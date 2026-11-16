import { WebSocket } from "ws";

import { parseQueryConfig } from "./stream-config";
import { detectedToTranslateSource, translateText } from "./translate";

const INTERIM_DEBOUNCE_MS = 300;

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

type AssemblyTurnMessage = {
  type?: string;
  transcript?: string;
  end_of_turn?: boolean;
  turn_is_formatted?: boolean;
  language_code?: string;
  error?: string;
  message?: string;
};

function transcriptFromAssembly(msg: AssemblyTurnMessage): {
  text: string;
  isFinal: boolean;
  detectedLang?: string;
} | null {
  if (msg.type !== "Turn") return null;
  const text = msg.transcript?.trim() ?? "";
  if (!text) return null;
  return {
    text,
    isFinal: Boolean(msg.end_of_turn),
    detectedLang: msg.language_code || undefined,
  };
}

export async function handleAssemblyConnection(
  ws: WebSocket,
  request: Request,
): Promise<void> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!apiKey) {
    sendJson(ws, {
      type: "error",
      message:
        "Missing ASSEMBLYAI_API_KEY. Create a key at https://www.assemblyai.com/dashboard and add it to .env.",
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
  let upstream: WebSocket | null = null;
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

  const startUpstream = (): void => {
    const auto = config.sourceLang === "auto" || !config.sttSource;
    const requested =
      process.env.ASSEMBLYAI_SPEECH_MODEL?.trim() || "universal-3-6-pro";
    const multilingualOnly = new Set(["en", "es", "de", "fr", "pt", "it"]);
    const needsBroadModel =
      auto ||
      !config.sttSource ||
      !multilingualOnly.has(config.sttSource.split("-")[0] ?? "");
    const model =
      requested === "universal-streaming-multilingual" && needsBroadModel
        ? "universal-3-6-pro"
        : requested;
    if (model !== requested) {
      console.warn(
        `[assemblyai] ${requested} 不含中文等語言，改用 ${model}。請把 .env 設為 ASSEMBLYAI_SPEECH_MODEL=universal-3-6-pro 並重啟。`,
      );
    }
    const params = new URLSearchParams({
      sample_rate: "16000",
      speech_model: model,
      format_turns: "true",
    });
    if (auto) {
      params.set("language_detection", "true");
    } else if (config.sttSource) {
      params.set("language_codes", config.sttSource);
    }

    const socket = new WebSocket(
      `wss://streaming.assemblyai.com/v3/ws?${params.toString()}`,
      { headers: { Authorization: apiKey } },
    );
    upstream = socket;

    socket.on("open", () => {
      for (const chunk of pendingAudio) {
        socket.send(chunk);
      }
      pendingAudio.length = 0;
      sendJson(ws, { type: "status", status: "listening" });
    });

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as AssemblyTurnMessage;
        if (msg.type === "Error") {
          sendJson(ws, {
            type: "error",
            message: msg.error || msg.message || "AssemblyAI Error",
          });
          return;
        }
        const parsed = transcriptFromAssembly(msg);
        if (!parsed) return;
        onTranscript(parsed.text, parsed.isFinal, parsed.detectedLang);
      } catch {
        // ignore non-JSON
      }
    });

    socket.on("error", (err) => {
      if (closed) return;
      const raw = err.message || "AssemblyAI WebSocket error";
      const message = /401/.test(raw)
        ? "AssemblyAI 拒絕連線 (401)：請確認 ASSEMBLYAI_API_KEY 有效，並重啟 npm run dev。"
        : raw;
      sendJson(ws, { type: "error", message });
    });

    socket.on("unexpected-response", (_req, res) => {
      if (closed) return;
      const code = res.statusCode ?? 0;
      const message =
        code === 401
          ? "AssemblyAI 拒絕連線 (401)：API Key 無效。請到 https://www.assemblyai.com/dashboard 重新建立金鑰。"
          : `AssemblyAI unexpected response: ${code}`;
      sendJson(ws, { type: "error", message });
      res.resume();
    });
  };

  const cleanup = (): void => {
    closed = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (upstream) {
      try {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(JSON.stringify({ type: "Terminate" }));
        }
        upstream.close();
      } catch {
        // ignore
      }
      upstream = null;
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
          if (!upstream) startUpstream();
        }
      } catch (err) {
        sendJson(ws, {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (!upstream) startUpstream();
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (upstream && upstream.readyState === WebSocket.OPEN) {
      upstream.send(chunk);
    } else {
      pendingAudio.push(chunk);
    }
  });

  ws.on("close", cleanup);
  ws.on("error", cleanup);

  sendJson(ws, { type: "status", status: "connecting" });
}
