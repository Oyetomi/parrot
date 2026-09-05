// Cross-checking one analysis against a second, independent one.
//
// The analysis runs at a non-zero temperature, so the same recording does not
// produce the same error list twice. That is a real weakness in anything
// calling itself a score. Rather than hide it, Parrot runs the analysis twice
// and records which findings both passes agree on.
//
// Agreement is not proof — two passes of the same model share the same blind
// spots. It only separates "found reliably" from "found once", which is the
// honest distinction to draw, and it is the distinction the report shows.

import type { AnalysisError, RankedError } from './schema';

/** Two spans agree if they overlap at all: the same mistake, framed differently. */
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * Merge two passes. The first pass supplies the wording; the second only votes
 * on whether each finding is real. Findings unique to the second pass are kept
 * too, also marked unconfirmed — dropping them would quietly bias the count
 * toward whichever pass happened to run first.
 */
export function crossCheck(primary: AnalysisError[], secondary: AnalysisError[]): RankedError[] {
  const seen = new Set<number>();

  const fromPrimary = primary.map((e) => {
    const match = secondary.findIndex((o, i) => !seen.has(i) && overlaps(e, o));
    if (match >= 0) seen.add(match);
    return { ...e, confirmed: match >= 0 };
  });

  const onlySecondary = secondary
    .filter((_, i) => !seen.has(i))
    .filter((o) => !primary.some((e) => overlaps(e, o)))
    .map((e) => ({ ...e, confirmed: false }));

  return [...fromPrimary, ...onlySecondary]
    .sort((a, b) => {
      // Confirmed findings lead, then by the model's own ranking.
      if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
      return (a.rank ?? 99) - (b.rank ?? 99);
    })
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

/** When only one pass succeeded, nothing can be confirmed. Say so honestly. */
export function singlePass(errors: AnalysisError[]): RankedError[] {
  return errors
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .map((e, i) => ({ ...e, rank: i + 1, confirmed: false }));
}
