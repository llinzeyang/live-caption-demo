import { upgradeWebSocket } from "@vercel/functions";

import { handleCloudflareConnection } from "@/server/cloudflare-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  return upgradeWebSocket((ws) => {
    void handleCloudflareConnection(ws, request);
  });
}
