// The analysis prompt.
//
// Two design rules hold this together:
//
// 1. Errors are anchored to WORD INDICES, not to quoted strings. The model
//    sees a numbered word list and returns index ranges, so every correction
//    maps onto real audio the learner can replay. Matching on quoted text
//    breaks the moment the model normalises punctuation or spacing.
//
// 2. Notes come back as PLAIN TEXT with backticks for inline code. Nothing the
//    model writes is ever inserted as HTML, so a prompt-injected recording
//    cannot script the page. The renderer escapes everything and converts
//    backtick spans itself.

import type { Stats, Word } from './types';

export const SCHEMA_NOTE = `Return one JSON object with exactly these keys:

{
  "language_name": string,          // English name of the spoken language
  "summary_line": string,           // one sentence, what this recording is about
  "level": {
    "framework": string,            // "CEFR", "ACTFL", "JLPT", "HSK", "TOPIK"
    "band": string,                 // e.g. "A2", "Intermediate Low", "N4"
    "reaching": string              // the band the speaker is attempting, or ""
  },
  "verdict": [string, string],      // two short paragraphs: what works, what fails
  "errors": [
    {
      "rank": number,               // 1 = most damaging to comprehension
      "start": number,              // first word index of the mistake
      "end": number,                // last word index, inclusive
      "said": string,               // exactly what was said, as spoken
      "correction": string,         // the corrected form, same span only
      "category": string,           // one lowercase word: gender, preposition,
                                    // agreement, tense, article, word-order,
                                    // vocabulary, meaning, particle, counter…
      "note": string,               // 1-3 sentences: the RULE, not just the fix
      "gloss": string               // what the speaker was trying to say, in English
    }
  ],
  "fillers": [
    { "start": number, "end": number, "note": string }
  ],
  "drills": [
    { "title": string, "detail": string, "examples": string }
  ],
  "pace_note": string,              // one sentence on their speaking rate
  "stall_note": string              // one sentence on WHERE they hesitate
}`;

export function systemPrompt(): string {
  return `You are an exacting, warm language tutor reviewing a spoken recording.

You judge GRAMMAR, WORD CHOICE and IDIOM. You must not comment on pronunciation
or accent: you are reading a machine transcript that normalises pronunciation
toward the standard form of the language, so any pronunciation claim would be
invented. Say nothing about it.

Rules:
- Rank errors by how much they damage comprehension, not by frequency. An error
  that inverts the meaning of a sentence outranks a gender slip.
- "note" must teach the underlying rule so it generalises, not just state the fix.
- Only mark real errors. Regional and colloquial forms are not mistakes. If the
  speaker is fluent, return few errors or none — do not invent them to fill space.
- "start" and "end" are indices into the numbered word list, inclusive. The span
  must be tight: cover the error and the words needed to correct it, nothing more.
- "said" must reproduce those exact words. "correction" replaces exactly that span.
- Spans must never overlap each other. Order "errors" by rank ascending.
- "fillers" marks hesitation crutches actually used to buy time ("euh", "like",
  "えーと", "c'est ça"), not ordinary discourse markers.
- Write every note and drill in English. Quote the target language directly.
- Plain text only. Use \`backticks\` for inline forms. Never write HTML or Markdown.

${SCHEMA_NOTE}

Output the JSON object and nothing else.`;
}

export function userPrompt({
  words,
  language,
  stats,
}: {
  words: Word[];
  language: string;
  stats: Stats;
}): string {
  const numbered = words.map((w, i) => `${i}\t${w.word}`).join('\n');
  const plain = words.map((w) => w.word).join(' ');

  return `Language spoken: ${language}

Measured already (do not recompute, just interpret):
- duration: ${stats.duration.toFixed(1)}s
- speaking rate: ${stats.rate} ${stats.unitLabel}
${stats.band ? `- unhurried native range for this language: ${stats.band[0]}–${stats.band[1]}` : '- no native baseline available for this language'}
- pauses over 0.6s: ${stats.pauseCount}, totalling ${stats.deadAirSeconds}s (${stats.deadAirPercent}% of the clip)
- longest hesitations came before: ${stats.stallPhrases.join(' / ') || 'nothing notable'}

Transcript:
${plain}

Numbered words (index, then the word exactly as transcribed):
${numbered}`;
}
