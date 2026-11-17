/**
 * Local WebSocket proxy for Next.js `next dev` (Windows-friendly).
 * `vercel dev` is not required; production still uses Route Handler + upgradeWebSocket.
 *
 * Usage: npm run dev:ws   (alongside npm run dev)
 */
import { createServer, type IncomingMessage } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { WebSocketServer } from "ws";

import { handleAssemblyConnection } from "../server/assemblyai-stream";
import { handleCloudflareConnection } from "../server/cloudflare-stream";
import { handleDeepgramConnection } from "../server/deepgram-stream";
import { handleGoogleConnection } from "../server/google-stream";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(rootDir, "..", ".env"), override: true });

const PORT = Number(process.env.WS_DEV_PORT?.trim() || 3001);

function requestFromUpgrade(req: IncomingMessage): Request {
  const host = req.headers.host ?? `localhost:${PORT}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  return new Request(url);
}

const server = createServer((_req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(
    "live-caption WS dev server\nPaths: /api/providers/{google|deepgram|assemblyai|cloudflare}/stream\n",
  );
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";
  const handler =
    url.startsWith("/api/providers/deepgram/stream")
      ? handleDeepgramConnection
      : url.startsWith("/api/providers/assemblyai/stream")
        ? handleAssemblyConnection
        : url.startsWith("/api/providers/google/stream")
          ? handleGoogleConnection
          : url.startsWith("/api/providers/cloudflare/stream")
            ? handleCloudflareConnection
            : null;

  if (!handler) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    void handler(ws, requestFromUpgrade(req));
  });
});

server.listen(PORT, () => {
  console.log(
    `[ws-dev] listening on ws://localhost:${PORT} (set NEXT_PUBLIC_WS_ORIGIN=ws://localhost:${PORT})`,
  );
});
