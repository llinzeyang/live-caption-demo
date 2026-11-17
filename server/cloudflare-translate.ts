/**
 * Translate via Cloudflare Workers AI `@cf/meta/m2m100-1.2b`.
 * Language args use short codes (en, ko, ja, zh, …) per Workers AI docs.
 */

function readCloudflareAuth(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error(
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN. Create a Workers AI token in the Cloudflare dashboard.",
    );
  }
  return { accountId, token };
}

/** Map demo translate codes → m2m100 source/target_lang. */
export function toM2m100Lang(code: string): string {
  const c = code.trim();
  const lower = c.toLowerCase();
  if (!lower || lower === "auto") return "en";
  if (lower.startsWith("zh") || lower === "cmn" || lower === "yue") return "zh";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("ja")) return "ja";
  return lower.split("-")[0] || "en";
}

export async function translateWithCloudflare(opts: {
  text: string;
  from: string;
  to: string;
}): Promise<string> {
  const { accountId, token } = readCloudflareAuth();
  const source_lang = toM2m100Lang(opts.from);
  const target_lang = toM2m100Lang(opts.to);

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/m2m100-1.2b`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: opts.text,
      source_lang,
      target_lang,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Cloudflare m2m100 failed (${res.status}): ${detail || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    success?: boolean;
    result?: { translated_text?: string; text?: string } | string;
    errors?: Array<{ message?: string }>;
  };

  if (json.success === false) {
    const msg = json.errors?.[0]?.message ?? "Cloudflare AI run failed";
    throw new Error(msg);
  }

  const result = json.result;
  if (typeof result === "string" && result.trim()) return result.trim();
  if (result && typeof result === "object") {
    const out =
      result.translated_text?.trim() ||
      (typeof result.text === "string" ? result.text.trim() : "");
    if (out) return out;
  }

  throw new Error("Cloudflare m2m100 returned empty translation");
}
