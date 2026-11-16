import { langLabel } from "./lang-labels";
import {
  preparePlaybackFromArrayBuffer,
  prepareSamplePlayback,
  sampleUrlForSource,
  TTS_UI_LANGS,
  type SamplePlayback,
} from "./lib/sample-playback";
import { bootstrapProviders, listProviders } from "./providers";
import { CaptionSession } from "./session";
import { TranscriptFeed } from "./transcript";

export function bootstrapCaptionDesk(): void {
  const bootFlag = globalThis as typeof globalThis & {
    __liveCaptionDeskBoot?: boolean;
  };
  if (bootFlag.__liveCaptionDeskBoot) return;
  bootFlag.__liveCaptionDeskBoot = true;

bootstrapProviders();

const session = new CaptionSession();
let mediaStream: MediaStream | null = null;
let samplePlayback: SamplePlayback | null = null;
/** Non-mic injected audio session (preset sample or custom TTS). */
let injectedAudioActive = false;
let injectedAudioGeneration = 0;
let injectedStatusLabel = "播放測試音訊…";

const TTS_MAX_CHARS = 500;

const providerSelect = document.querySelector<HTMLSelectElement>("#providerSelect")!;
const sourceLangSelect = document.querySelector<HTMLSelectElement>("#sourceLang")!;
const targetLangSelect = document.querySelector<HTMLSelectElement>("#targetLang")!;
const startBtn = document.querySelector<HTMLButtonElement>("#startBtn")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#stopBtn")!;
const testAudioBtn = document.querySelector<HTMLButtonElement>("#testAudioBtn")!;
const speakRecognizeBtn =
  document.querySelector<HTMLButtonElement>("#speakRecognizeBtn")!;
const customTextEl = document.querySelector<HTMLTextAreaElement>("#customText")!;
const ttsLangSelect = document.querySelector<HTMLSelectElement>("#ttsLang")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const statusChip = document.querySelector<HTMLElement>("#statusChip")!;
const sessionStateEl = document.querySelector<HTMLElement>("#sessionState")!;
const sessionTimerEl = document.querySelector<HTMLElement>("#sessionTimer")!;
const micModuleEl = document.querySelector<HTMLElement>("#micModule")!;
const errorEl = document.querySelector<HTMLElement>("#error")!;
const transcriptListEl = document.querySelector<HTMLElement>("#transcriptList")!;
const emptyTranscriptEl = document.querySelector<HTMLElement>("#emptyTranscript")!;
const recordCountEl = document.querySelector<HTMLElement>("#recordCount")!;
const transcriptViewportEl = document.querySelector<HTMLElement>("#transcriptViewport")!;
const sourceRouteEl = document.querySelector<HTMLElement>("#sourceRoute")!;
const targetRouteEl = document.querySelector<HTMLElement>("#targetRoute")!;
const clearTranscriptBtn =
  document.querySelector<HTMLButtonElement>("#clearTranscriptBtn")!;

const transcriptFeed = new TranscriptFeed(
  transcriptListEl,
  emptyTranscriptEl,
  recordCountEl,
  transcriptViewportEl,
);

let timerStartedAt = 0;
let timerHandle: ReturnType<typeof setInterval> | null = null;

function setStatus(
  text: string,
  state: "idle" | "requesting" | "connecting" | "listening" | "error",
): void {
  statusEl.textContent = text;
  sessionStateEl.textContent = text;
  statusChip.dataset.state = state;
  micModuleEl.dataset.state = state;
}

function setError(message: string | null): void {
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function fillSelect(
  select: HTMLSelectElement,
  values: string[],
  labelFn: (code: string) => string,
  preferred?: string,
): void {
  select.innerHTML = "";
  for (const value of values) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = labelFn(value);
    select.appendChild(opt);
  }
  if (preferred && values.includes(preferred)) {
    select.value = preferred;
  } else if (values[0]) {
    select.value = values[0];
  }
}

function refreshLanguageOptions(preserveSelection = true): void {
  const provider = listProviders().find((p) => p.id === providerSelect.value);
  if (!provider) return;
  const { source, target } = provider.supportedLanguages();
  const prevSource = preserveSelection ? sourceLangSelect.value : undefined;
  const prevTarget = preserveSelection ? targetLangSelect.value : undefined;
  fillSelect(sourceLangSelect, source, langLabel, prevSource ?? "auto");
  fillSelect(targetLangSelect, target, langLabel, prevTarget ?? "zh-Hant");
  updateTranscriptLanguage();
}

function updateTranscriptLanguage(): void {
  sourceRouteEl.textContent = langLabel(sourceLangSelect.value);
  targetRouteEl.textContent = langLabel(targetLangSelect.value);
  transcriptFeed.setLanguagePair(
    sourceLangSelect.value,
    targetLangSelect.value,
  );
}

function bootstrapProviderSelect(): void {
  const providers = listProviders();
  providerSelect.innerHTML = "";
  for (const p of providers) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.displayName;
    providerSelect.appendChild(opt);
  }
  if (providers[0]) {
    providerSelect.value = providers[0].id;
  }
  refreshLanguageOptions(false);
}

