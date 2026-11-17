import { WebSocket } from "ws";

import { translateWithCloudflare } from "./cloudflare-translate";
import {
  toWhisperLanguage,
  transcribeWithCloudflareWhisper,
} from "./cloudflare-whisper";
import { parseQueryConfig } from "./stream-config";
import { detectedToTranslateSource } from "./translate";

const INTERIM_DEBOUNCE_MS = 300;
const KEEPALIVE_MS = 8000;
const WHISPER_CHUNK_BYTES = 16_000 * 2 * 2.5; // ~2.5s of 16-bit mono PCM

/** Explicit `language=` values that Workers AI Nova-3 WS accepts (probed). */
const NOVA3_DIRECT_LANGS = new Set(["en", "en-US", "ja", "multi"]);

/**
 * Nova-3 WS rejects zh / ko language codes (HTTP 400) and `multi` mis-detects
 * Mandarin as pt/nl. Use Whisper HTTP chunks for these UI sources.
 */
function shouldUseWhisper(sourceLang: string): boolean {
  return sourceLang === "cmn" || sourceLang === "yue" || sourceLang === "ko-KR";
}

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

function transcriptFromNova(msg: DeepgramResultsMessage): {
  text: string;
  isFinal: boolean;
  detectedLang?: string;
} | null {
  if (msg.type && msg.type !== "Results") {
    if (!msg.channel) return null;
  }
  const alt = msg.channel?.alternatives?.[0];
  const text = alt?.transcript?.trim() ?? "";
  if (!text) return null;
  return {
    text,
    isFinal: Boolean(msg.is_final || msg.speech_final),
    detectedLang: alt?.languages?.[0],
  };
}

function readAuth():
  | { accountId: string; token: string; gateway?: string }
  | { error: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    return {
      error:
        "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN. Create a Workers AI API token in the Cloudflare dashboard and add both to .env.",
    };
  }
  const gateway = process.env.CLOUDFLARE_AI_GATEWAY?.trim() || undefined;
  return { accountId, token, gateway };
}

function languageHintsFor(sourceLang: string): string[] {
  switch (sourceLang) {
    case "ko-KR":
      return ["ko"];
    case "cmn":
      return ["zh-CN", "zh"];
    case "yue":
      return ["zh-HK", "zh-CN", "zh"];
    case "ja-JP":
      return ["ja"];
    case "en-US":
      return ["en"];
    case "auto":
    default:
      return ["zh-CN", "en", "ko", "ja"];
  }
}

function buildUpstreamUrl(
  auth: { accountId: string; gateway?: string },
  config: { sourceLang: string; sttSource: string },
): string {
  const params = new URLSearchParams({
    encoding: "linear16",
    sample_rate: "16000",
    interim_results: "true",
    punctuate: "true",
    smart_format: "true",
  });

  const requested = config.sttSource.trim() || "multi";
  const language = NOVA3_DIRECT_LANGS.has(requested) ? requested : "multi";
  params.set("language", language);

  if (language === "multi") {
    for (const hint of languageHintsFor(config.sourceLang)) {
      params.append("language_hint", hint);
    }
  }

  if (auth.gateway) {
    params.set("model", "@cf/deepgram/nova-3");
    return `wss://gateway.ai.cloudflare.com/v1/${auth.accountId}/${auth.gateway}/workers-ai?${params}`;
  }

  return `wss://api.cloudflare.com/client/v4/accounts/${auth.accountId}/ai/run/@cf/deepgram/nova-3?${params}`;
}

async function readResponseBody(res: {
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
}): Promise<string> {
  try {
    const chunks: Buffer[] = [];
    if (typeof res[Symbol.asyncIterator] === "function") {
      for await (const c of res as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
      }
      return Buffer.concat(chunks).toString("utf8");
    }
    return await new Promise((resolve) => {
      const parts: Buffer[] = [];
      res.on?.("data", (c) => {
        parts.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
      });
      res.on?.("end", () => resolve(Buffer.concat(parts).toString("utf8")));
      res.on?.("error", () => resolve(""));
    });
  } catch {
    return "";
  }
}

