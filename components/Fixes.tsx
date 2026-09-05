'use client';

import { useState } from 'react';
import { usePlayback } from './Playback';
import { FixBody } from './Transcript';
import { plainCategory } from '@/lib/text';
import type { RankedError } from '@/lib/schema';
import type { Word } from '@/lib/types';

export function Fixes({
  errors, words, language, dismissedKeys, onDismiss, onRestore,
}: {
  errors: RankedError[];
  words: Word[];
  language: string;
  dismissedKeys: Set<string>;
  onDismiss: (e: RankedError) => void;
  onRestore: (e: RankedError) => void;
}) {
  const { seek } = usePlayback();
  const [tag, setTag] = useState('all');
  const [showDismissed, setShowDismissed] = useState(false);

  if (!errors.length) {
    return (
      <ol className="fixes">
        <li className="nofix">
          <p>
            <b>Nothing worth correcting.</b> The model found no grammar or word-choice errors
            in this recording. That is a real result, not a failure — but remember it says
            nothing about pronunciation, which a transcript cannot show.
          </p>
        </li>
      </ol>
    );
  }

  const live = errors.filter((e) => !dismissedKeys.has(`${e.said}::${e.correction}`));
  const dropped = errors.filter((e) => dismissedKeys.has(`${e.said}::${e.correction}`));
  const tags = ['all', ...Array.from(new Set(live.map((e) => e.category)))];

  return (
    <>
      {dropped.length ? (
        <p className="dismissnote">
          You marked <b>{dropped.length}</b> of these as correct as spoken.{' '}
          <button type="button" className="linkish" onClick={() => setShowDismissed(!showDismissed)}>
            {showDismissed ? 'Hide them' : 'Show them'}
          </button>
        </p>
      ) : null}

      {showDismissed && dropped.length ? (
        <ol className="fixes dismissed">
          {dropped.map((e) => (
            <li key={`d${e.rank}`}>
              <span className="rank">—</span>
              <FixBody err={e} />
              <button className="hearit" type="button" onClick={() => onRestore(e)}>
                Put it back
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="filters">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className="chip"
            aria-pressed={tag === t}
            onClick={() => setTag(t)}
          >
            {t === 'all' ? `All ${live.length}` : plainCategory(t)}
          </button>
        ))}
      </div>
      <ol className="fixes">
        {live.map((e) => (
          <li key={e.rank} className={tag !== 'all' && e.category !== tag ? 'hide' : undefined}>
            <span className="rank">{String(e.rank).padStart(2, '0')}</span>
            <FixBody err={e} />
            <div className="fixactions">
              <button
                className="hearit"
                type="button"
                onClick={() => {
                  seek(words[e.start].start - 0.35);
                  document.getElementById('listen')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                Hear it
              </button>
              <button className="hearit reject" type="button" onClick={() => onDismiss(e)}>
                I said this correctly
              </button>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
