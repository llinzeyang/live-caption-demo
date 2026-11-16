import { v2 as translateV2 } from "@google-cloud/translate";

import { googleCredentialsConfigured } from "./gcp-credentials";

/** Map a detected STT language tag → DeepL / Google Translate `from` code. */
export function detectedToTranslateSource(
  detected: string | undefined | null,
): string {
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

/**
 * Shared text translation for streaming caption proxies.
 * Prefer DeepL when DEEPL_API_KEY is set; otherwise Google Cloud Translation.
 */
export async function translateText(opts: {
  text: string;
  from: string;
  to: string;
}): Promise<string> {
  const deeplKey = process.env.DEEPL_API_KEY?.trim();
  if (deeplKey) {
    return translateWithDeepL(opts.text, opts.from, opts.to, deeplKey);
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (projectId && googleCredentialsConfigured()) {
    const client = new translateV2.Translate({ projectId });
    const [translated] = await client.translate(opts.text, {
      ...(opts.from && opts.from !== "auto" ? { from: opts.from } : {}),
      to: opts.to,
    });
    return typeof translated === "string" ? translated : String(translated);
  }

  throw new Error(
    "No translation backend configured. Set DEEPL_API_KEY, or GOOGLE_CLOUD_PROJECT + GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_JSON.",
  );
}

function toDeepLLang(code: string, kind: "source" | "target"): string {
  const base = code.trim();
  const map: Record<string, string> = {
    ko: "KO",
    "ko-KR": "KO",
    en: "EN",
    "en-US": "EN",
    "en-GB": "EN-GB",
    ja: "JA",
    "ja-JP": "JA",
    "zh-CN": "ZH",
    "zh-Hans": "ZH",
    "zh-TW": "ZH-HANT",
    "zh-Hant": "ZH-HANT",
    zh: kind === "target" ? "ZH-HANT" : "ZH",
  };
  return map[base] ?? base.toUpperCase();
}

async function translateWithDeepL(
  text: string,
  from: string,
  to: string,
  apiKey: string,
): Promise<string> {
  const free =
    apiKey.endsWith(":fx") || process.env.DEEPL_API_URL?.includes("api-free");
  const endpoint =
    process.env.DEEPL_API_URL?.trim() ||
    (free
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate");

  const body = new URLSearchParams();
  body.set("text", text);
  const fromNorm = from.trim().toLowerCase();
  if (fromNorm && fromNorm !== "auto") {
    body.set("source_lang", toDeepLLang(from, "source").split("-")[0]!);
  }
  body.set("target_lang", toDeepLLang(to, "target"));

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `DeepL failed (${res.status}): ${detail || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    translations?: Array<{ text?: string }>;
  };
  const out = json.translations?.[0]?.text?.trim();
  if (!out) throw new Error("DeepL returned empty translation");
  return out;
}
