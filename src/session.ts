import { getProvider } from "./providers/registry";
import type {
  CaptionCue,
  CaptionProvider,
  CaptionProviderStartOptions,
  ProviderId,
} from "./providers/types";

export type CaptionSessionHandlers = {
  onCue: (cue: CaptionCue) => void;
  onError: (err: Error) => void;
  onStatus?: (status: "connecting" | "listening" | "stopped") => void;
};

/**
 * Owns the active CaptionProvider. UI talks only to this session —
 * switching providers is stop-then-start with the same language options.
 */
export class CaptionSession {
  private provider: CaptionProvider | null = null;
  private opts: CaptionProviderStartOptions | null = null;
  private handlers: CaptionSessionHandlers | null = null;
  private running = false;

  get activeProviderId(): ProviderId | null {
    return this.provider?.id ?? null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  async start(
    providerId: ProviderId,
    opts: CaptionProviderStartOptions,
    handlers: CaptionSessionHandlers,
  ): Promise<void> {
    const next = getProvider(providerId);
    if (!next) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    await this.stop();

    this.provider = next;
    this.opts = { ...opts };
    this.handlers = handlers;
    this.running = true;

    try {
      await next.start(opts, {
        onCue: handlers.onCue,
        onError: handlers.onError,
        onStatus: handlers.onStatus,
      });
    } catch (err) {
      this.running = false;
      this.provider = null;
      throw err;
    }
  }

  async switchProvider(providerId: ProviderId): Promise<void> {
    if (!this.opts || !this.handlers) {
      throw new Error("Session has not been started");
    }
    if (this.provider?.id === providerId && this.running) {
      return;
    }
    const opts = this.opts;
    const handlers = this.handlers;
    await this.start(providerId, opts, handlers);
  }

  async updateLanguages(sourceLang: string, targetLang: string): Promise<void> {
    if (!this.provider || !this.handlers || !this.opts) {
      throw new Error("Session has not been started");
    }
    const providerId = this.provider.id;
    const opts: CaptionProviderStartOptions = {
      ...this.opts,
      sourceLang,
      targetLang,
    };
    await this.start(providerId, opts, this.handlers);
  }

  async stop(): Promise<void> {
    const current = this.provider;
    this.running = false;
    this.provider = null;
    if (!current) {
      this.handlers?.onStatus?.("stopped");
      return;
    }
    try {
      await current.stop();
    } finally {
      this.handlers?.onStatus?.("stopped");
    }
  }
}
