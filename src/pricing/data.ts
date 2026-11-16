/** Static public list prices for this demo's four caption pipelines (USD). */

export const PRICING_AS_OF = "2026-11";

export const DEFAULT_HOURS = 1;
export const DEFAULT_CHARS_PER_HOUR = 10_000;

export type EnginePricing = {
  id: string;
  name: string;
  composition: string;
  /** STT / session rate in USD per audio (or session) hour. */
  sttHourlyUsd: number;
  /** Machine translation USD per 1M characters; 0 if bundled into STT. */
  mtPerMillionUsd: number;
  unitLabel: string;
  notes: string;
  freeTierNote: string;
  docsUrl: string;
};

export const ENGINES: EnginePricing[] = [
  {
    id: "azure",
    name: "Azure Speech Translation",
    composition: "Speech Translation（STT + 翻譯，最多 2 個目標語）",
    sttHourlyUsd: 2.5,
    mtPerMillionUsd: 0,
    unitLabel: "$2.50 / audio hour",
    notes: "一站式計費；第 3 個以上目標語另依 Translator 計費。",
    freeTierNote: "F0：每月約 5 audio hours 免費額度。",
    docsUrl: "https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/",
  },
  {
    id: "google",
    name: "Google Speech + Translation",
    composition: "Speech-to-Text V2 Standard + Cloud Translation NMT",
    sttHourlyUsd: 0.016 * 60, // $0.96 / hr
    mtPerMillionUsd: 20,
    unitLabel: "STT $0.016/min + MT $20/1M chars",
    notes: "即時辨識依成功處理的音訊秒數計費。",
    freeTierNote: "Translation：每月前 50 萬字元約等同 $10 credit。",
    docsUrl: "https://cloud.google.com/speech-to-text/pricing",
  },
  {
    id: "deepgram",
    name: "Deepgram + DeepL",
    composition: "Nova streaming（nova-2／auto 時 nova-3）+ DeepL 字元",
    sttHourlyUsd: 0.0077 * 60, // Nova-3 monolingual PAYG list
    mtPerMillionUsd: 25,
    unitLabel: "Nova-3 ~$0.0077/min + DeepL ~$25/1M",
    notes: "auto／多語 Nova-3 約 $0.0092/min；Growth 方案更低。",
    freeTierNote: "DeepL Free：約 50 萬字元／月（不可商用）。",
    docsUrl: "https://deepgram.com/pricing",
  },
  {
    id: "assemblyai",
    name: "AssemblyAI + DeepL",
    composition: "universal-3-6-pro session 時長 + DeepL 字元",
    sttHourlyUsd: 0.45,
    mtPerMillionUsd: 25,
    unitLabel: "$0.45 / session hour + DeepL ~$25/1M",
    notes: "串流依 WebSocket 開線時長計費，非僅音訊秒數。",
    freeTierNote: "DeepL Free：約 50 萬字元／月（不可商用）。",
    docsUrl: "https://www.assemblyai.com/pricing",
  },
];

export type CostEstimate = {
  engineId: string;
  sttUsd: number;
  mtUsd: number;
  totalUsd: number;
};

export function estimateCost(
  engine: EnginePricing,
  hours: number,
  charsPerHour: number,
): CostEstimate {
  const sttUsd = engine.sttHourlyUsd * hours;
  const mtUsd =
    engine.mtPerMillionUsd > 0
      ? (charsPerHour * hours) / 1_000_000 * engine.mtPerMillionUsd
      : 0;
  return {
    engineId: engine.id,
    sttUsd,
    mtUsd,
    totalUsd: sttUsd + mtUsd,
  };
}

export function formatUsd(value: number): string {
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 10) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(2)}`;
}
