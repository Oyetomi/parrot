'use client';

import type { StepId } from '@/lib/types';

const STEPS: [StepId, string][] = [
  ['extract', 'Extracting audio in your browser'],
  ['upload', 'Transcribing with Whisper'],
  ['measure', 'Measuring pace, pauses and stalls'],
  ['analyse', 'Analysing grammar and word choice'],
];

export function Progress({
  active, meta, error, filename, onReset,
}: {
  active: StepId;
  meta: Partial<Record<StepId, string>>;
  error: string | null;
  filename: string;
  onReset: () => void;
}) {
  const idx = STEPS.findIndex(([id]) => id === active);
  return (
    <main>
      <section className="wrap">
        <h2 className="worktitle">Working on <span>{filename}</span></h2>
        {error ? <p className="workerr" role="alert">{error}</p> : null}
        <ol className="steps" aria-live="polite" aria-busy={!error}>
          {STEPS.map(([id, label], i) => {
            const cls = error && i === idx ? 'fail' : i < idx ? 'done' : i === idx ? 'run' : '';
            return (
              <li className={cls} key={id}>
                <i className="dotmark" />
                <span>{label}</span>
                <span className="meta">{meta[id] ?? ''}</span>
              </li>
            );
          })}
        </ol>
        <button className="ghost dark" type="button" onClick={onReset}>Start over</button>
      </section>
    </main>
  );
}
