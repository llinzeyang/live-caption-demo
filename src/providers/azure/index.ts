import {
  AudioConfig,
  AutoDetectSourceLanguageConfig,
  AutoDetectSourceLanguageResult,
  LanguageIdMode,
  ResultReason,
  SpeechTranslationConfig,
  TranslationRecognizer,
} from "microsoft-cognitiveservices-speech-sdk";

import type {
  CaptionProvider,
  CaptionProviderHandlers,
  CaptionProviderStartOptions,
} from "../types";
import {
  AZURE_AUTO_CANDIDATES,
  AZURE_SOURCE_LANGS,
  AZURE_TARGET_LANGS,
  toAzureSourceLang,
  toAzureTargetLang,
} from "./lang";

type TokenResponse = {
  token: string;
  region: string;
};

async function fetchAzureToken(): Promise<TokenResponse> {
  const res = await fetch("/api/providers/azure/token");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Azure token failed (${res.status})`);
  }
  return (await res.json()) as TokenResponse;
}

function translationText(
  translations: { get: (key: string) => string | undefined },
  targetLang: string,
): string {
  return translations.get(targetLang) ?? translations.get(targetLang.toLowerCase()) ?? "";
}

function detectedSourceLocale(result: Parameters<
  typeof AutoDetectSourceLanguageResult.fromResult
>[0]): string | undefined {
  try {
    const v = AutoDetectSourceLanguageResult.fromResult(result).language;
    return v?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export class AzureCaptionProvider implements CaptionProvider {
  readonly id = "azure";
  readonly displayName = "Azure Speech Translation";

  private recognizer: TranslationRecognizer | null = null;

  supportedLanguages(): { source: string[]; target: string[] } {
    return {
      source: [...AZURE_SOURCE_LANGS],
      target: [...AZURE_TARGET_LANGS],
    };
  }

  async start(
    opts: CaptionProviderStartOptions,
    handlers: CaptionProviderHandlers,
  ): Promise<void> {
    await this.stop();
    handlers.onStatus?.("connecting");

    const { token, region } = await fetchAzureToken();
    const targetLang = toAzureTargetLang(opts.targetLang);
    const auto = opts.sourceLang === "auto";

    const cfg = SpeechTranslationConfig.fromAuthorizationToken(token, region);
    // Placeholder required when auto-detect is on; ignored by the service.
    cfg.speechRecognitionLanguage = auto
      ? "zh-CN"
      : toAzureSourceLang(opts.sourceLang);
    cfg.addTargetLanguage(targetLang);

    const audioConfig = opts.mediaStream
      ? AudioConfig.fromStreamInput(opts.mediaStream)
      : AudioConfig.fromDefaultMicrophoneInput();
    let recognizer: TranslationRecognizer;
    if (auto) {
      const autoCfg = AutoDetectSourceLanguageConfig.fromLanguages([
        ...AZURE_AUTO_CANDIDATES,
      ]);
      autoCfg.mode = LanguageIdMode.Continuous;
      recognizer = TranslationRecognizer.FromConfig(cfg, autoCfg, audioConfig);
    } else {
      recognizer = new TranslationRecognizer(cfg, audioConfig);
    }
    this.recognizer = recognizer;

    recognizer.recognizing = (_s, e) => {
      if (e.result.reason !== ResultReason.TranslatingSpeech) return;
      const text = translationText(e.result.translations, targetLang);
      if (!text.trim()) return;
      handlers.onCue({
        text,
        isFinal: false,
        sourceText: e.result.text || undefined,
        sourceLang: detectedSourceLocale(e.result) ?? opts.sourceLang,
        targetLang: opts.targetLang,
      });
    };

    recognizer.recognized = (_s, e) => {
      if (e.result.reason === ResultReason.TranslatedSpeech) {
        const text = translationText(e.result.translations, targetLang);
        if (!text.trim()) return;
        handlers.onCue({
          text,
          isFinal: true,
          sourceText: e.result.text || undefined,
          sourceLang: detectedSourceLocale(e.result) ?? opts.sourceLang,
          targetLang: opts.targetLang,
        });
        return;
      }
      if (e.result.reason === ResultReason.NoMatch) {
        // silence / no speech — ignore
      }
    };

    recognizer.canceled = (_s, e) => {
      handlers.onError(new Error(e.errorDetails || `Azure canceled: ${e.reason}`));
    };

    await new Promise<void>((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(
        () => {
          handlers.onStatus?.("listening");
          resolve();
        },
        (err) => {
          reject(new Error(typeof err === "string" ? err : String(err)));
        },
      );
    });
  }

  async stop(): Promise<void> {
    const recognizer = this.recognizer;
    this.recognizer = null;
    if (!recognizer) return;

    await new Promise<void>((resolve) => {
      recognizer.stopContinuousRecognitionAsync(
        () => {
          recognizer.close();
          resolve();
        },
        () => {
          try {
            recognizer.close();
          } catch {
            // ignore
          }
          resolve();
        },
      );
    });
  }
}

export function createAzureCaptionProvider(): CaptionProvider {
  return new AzureCaptionProvider();
}
