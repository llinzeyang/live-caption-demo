import { upgradeWebSocket } from "@vercel/functions";

import { handleGoogleConnection } from "@/server/google-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  return upgradeWebSocket((ws) => {
    void handleGoogleConnection(ws, request);
  });
}