function bootstrapTtsLangSelect(): void {
  fillSelect(ttsLangSelect, [...TTS_UI_LANGS], langLabel, "cmn");
}

function cueHandlers() {
  return {
    onCue: (cue: Parameters<typeof transcriptFeed.push>[0]) =>
      transcriptFeed.push(cue),
    onError: (err: Error) => setError(err.message),
    onStatus: (s: "connecting" | "listening" | "stopped") => {
      if (s === "connecting") setStatus("連線翻譯服務…", "connecting");
      else if (s === "listening") {
        setStatus(
          injectedAudioActive ? injectedStatusLabel : "正在聆聽",
          "listening",
        );
      } else if (!injectedAudioActive) {
        setStatus("待命", "idle");
      }
    },
  };
}

async function ensureAudio(): Promise<MediaStream> {
  if (mediaStream) return mediaStream;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  mediaStream = stream;
  return stream;
}

function stopSamplePlayback(): void {
  samplePlayback?.stop();
  samplePlayback = null;
}

function stopMedia(): void {
  stopSamplePlayback();
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
}

function startTimer(): void {
  if (timerHandle) return;
  timerStartedAt = Date.now();
  sessionTimerEl.textContent = "00:00";
  timerHandle = setInterval(() => {
    const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000);
    const minutes = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (elapsed % 60).toString().padStart(2, "0");
    sessionTimerEl.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer(reset = true): void {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  if (reset) sessionTimerEl.textContent = "00:00";
}

function setRunningControls(running: boolean): void {
  startBtn.disabled = running;
  stopBtn.disabled = !running;
  testAudioBtn.disabled = running;
  speakRecognizeBtn.disabled = running;
  customTextEl.disabled = running;
  ttsLangSelect.disabled = running;
}

async function startSession(): Promise<void> {
  if (injectedAudioActive) return;
  setError(null);
  transcriptFeed.clear();
  updateTranscriptLanguage();
  setRunningControls(true);
  setStatus("請求麥克風權限…", "requesting");

  try {
    const stream = await ensureAudio();
    startTimer();

    await session.start(
      providerSelect.value,
      {
        sourceLang: sourceLangSelect.value,
        targetLang: targetLangSelect.value,
        mediaStream: stream,
      },
      cueHandlers(),
    );
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    setStatus("啟動失敗", "error");
    stopMedia();
    stopTimer();
    setRunningControls(false);
  }
}

async function stopSession(): Promise<void> {
  injectedAudioGeneration += 1;
  injectedAudioActive = false;
  stopBtn.disabled = true;
  await session.stop();
  stopTimer();
  stopMedia();
  setRunningControls(false);
  setStatus("待命", "idle");
}

async function runInjectedAudioSession(
  preparePlayback: () => Promise<SamplePlayback>,
  opts: {
    loadStatus: string;
    playingStatus: string;
    failStatus: string;
    sourceLang: string;
  },
): Promise<void> {
  if (session.isRunning || injectedAudioActive) {
    setError("目前正在進行聆聽或朗讀，請先按「停止」再試。");
    return;
  }

  const generation = ++injectedAudioGeneration;
  injectedAudioActive = true;
  injectedStatusLabel = opts.playingStatus;
  setError(null);
  transcriptFeed.clear();
  sourceLangSelect.value = opts.sourceLang;
  updateTranscriptLanguage();
  setRunningControls(true);
  setStatus(opts.loadStatus, "requesting");

  try {
    stopSamplePlayback();
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;

    const playback = await preparePlayback();
    if (generation !== injectedAudioGeneration) {
      playback.stop();
      return;
    }
    samplePlayback = playback;
    mediaStream = playback.mediaStream;
    startTimer();
    setStatus("連線翻譯服務…", "connecting");

    let resolveListening!: () => void;
    const listeningReady = new Promise<void>((resolve) => {
      resolveListening = resolve;
    });
    const handlers = cueHandlers();
    const onStatus = handlers.onStatus;
    handlers.onStatus = (s) => {
      onStatus?.(s);
      if (s === "listening") resolveListening();
    };

    await session.start(
      providerSelect.value,
      {
        sourceLang: opts.sourceLang,
        targetLang: targetLangSelect.value,
        mediaStream: playback.mediaStream,
      },
      handlers,
    );
    if (generation !== injectedAudioGeneration) return;

    // Providers may resolve before upstream STT is ready; wait for listening
    // (or a short timeout) then warm-up silence frames.
    await Promise.race([
      listeningReady,
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);
    if (generation !== injectedAudioGeneration) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (generation !== injectedAudioGeneration) return;

    setStatus(opts.playingStatus, "listening");
    playback.start();
    await playback.ended;
    if (generation !== injectedAudioGeneration) return;

    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (generation !== injectedAudioGeneration) return;

    await stopSession();
  } catch (err) {
    if (generation !== injectedAudioGeneration) return;
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
    setStatus(opts.failStatus, "error");
    injectedAudioActive = false;
    await session.stop();
    stopTimer();
    stopMedia();
    setRunningControls(false);
  }
}

async function runTestAudio(): Promise<void> {
  const sourceLang =
    sourceLangSelect.value === "auto" ? "cmn" : sourceLangSelect.value;
  await runInjectedAudioSession(
    () => prepareSamplePlayback(sampleUrlForSource(sourceLang)),
    {
      loadStatus: "載入測試音訊…",
      playingStatus: "播放測試音訊…",
      failStatus: "測試失敗",
      sourceLang,
    },
  );
}

async function fetchTtsAudio(text: string, lang: string): Promise<ArrayBuffer> {
  const attempt = async (): Promise<Response> =>
    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });

  let res = await attempt();
  if (!res.ok && (res.status === 502 || res.status === 429)) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    res = await attempt();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `語音合成失敗（${res.status}）`);
  }
  return res.arrayBuffer();
}

