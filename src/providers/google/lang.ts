import {
  UI_SOURCE_LANGS,
  UI_TARGET_LANGS,
  uiSourceToTranslateSource,
  uiTargetToTranslateTarget,
} from "../../languages";

export const GOOGLE_SOURCE_LANGS = [...UI_SOURCE_LANGS];
export const GOOGLE_TARGET_LANGS = [...UI_TARGET_LANGS];

export function toGoogleSttSource(uiSource: string): string {
  switch (uiSource) {
    case "cmn":
      return "zh-CN";
    case "yue":
      return "yue-Hant-HK";
    case "en-US":
      return "en-US";
    case "ko-KR":
      return "ko-KR";
    case "ja-JP":
      return "ja-JP";
    default:
      return "zh-CN";
  }
}

/** When auto: pass several languageCodes so STT can pick the most likely. */
export const GOOGLE_AUTO_LANGUAGE_CODES = [
  "zh-CN",
  "yue-Hant-HK",
  "en-US",
  "ko-KR",
  "ja-JP",
] as const;

export function toGoogleTranslateSource(uiSource: string): string {
  return uiSourceToTranslateSource(uiSource);
}

export function toGoogleTranslateTarget(uiTarget: string): string {
  return uiTargetToTranslateTarget(uiTarget);
}
