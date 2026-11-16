import { upgradeWebSocket } from "@vercel/functions";

import { handleAssemblyConnection } from "@/server/assemblyai-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  return upgradeWebSocket((ws) => {
    void handleAssemblyConnection(ws, request);
  });
}
