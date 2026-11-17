import {
  UI_SOURCE_LANGS,
  UI_TARGET_LANGS,
  uiSourceToTranslateSource,
  uiTargetToTranslateTarget,
} from "../../languages";

export const CLOUDFLARE_SOURCE_LANGS = [...UI_SOURCE_LANGS];
export const CLOUDFLARE_TARGET_LANGS = [...UI_TARGET_LANGS];

/**
 * Map UI source → Nova-3 `language` query param (URL / config only).
 * zh / ko are rejected by Nova-3 WS; the server switches those to Whisper chunks.
 */
export function toCloudflareSttSource(uiSource: string): string {
  switch (uiSource) {
    case "en-US":
      return "en-US";
    case "ja-JP":
      return "ja";
    case "cmn":
    case "yue":
    case "ko-KR":
    case "auto":
      return "multi";
    default:
      return "multi";
  }
}

/**
 * Hints when STT language is `multi`.
 * Prefer specific BCP-47 hints (zh-CN) — bare `zh` is too weak and Nova-3
 * may mis-detect Mandarin as Portuguese.
 */
export function toCloudflareLanguageHints(uiSource: string): string[] {
  switch (uiSource) {
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

export function toCloudflareTranslateSource(uiSource: string): string {
  return uiSourceToTranslateSource(uiSource);
}

export function toCloudflareTranslateTarget(uiTarget: string): string {
  return uiTargetToTranslateTarget(uiTarget);
}
