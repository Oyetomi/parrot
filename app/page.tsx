'use client';

import { useCallback, useEffect, useState } from 'react';
import { Setup } from '@/components/Setup';
import { Progress } from '@/components/Progress';
import { Report, type ReportData } from '@/components/Report';
import { KeyDialog } from '@/components/KeyDialog';
import * as A from '@/lib/audio';
import * as G from '@/lib/groq';
import * as M from '@/lib/metrics';
import * as Store from '@/lib/store';
import { profile } from '@/lib/languages';
import { systemPrompt, userPrompt } from '@/lib/prompt';
import { cleanSpans, type RankedError } from '@/lib/schema';
import type { Phase, StepId } from '@/lib/types';

const DEFAULT_MODEL = G.ANALYSIS_MODELS[0].id;

export default function Home() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [language, setLanguage] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [step, setStep] = useState<StepId>('extract');
  const [meta, setMeta] = useState<Partial<Record<StepId, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportData | null>(null);

  // localStorage is only readable on the client, so seed after mount.
  useEffect(() => {
    setHasKey(!!Store.getKey());
    setModel(Store.getModel(DEFAULT_MODEL));
  }, []);

  const chooseModel = useCallback((m: string) => { setModel(m); Store.setModel(m); }, []);

  const run = useCallback(async () => {
    if (!file) return;
    const apiKey = Store.getKey();
    if (!apiKey) { setKeyOpen(true); return; }

    setPhase('working');
    setError(null);
    setStep('extract');
    setMeta({});

    try {
      const buffer = await A.decode(file);
      const samples = await A.toMono16k(buffer);
      const duration = samples.length / A.TARGET_RATE;
      const envelope = A.envelope(samples);
      const chunks = A.chunk(samples);

      setStep('upload');
      setMeta({ extract: `${(chunks.reduce((s, c) => s + c.blob.size, 0) / 1048576).toFixed(1)} MB` });

      const stt = await G.transcribe({
        chunks,
        apiKey,
        language: language || undefined,
        onChunk: (i, n) => { if (n > 1) setMeta((m) => ({ ...m, upload: `part ${i} of ${n}` })); },
      });
      const words = stt.words;
      const lang = profile(stt.language);

      setStep('measure');
      const pauses = M.pauses(words);
      const rate = M.rate(words, duration, lang.unit);
      const deadAir = M.deadAir(pauses, duration);
      const stalls = M.stalls(words, pauses);

      setStep('analyse');
      const analysis = await G.analyze({
        apiKey,
        model,
        system: systemPrompt(),
        user: userPrompt({
          words,
          language: lang.name,
          stats: {
            duration, rate, unitLabel: lang.unitLabel, band: lang.band,
            pauseCount: pauses.length, deadAirSeconds: deadAir.seconds,
            deadAirPercent: deadAir.percent,
            stallPhrases: stalls.slice(0, 3).map((s) => s.phrase),
          },
        }),
      });

      const max = words.length - 1;
      const errors: RankedError[] = cleanSpans(analysis.errors, max)
        .map((e, i) => ({ ...e, rank: e.rank ?? i + 1 }))
        .sort((a, b) => a.rank - b.rank);
      const fillers = cleanSpans(analysis.fillers, max);

      setData({
        words,
        // A line break landing inside an error span would split it across two
        // paragraphs and orphan half of it, so those break points are dropped.
        lineStarts: M.lineStartsAvoiding(words, errors),
        errors, fillers, analysis, lang, pauses, stalls, deadAir, rate, duration,
        envelope, audioUrl: A.playableUrl(samples), filename: file.name,
      });
      setPhase('report');
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof A.UnsupportedFileError) {
        setError(
          `${e.message}\n\nConvert it first, then try the result:\n\nffmpeg -i "${file.name}" -vn -ac 1 -ar 16000 audio.wav`,
        );
      } else if (e instanceof G.ApiError) {
        setError(e.message);
      } else {
        setError(`Something broke: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }, [file, language, model]);

  const reset = useCallback(() => {
    setPhase('setup');
    setError(null);
    setData(null);
  }, []);

  if (phase === 'report' && data) {
    return <Report data={data} onAgain={reset} />;
  }

  return (
    <>
      <header className="studio">
        <div className="wrap">
          <div className="topbar">
            <div className="brand">
              <span className="logo" aria-hidden="true">🦜</span>
              <span className="brandname">Parrot</span>
            </div>
            <div className="topactions">
              <button
                className={`ghost${hasKey ? '' : ' on'}`}
                type="button"
                onClick={() => setKeyOpen(true)}
              >
                {hasKey ? 'API key ✓' : 'API key'}
              </button>
              <a
                className="ghost"
                href="https://github.com/Oyetomi/parrot"
                target="_blank"
                rel="noopener noreferrer"
              >
                Source
              </a>
            </div>
          </div>

          {phase === 'setup' ? (
            <div id="heroCopy">
              <h1>Hear yourself <span className="accent">speak</span></h1>
              <p className="hero-dek">
                Upload a recording in any language. Parrot transcribes it with word-level
                timing, measures where you hesitated, and marks every mistake with the rule
                behind it — then plays it back word by word.
              </p>
            </div>
          ) : null}
        </div>
      </header>

      {phase === 'setup' ? (
        <Setup
          file={file}
          hasKey={hasKey}
          model={model}
          language={language}
          onFile={setFile}
          onModel={chooseModel}
          onLanguage={setLanguage}
          onStart={run}
          onNeedKey={() => setKeyOpen(true)}
        />
      ) : (
        <Progress
          active={step}
          meta={meta}
          error={error}
          filename={file?.name ?? 'your recording'}
          onReset={reset}
        />
      )}

      <KeyDialog
        open={keyOpen}
        onClose={() => { setKeyOpen(false); setHasKey(!!Store.getKey()); }}
      />
    </>
  );
}
