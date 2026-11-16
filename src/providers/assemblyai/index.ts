import { startPcmCapture, type PcmCapture } from "../../lib/pcm";
import type {
  CaptionProvider,
  CaptionProviderHandlers,
  CaptionProviderStartOptions,
} from "../types";
import {
  nextReconnectDelayMs,
  WS_RECONNECT_MAX_ATTEMPTS,
} from "../ws-reconnect";
import { captionStreamUrl } from "../ws-url";
import {
  ASSEMBLYAI_SOURCE_LANGS,
  ASSEMBLYAI_TARGET_LANGS,
  toAssemblyAiSttSource,
  toAssemblyAiTranslateSource,
  toAssemblyAiTranslateTarget,
} from "./lang";

type ServerMessage =
  | {
      type: "cue";
      text: string;
      isFinal: boolean;
      sourceText?: string;
      sourceLang?: string;
      targetLang?: string;
    }
  | { type: "status"; status: "connecting" | "listening" | "stopped" }
  | { type: "error"; message: string };

type Session = {
  opts: CaptionProviderStartOptions;
  handlers: CaptionProviderHandlers;
  sttSource: string;
  translateSource: string;
  translateTarget: string;
  url: string;
};

function assemblyStreamUrl(opts: {
  sourceLang: string;
  targetLang: string;
  sttSource: string;
  translateSource: string;
  translateTarget: string;
}): string {
  const params = new URLSearchParams({
    source: opts.sourceLang,
    target: opts.targetLang,
    sttSource: opts.sttSource,
    translateSource: opts.translateSource,
    translateTarget: opts.translateTarget,
  });
  return captionStreamUrl("/api/providers/assemblyai/stream", params);
}

export class AssemblyAiCaptionProvider implements CaptionProvider {
  readonly id = "assemblyai";
  readonly displayName = "AssemblyAI + DeepL";

  private ws: WebSocket | null = null;
  private pcm: PcmCapture | null = null;
  private sendFrame: ((frame: ArrayBuffer) => void) | null = null;
  private session: Session | null = null;
  private stopped = true;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  supportedLanguages(): { source: string[]; target: string[] } {
    return {
      source: [...ASSEMBLYAI_SOURCE_LANGS],
      target: [...ASSEMBLYAI_TARGET_LANGS],
    };
  }

  async start(
    opts: CaptionProviderStartOptions,
    handlers: CaptionProviderHandlers,
  ): Promise<void> {
    await this.stop();

    if (!opts.mediaStream) {
      throw new Error(
        "AssemblyAI provider requires a microphone media stream.",
      );
    }

    const sttSource = toAssemblyAiSttSource(opts.sourceLang);
    const translateSource = toAssemblyAiTranslateSource(opts.sourceLang);
    const translateTarget = toAssemblyAiTranslateTarget(opts.targetLang);
    const url = assemblyStreamUrl({
      sourceLang: opts.sourceLang,
      targetLang: opts.targetLang,
      sttSource,
      translateSource,
      translateTarget,
    });

    this.stopped = false;
    this.reconnectAttempt = 0;
    this.session = {
      opts,
      handlers,
      sttSource,
      translateSource,
      translateTarget,
      url,
    };

    handlers.onStatus?.("connecting");
    await this.connect(true);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || !this.session) return;
    if (this.reconnectAttempt >= WS_RECONNECT_MAX_ATTEMPTS) {
      this.session.handlers.onError(
        new Error("AssemblyAI WebSocket reconnect exhausted"),
      );
      this.session.handlers.onStatus?.("stopped");
      return;
    }
    this.reconnectAttempt += 1;
    const delay = nextReconnectDelayMs(this.reconnectAttempt);
    this.session.handlers.onStatus?.("connecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(false).catch((err) => {
        this.session?.handlers.onError(
          err instanceof Error ? err : new Error(String(err)),
        );
        this.scheduleReconnect();
      });
    }, delay);
  }

  private async connect(isInitial: boolean): Promise<void> {
    const session = this.session;
    if (!session || this.stopped) return;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(session.url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      let settled = false;

      const fail = (err: Error) => {
        if (settled) {
          if (isInitial) session.handlers.onError(err);
          return;
        }
        settled = true;
        reject(err);
      };

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "config",
            sourceLang: session.opts.sourceLang,
            targetLang: session.opts.targetLang,
            sttSource: session.sttSource,
            translateSource: session.translateSource,
            translateTarget: session.translateTarget,
          }),
        );

        this.sendFrame = (frame) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(frame);
          }
        };

        if (!this.pcm) {
          try {
            this.pcm = startPcmCapture(session.opts.mediaStream!, (frame) => {
              this.sendFrame?.(frame);
            });
          } catch (err) {
            fail(err instanceof Error ? err : new Error(String(err)));
            void this.stop();
            return;
          }
        }

        this.reconnectAttempt = 0;
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }

        if (msg.type === "cue") {
          if (!msg.text.trim()) return;
          session.handlers.onCue({
            text: msg.text,
            isFinal: msg.isFinal,
            sourceText: msg.sourceText,
            sourceLang: msg.sourceLang ?? session.opts.sourceLang,
            targetLang: msg.targetLang ?? session.opts.targetLang,
          });
          return;
        }

        if (msg.type === "status") {
          session.handlers.onStatus?.(msg.status);
          return;
        }

        if (msg.type === "error") {
          fail(new Error(msg.message));
        }
      };

      ws.onerror = () => {
        fail(new Error("AssemblyAI WebSocket connection failed"));
      };

      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        if (!settled) {
          fail(new Error("AssemblyAI WebSocket closed before ready"));
          return;
        }
        if (this.stopped) {
          session.handlers.onStatus?.("stopped");
          return;
        }
        this.scheduleReconnect();
      };
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearReconnectTimer();
    this.session = null;
    this.sendFrame = null;
    this.pcm?.stop();
    this.pcm = null;
    const ws = this.ws;
    this.ws = null;
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.close();
    }
  }
}

export function createAssemblyAiCaptionProvider(): CaptionProvider {
  return new AssemblyAiCaptionProvider();
}
