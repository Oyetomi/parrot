'use client';

import { useState } from 'react';
import { usePlayback } from './Playback';
import { FixBody } from './Transcript';
import type { RankedError } from '@/lib/schema';
import type { Word } from '@/lib/types';

export function Fixes({ errors, words }: { errors: RankedError[]; words: Word[] }) {
  const { seek } = usePlayback();
  const [tag, setTag] = useState('all');

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

  const tags = ['all', ...Array.from(new Set(errors.map((e) => e.category)))];

  return (
    <>
      <div className="filters">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className="chip"
            aria-pressed={tag === t}
            onClick={() => setTag(t)}
          >
            {t === 'all' ? `All ${errors.length}` : t}
          </button>
        ))}
      </div>
      <ol className="fixes">
        {errors.map((e) => (
          <li key={e.rank} className={tag !== 'all' && e.category !== tag ? 'hide' : undefined}>
            <span className="rank">{String(e.rank).padStart(2, '0')}</span>
            <FixBody err={e} />
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
          </li>
        ))}
      </ol>
    </>
  );
}
