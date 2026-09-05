// The model's JSON is the one genuinely untrustworthy input in this project.
// Parsing it through a schema at the boundary means the rest of the app can
// treat the analysis as a real typed value instead of guessing at it, and a
// malformed response fails in one obvious place rather than five subtle ones.

import { z } from 'zod';

export const SpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export const ErrorSchema = SpanSchema.extend({
  rank: z.number().int().positive().optional(),
  said: z.string().default(''),
  correction: z.string().default(''),
  category: z.string().default('other'),
  note: z.string().default(''),
  gloss: z.string().default(''),
});

export const FillerSchema = SpanSchema.extend({
  note: z.string().default(''),
});

export const LevelSchema = z.object({
  framework: z.string().default('CEFR'),
  band: z.string().default('—'),
  reaching: z.string().default(''),
});

export const DrillSchema = z.object({
  title: z.string().default(''),
  detail: z.string().default(''),
  examples: z.string().default(''),
});

export const AnalysisSchema = z.object({
  language_name: z.string().default(''),
  summary_line: z.string().default(''),
  level: LevelSchema.default({ framework: 'CEFR', band: '—', reaching: '' }),
  verdict: z.array(z.string()).default([]),
  errors: z.array(ErrorSchema).default([]),
  fillers: z.array(FillerSchema).default([]),
  drills: z.array(DrillSchema).default([]),
  pace_note: z.string().default(''),
  stall_note: z.string().default(''),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type AnalysisError = z.infer<typeof ErrorSchema>;
export type Filler = z.infer<typeof FillerSchema>;
export type Level = z.infer<typeof LevelSchema>;
export type Drill = z.infer<typeof DrillSchema>;

/** An error span that has been validated against the real word list. */
export type RankedError = AnalysisError & { rank: number };

/**
 * Model output is not trusted to be well-formed. Indices are clamped to the
 * real word list, spans that overlap an earlier one are dropped, and anything
 * absurdly long is discarded — one bad span would otherwise corrupt the whole
 * transcript.
 */
export function cleanSpans<T extends { start: number; end: number }>(
  list: T[] | undefined,
  maxIndex: number,
): T[] {
  const taken = new Set<number>();
  return (Array.isArray(list) ? list : [])
    .map((e) => ({
      ...e,
      start: Math.max(0, Math.min(maxIndex, Math.trunc(e.start))),
      end: Math.max(0, Math.min(maxIndex, Math.trunc(e.end))),
    }))
    .filter((e) => e.end >= e.start && e.end - e.start < 30)
    .sort((a, b) => a.start - b.start)
    .filter((e) => {
      for (let i = e.start; i <= e.end; i++) if (taken.has(i)) return false;
      for (let i = e.start; i <= e.end; i++) taken.add(i);
      return true;
    });
}

/**
 * The same contract as AnalysisSchema, expressed as JSON Schema for Groq's
 * structured outputs.
 *
 * `json_object` mode only promises syntactically valid JSON — nothing about
 * its shape — and a reasoning model can fail even that. Strict `json_schema`
 * uses constrained decoding, so the model physically cannot emit a token that
 * breaks the schema.
 *
 * Strict mode has three hard rules: every property must appear in `required`,
 * every object must set `additionalProperties: false`, and genuinely optional
 * fields must be union types with null. Zod still parses the result — this
 * governs generation, that governs trust.
 */
const str = { type: 'string' } as const;
const int = { type: 'integer' } as const;

const obj = <T extends Record<string, unknown>>(properties: T) => ({
  type: 'object' as const,
  additionalProperties: false as const,
  required: Object.keys(properties),
  properties,
});

export const ANALYSIS_JSON_SCHEMA = obj({
  language_name: str,
  summary_line: str,
  level: obj({ framework: str, band: str, reaching: str }),
  verdict: { type: 'array', items: str },
  errors: {
    type: 'array',
    items: obj({
      rank: int, start: int, end: int,
      said: str, correction: str, category: str, note: str, gloss: str,
    }),
  },
  fillers: { type: 'array', items: obj({ start: int, end: int, note: str }) },
  drills: { type: 'array', items: obj({ title: str, detail: str, examples: str }) },
  pace_note: str,
  stall_note: str,
});
