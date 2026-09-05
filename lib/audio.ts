// Audio extraction, entirely in the browser.
// The source file never leaves the machine: we decode it, downmix to 16 kHz
// mono, and upload only that. A 32 MB video becomes roughly 1 MB of audio,
// which is also what keeps us under Groq's 25 MB free-tier cap.

export const TARGET_RATE = 16000;

// 16 kHz mono 16-bit PCM runs 32 kB/s, so we split well before the 25 MB cap
// and stitch the timestamps back onto one timeline.
const MAX_CHUNK_BYTES = 20 * 1024 * 1024;
const MAX_CHUNK_SEC = Math.floor(MAX_CHUNK_BYTES / (TARGET_RATE * 2));

export interface Chunk {
  blob: Blob;
  offset: number;
}

export class UnsupportedFileError extends Error {}

/** Decode any file the browser can handle into an AudioBuffer. */
export async function decode(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(bytes);
  } catch {
    throw new UnsupportedFileError("This browser could not decode that file's audio track.");
  } finally {
    void ctx.close();
  }
}

/** Downmix to mono and resample to 16 kHz. */
export async function toMono16k(buffer: AudioBuffer): Promise<Float32Array> {
  const frames = Math.max(1, Math.round(buffer.duration * TARGET_RATE));
  const off = new OfflineAudioContext(1, frames, TARGET_RATE);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/** Encode Float32 samples as a 16-bit PCM WAV blob. */
export function encodeWav(samples: Float32Array, rate = TARGET_RATE): Blob {
  const bytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const view = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  str(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);       // PCM header size
  view.setUint16(20, 1, true);        // format: PCM
  view.setUint16(22, 1, true);        // channels
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true);        // block align
  view.setUint16(34, 16, true);       // bits per sample
  str(36, 'data');
  view.setUint32(40, bytes, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Split into upload-sized pieces. Each piece carries the offset in seconds
 * that has to be added back to every timestamp Whisper returns for it.
 */
export function chunk(samples: Float32Array, rate = TARGET_RATE): Chunk[] {
  const per = MAX_CHUNK_SEC * rate;
  if (samples.length <= per) return [{ blob: encodeWav(samples, rate), offset: 0 }];

  const out: Chunk[] = [];
  for (let start = 0; start < samples.length; start += per) {
    out.push({
      blob: encodeWav(samples.subarray(start, start + per) as Float32Array, rate),
      offset: start / rate,
    });
  }
  return out;
}

/** Peak envelope for the waveform, reduced to `buckets` values in 0..1. */
export function envelope(samples: Float32Array, buckets = 340): number[] {
  const per = samples.length / buckets;
  const out = new Array<number>(buckets);
  let max = 0;
  for (let i = 0; i < buckets; i++) {
    const s = Math.floor(i * per);
    const e = Math.min(samples.length, Math.floor((i + 1) * per));
    let sum = 0;
    for (let j = s; j < e; j++) sum += samples[j] * samples[j];
    const rms = Math.sqrt(sum / Math.max(1, e - s));
    out[i] = rms;
    if (rms > max) max = rms;
  }
  // Perceptual curve, so quiet speech still reads on the canvas.
  return out.map((v) => +Math.pow(v / (max || 1), 0.62).toFixed(3));
}

/** A playable copy of the extracted audio, for the report's player. */
export function playableUrl(samples: Float32Array, rate = TARGET_RATE): string {
  return URL.createObjectURL(encodeWav(samples, rate));
}
