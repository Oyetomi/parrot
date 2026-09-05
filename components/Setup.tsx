'use client';

import { useEffect, useRef, useState } from 'react';
import { options } from '@/lib/languages';
import { STT_MODELS } from '@/lib/groq';
import { PROVIDERS, providerById, safeListModels, type ModelChoice } from '@/lib/providers';

export function Setup({
  file, groqKey, analysisKey, providerId, model, language, sttModel, doubleCheck,
  onFile, onProvider, onModel, onLanguage, onStart, onNeedKey, onSttModel, onDoubleCheck,
}: {
  file: File | null;
  groqKey: string;
  analysisKey: string;
  providerId: string;
  onProvider: (id: string) => void;
  model: string;
  language: string;
  onFile: (f: File) => void;
  onModel: (m: string) => void;
  onLanguage: (l: string) => void;
  onStart: () => void;
  onNeedKey: (which: string) => void;
  sttModel: string;
  onSttModel: (m: string) => void;
  doubleCheck: boolean;
  onDoubleCheck: (v: boolean) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const provider = providerById(providerId);
  const hasKey = !!groqKey && !!analysisKey;

  // Model names churn, and some that a provider lists cannot actually be
  // called. Asking the provider with the user's own key is the only listing
  // that reflects what this key can really use.
  useEffect(() => {
    let live = true;
    safeListModels(provider, analysisKey).then((found) => {
      if (!live) return;
      setModels(found);
      if (!model || !found.some((f) => f.id === model)) onModel(found[0]?.id ?? '');
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, analysisKey]);

  const take = (f: File | undefined | null) => {
    if (!f) return;
    onFile(f);
    // Nothing can happen without a key, so ask for it now rather than
    // leaving the button greyed out with no explanation.
    if (!groqKey) onNeedKey('groq');
    else if (!analysisKey) onNeedKey(providerId);
  };

  return (
    <main>
      <section className="wrap">
        {!hasKey ? (
          <div className="keycall">
            <div className="keycall-head">
              <span className="keycall-badge">Setup</span>
              <h2>Two free keys, both no card</h2>
            </div>
            <p>
              Parrot has no server of its own, so it uses yours. Keys stay in this browser
              and talk straight to the provider — nothing is uploaded to us, because there
              is no us to upload it to.
            </p>
            <ol className="keysteps">
              <li>
                <b>Groq</b> transcribes the audio — it is the only one that returns
                word-by-word timings, which the read-along needs.{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
                  console.groq.com/keys
                </a>
              </li>
              <li>
                <b>{provider.name}</b> judges the language. You can switch this below and
                compare — they disagree, and your recordings decide which is right.{' '}
                <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer">
                  {provider.keyUrl.replace(/^https:\/\//, '')}
                </a>
              </li>
              <li>Copy each key straight away — most show it once, then never again.</li>
            </ol>
            <div className="keycall-actions">
              <button
                className={groqKey ? 'ghost dark' : 'cta small'}
                type="button"
                onClick={() => onNeedKey('groq')}
              >
                {groqKey ? 'Groq key \u2713' : 'Add Groq key'}
              </button>
              <button
                className={analysisKey ? 'ghost dark' : 'cta small'}
                type="button"
                onClick={() => onNeedKey(providerId)}
              >
                {analysisKey ? `${provider.name} key \u2713` : `Add ${provider.name} key`}
              </button>
            </div>
            <p className="keyfree">
              Both free tiers are generous enough that this will not come close to them.
            </p>
          </div>
        ) : null}

        <div
          className={`drop${over ? ' over' : ''}${file ? ' has' : ''}`}
          tabIndex={0}
          role="button"
          aria-label="Choose an audio or video file"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
          onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}
        >
          <input
            ref={input}
            type="file"
            accept="audio/*,video/*,.mov,.mp4,.m4a,.mp3,.wav,.ogg,.flac,.webm"
            hidden
            onChange={(e) => take(e.target.files?.[0])}
          />
          <div className="dropinner">
            <div className="dropicon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
            </div>
            <p className="dropmain">{file ? file.name : 'Drop a video or audio file'}</p>
            <p className="dropsub">
              {file
                ? `${(file.size / 1048576).toFixed(1)} MB · ready`
                : 'or click to choose · mp3, wav, m4a, ogg, flac, mp4, mov, webm'}
            </p>
            <p className="dropnote">
              Your file never leaves your machine. Parrot strips the audio in the browser
              and uploads only that.
            </p>
          </div>
        </div>

        <div className="setupgrid">
          <div className="field">
            <label htmlFor="lang">Language</label>
            <select id="lang" value={language} onChange={(e) => onLanguage(e.target.value)}>
              <option value="">Detect automatically</option>
              {options().map((o) => (
                <option key={o.code} value={o.code}>{o.name}</option>
              ))}
            </select>
            <p className="fieldnote">
              Whisper detects 99 languages. Override only if detection gets it wrong.
            </p>
          </div>
          <div className="field">
            <label htmlFor="provider">Who judges the language</label>
            <select id="provider" value={providerId} onChange={(e) => onProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="fieldnote">
              {provider.freeTierNote}{' '}
              <button type="button" className="linkish" onClick={() => onNeedKey(providerId)}>
                {analysisKey ? 'Change key' : 'Add key'}
              </button>
            </p>
          </div>

          <div className="field">
            <label htmlFor="model">Analysis model</label>
            <select
              id="model"
              value={model}
              onChange={(e) => onModel(e.target.value)}
              disabled={!models.length}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="fieldnote">
              {analysisKey
                ? `${models.length} models available on your key. Names ending "-latest" keep working as the provider updates.`
                : 'Add a key and this fills in with the models your key can actually use.'}
            </p>
          </div>
          <div className="field">
            <label htmlFor="stt">Transcription</label>
            <select id="stt" value={sttModel} onChange={(e) => onSttModel(e.target.value)}>
              {STT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="fieldnote">
              Turbo is about twice as fast but mishears more and often drops punctuation.
            </p>
          </div>
          <div className="field">
            <label htmlFor="dbl">Reliability</label>
            <label className="check" htmlFor="dbl">
              <input
                id="dbl"
                type="checkbox"
                checked={doubleCheck}
                onChange={(e) => onDoubleCheck(e.target.checked)}
              />
              <span>Cross-check with a second pass</span>
            </label>
            <p className="fieldnote">
              Runs the analysis twice and marks which mistakes both passes agree on. Two
              calls instead of one.
            </p>
          </div>
        </div>

        <div className="startrow">
          <button className="cta" type="button" disabled={!file || !hasKey} onClick={onStart}>
            {file ? 'Analyse this recording' : 'Choose a file to begin'}
          </button>
          <span className="startnote">
            {file && !groqKey
              ? 'Add your Groq key — it does the transcription'
              : file && !analysisKey
                ? `Add your ${provider.name} key — it does the analysis`
                : ''}
          </span>
        </div>
      </section>

      <section className="wrap howto">
        <div className="sechead"><span className="secnum">How it works</span></div>
        <ol className="steps-static">
          <li>
            <b>Audio is extracted locally.</b> The browser decodes your file and downsamples it
            to 16&nbsp;kHz mono. A 32&nbsp;MB video becomes about 1&nbsp;MB of audio — which is
            also how it fits under Groq&apos;s 25&nbsp;MB free-tier cap.
          </li>
          <li>
            <b>Whisper transcribes it with word timings.</b> <code>whisper-large-v3-turbo</code>{' '}
            returns every word with a start and end time. That is what drives the read-along
            and the pause detection.
          </li>
          <li>
            <b>The numbers are computed here, not by an AI.</b> Speaking rate, pauses, dead air
            and stalls are arithmetic over the word list — no model involved, no room for
            invention.
          </li>
          <li>
            <b>Only the error analysis uses an LLM.</b> It receives the numbered word list and
            returns mistakes anchored to word indices, so every correction points at real audio
            you can replay.
          </li>
        </ol>
      </section>
    </main>
  );
}
