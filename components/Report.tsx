'use client';

import { useEffect, useRef, useState } from 'react';
import { Playback, usePlayback } from './Playback';
import { Player, MiniPlayer } from './Player';
import { Transcript } from './Transcript';
import { Pace, Stalls } from './Pace';
import { Fixes } from './Fixes';
import { Verdict, Drills } from './Verdict';
import type { Analysis, Filler, RankedError } from '@/lib/schema';
import type { DeadAir, LanguageProfile, Pause, Stall, Word } from '@/lib/types';

export interface ReportData {
  words: Word[];
  lineStarts: number[];
  errors: RankedError[];
  fillers: Filler[];
  analysis: Analysis;
  lang: LanguageProfile;
  pauses: Pause[];
  stalls: Stall[];
  deadAir: DeadAir;
  rate: number;
  duration: number;
  envelope: number[];
  audioUrl: string;
  filename: string;
}

export function Report({ data, onAgain }: { data: ReportData; onAgain: () => void }) {
  const [corrected, setCorrected] = useState(false);
  const [follow, setFollow] = useState(true);
  const [openAll, setOpenAll] = useState(0);
  const [miniVisible, setMiniVisible] = useState(false);
  const playerBox = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = playerBox.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setMiniVisible(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { lang, analysis, errors } = data;
  const unitShort = lang.unit === 'chars' ? 'cpm' : 'wpm';
  const level = analysis.level;

  return (
    <Playback
      words={data.words}
      lineStarts={data.lineStarts}
      pauses={data.pauses}
      envelope={data.envelope}
      duration={data.duration}
      src={data.audioUrl}
    >
      <header className="studio">
        <div className="wrap">
          <div className="topbar">
            <div className="brand">
              <span className="logo" aria-hidden="true">🦜</span>
              <span className="brandname">Parrot</span>
            </div>
            <div className="topactions">
              <span className="ghost">{data.filename}</span>
            </div>
          </div>
          <div ref={playerBox}>
            <Player duration={data.duration} deadAirSeconds={data.deadAir.seconds} />
          </div>
        </div>
      </header>

      <div className="score">
        <div className="wrap">
          <Cell k="Speaking rate" v={<>{data.rate}<small> {unitShort}</small></>}
            n={lang.band ? `Unhurried native speech runs ${lang.band[0]}–${lang.band[1]}` : 'No native baseline for this language'} />
          <Cell k="Dead air" v={<>{data.deadAir.percent}<small>%</small></>}
            n={`${data.pauses.length} pause${data.pauses.length === 1 ? '' : 's'} over 0.6 seconds`} />
          <Cell k="Mistakes marked" v={<>{errors.length}</>}
            n={errors.length ? 'Ranked by cost to comprehension' : 'Nothing worth correcting'} />
          <Cell k="Level" v={level.reaching ? <>{level.band}<small> → {level.reaching}</small></> : <>{level.band}</>}
            n={`${level.framework} · ${data.words.length} words spoken`} />
        </div>
      </div>

      <main>
        <section className="wrap" id="listen">
          <div className="sechead"><span className="secnum">01</span><h2>Read along, mistakes and all</h2></div>
          <p className="lede">
            {analysis.summary_line ? `${analysis.summary_line} ` : ''}
            Tap a timestamp to jump. Tap anything underlined in red to see what it should have been.
          </p>
          <div className="controls">
            <div className="seg" role="group" aria-label="Transcript version">
              <button type="button" aria-pressed={!corrected} onClick={() => setCorrected(false)}>What was said</button>
              <button type="button" aria-pressed={corrected} onClick={() => setCorrected(true)}>Corrected</button>
            </div>
            <button className="chip" type="button" aria-pressed={follow} onClick={() => setFollow(!follow)}>
              <i className="dot" />Auto-scroll
            </button>
            <button className="chip" type="button" onClick={() => setOpenAll(openAll ? 0 : 1)}>
              {openAll ? 'Close all fixes' : 'Open all fixes'}
            </button>
            <span className="hint">Space to play · ← → to skip 5s</span>
          </div>
          <Sync corrected={corrected} follow={follow} />
          <Transcript
            words={data.words} lineStarts={data.lineStarts} errors={errors}
            fillers={data.fillers} lang={lang} corrected={corrected} openAll={openAll}
          />
        </section>

        <section className="wrap">
          <div className="sechead"><span className="secnum">02</span><h2>Where the time went</h2></div>
          {analysis.pace_note ? <p className="lede">{analysis.pace_note}</p> : null}
          <Pace rate={data.rate} lang={lang} />
          <Stalls stalls={data.stalls} />
          {analysis.stall_note ? <p className="lede" style={{ margin: '24px 0 0' }}>{analysis.stall_note}</p> : null}
        </section>

        <section className="wrap" id="fixes">
          <div className="sechead"><span className="secnum">03</span><h2>Every fix, worst first</h2></div>
          {errors.length ? (
            <p className="lede">Ranked by how much each one costs you, not by how often it appears.</p>
          ) : null}
          <Fixes errors={errors} words={data.words} />
        </section>

        <section className="wrap">
          <div className="sechead"><span className="secnum">04</span><h2>The verdict, and what to drill</h2></div>
          <Verdict level={level} paragraphs={analysis.verdict} />
          <Drills drills={analysis.drills} />
        </section>

        <section className="wrap">
          <div className="againrow">
            <button className="cta" type="button" onClick={onAgain}>Analyse another recording</button>
            <button className="ghost dark" type="button" onClick={() => download(data)}>
              Download the raw JSON
            </button>
          </div>
        </section>
      </main>

      <MiniPlayer visible={miniVisible} />
    </Playback>
  );
}

/** Pushes the two React-held toggles into the imperative playback loop. */
function Sync({ corrected, follow }: { corrected: boolean; follow: boolean }) {
  const { setCorrected, setFollow } = usePlayback();
  useEffect(() => { setCorrected(corrected); }, [corrected, setCorrected]);
  useEffect(() => { setFollow(follow); }, [follow, setFollow]);
  return null;
}

function Cell({ k, v, n }: { k: string; v: React.ReactNode; n: string }) {
  return (
    <div className="score-cell">
      <span className="sk">{k}</span>
      <span className="sv">{v}</span>
      <span className="sn">{n}</span>
    </div>
  );
}

function download(data: ReportData) {
  const blob = new Blob(
    [JSON.stringify({
      file: data.filename, language: data.lang, duration: data.duration,
      words: data.words, analysis: data.analysis,
    }, null, 2)],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = data.filename.replace(/\.[^.]+$/, '') + '.parrot.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
