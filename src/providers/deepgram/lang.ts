import {
  UI_SOURCE_LANGS,
  UI_TARGET_LANGS,
  uiSourceToTranslateSource,
  uiTargetToTranslateTarget,
} from "../../languages";

export const DEEPGRAM_SOURCE_LANGS = [...UI_SOURCE_LANGS];
export const DEEPGRAM_TARGET_LANGS = [...UI_TARGET_LANGS];

export function toDeepgramSttSource(uiSource: string): string {
  switch (uiSource) {
    case "cmn":
      return "zh-CN";
    case "yue":
      return "zh-HK";
    case "en-US":
      return "en-US";
    case "ko-KR":
      return "ko";
    case "ja-JP":
      return "ja";
    case "auto":
      return "multi";
    default:
      return uiSource;
  }
}

/** Nova-3 multilingual hints when UI source is auto. */
export const DEEPGRAM_AUTO_HINTS = ["zh-CN", "zh-HK", "en", "ko", "ja"] as const;

export function toDeepgramTranslateSource(uiSource: string): string {
  return uiSourceToTranslateSource(uiSource);
}

export function toDeepgramTranslateTarget(uiTarget: string): string {
  return uiTargetToTranslateTarget(uiTarget);
}
