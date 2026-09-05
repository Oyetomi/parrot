// Google Gemini.
//
// Every detail here was established by calling the API, because the published
// docs disagreed with it on three points that would each have shipped broken:
//
//  1. Gemini 3.x replies with MULTIPLE parts, and the first is often an opaque
//     "thought" part, not the answer. Reading parts[0].text returns a base64
//     blob. The answer is the text of the parts not marked as thoughts.
//  2. ListModels returns models the key cannot actually call — gemini-2.5-flash
//     is listed and then 404s with "no longer available to new users".
//  3. 503 "high demand" is common on the popular aliases and is transient, so
//     it deserves a retry rather than a failed run.

import { ApiError, friendly } from '../api-error';
import { ANALYSIS_JSON_SCHEMA, type Analysis } from '../schema';
import { parseAnalysis } from './openai-compatible';
import type { AnalysisRequest, ModelChoice, Provider } from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini accepts a subset of JSON Schema. `additionalProperties` is not part of
 * it, and its output is constrained regardless, so it is stripped rather than
 * risked.
 */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'additionalProperties') continue;
      out[k] = toGeminiSchema(v);
    }
    return out;
  }
  return node;
}

interface GeminiPart { text?: string; thought?: boolean }
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  error?: { code?: number; message?: string; status?: string };
}

/** The answer is every non-thought text part, joined. */
function answerText(res: GeminiResponse): string {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
}

async function call(model: string, apiKey: string, body: unknown): Promise<GeminiResponse> {
  const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    const detail = data.error?.message ?? '';
    if (res.status === 404) {
      throw new ApiError(
        `Gemini no longer serves "${model}" to new keys. Pick another model.`,
        404, 'model_gone',
      );
    }
    throw new ApiError(friendly(res.status, detail, 'Gemini'), res.status, data.error?.status ?? '');
  }
  return data;
}

async function analyze(req: AnalysisRequest): Promise<Analysis> {
  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.user }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(ANALYSIS_JSON_SCHEMA),
    },
  };

  // 503 on the busy aliases is transient and common enough that one retry is
  // the difference between a working run and a wasted upload.
  let last: ApiError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await call(req.model, req.apiKey, body);
      const text = answerText(data);
      if (!text.trim()) {
        throw new ApiError(
          `Gemini returned no answer (${data.candidates?.[0]?.finishReason ?? 'unknown reason'}).`,
          502, 'empty',
        );
      }
      return parseAnalysis(text, 'Gemini');
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 503) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  throw last ?? new ApiError('Gemini was unavailable.', 503, 'busy');
}

const SKIP = /embed|aqa|tts|image|video|audio|vision|nano-banana|gemma|learnlm|veo|imagen/i;

async function listModels(apiKey: string): Promise<ModelChoice[]> {
  const res = await fetch(`${BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    throw new ApiError(friendly(res.status, body.error?.message ?? '', 'Gemini'), res.status);
  }
  const data = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const ids = (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((m) => !SKIP.test(m));

  // The "-latest" aliases track whatever Google currently considers current,
  // which is the only defence against a model id that quietly stops working.
  ids.sort((a, b) => {
    const rank = (s: string) => (s.endsWith('-latest') ? 0 : s.includes('preview') ? 2 : 1);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return ids.map((id) => ({ id, label: id }));
}

export const gemini: Provider = {
  id: 'gemini',
  name: 'Gemini',
  keyUrl: 'https://aistudio.google.com/apikey',
  keyHint: 'Google AI Studio · free, no card',
  trainsOnYourData: false,
  freeTierNote: 'Free tier, no credit card. Strongest all-round on languages other than English.',
  fallbackModels: [
    { id: 'gemini-flash-latest', label: 'gemini-flash-latest' },
    { id: 'gemini-pro-latest', label: 'gemini-pro-latest' },
  ],
  listModels,
  analyze,
};
