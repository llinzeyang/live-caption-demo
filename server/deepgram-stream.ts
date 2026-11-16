import { WebSocket } from "ws";

import { parseQueryConfig } from "./stream-config";
import { detectedToTranslateSource, translateText } from "./translate";

const INTERIM_DEBOUNCE_MS = 300;
const KEEPALIVE_MS = 8000;

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

type DeepgramResultsMessage = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      languages?: string[];
    }>;
  };
};

function transcriptFromDeepgram(msg: DeepgramResultsMessage): {
  text: string;
  isFinal: boolean;
  detectedLang?: string;
} | null {
  if (msg.type !== "Results") return null;
  const alt = msg.channel?.alternatives?.[0];
  const text = alt?.transcript?.trim() ?? "";
  if (!text) return null;
  return {
    text,
    isFinal: Boolean(msg.is_final || msg.speech_final),
    detectedLang: alt?.languages?.[0],
  };
}

export async function handleDeepgramConnection(
  ws: WebSocket,
  request: Request,
): Promise<void> {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    sendJson(ws, {
      type: "error",
      message:
        "Missing DEEPGRAM_API_KEY. Create a key at https://console.deepgram.com/ and add it to .env.",
    });
    ws.close();
    return;
  }
  if (apiKey.startsWith("sk_") || apiKey.startsWith("sk-")) {
    sendJson(ws, {
      type: "error",
      message:
        "DEEPGRAM_API_KEY 看起來不是 Deepgram 金鑰（目前以 sk_ 開頭）。請到 https://console.deepgram.com/ → API Keys 建立金鑰，複製以 dg_ 開頭的 secret 寫入 .env 後重啟 npm run dev。",
    });
    ws.close();
    return;
  }

  const queryConfig = parseQueryConfig(request, {
    sttSource: "ko",
    translateSource: "ko",
    translateTarget: "zh-TW",
  });
  if (!queryConfig) {
    sendJson(ws, { type: "error", message: "Invalid stream URL" });
    ws.close();
    return;
  }

  let config = queryConfig;
  let dg: WebSocket | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let seq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let lastDetectedLang: string | undefined;
  const pendingAudio: Buffer[] = [];

  const pushCue = async (
    sourceText: string,
    isFinal: boolean,
    detectedLang?: string,
  ): Promise<void> => {
    const mySeq = ++seq;
    if (detectedLang) lastDetectedLang = detectedLang;
    const from =
      config.sourceLang === "auto"
        ? detectedToTranslateSource(detectedLang ?? lastDetectedLang)
        : config.translateSource;
    try {
      const text = await translateText({
        text: sourceText,
        from,
        to: config.translateTarget,
      });
      if (closed || mySeq !== seq) return;
      sendJson(ws, {
        type: "cue",
        text,
        isFinal,
        sourceText,
        sourceLang: detectedLang ?? lastDetectedLang ?? config.sourceLang,
        targetLang: config.targetLang,
      });
    } catch (err) {
      if (closed) return;
      sendJson(ws, {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onTranscript = (
    sourceText: string,
    isFinal: boolean,
    detectedLang?: string,
  ): void => {
    if (isFinal) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      void pushCue(sourceText, true, detectedLang);
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void pushCue(sourceText, false, detectedLang);
    }, INTERIM_DEBOUNCE_MS);
  };

  const startDeepgram = (): void => {
    const auto = config.sourceLang === "auto" || config.sttSource === "multi";
    const model =
      process.env.DEEPGRAM_MODEL?.trim() || (auto ? "nova-3" : "nova-2");
    const params = new URLSearchParams({
      model,
      language: auto ? "multi" : config.sttSource,
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
      interim_results: "true",
      punctuate: "true",
      smart_format: "true",
    });
    if (auto) {
      for (const hint of ["zh-CN", "zh-HK", "en", "ko", "ja"]) {
        params.append("language_hint", hint);
      }
    }

    const upstream = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params.toString()}`,
      { headers: { Authorization: `Token ${apiKey}` } },
    );
    dg = upstream;

    upstream.on("open", () => {
      for (const chunk of pendingAudio) {
        upstream.send(chunk);
      }
      pendingAudio.length = 0;
      sendJson(ws, { type: "status", status: "listening" });
      keepalive = setInterval(() => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, KEEPALIVE_MS);
    });

    upstream.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as DeepgramResultsMessage;
        const parsed = transcriptFromDeepgram(msg);
        if (!parsed) return;
        onTranscript(parsed.text, parsed.isFinal, parsed.detectedLang);
      } catch {
        // ignore non-JSON
      }
    });

    upstream.on("error", (err) => {
      if (closed) return;
      const raw = err.message || "Deepgram WebSocket error";
      const message = /401/.test(raw)
        ? "Deepgram 拒絕連線 (401)：請到 https://console.deepgram.com/ 建立新的 API Key，更新 .env 的 DEEPGRAM_API_KEY 後重啟 npm run dev。"
        : raw;
      sendJson(ws, { type: "error", message });
    });

    upstream.on("unexpected-response", (_req, res) => {
      if (closed) return;
      const code = res.statusCode ?? 0;
      const message =
        code === 401
          ? "Deepgram 拒絕連線 (401)：API Key 無效或已撤銷。請在 Deepgram Console 重新建立金鑰，寫入 .env 的 DEEPGRAM_API_KEY，然後重啟開發伺服器。"
          : `Deepgram unexpected response: ${code}`;
      sendJson(ws, { type: "error", message });
      res.resume();
    });

    upstream.on("close", () => {
      if (keepalive) {
        clearInterval(keepalive);
        keepalive = null;
      }
    });
  };

  const cleanup = (): void => {
    closed = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (keepalive) {
      clearInterval(keepalive);
      keepalive = null;
    }
    if (dg) {
      try {
        if (dg.readyState === WebSocket.OPEN) {
          dg.send(JSON.stringify({ type: "CloseStream" }));
        }
        dg.close();
      } catch {
        // ignore
      }
      dg = null;
    }
  };

  ws.on("message", (data, isBinary) => {
    if (closed) return;

    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString()) as {
          type?: string;
          sourceLang?: string;
          targetLang?: string;
          sttSource?: string;
          translateSource?: string;
          translateTarget?: string;
        };
        if (msg.type === "config") {
          config = {
            sourceLang: msg.sourceLang ?? config.sourceLang,
            targetLang: msg.targetLang ?? config.targetLang,
            sttSource: msg.sttSource ?? config.sttSource,
            translateSource: msg.translateSource ?? config.translateSource,
            translateTarget: msg.translateTarget ?? config.translateTarget,
          };
          if (!dg) startDeepgram();
        }
      } catch (err) {
        sendJson(ws, {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (!dg) startDeepgram();
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (dg && dg.readyState === WebSocket.OPEN) {
      dg.send(chunk);
    } else {
      pendingAudio.push(chunk);
    }
  });

  ws.on("close", cleanup);
  ws.on("error", cleanup);

  sendJson(ws, { type: "status", status: "connecting" });
}
