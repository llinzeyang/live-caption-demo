import {
  UI_SOURCE_LANGS,
  UI_TARGET_LANGS,
  uiSourceToTranslateSource,
  uiTargetToTranslateTarget,
} from "../../languages";

export const ASSEMBLYAI_SOURCE_LANGS = [...UI_SOURCE_LANGS];
export const ASSEMBLYAI_TARGET_LANGS = [...UI_TARGET_LANGS];

export function toAssemblyAiSttSource(uiSource: string): string {
  switch (uiSource) {
    case "cmn":
      return "zh";
    case "yue":
      return "yue";
    case "en-US":
      return "en";
    case "ko-KR":
      return "ko";
    case "ja-JP":
      return "ja";
    case "auto":
      return "";
    default:
      return uiSource.split("-")[0] ?? uiSource;
  }
}

export function toAssemblyAiTranslateSource(uiSource: string): string {
  return uiSourceToTranslateSource(uiSource);
}

export function toAssemblyAiTranslateTarget(uiTarget: string): string {
  return uiTargetToTranslateTarget(uiTarget);
}
