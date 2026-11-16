export type ClientConfig = {
  sourceLang: string;
  targetLang: string;
  sttSource: string;
  translateSource: string;
  translateTarget: string;
};

export function parseQueryConfig(
  request: Request,
  defaults: Partial<ClientConfig> = {},
): ClientConfig | null {
  try {
    const url = new URL(request.url);
    const sourceLang =
      url.searchParams.get("source") ?? defaults.sourceLang ?? "ko-KR";
    const targetLang =
      url.searchParams.get("target") ?? defaults.targetLang ?? "zh-Hant";
    return {
      sourceLang,
      targetLang,
      sttSource:
        url.searchParams.get("sttSource") ??
        defaults.sttSource ??
        sourceLang,
      translateSource:
        url.searchParams.get("translateSource") ??
        defaults.translateSource ??
        "ko",
      translateTarget:
        url.searchParams.get("translateTarget") ??
        defaults.translateTarget ??
        "zh-TW",
    };
  } catch {
    return null;
  }
}
