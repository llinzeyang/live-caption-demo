import { upgradeWebSocket } from "@vercel/functions";

import { handleDeepgramConnection } from "@/server/deepgram-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  return upgradeWebSocket((ws) => {
    void handleDeepgramConnection(ws, request);
  });
}
