// Groq API calls. There is no backend: the key goes from this page straight
// to api.groq.com and nowhere else.

import { AnalysisSchema, ANALYSIS_JSON_SCHEMA, type Analysis } from './schema';
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

// `structured` marks the models Groq can hold to a JSON Schema by constrained
// decoding. The others only get json_object mode, which promises valid JSON
// and nothing about its shape, so they fail more often on a schema this size.
export const ANALYSIS_MODELS = [
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B — best explanations', structured: true },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B — fastest', structured: true },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — no schema enforcement', structured: false },
] as const;

export function supportsStructured(model: string): boolean {
  return ANALYSIS_MODELS.some((m) => m.id === model && m.structured);
}

export class ApiError extends Error {
  status: number;
  code: string;
  /** Groq's `failed_generation`: the model's partial output when it broke. */
  partial: string;
  constructor(message: string, status: number, code = '', partial = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.partial = partial;
  }
}

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
  throw new ApiError(message, res.status, code, partial);
}

interface WhisperResponse {
  text?: string;
  language?: string;
  words?: { word?: string; start: number; end: number }[];
}

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

    for (const w of data.words ?? []) {
      words.push({
        word: (w.word ?? '').trim(),
        start: +(w.start + offset).toFixed(3),
        end: +(w.end + offset).toFixed(3),
      });
    }
    onChunk?.(i + 1, chunks.length);
  }

  const kept = words.filter((w) => w.word);
  if (!kept.length) throw new ApiError('No speech was found in that recording.', 0);
  return { words: kept, language: detected, text };
}

/** Ask the model for the error analysis, validated at the boundary. */
export async function analyze({
  system,
  user,
  apiKey,
  model,
}: {
  system: string;
  user: string;
  apiKey: string;
  model: string;
}): Promise<Analysis> {
  // Strict json_schema constrains decoding, so the model cannot emit a token
  // that breaks the shape. json_object only asks for valid JSON and is where
  // reasoning models fall over. Try the strongest mode the model supports and
  // walk down on a validation failure rather than dead-ending the whole run.
  const modes: ResponseFormat[] = supportsStructured(model)
    ? [strictSchema(true), strictSchema(false), { type: 'json_object' }]
    : [{ type: 'json_object' }];

  let last: ApiError | null = null;

  for (const response_format of modes) {
    try {
      return await attempt({ system, user, apiKey, model, response_format });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      // Only a schema/JSON validation failure is worth retrying in a weaker
      // mode. A bad key or a rate limit will fail identically every time.
      const retryable = e.status === 400 && /json|schema|validate/i.test(e.message + e.code);
      if (!retryable) throw e;
      last = e;
    }
  }

  const tail = last?.partial ? `\n\nThe model got as far as:\n${last.partial.slice(0, 300)}…` : '';
  throw new ApiError(
    `${model} could not produce a valid analysis for this recording. Try another model.${tail}`,
    400,
    last?.code ?? '',
    last?.partial ?? '',
  );
}

type ResponseFormat =
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; schema: unknown; strict: boolean } };

function strictSchema(strict: boolean): ResponseFormat {
  return {
    type: 'json_schema',
    json_schema: { name: 'speech_analysis', schema: ANALYSIS_JSON_SCHEMA, strict },
  };
}

async function attempt({
  system, user, apiKey, model, response_format,
}: {
  system: string;
  user: string;
  apiKey: string;
  model: string;
  response_format: ResponseFormat;
}): Promise<Analysis> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // A long recording produces a long analysis. Without headroom the JSON
      // is truncated mid-object and fails validation for the wrong reason.
      max_completion_tokens: 8000,
      response_format,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) await throwApi(res);

  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = data.choices?.[0];
  const raw = choice?.message?.content ?? '';

  if (choice?.finish_reason === 'length') {
    throw new ApiError(
      'The analysis was cut off before it finished. Try a shorter recording.',
      400, 'length', raw,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError('The model returned something that was not valid JSON.', 400, 'json_parse', raw);
  }

  const result = AnalysisSchema.safeParse(parsed);
  if (!result.success) {
    const where = result.error.issues[0]?.path.join('.') || 'root';
    throw new ApiError(
      `The model's response did not match the expected shape (at ${where}).`,
      400, 'schema', raw.slice(0, 400),
    );
  }
  return result.data;
}
