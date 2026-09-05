// Groq API calls. There is no backend: the key goes from this page straight
// to api.groq.com and nowhere else.

import { ApiError as Err } from './api-error';
import type { Word } from './types';

const BASE = 'https://api.groq.com/openai/v1';

// Turbo is roughly twice as fast and noticeably sloppier: it mishears more on
// accented or hesitant speech and frequently returns long stretches with no
// punctuation at all, which costs both accuracy and readability. For a tool
// whose whole job is judging what was said, accuracy wins by default.
export const STT_MODELS = [
  { id: 'whisper-large-v3', label: 'Whisper large-v3 — most accurate' },
  { id: 'whisper-large-v3-turbo', label: 'Whisper large-v3 turbo — faster, sloppier' },
] as const;

export const STT_MODEL = STT_MODELS[0].id;

export { ApiError } from './api-error';

interface GroqErrorBody {
  error?: { message?: string; code?: string; failed_generation?: string };
}

async function readError(res: Response): Promise<{ message: string; code: string; partial: string }> {
  let detail = '';
  let code = '';
  let partial = '';
  try {
    const body = (await res.json()) as GroqErrorBody;
    detail = body?.error?.message ?? '';
    code = body?.error?.code ?? '';
    // Groq returns the model's partial output here when generation fails
    // validation. Without it a JSON failure is undebuggable.
    partial = body?.error?.failed_generation ?? '';
  } catch {
    /* non-JSON error body */
  }

  let message = detail || `Groq returned ${res.status}.`;
  if (res.status === 401) message = 'That API key was rejected. Check it in the API key dialog.';
  else if (res.status === 413) message = 'That file is too large for the free tier (25 MB per request).';
  else if (res.status === 429)
    message = 'Rate limit hit. The free tier allows 20 requests a minute — wait a moment and retry.';

  return { message, code, partial };
}

async function throwApi(res: Response): Promise<never> {
  const { message, code, partial } = await readError(res);
  throw new Err(message, res.status, code, partial);
}

interface WhisperSegment {
  start: number;
  end: number;
  avg_logprob?: number;
  no_speech_prob?: number;
}

interface WhisperResponse {
  text?: string;
  language?: string;
  words?: { word?: string; start: number; end: number }[];
  segments?: WhisperSegment[];
}

// Whisper reports how sure it was, per segment. Below this the transcript of
// that stretch is doubtful, and a "mistake" found inside it is more likely to
// be Whisper's than the speaker's. avg_logprob runs about -0.1 on clean speech
// and falls away sharply as the audio gets harder.
const SHAKY_LOGPROB = -0.62;
const SHAKY_NO_SPEECH = 0.5;

/**
 * Transcribe one or more chunks, stitching timestamps back onto one timeline.
 * Word-level timings require verbose_json plus timestamp_granularities[]=word.
 */
export async function transcribe({
  chunks,
  apiKey,
  language,
  model = STT_MODEL,
  onChunk,
}: {
  chunks: { blob: Blob; offset: number }[];
  apiKey: string;
  language?: string;
  model?: string;
  onChunk?: (done: number, total: number) => void;
}): Promise<{ words: Word[]; language: string; text: string }> {
  const words: Word[] = [];
  let detected = language ?? '';
  let text = '';

  for (let i = 0; i < chunks.length; i++) {
    const { blob, offset } = chunks[i];
    const form = new FormData();
    form.append('file', blob, 'audio.wav');
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    // Deterministic decoding: the same recording should transcribe the same
    // way twice, or none of the measurements downstream are reproducible.
    form.append('temperature', '0');
    // Whisper copies the register of its prompt, so a fully punctuated one
    // nudges it toward returning sentence breaks rather than an unbroken run.
    form.append('prompt', 'Transcribe with full punctuation, including commas and full stops.');
    if (language) form.append('language', language);

    const res = await fetch(`${BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) await throwApi(res);

    const data = (await res.json()) as WhisperResponse;
    detected = detected || data.language || '';
    text += (text ? ' ' : '') + (data.text ?? '').trim();

    // A word inherits the confidence of the segment it falls inside, so the
    // analysis can refuse to correct anything Whisper was unsure it heard.
    const shaky = (data.segments ?? []).filter(
      (sg) =>
        (sg.avg_logprob ?? 0) < SHAKY_LOGPROB ||
        (sg.no_speech_prob ?? 0) > SHAKY_NO_SPEECH,
    );

    for (const w of data.words ?? []) {
      const uncertain = shaky.some((sg) => w.start >= sg.start && w.start <= sg.end);
      words.push({
        word: (w.word ?? '').trim(),
        start: +(w.start + offset).toFixed(3),
        end: +(w.end + offset).toFixed(3),
        uncertain,
      });
    }
    onChunk?.(i + 1, chunks.length);
  }

  const kept = words.filter((w) => w.word);
  if (!kept.length) throw new Err('No speech was found in that recording.', 0);
  return { words: kept, language: detected, text };
}
