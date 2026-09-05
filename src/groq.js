// Groq API calls. There is no backend: the key goes from this page straight
// to api.groq.com and nowhere else.

const BASE = 'https://api.groq.com/openai/v1';

export const STT_MODEL = 'whisper-large-v3-turbo';

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function readError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || '';
  } catch { /* non-JSON error body */ }

  if (res.status === 401) return 'That API key was rejected. Check it in the API key dialog.';
  if (res.status === 413) return 'That file is too large for the free tier (25 MB per request).';
  if (res.status === 429) return 'Rate limit hit. The free tier allows 20 requests a minute — wait a moment and retry.';
  return detail || `Groq returned ${res.status}.`;
}

/**
 * Transcribe one or more chunks, stitching timestamps back onto one timeline.
 * Word-level timings require verbose_json plus timestamp_granularities[]=word.
 */
export async function transcribe({ chunks, apiKey, language, onChunk }) {
  const words = [];
  let detected = language || '';
  let text = '';

  for (let i = 0; i < chunks.length; i++) {
    const { blob, offset } = chunks[i];
    const form = new FormData();
    form.append('file', blob, 'audio.wav');
    form.append('model', STT_MODEL);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    if (language) form.append('language', language);

    const res = await fetch(`${BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) throw new ApiError(await readError(res), res.status);

    const data = await res.json();
    detected = detected || data.language || '';
    text += (text ? ' ' : '') + (data.text || '').trim();

    for (const w of data.words || []) {
      words.push({
        word: (w.word || '').trim(),
        start: +(w.start + offset).toFixed(3),
        end: +(w.end + offset).toFixed(3),
      });
    }
    onChunk?.(i + 1, chunks.length);
  }

  if (!words.length) {
    throw new ApiError('No speech was found in that recording.', 0);
  }
  return { words: words.filter(w => w.word), language: detected, text };
}

/** Ask the model for the error analysis. Returns parsed JSON. */
export async function analyze({ system, user, apiKey, model }) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError('The model returned something that was not valid JSON. Try again, or pick a different model.', 0);
  }
}
