import { v2 as speechV2 } from "@google-cloud/speech";
import { v2 as translateV2 } from "@google-cloud/translate";
import type { WebSocket } from "ws";

import { googleCredentialsConfigured } from "./gcp-credentials";
import { parseQueryConfig } from "./stream-config";

const INTERIM_DEBOUNCE_MS = 300;

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function readEnv(): { projectId: string; location: string } | { error: string } {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!projectId) {
    return {
      error:
        "Missing GOOGLE_CLOUD_PROJECT. Set it in .env along with GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON.",
    };
  }
  if (!googleCredentialsConfigured()) {
    return {
      error:
        "Missing Google credentials. Set GOOGLE_APPLICATION_CREDENTIALS (path) or GOOGLE_SERVICE_ACCOUNT_JSON.",
    };
  }
  const location = process.env.GOOGLE_SPEECH_LOCATION?.trim() || "global";
  return { projectId, location };
}

function transcriptFromResponse(response: {
  results?: Array<{
    alternatives?: Array<{ transcript?: string | null } | null> | null;
    isFinal?: boolean | null;
  } | null> | null;
}): { text: string; isFinal: boolean } | null {
  const result = response.results?.[0];
  const text = result?.alternatives?.[0]?.transcript?.trim() ?? "";
  if (!text) return null;
  return { text, isFinal: Boolean(result?.isFinal) };
}

export async function handleGoogleConnection(
  ws: WebSocket,
  request: Request,
): Promise<void> {
  const env = readEnv();
  if ("error" in env) {
    sendJson(ws, { type: "error", message: env.error });
    ws.close();
    return;
  }

  const queryConfig = parseQueryConfig(request);
  if (!queryConfig) {
    sendJson(ws, { type: "error", message: "Invalid stream URL" });
    ws.close();
    return;
  }

  let config = queryConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recognizeStream: {
    write: (req: object) => void;
    end: () => void;
    on: (...args: any[]) => void;
  } | null = null;
  let translateClient: InstanceType<typeof translateV2.Translate> | null = null;
  let seq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const translate = async (text: string): Promise<string> => {
    if (!translateClient) {
      translateClient = new translateV2.Translate({ projectId: env.projectId });
    }
    const [translated] = await translateClient.translate(text, {
      from: config.translateSource,
      to: config.translateTarget,
    });
    return typeof translated === "string" ? translated : String(translated);
  };

  const pushCue = async (sourceText: string, isFinal: boolean): Promise<void> => {
    const mySeq = ++seq;
    try {
      const text = await translate(sourceText);
      if (closed || mySeq !== seq) return;
      sendJson(ws, {
        type: "cue",
        text,
        isFinal,
        sourceText,
        sourceLang: config.sourceLang,
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

  const onTranscript = (sourceText: string, isFinal: boolean): void => {
    if (isFinal) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      void pushCue(sourceText, true);
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void pushCue(sourceText, false);
    }, INTERIM_DEBOUNCE_MS);
  };

  const startRecognizer = (): void => {
    const clientOptions =
      env.location === "global"
        ? {}
        : { apiEndpoint: `${env.location}-speech.googleapis.com` };
    const client = new speechV2.SpeechClient(clientOptions);
    const stream = client._streamingRecognize();
    recognizeStream = stream;

    stream.on("data", (response) => {
      const parsed = transcriptFromResponse(response);
      if (!parsed) return;
      onTranscript(parsed.text, parsed.isFinal);
    });

    stream.on("error", (err: Error) => {
      if (closed) return;
      sendJson(ws, {
        type: "error",
        message: err.message || "Google Speech stream error",
      });
    });

    stream.write({
      recognizer: `projects/${env.projectId}/locations/${env.location}/recognizers/_`,
      streamingConfig: {
        config: {
          explicitDecodingConfig: {
            encoding: "LINEAR16",
            sampleRateHertz: 16000,
            audioChannelCount: 1,
          },
          languageCodes: config.sttSource
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          model: "latest_long",
        },
        streamingFeatures: {
          interimResults: true,
        },
      },
    });

    sendJson(ws, { type: "status", status: "listening" });
  };

  const cleanup = (): void => {
    closed = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (recognizeStream) {
      try {
        recognizeStream.end();
      } catch {
        // ignore
      }
      recognizeStream = null;
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
          if (!recognizeStream) startRecognizer();
        }
      } catch (err) {
        sendJson(ws, {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (!recognizeStream) {
      startRecognizer();
    }
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    try {
      recognizeStream?.write({ audio: chunk });
    } catch (err) {
      sendJson(ws, {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  ws.on("close", cleanup);
  ws.on("error", cleanup);

  sendJson(ws, { type: "status", status: "connecting" });
}
