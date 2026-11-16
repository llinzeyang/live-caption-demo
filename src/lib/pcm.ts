const TARGET_RATE = 16000;

export type PcmCapture = {
  stop: () => void;
};

/**
 * Pull mono PCM16 @ 16 kHz from an existing MediaStream and deliver frames.
 * Uses ScriptProcessor for broad browser support in this demo.
 */
export function startPcmCapture(
  mediaStream: MediaStream,
  onFrame: (pcm: ArrayBuffer) => void,
): PcmCapture {
  const audioTracks = mediaStream.getAudioTracks();
  if (audioTracks.length === 0) {
    throw new Error("MediaStream has no audio track");
  }

  const audioStream = new MediaStream([audioTracks[0]!]);
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(audioStream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;

  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm = downsampleTo16kInt16(input, ctx.sampleRate);
    if (pcm.byteLength > 0) {
      onFrame(pcm.buffer as ArrayBuffer);
    }
  };

  void ctx.resume();

  return {
    stop: () => {
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
        source.disconnect();
        mute.disconnect();
      } catch {
        // ignore
      }
      void ctx.close();
    },
  };
}

function downsampleTo16kInt16(input: Float32Array, inputRate: number): Int16Array {
  if (inputRate === TARGET_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]!));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  const ratio = inputRate / TARGET_RATE;
  const newLength = Math.floor(input.length / ratio);
  const out = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < input.length; j++) {
      sum += input[j]!;
      count++;
    }
    const sample = count ? sum / count : 0;
    const s = Math.max(-1, Math.min(1, sample));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
