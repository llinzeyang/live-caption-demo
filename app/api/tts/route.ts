import { synthesizeSpeech, TTS_LANGS, TTS_MAX_CHARS } from "@/server/tts";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: unknown;
      lang?: unknown;
    };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const lang = typeof body.lang === "string" ? body.lang : "";

    if (!text) {
      return Response.json({ error: "請輸入要朗讀的文本。" }, { status: 400 });
    }
    if (text.length > TTS_MAX_CHARS) {
      return Response.json(
        { error: `文本過長（最多 ${TTS_MAX_CHARS} 字元）。` },
        { status: 400 },
      );
    }
    if (!TTS_LANGS.includes(lang)) {
      return Response.json(
        { error: `不支援的朗讀語言。可用：${TTS_LANGS.join(", ")}` },
        { status: 400 },
      );
    }

    const audio = await synthesizeSpeech(text, lang);
    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
