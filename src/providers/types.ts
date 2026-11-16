export type ProviderId = string; // "azure" | 後續 "google" | "openai" ...

export type CaptionCue = {
  text: string;
  isFinal: boolean;
  sourceText?: string;
  sourceLang: string;
  targetLang: string;
};

export type CaptionProviderStartOptions = {
  sourceLang: string; // BCP-47，如 "ko-KR"
  targetLang: string; // 如 "zh-Hant"
  mediaStream?: MediaStream; // 麥克風音軌；不包含相機
};

export type CaptionProviderHandlers = {
  onCue: (cue: CaptionCue) => void;
  onError: (err: Error) => void;
  onStatus?: (status: "connecting" | "listening" | "stopped") => void;
};

export interface CaptionProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  /** 該供應商支援的源/目標語言對；UI 用此過濾下拉 */
  supportedLanguages(): { source: string[]; target: string[] };
  start(
    opts: CaptionProviderStartOptions,
    handlers: CaptionProviderHandlers,
  ): Promise<void>;
  stop(): Promise<void>;
}
