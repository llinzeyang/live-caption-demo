import { translateText } from "./translate";

export const TTS_MAX_CHARS = 500;
const CHUNK_MAX = 180;

const LANG_TO_TTS: Record<string, string> = {
  cmn: "zh-CN",
  yue: "yue",
  "en-US": "en",
  "ko-KR": "ko",
  "ja-JP": "ja",
};

/** Fallback codes when primary Google TTS locale fails. */
const LANG_TTS_FALLBACK: Record<string, string[]> = {
  yue: ["zh-HK", "zh-TW"],
  cmn: ["zh"],
};

export const TTS_LANGS = Object.keys(LANG_TO_TTS);

function splitText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= CHUNK_MAX) return [normalized];

  const parts: string[] = [];
  let rest = normalized;
  while (rest.length > CHUNK_MAX) {
    const window = rest.slice(0, CHUNK_MAX);
    const breakAt = Math.max(
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
      window.lastIndexOf("."),
      window.lastIndexOf("!"),
      window.lastIndexOf("?"),
      window.lastIndexOf("，"),
      window.lastIndexOf(","),
      window.lastIndexOf(" "),
    );
    const cut = breakAt > 20 ? breakAt + 1 : CHUNK_MAX;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

async function fetchChunkMp3(text: string, ttsLang: string): Promise<Buffer> {
  const url = new URL("https://translate.google.com/translate_tts");
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("client", "tw-ob");
  url.searchParams.set("tl", ttsLang);
  url.searchParams.set("q", text);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://translate.google.com/",
      Accept: "*/*",
    },
  });
  if (!res.ok) {
    throw new Error(`TTS upstream failed (${res.status}) for tl=${ttsLang}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 100) {
    throw new Error(`TTS upstream returned empty audio for tl=${ttsLang}`);
  }
  return buf;
}

async function fetchChunkWithFallback(
  text: string,
  lang: string,
): Promise<Buffer> {
  const primary = LANG_TO_TTS[lang];
  if (!primary) throw new Error(`Unsupported TTS language: ${lang}`);
  const candidates = [primary, ...(LANG_TTS_FALLBACK[lang] ?? [])];
  let lastErr: Error | null = null;
  for (const tl of candidates) {
    try {
      return await fetchChunkMp3(text, tl);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error("TTS failed");
}

/** Map UI TTS lang → translation target. Chinese locales speak input as-is. */
function translateTargetForTtsLang(lang: string): string | null {
  switch (lang) {
    case "en-US":
      return "en";
    case "ko-KR":
      return "ko";
    case "ja-JP":
      return "ja";
    case "cmn":
    case "yue":
      return null;
    default:
      return null;
  }
}

/**
 * If 朗讀語言 is EN/KO/JA, translate the typed text into that language first
 * so TTS actually speaks that language (not Chinese characters with a foreign voice).
 */
export async function prepareSpeakText(
  text: string,
  lang: string,
): Promise<string> {
  const target = translateTargetForTtsLang(lang);
  if (!target) return text;
  const translated = await translateText({
    text,
    from: "auto",
    to: target,
  });
  return translated.trim() || text;
}

export async function synthesizeSpeech(
  text: string,
  lang: string,
): Promise<Buffer> {
  if (!LANG_TO_TTS[lang]) {
    throw new Error(`Unsupported TTS language: ${lang}`);
  }
  const speakText = await prepareSpeakText(text, lang);
  const chunks = splitText(speakText);
  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    buffers.push(await fetchChunkWithFallback(chunk, lang));
  }
  return Buffer.concat(buffers);
}
