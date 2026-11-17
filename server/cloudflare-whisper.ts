/**
 * Chunked STT via Cloudflare `@cf/openai/whisper-large-v3-turbo`.
 * Used when Nova-3 WebSocket cannot take an explicit zh/ko language (HTTP 400).
 */

const SAMPLE_RATE = 16_000;

function readAuth(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error(
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN.",
    );
  }
  return { accountId, token };
}

/** UI / translate source → Whisper `language` code. */
export function toWhisperLanguage(sourceLang: string): string {
  switch (sourceLang) {
    case "cmn":
      return "zh";
    case "yue":
      return "yue";
    case "ko-KR":
      return "ko";
    case "ja-JP":
      return "ja";
    case "en-US":
      return "en";
    default:
      return "zh";
  }
}

/** Build a minimal WAV container around 16-bit mono PCM. */
export function pcm16MonoToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const dataSize = pcm.byteLength;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, 44);
  return buffer;
}

export async function transcribeWithCloudflareWhisper(opts: {
  pcm: Buffer;
  language: string;
}): Promise<string> {
  if (opts.pcm.byteLength < 3200) {
    // < ~100ms of audio — skip
    return "";
  }

  const { accountId, token } = readAuth();
  const wav = pcm16MonoToWav(opts.pcm);
  const audio = wav.toString("base64");

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/whisper-large-v3-turbo`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio,
      task: "transcribe",
      language: opts.language,
      vad_filter: true,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Cloudflare Whisper failed (${res.status}): ${detail || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    success?: boolean;
    result?: { text?: string; transcription?: string } | string;
    errors?: Array<{ message?: string }>;
  };

  if (json.success === false) {
    throw new Error(json.errors?.[0]?.message ?? "Cloudflare Whisper failed");
  }

  const result = json.result;
  if (typeof result === "string") return result.trim();
  if (result && typeof result === "object") {
    return (result.text ?? result.transcription ?? "").trim();
  }
  return "";
}
