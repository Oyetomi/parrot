// The analysis provider is swappable; transcription is not.
//
// Whisper's word-level timestamps drive the read-along, the pause detection and
// the waveform, and no other provider returns them — so transcription stays on
// Groq while the analysis can go wherever judges the language best.
//
// Which provider judges best is not something to settle by reputation. Run the
// same recording through two of them and read the results.

import { makeOpenAiCompatible } from './openai-compatible';
import { gemini } from './gemini';
import type { ModelChoice, Provider } from './types';

export const groq: Provider = makeOpenAiCompatible({
  id: 'groq',
  name: 'Groq',
  base: 'https://api.groq.com/openai/v1',
  keyUrl: 'https://console.groq.com/keys',
  keyHint: 'Also required — Groq does the transcription',
  trainsOnYourData: false,
  freeTierNote: 'About 8 hours of audio a day. Fastest, but weaker at fine judgements of register.',
  fallbackModels: [
    { id: 'openai/gpt-oss-120b', label: 'openai/gpt-oss-120b' },
    { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' },
  ],
  prefer: /gpt-oss-120b|llama-3\.3-70b/,
});

export const mistral: Provider = makeOpenAiCompatible({
  id: 'mistral',
  name: 'Mistral',
  base: 'https://api.mistral.ai/v1',
  keyUrl: 'https://console.mistral.ai/api-keys',
  keyHint: 'Free "Experiment" tier',
  // Stated plainly rather than buried: the free tier is conditional on this.
  trainsOnYourData: true,
  freeTierNote:
    'Generous free tier, and strong on Romance languages — but it requires opting in to training on your data, so your transcripts would be used to train their models.',
  fallbackModels: [
    { id: 'mistral-large-latest', label: 'mistral-large-latest' },
    { id: 'mistral-medium-latest', label: 'mistral-medium-latest' },
  ],
  prefer: /large-latest|medium-latest/,
});

export const PROVIDERS: Provider[] = [gemini, groq, mistral];

export function providerById(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? gemini;
}

/** Discovery is best-effort: a provider that will not list still works. */
export async function safeListModels(p: Provider, apiKey: string): Promise<ModelChoice[]> {
  if (!apiKey) return p.fallbackModels;
  try {
    const found = await p.listModels(apiKey);
    return found.length ? found : p.fallbackModels;
  } catch {
    return p.fallbackModels;
  }
}

export type { Provider, ModelChoice } from './types';
