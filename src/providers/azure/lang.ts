import {
  UI_SOURCE_LANGS,
  UI_TARGET_LANGS,
  uiSourceToTranslateSource,
  uiTargetToTranslateTarget,
} from "../../languages";

export const AZURE_SOURCE_LANGS = [...UI_SOURCE_LANGS];
export const AZURE_TARGET_LANGS = [...UI_TARGET_LANGS];

/** Azure Speech locale for a fixed UI source (not auto). */
export function toAzureSourceLang(uiSource: string): string {
  switch (uiSource) {
    case "cmn":
      return "zh-CN";
    case "yue":
      return "zh-HK";
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

/** Candidate locales for Azure continuous language ID (max practical set). */
export const AZURE_AUTO_CANDIDATES = [
  "zh-CN",
  "zh-HK",
  "en-US",
  "ko-KR",
  "ja-JP",
] as const;

export function toAzureTargetLang(uiTarget: string): string {
  return uiTarget;
}

export { uiSourceToTranslateSource, uiTargetToTranslateTarget };
