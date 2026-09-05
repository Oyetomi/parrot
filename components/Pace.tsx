'use client';

import { usePlayback } from './Playback';
import { fmtTime } from '@/lib/metrics';
import type { LanguageProfile, Stall } from '@/lib/types';

export function Pace({ rate, lang }: { rate: number; lang: LanguageProfile }) {
  if (!lang.benchmarked || !lang.band) {
    return (
      <div className="pace">
        <p className="nobaseline">
          Measured at <b>{rate}</b> {lang.unitLabel}. Parrot has no native baseline for{' '}
          {lang.name}, so there is no honest comparison to draw — the number is here for
          tracking against your own future recordings.
        </p>
      </div>
    );
  }

  const [lo, hi] = lang.band;
  const max = Math.max(200, Math.ceil((hi * 1.15) / 50) * 50);
  const pct = (v: number) => Math.min(100, (v / max) * 100);
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];

  return (
    <div className="pace">
      <div className="scale">
        <div className="rule" />
        <div className="band" style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}>
          <em>native {lo}–{hi}</em>
        </div>
        <div className="you" style={{ left: `${pct(rate)}%` }}>
          <em>{rate} — this recording</em>
        </div>
      </div>
      <div className="paceaxis">
        {ticks.map((v) => (
          <span key={v} style={{ left: `${pct(v)}%` }}>{Math.round(v)}</span>
        ))}
      </div>
      <div className="unit">{lang.unitLabel}</div>
    </div>
  );
}

export function Stalls({ stalls }: { stalls: Stall[] }) {
  const { seek } = usePlayback();
  if (!stalls.length) return null;
  return (
    <ul className="stalls">
      {stalls.map((s) => (
        <li key={s.at}>
          <b>{fmtTime(s.at)}</b>
          <em>{s.seconds.toFixed(1)}s</em>
          <button className="jump" type="button" onClick={() => seek(s.at)}>
            before <q>{s.phrase}</q>
          </button>
        </li>
      ))}
    </ul>
  );
}
