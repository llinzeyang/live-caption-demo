export type SamplePlayback = {
  mediaStream: MediaStream;
  /** Resolves when the spoken sample finishes (stream may stay silent until stop). */
  ended: Promise<void>;
  /** Begin audible playback into speakers + MediaStream. */
  start: () => void;
  stop: () => void;
};

const SAMPLE_BY_SOURCE: Record<string, string> = {
  cmn: "/samples/cmn.wav",
  yue: "/samples/yue.mp3",
  "en-US": "/samples/en-US.wav",
  "ko-KR": "/samples/ko-KR.mp3",
  "ja-JP": "/samples/ja-JP.mp3",
  auto: "/samples/cmn.wav",
};

export const TTS_UI_LANGS = ["cmn", "yue", "en-US", "ko-KR", "ja-JP"] as const;

export function sampleUrlForSource(sourceLang: string): string {
  return SAMPLE_BY_SOURCE[sourceLang] ?? SAMPLE_BY_SOURCE.cmn!;
}

/** Leading silence so speakers / STT do not clip the first syllable. */
const LEAD_IN_SECONDS = 0.55;

function withLeadInSilence(
  ctx: AudioContext,
  sourceBuffer: AudioBuffer,
  leadInSeconds = LEAD_IN_SECONDS,
): AudioBuffer {
  const leadFrames = Math.ceil(sourceBuffer.sampleRate * leadInSeconds);
  const out = ctx.createBuffer(
    sourceBuffer.numberOfChannels,
    leadFrames + sourceBuffer.length,
    sourceBuffer.sampleRate,
  );
  for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
    out.copyToChannel(sourceBuffer.getChannelData(ch), ch, leadFrames);
  }
  return out;
}

/**
 * Decode audio bytes and expose them as a MediaStream.
 * Call `start()` after the caption session is listening so STT does not miss
 * the beginning of the clip.
 */
export async function preparePlaybackFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
): Promise<SamplePlayback> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  await ctx.resume();

  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const audioBuffer = withLeadInSilence(ctx, decoded);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;

  const dest = ctx.createMediaStreamDestination();
  source.connect(ctx.destination);
  source.connect(dest);

  let started = false;
  let stopped = false;
  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  source.onended = () => {
    resolveEnded();
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    try {
      source.onended = null;
      if (started) source.stop();
    } catch {
      // already stopped
    }
    try {
      source.disconnect();
    } catch {
      // ignore
    }
    dest.stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    resolveEnded();
  };

  return {
    mediaStream: dest.stream,
    ended,
    start: () => {
      if (started || stopped) return;
      started = true;
      // Resume may be needed after async TTS fetch loses the click gesture.
      void ctx.resume().finally(() => {
        if (stopped) return;
        try {
          source.start(0);
        } catch {
          resolveEnded();
        }
      });
    },
    stop,
  };
}

export async function prepareSamplePlayback(
  url: string,
): Promise<SamplePlayback> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load sample audio (${res.status}): ${url}`);
  }
  return preparePlaybackFromArrayBuffer(await res.arrayBuffer());
}
