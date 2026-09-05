// Guards against telling a correct speaker they were wrong.
//
// This is the failure that matters. Missing a mistake costs a learner one
// missed correction; inventing one teaches them something false and gives them
// no way to know it was false. So every finding has to clear these checks
// before it is shown, and the checks are deterministic — they do not ask the
// model to grade its own work.
//
// The dominant source of false positives is not the analyser at all. It is the
// chain: speech → Whisper → analysis. When Whisper mishears, the analysis
// faithfully corrects a mistake the speaker never made. We saw exactly this:
// the turbo model turned "matin" into "m'attendre", which any competent
// analyser would then flag as an error. That is why `uncertain` exists.

import type { RankedError } from './schema';
import type { Word } from './types';

export interface Rejected {
  error: RankedError;
  reason: string;
}

/** Loose comparison: punctuation and case differ harmlessly between the two. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:«»"“”…]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does the model's quoted text actually match the words it pointed at?
 *
 * A mismatch means the finding is anchored to the wrong place — the model
 * quoted something it invented, or drifted off the indices. Either way the
 * correction would be attached to words the speaker did not say.
 */
function spanMatches(err: RankedError, words: Word[]): boolean {
  const actual = normalise(words.slice(err.start, err.end + 1).map((w) => w.word).join(' '));
  const claimed = normalise(err.said);
  if (!claimed) return false;
  if (actual === claimed) return true;
  // Allow a tight near-miss: the model often trims or adds a leading article.
  return actual.includes(claimed) || claimed.includes(actual);
}

/** Did Whisper flag any of these words as doubtfully transcribed? */
function onShakyGround(err: RankedError, words: Word[]): boolean {
  return words.slice(err.start, err.end + 1).some((w) => w.uncertain);
}

/**
 * Keep only findings that survive every check, and report what was dropped so
 * the interface can be honest about it rather than silently shrinking the count.
 */
export function verify(
  errors: RankedError[],
  words: Word[],
): { kept: RankedError[]; rejected: Rejected[] } {
  const kept: RankedError[] = [];
  const rejected: Rejected[] = [];

  for (const err of errors) {
    if (!spanMatches(err, words)) {
      rejected.push({ error: err, reason: 'quoted text did not match the transcript' });
      continue;
    }
    if (onShakyGround(err, words)) {
      rejected.push({ error: err, reason: 'Whisper was unsure it heard this correctly' });
      continue;
    }
    if (normalise(err.correction) === normalise(err.said)) {
      rejected.push({ error: err, reason: 'the correction is identical to what was said' });
      continue;
    }
    kept.push(err);
  }

  return { kept: kept.map((e, i) => ({ ...e, rank: i + 1 })), rejected };
}