export async function handleCloudflareConnection(
  ws: WebSocket,
  request: Request,
): Promise<void> {
  const auth = readAuth();
  if ("error" in auth) {
    sendJson(ws, { type: "error", message: auth.error });
    ws.close();
    return;
  }

  const queryConfig = parseQueryConfig(request, {
    sttSource: "multi",
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
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let seq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let lastDetectedLang: string | undefined;
  let mode: "pending" | "nova" | "whisper" = "pending";
  const pendingAudio: Buffer[] = [];
  let whisperPcm = Buffer.alloc(0);
  let whisperBusy = false;
  let listeningSent = false;

  const cueSourceLang = (detectedLang?: string): string =>
    config.sourceLang === "auto"
      ? (detectedLang ?? lastDetectedLang ?? config.sourceLang)
      : config.sourceLang;

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
      // Same-script Chinese→Chinese: skip MT to avoid m2m100 noise.
      const fromCode = from.toLowerCase();
      const toCode = config.translateTarget.toLowerCase();
      const bothZh =
        (fromCode.startsWith("zh") || fromCode === "cmn" || fromCode === "yue") &&
        toCode.startsWith("zh");
      const text = bothZh
        ? sourceText
        : await translateWithCloudflare({
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
        sourceLang: cueSourceLang(detectedLang),
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

  const markListening = (): void => {
    if (listeningSent || closed) return;
    listeningSent = true;
    sendJson(ws, { type: "status", status: "listening" });
  };

  const flushWhisper = async (forceFinal: boolean): Promise<void> => {
    if (whisperBusy || closed) return;
    if (whisperPcm.byteLength < 3200 && !forceFinal) return;
    if (whisperPcm.byteLength === 0) return;

    const slice = whisperPcm;
    whisperPcm = Buffer.alloc(0);
    whisperBusy = true;
    try {
      const sourceText = await transcribeWithCloudflareWhisper({
        pcm: slice,
        language: toWhisperLanguage(config.sourceLang),
      });
      if (closed) return;
      if (sourceText) {
        await pushCue(sourceText, true, config.sourceLang);
      }
    } catch (err) {
      if (closed) return;
      sendJson(ws, {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      whisperBusy = false;
      if (!closed && whisperPcm.byteLength >= WHISPER_CHUNK_BYTES) {
        void flushWhisper(false);
      }
    }
  };

  const startWhisper = (): void => {
    mode = "whisper";
    markListening();
    for (const chunk of pendingAudio) {
      whisperPcm = Buffer.concat([whisperPcm, chunk]);
    }
    pendingAudio.length = 0;
    if (whisperPcm.byteLength >= WHISPER_CHUNK_BYTES) {
      void flushWhisper(false);
    }
  };

  const startNova = (): void => {
    mode = "nova";
    const url = buildUpstreamUrl(auth, config);
    const headers: Record<string, string> = auth.gateway
      ? { "cf-aig-authorization": auth.token }
      : { Authorization: `Bearer ${auth.token}` };

    const socket = new WebSocket(url, { headers });
    upstream = socket;

    socket.on("open", () => {
      for (const chunk of pendingAudio) {
        socket.send(chunk);
      }
      pendingAudio.length = 0;
      markListening();
      keepalive = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: "KeepAlive" }));
          } catch {
            // ignore
          }
        }
      }, KEEPALIVE_MS);
    });

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as DeepgramResultsMessage;
        const parsed = transcriptFromNova(msg);
        if (!parsed) return;
        onTranscript(parsed.text, parsed.isFinal, parsed.detectedLang);
      } catch {
        // ignore non-JSON
      }
    });

    socket.on("error", (err) => {
      if (closed) return;
      const raw = err.message || "Cloudflare Workers AI WebSocket error";
      const message = /401|403/.test(raw)
        ? "Cloudflare 拒絕連線：請確認 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN（Workers AI 權限）後重啟。"
        : raw;
      sendJson(ws, { type: "error", message });
    });

    socket.on("unexpected-response", (_req, res) => {
      void (async () => {
        if (closed) return;
        const code = res.statusCode ?? 0;
        const body = await readResponseBody(res);
        let detail = body.trim();
        try {
          const parsed = JSON.parse(body) as {
            message?: string;
            description?: string;
          };
          detail = parsed.message || parsed.description || detail;
        } catch {
          // keep raw text
        }
        const message =
          code === 401 || code === 403
            ? "Cloudflare 拒絕連線：API Token 無效或缺少 Workers AI 權限。"
            : `Cloudflare unexpected response: ${code}${detail ? ` — ${detail}` : ""}`;
        sendJson(ws, { type: "error", message });
        try {
          res.resume();
        } catch {
          // ignore
        }
      })();
    });

    socket.on("close", () => {
      if (keepalive) {
        clearInterval(keepalive);
        keepalive = null;
      }
    });
  };

  const startUpstream = (): void => {
    if (mode !== "pending") return;
    if (shouldUseWhisper(config.sourceLang)) {
      startWhisper();
    } else {
      startNova();
    }
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
    if (mode === "whisper" && whisperPcm.byteLength > 0) {
      void flushWhisper(true);
    }
    if (upstream) {
      try {
        if (upstream.readyState === WebSocket.OPEN) {
          try {
            upstream.send(JSON.stringify({ type: "CloseStream" }));
          } catch {
            // ignore
          }
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
          startUpstream();
        }
      } catch (err) {
        sendJson(ws, {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

    if (mode === "pending") {
      pendingAudio.push(chunk);
      startUpstream();
      return;
    }

    if (mode === "whisper") {
      whisperPcm = Buffer.concat([whisperPcm, chunk]);
      if (whisperPcm.byteLength >= WHISPER_CHUNK_BYTES) {
        void flushWhisper(false);
      }
      return;
    }

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
