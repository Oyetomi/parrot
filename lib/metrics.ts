// Everything measurable is measured here, not asked of a model.
// Pace, pauses, dead air and stalls are arithmetic over Whisper's word
// timings, so they cannot be hallucinated and cost nothing to produce.

import type { CountUnit, DeadAir, Pace, Pause, Stall, Word } from './types';

/** Gaps between consecutive words, longer than `min` seconds. */
export function pauses(words: Word[], min = 0.6): Pause[] {
  const out: Pause[] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= min) {
      out.push({
        at: +words[i - 1].end.toFixed(2),
        seconds: +gap.toFixed(2),
        beforeIndex: i,
        before: words[i].word,
      });
    }
  }
  return out;
}

/** Units counted, in whatever the language actually counts in. */
function countable(words: Word[], unit: CountUnit): number {
  return unit === 'chars'
    ? words.reduce((sum, w) => sum + w.word.replace(/\s/g, '').length, 0)
    : words.length;
}

/**
 * Speaking rate in the language's own counting unit, reported two ways.
 *
 * Overall rate divides by the whole recording, so every silence counts against
 * it. Articulation rate divides by time actually spent speaking. A careful
 * speaker who pauses to think and a speaker who cannot retrieve words look
 * identical on the first number and quite different on the second, so
 * reporting only one of them would misrepresent both.
 */
export function pace(
  words: Word[],
  duration: number,
  pauseSeconds: number,
  unit: CountUnit = 'words',
): Pace {
  if (!duration) return { overall: 0, articulation: 0, speechSeconds: 0 };
  const n = countable(words, unit);
  const speech = Math.max(0.1, duration - pauseSeconds);
  return {
    overall: Math.round((n / duration) * 60),
    articulation: Math.round((n / speech) * 60),
    speechSeconds: +speech.toFixed(1),
  };
}

/** Share of the clip spent in pauses over the threshold. */
export function deadAir(pauseList: Pause[], duration: number): DeadAir {
  if (!duration) return { seconds: 0, percent: 0 };
  const seconds = pauseList.reduce((s, p) => s + p.seconds, 0);
  return { seconds: +seconds.toFixed(1), percent: Math.round((seconds / duration) * 100) };
}

/** The longest hesitations, with the words they preceded. */
export function stalls(words: Word[], pauseList: Pause[], limit = 5): Stall[] {
  return [...pauseList]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit)
    .map((p) => ({
      ...p,
      phrase: words.slice(p.beforeIndex, p.beforeIndex + 4).map((w) => w.word).join(' '),
    }));
}

/**
 * Group words into readable lines.
 *
 * Whisper's word timings are reliable; its punctuation is not, and the turbo
 * model in particular returns long stretches with none at all. So the length
 * cap has to carry the layout on its own rather than relying on sentence ends
 * that may never arrive.
 */
export function lines(words: Word[], maxWords = 14): number[] {
  const out: number[] = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const endsSentence = /[.!?。！？]$/.test(words[i].word.trim());
    const nextGap = i + 1 < words.length ? words[i + 1].start - words[i].end : 0;
    const run = i - start + 1;
    const shouldBreak =
      i === words.length - 1 || (endsSentence && run >= 6) || nextGap >= 2.0 || run >= maxWords;
    if (shouldBreak) {
      out.push(start);
      start = i + 1;
    }
  }
  return out;
}

/**
 * Line breaks must never fall inside an error span, or the span is split across
 * two paragraphs and half of it orphaned.
 *
 * Dropping such a break merges the two lines, which is fine once — but in a
 * passage dense with mistakes it merges every line into one wall of text.
 * Snapping the break past the end of the span keeps the line count instead.
 */
export function lineStartsAvoiding(
  words: Word[],
  spans: { start: number; end: number }[],
): number[] {
  const out = new Set<number>([0]);
  for (const start of lines(words)) {
    const straddled = spans.find((e) => start > e.start && start <= e.end);
    if (!straddled) { out.add(start); continue; }
    const after = straddled.end + 1;
    if (after < words.length) out.add(after);
  }
  return [...out].sort((a, b) => a - b);
}

export function fmtTime(t: number): string {
  const v = Math.max(0, t || 0);
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
