'use client';

import { useEffect, useRef, useState } from 'react';
import { Playback, usePlayback, SMOOTH } from './Playback';
import { Player, MiniPlayer } from './Player';
import { Transcript } from './Transcript';
import { Pace, Stalls } from './Pace';
import { Fixes } from './Fixes';
import { Verdict, Drills } from './Verdict';
import { History } from './History';
import * as Dismissed from '@/lib/dismissed';
import type { Analysis, Filler, RankedError } from '@/lib/schema';
import type { Session } from '@/lib/history';
import type { DeadAir, LanguageProfile, Pace as PaceT, Pause, Stall, Word } from '@/lib/types';
import { MIN_WORDS_FOR_LEVEL } from '@/lib/types';

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
  pace: PaceT;
  duration: number;
  envelope: number[];
  audioUrl: string;
  filename: string;
  levelReliable: boolean;
  errorsPer100: number;
  crossChecked: boolean;
  prior: Session[];
  sttModel: string;
  /** Findings dropped by the deterministic checks before anything was shown. */
  rejected: number;
  /** Words Whisper was unsure it heard, which are never corrected. */
  uncertainWords: number;
}

export function Report({ data, onAgain }: { data: ReportData; onAgain: () => void }) {
  const [corrected, setCorrected] = useState(false);
  const [follow, setFollow] = useState(true);
  const [openAll, setOpenAll] = useState(0);
  const [miniVisible, setMiniVisible] = useState(false);
  // A dismissal is the speaker overruling the model about their own speech,
  // which they are entitled to do. Keyed by the claim, so it holds across
  // recordings: a model that keeps insisting a natural phrase is wrong is told
  // once, not once per video.
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const playerBox = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = playerBox.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setMiniVisible(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { lang, analysis } = data;

  // Opening every fix at once is useless if the first one is off screen: the
  // page appears not to have reacted. Bring it into view, but only when it is
  // actually out of view — scrolling a fix the reader is already looking at
  // just moves the page under them.
  useEffect(() => {
    if (!openAll) return;
    const id = requestAnimationFrame(() => {
      const firstErr = document.querySelector('#transcript .err');
      const line = firstErr?.closest('.tline') as HTMLElement | null;
      if (!line) return;
      const r = line.getBoundingClientRect();
      const inView = r.top >= 0 && r.bottom <= window.innerHeight;
      if (!inView) line.scrollIntoView({ behavior: SMOOTH, block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [openAll]);

  useEffect(() => {
    const stored = Dismissed.all().filter((d) => d.language === lang.code);
    setDismissedKeys(new Set(stored.map((d) => `${d.said}::${d.correction}`)));
  }, [lang.code]);

  const dismiss = (e: RankedError) => {
    Dismissed.add({
      language: lang.code, said: e.said, correction: e.correction,
      category: e.category, at: Date.now(),
    });
    setDismissedKeys((prev) => new Set(prev).add(`${e.said}::${e.correction}`));
  };
  const restore = (e: RankedError) => {
    Dismissed.remove(lang.code, e.said, e.correction);
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.delete(`${e.said}::${e.correction}`);
      return next;
    });
  };

  // Dismissed findings leave the transcript as well. Leaving a phrase
  // underlined in red after the speaker has said it is fine would be arguing
  // with the one person here who knows what they meant.
  const errors = data.errors.filter((e) => !dismissedKeys.has(`${e.said}::${e.correction}`));
  const unitShort = lang.unit === 'chars' ? 'cpm' : 'wpm';
  const level = analysis.level;
  const confirmed = errors.filter((e) => e.confirmed).length;
  const sessions = [...data.prior, {
    id: 'current', at: Date.now(), filename: data.filename,
    language: lang.code, languageName: lang.name, words: data.words.length,
    duration: data.duration, overallRate: data.pace.overall,
    articulationRate: data.pace.articulation, unit: lang.unit,
    deadAirPercent: data.deadAir.percent, errorCount: errors.length,
    confirmedErrors: confirmed, errorsPer100: data.errorsPer100,
    level: level.band, framework: level.framework, levelReliable: data.levelReliable,
  } as Session];

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
          <Cell k="Articulation rate" v={<>{data.pace.articulation}<small> {unitShort}</small></>}
            n={`While actually speaking · ${data.pace.overall} ${unitShort} counting silence`} />
          <Cell k="Dead air" v={<>{data.deadAir.percent}<small>%</small></>}
            n={`${data.pauses.length} pause${data.pauses.length === 1 ? '' : 's'} over 0.6 seconds`} />
          <Cell k="Worth checking" v={<>{errors.length}</>}
            n={errors.length
              ? data.crossChecked
                ? `${confirmed} of ${errors.length} found by both passes`
                : 'Single pass — none cross-checked'
              : 'Nothing flagged'} />
          {data.levelReliable ? (
            <Cell k="Level" v={level.reaching ? <>{level.band}<small> → {level.reaching}</small></> : <>{level.band}</>}
              n={`${level.framework} estimate · ${data.words.length} words spoken`} />
          ) : (
            <Cell k="Level" v={<span className="nolevel">not placed</span>}
              n={`Needs ${MIN_WORDS_FOR_LEVEL}+ words · this had ${data.words.length}`} />
          )}
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
          <Pace pace={data.pace} lang={lang} unitShort={unitShort} />
          <Stalls stalls={data.stalls} />
          {analysis.stall_note ? <p className="lede" style={{ margin: '24px 0 0' }}>{analysis.stall_note}</p> : null}
        </section>

        <section className="wrap" id="fixes">
          <div className="sechead"><span className="secnum">03</span><h2>Worth checking, worst first</h2></div>
          {errors.length ? (
            <p className="lede">
              Ranked by how much each would cost you, not by how often it appears. These are
              a well-informed second opinion, not a verdict — if you know a form is right
              where you speak, you are right and this is wrong.
            </p>
          ) : null}
          {(data.rejected > 0 || data.uncertainWords > 0) ? (
            <p className="filternote">
              {data.rejected > 0 ? (
                <>
                  <b>{data.rejected}</b> further {data.rejected === 1 ? 'finding was' : 'findings were'}{' '}
                  discarded before you saw {data.rejected === 1 ? 'it' : 'them'}: the quoted text
                  did not match the transcript, or the correction was identical to what was said.
                </>
              ) : null}
              {data.rejected > 0 && data.uncertainWords > 0 ? ' ' : null}
              {data.uncertainWords > 0 ? (
                <>
                  <b>{data.uncertainWords}</b> {data.uncertainWords === 1 ? 'word was' : 'words were'}{' '}
                  transcribed with low confidence and are never corrected — a mistake there is
                  more likely the transcriber&apos;s than yours.
                </>
              ) : null}
            </p>
          ) : null}
          <Fixes
            errors={data.errors}
            words={data.words}
            language={lang.code}
            dismissedKeys={dismissedKeys}
            onDismiss={dismiss}
            onRestore={restore}
          />
        </section>

        <section className="wrap">
          <div className="sechead"><span className="secnum">04</span><h2>The verdict, and what to drill</h2></div>
          <Verdict
            level={level}
            paragraphs={analysis.verdict}
            reliable={data.levelReliable}
            wordCount={data.words.length}
          />
          <Drills drills={analysis.drills} />
        </section>

        <section className="wrap">
          <div className="sechead"><span className="secnum">05</span><h2>Progress over time</h2></div>
          <p className="lede">
            Everything above judges one recording. This compares you against yourself, which
            is the only comparison here that needs no rubric and no model — the same
            arithmetic, on the same person, over time.
          </p>
          <History sessions={sessions} unitLabel={lang.unitLabel} />
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
