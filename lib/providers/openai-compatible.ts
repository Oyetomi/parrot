// Groq and Mistral both speak the OpenAI chat-completions dialect, including
// the same `response_format: json_schema` for constrained decoding, so one
// implementation serves both. Only the base URL, the name and the model list
// differ.

import { ApiError, friendly } from '../api-error';
import { AnalysisSchema, ANALYSIS_JSON_SCHEMA, type Analysis } from '../schema';
import type { AnalysisRequest, ModelChoice } from './types';

interface ErrorBody {
  error?: { message?: string; code?: string; failed_generation?: string };
  message?: string;
}

async function readError(res: Response, name: string) {
  let detail = '';
  let code = '';
  let partial = '';
  try {
    const body = (await res.json()) as ErrorBody;
    detail = body?.error?.message ?? body?.message ?? '';
    code = body?.error?.code ?? '';
    partial = body?.error?.failed_generation ?? '';
  } catch {
    /* non-JSON error body */
  }
  return { message: friendly(res.status, detail, name), code, partial };
}

type ResponseFormat =
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; schema: unknown; strict: boolean } };

function schemaFormat(strict: boolean): ResponseFormat {
  return {
    type: 'json_schema',
    json_schema: { name: 'speech_analysis', schema: ANALYSIS_JSON_SCHEMA, strict },
  };
}

/** Chat models only: strip transcription, embedding, moderation and TTS entries. */
const NOT_CHAT = /whisper|embed|tts|audio|moderation|guard|rerank|ocr|vision-encoder/i;

export function makeOpenAiCompatible(opts: {
  id: string;
  name: string;
  base: string;
  keyUrl: string;
  keyHint: string;
  trainsOnYourData: boolean;
  freeTierNote: string;
  fallbackModels: ModelChoice[];
  prefer?: RegExp;
}) {
  const { id, name, base } = opts;

  async function listModels(apiKey: string): Promise<ModelChoice[]> {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const e = await readError(res, name);
      throw new ApiError(e.message, res.status, e.code, e.partial);
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    const ids = (data.data ?? []).map((m) => m.id).filter((m) => !NOT_CHAT.test(m));
    ids.sort((a, b) => {
      if (opts.prefer) {
        const pa = opts.prefer.test(a) ? 0 : 1;
        const pb = opts.prefer.test(b) ? 0 : 1;
        if (pa !== pb) return pa - pb;
      }
      return a.localeCompare(b);
    });
    return ids.map((m) => ({ id: m, label: m }));
  }

  async function attempt(req: AnalysisRequest, response_format: ResponseFormat): Promise<Analysis> {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${req.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        temperature: 0.2,
        max_tokens: 8000,
        response_format,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      }),
    });
    if (!res.ok) {
      const e = await readError(res, name);
      throw new ApiError(e.message, res.status, e.code, e.partial);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const choice = data.choices?.[0];
    const raw = choice?.message?.content ?? '';

    if (choice?.finish_reason === 'length') {
      throw new ApiError('The analysis was cut off before it finished. Try a shorter recording.', 400, 'length', raw);
    }
    return parseAnalysis(raw, name);
  }

  async function analyze(req: AnalysisRequest): Promise<Analysis> {
    // Strongest mode first, stepping down only on a validation failure.
    const modes: ResponseFormat[] = [schemaFormat(true), schemaFormat(false), { type: 'json_object' }];
    let last: ApiError | null = null;

    for (const mode of modes) {
      try {
        return await attempt(req, mode);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        const retryable = e.status === 400 && /json|schema|validate|format/i.test(e.message + e.code);
        if (!retryable) throw e;
        last = e;
      }
    }
    const tail = last?.partial ? `\n\nIt got as far as:\n${last.partial.slice(0, 300)}…` : '';
    throw new ApiError(
      `${req.model} could not produce a valid analysis. Try another model.${tail}`,
      400, last?.code ?? '', last?.partial ?? '',
    );
  }

  return { id, name, keyUrl: opts.keyUrl, keyHint: opts.keyHint,
           trainsOnYourData: opts.trainsOnYourData, freeTierNote: opts.freeTierNote,
           fallbackModels: opts.fallbackModels, listModels, analyze };
}

export function parseAnalysis(raw: string, name: string): Analysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(`${name} returned something that was not valid JSON.`, 400, 'json_parse', raw.slice(0, 400));
  }
  const result = AnalysisSchema.safeParse(parsed);
  if (!result.success) {
    const where = result.error.issues[0]?.path.join('.') || 'root';
    throw new ApiError(`The response did not match the expected shape (at ${where}).`, 400, 'schema', raw.slice(0, 400));
  }
  return result.data;
}
