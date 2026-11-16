import { config } from "dotenv";
import path from "node:path";
import { WebSocket } from "ws";

config({ path: path.join(process.cwd(), ".env"), override: true });

const key = (process.env.ASSEMBLYAI_API_KEY ?? "").trim();
const model =
  process.env.ASSEMBLYAI_SPEECH_MODEL?.trim() || "universal-streaming-multilingual";

console.log(
  JSON.stringify({
    keyLen: key.length,
    model,
  }),
);

function probe(label, query) {
  return new Promise((resolve) => {
    const url = `wss://streaming.assemblyai.com/v3/ws?${query}`;
    console.log("\n==>", label, url);
    const ws = new WebSocket(url, { headers: { Authorization: key } });
    const timer = setTimeout(() => {
      console.log(label, "TIMEOUT");
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      resolve();
    }, 6000);

    ws.on("open", () => {
      console.log(label, "OPEN");
      // 100ms of silence @ 16kHz mono PCM16
      const silence = Buffer.alloc(3200);
      ws.send(silence);
      setTimeout(() => {
        ws.send(JSON.stringify({ type: "Terminate" }));
      }, 1500);
    });

    ws.on("message", (data) => {
      const text = data.toString();
      console.log(label, "MSG", text.slice(0, 400));
    });

    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        console.log(
          label,
          "FAIL",
          res.statusCode,
          Buffer.concat(chunks).toString("utf8").slice(0, 400),
        );
        resolve();
      });
    });

    ws.on("close", (code, reason) => {
      clearTimeout(timer);
      console.log(label, "CLOSE", code, reason?.toString?.() || "");
      resolve();
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      console.log(label, "ERR", err.message);
      resolve();
    });
  });
}

const base = new URLSearchParams({
  sample_rate: "16000",
  speech_model: model,
  format_turns: "true",
});

await probe("plain", base.toString());

const withZh = new URLSearchParams(base);
withZh.set("language_codes", "zh");
await probe("lang-zh", withZh.toString());

const withJson = new URLSearchParams(base);
withJson.set("language_codes", JSON.stringify(["zh"]));
await probe("lang-json", withJson.toString());

const withPro = new URLSearchParams({
  sample_rate: "16000",
  speech_model: "universal-3-6-pro",
  format_turns: "true",
  language_codes: "zh",
});
await probe("pro-zh", withPro.toString());
