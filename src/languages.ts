/**
 * Shared UI language codes for every CaptionProvider.
 * Source uses dialect-aware Chinese (普通話 / 粵語) plus auto-detect.
 */

export const UI_SOURCE_LANGS = [
  "auto",
  "cmn",
  "yue",
  "en-US",
  "ko-KR",
  "ja-JP",
] as const;

export type UiSourceLang = (typeof UI_SOURCE_LANGS)[number];

export const UI_TARGET_LANGS = [
  "zh-Hant",
  "zh-Hans",
  "en",
  "ko",
  "ja",
] as const;

export type UiTargetLang = (typeof UI_TARGET_LANGS)[number];

const LABELS: Record<string, string> = {
  auto: "自動偵測",
  cmn: "普通話",
  yue: "粵語",
  "en-US": "英語",
  "ko-KR": "韓語",
  "ja-JP": "日語",
  "zh-Hant": "繁體中文",
  "zh-Hans": "簡體中文",
  en: "英語",
  ko: "韓語",
  ja: "日語",
};

export function langLabel(code: string): string {
  return LABELS[code] ?? code;
}

/** Map a detected STT language tag → DeepL / Google Translate `from` code. */
export function detectedToTranslateSource(detected: string | undefined | null): string {
  if (!detected) return "en";
  const d = detected.trim().toLowerCase();
  if (d === "yue" || d.startsWith("yue") || d === "zh-hk" || d.includes("hk")) {
    return "zh-TW";
  }
  if (d.startsWith("zh") || d.startsWith("cmn")) {
    if (d.includes("tw") || d.includes("hant") || d.includes("hk")) return "zh-TW";
    return "zh-CN";
  }
  if (d.startsWith("en")) return "en";
  if (d.startsWith("ko")) return "ko";
  if (d.startsWith("ja")) return "ja";
  return d.split("-")[0] || "en";
}

/** Default translate `from` when UI source is fixed (not auto). */
export function uiSourceToTranslateSource(uiSource: string): string {
  switch (uiSource) {
    case "cmn":
      return "zh-CN";
    case "yue":
      return "zh-TW";
    case "en-US":
      return "en";
    case "ko-KR":
      return "ko";
    case "ja-JP":
      return "ja";
    case "auto":
      return "en";
    default:
      return uiSource.split("-")[0] ?? uiSource;
  }
}

export function uiTargetToTranslateTarget(uiTarget: string): string {
  switch (uiTarget) {
    case "zh-Hant":
      return "zh-TW";
    case "zh-Hans":
      return "zh-CN";
    default:
      return uiTarget;
  }
}
