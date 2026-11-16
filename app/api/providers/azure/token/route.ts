export const runtime = "nodejs";

export async function GET() {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim();

  if (!key || !region) {
    return Response.json(
      {
        error:
          "Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION. Copy .env.example to .env and fill in your Speech resource values.",
      },
      { status: 500 },
    );
  }

  try {
    const tokenRes = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Length": "0",
        },
      },
    );

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return Response.json(
        {
          error: `Azure STS failed (${tokenRes.status}): ${detail || tokenRes.statusText}`,
        },
        { status: 502 },
      );
    }

    const token = await tokenRes.text();
    return Response.json({ token, region });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
