'use client';

import { Fragment, useState } from 'react';
import { usePlayback } from './Playback';
import { fmtTime } from '@/lib/metrics';
import { rich, plainCategory } from '@/lib/text';
import type { Filler, RankedError } from '@/lib/schema';
import type { LanguageProfile, Word } from '@/lib/types';

interface Props {
  words: Word[];
  lineStarts: number[];
  errors: RankedError[];
  fillers: Filler[];
  lang: LanguageProfile;
  corrected: boolean;
  openAll: number;
}

export function Transcript({ words, lineStarts, errors, fillers, lang, corrected, openAll }: Props) {
  const { registerWord, registerSpan, registerLine, seek } = usePlayback();
  const [openRank, setOpenRank] = useState<number | null>(null);

  const errAt = new Map(errors.map((e) => [e.start, e]));
  const filAt = new Map(fillers.map((f) => [f.start, f]));

  return (
    <div id="transcript">
      {lineStarts.map((start, li) => {
        const end = (li + 1 < lineStarts.length ? lineStarts[li + 1] : words.length) - 1;
        if (end < start) return null;

        const nodes: React.ReactNode[] = [];
        for (let i = start; i <= end; i++) {
          const err = errAt.get(i);
          const fil = filAt.get(i);

          if (err) {
            nodes.push(
              <ErrorSpan
                key={`e${i}`}
                err={err}
                words={words}
                corrected={corrected}
                open={openRank === err.rank}
                onOpen={() => setOpenRank(openRank === err.rank ? null : err.rank)}
                registerWord={registerWord}
                registerSpan={registerSpan}
              />,
            );
            nodes.push(<Fragment key={`es${i}`}> </Fragment>);
            i = err.end;
            continue;
          }
          if (fil) {
            nodes.push(
              <span className="crutch" key={`f${i}`} title={fil.note || undefined}>
                {words.slice(fil.start, fil.end + 1).map((w, k) => (
                  <Fragment key={k}>
                    <span className="w" ref={(el) => registerWord(fil.start + k, el)}>{w.word}</span>
                    {k < fil.end - fil.start ? ' ' : ''}
                  </Fragment>
                ))}
              </span>,
            );
            nodes.push(<Fragment key={`fs${i}`}> </Fragment>);
            i = fil.end;
            continue;
          }
          nodes.push(
            <span className="w" key={i} ref={(el) => registerWord(i, el)}>{words[i].word}</span>,
          );
          if (i < end) nodes.push(<Fragment key={`s${i}`}> </Fragment>);
        }

        const lineErr = errors.find((e) => e.start >= start && e.start <= end);
        const showCard = (openAll > 0 || openRank !== null) && lineErr &&
          (openAll > 0 || openRank === lineErr.rank);

        return (
          <div className="tline" key={li} ref={(el) => registerLine(li, el)}>
            <button className="tstamp" type="button" onClick={() => seek(words[start].start)}>
              {fmtTime(words[start].start)}
            </button>
            <p className={`tsay${lang.rtl ? ' rtl' : ''}${lang.unit === 'chars' ? ' cjk' : ''}`}>
              {nodes}
            </p>
            <div className={`fixcard${showCard ? ' open' : ''}`}>
              <div>
                <div className="fixinner">{lineErr ? <FixBody err={lineErr} /> : null}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ErrorSpan({
  err, words, corrected, open, onOpen, registerWord, registerSpan,
}: {
  err: RankedError;
  words: Word[];
  corrected: boolean;
  open: boolean;
  onOpen: () => void;
  registerWord: (i: number, el: HTMLElement | null) => void;
  registerSpan: (a: number, b: number, el: HTMLElement | null) => void;
}) {
  return (
    <span
      className={`err${open ? ' open' : ''}${corrected ? ' fixed' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={
        corrected
          ? `Corrected to: ${err.correction}. Was: ${err.said}.`
          : `Possible issue: ${err.said}. Activate for the correction.`
      }
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      ref={(el) => registerSpan(err.start, err.end, el)}
    >
      {corrected ? (
        err.correction
      ) : (
        <>
          {words.slice(err.start, err.end + 1).map((w, k) => {
            const isLast = k === err.end - err.start;
            const word = (
              <span className="w" ref={(el) => registerWord(err.start + k, el)}>{w.word}</span>
            );
            // The marker has to stay glued to the final word, or a line break
            // strands it alone on the next line in its own coloured box.
            return isLast ? (
              <span className="nobreak" key={k}>{word}<sup>{err.rank}</sup></span>
            ) : (
              <Fragment key={k}>{word}{' '}</Fragment>
            );
          })}
        </>
      )}
    </span>
  );
}

export function FixBody({ err }: { err: RankedError }) {
  return (
    <>
      <div className="swap">
        <span className="said-b">{err.said}</span>
        <span className="arrow">→</span>
        <span className="want-b">{err.correction}</span>
        <span className="tag">{plainCategory(err.category)}</span>
        <span className={`tag conf ${err.confirmed ? 'yes' : 'no'}`}>
          {err.confirmed ? '✓ confirmed twice' : '· found once'}
        </span>
      </div>
      <p className="fixnote" dangerouslySetInnerHTML={rich(err.note)} />
      {err.gloss ? <p className="gloss">meaning: {err.gloss}</p> : null}
    </>
  );
}
