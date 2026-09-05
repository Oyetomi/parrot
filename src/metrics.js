// Everything measurable is measured here, not asked of a model.
// Pace, pauses, dead air and stalls are arithmetic over Whisper's word
// timings, so they cannot be hallucinated and cost nothing to produce.

/** Gaps between consecutive words, longer than `min` seconds. */
export function pauses(words, min = 0.6) {
  const out = [];
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

/**
 * Speaking rate in the language's own counting unit. For languages Whisper
 * tokenises by character (Chinese, Japanese, Thai) counting "words" is
 * meaningless, so we count characters instead.
 */
export function rate(words, duration, unit = 'words') {
  if (!duration) return 0;
  const n = unit === 'chars'
    ? words.reduce((sum, w) => sum + w.word.replace(/\s/g, '').length, 0)
    : words.length;
  return Math.round((n / duration) * 60);
}

/** Share of the clip spent in pauses over the threshold. */
export function deadAir(pauseList, duration) {
  if (!duration) return { seconds: 0, percent: 0 };
  const seconds = pauseList.reduce((s, p) => s + p.seconds, 0);
  return { seconds: +seconds.toFixed(1), percent: Math.round((seconds / duration) * 100) };
}

/** The longest hesitations, with the words they preceded. */
export function stalls(words, pauseList, limit = 5) {
  return [...pauseList]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit)
    .map(p => ({
      ...p,
      phrase: words.slice(p.beforeIndex, p.beforeIndex + 4).map(w => w.word).join(' '),
    }));
}

/**
 * Do the long stalls land before content words or before function words?
 * Vocabulary retrieval and grammar assembly fail in different places, and
 * they need different practice, so the distinction is worth drawing.
 */
export function stallShape(stallList, fillerIndices = new Set()) {
  if (!stallList.length) return null;
  const long = stallList.filter(s => s.seconds >= 1.5).length;
  return { long, total: stallList.length };
}

/** Group words into readable lines, breaking on sentence ends and long gaps. */
export function lines(words, maxWords = 18) {
  const out = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].word;
    const endsSentence = /[.!?。！？]$/.test(w.trim());
    const nextGap = i + 1 < words.length ? words[i + 1].start - words[i].end : 0;
    const run = i - start + 1;
    const shouldBreak =
      i === words.length - 1 ||
      (endsSentence && run >= 6) ||
      nextGap >= 2.0 ||
      run >= maxWords;
    if (shouldBreak) {
      out.push(start);
      start = i + 1;
    }
  }
  return out.filter((v, i, a) => a.indexOf(v) === i);
}

export function fmtTime(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return m + ':' + String(s).padStart(2, '0');
}