async function runCustomSpeakRecognize(): Promise<void> {
  const text = customTextEl.value.trim();
  if (!text) {
    setError("請輸入要朗讀的文本。");
    return;
  }
  if (text.length > TTS_MAX_CHARS) {
    setError(`文本過長（最多 ${TTS_MAX_CHARS} 字元）。`);
    return;
  }
  const lang = ttsLangSelect.value;

  await runInjectedAudioSession(
    async () => {
      setStatus("合成語音…", "requesting");
      const buf = await fetchTtsAudio(text, lang);
      return preparePlaybackFromArrayBuffer(buf);
    },
    {
      loadStatus: "合成語音…",
      playingStatus: "朗讀並辨識中…",
      failStatus: "朗讀辨識失敗",
      sourceLang: lang,
    },
  );
}

async function restartIfRunning(): Promise<void> {
  if (!session.isRunning || injectedAudioActive) return;
  try {
    setError(null);
    updateTranscriptLanguage();
    await session.start(
      providerSelect.value,
      {
        sourceLang: sourceLangSelect.value,
        targetLang: targetLangSelect.value,
        mediaStream: mediaStream ?? undefined,
      },
      cueHandlers(),
    );
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    setStatus("切換失敗", "error");
    stopTimer();
    stopMedia();
    setRunningControls(false);
  }
}

bootstrapProviderSelect();
bootstrapTtsLangSelect();

startBtn.addEventListener("click", () => {
  void startSession();
});

stopBtn.addEventListener("click", () => {
  void stopSession();
});

testAudioBtn.addEventListener("click", () => {
  void runTestAudio();
});

speakRecognizeBtn.addEventListener("click", () => {
  void runCustomSpeakRecognize();
});

providerSelect.addEventListener("change", () => {
  refreshLanguageOptions(false);
  void restartIfRunning();
});

sourceLangSelect.addEventListener("change", () => {
  updateTranscriptLanguage();
  void restartIfRunning();
});

targetLangSelect.addEventListener("change", () => {
  updateTranscriptLanguage();
  void restartIfRunning();
});

clearTranscriptBtn.addEventListener("click", () => {
  transcriptFeed.clear();
});
}
