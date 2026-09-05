'use client';

import { useRef, useState } from 'react';
import { options } from '@/lib/languages';
import { ANALYSIS_MODELS, STT_MODELS } from '@/lib/groq';

export function Setup({
  file, hasKey, model, language, sttModel, doubleCheck,
  onFile, onModel, onLanguage, onStart, onNeedKey, onSttModel, onDoubleCheck,
}: {
  file: File | null;
  hasKey: boolean;
  model: string;
  language: string;
  onFile: (f: File) => void;
  onModel: (m: string) => void;
  onLanguage: (l: string) => void;
  onStart: () => void;
  onNeedKey: () => void;
  sttModel: string;
  onSttModel: (m: string) => void;
  doubleCheck: boolean;
  onDoubleCheck: (v: boolean) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  const take = (f: File | undefined | null) => {
    if (!f) return;
    onFile(f);
    // Nothing can happen without a key, so ask for it now rather than
    // leaving the button greyed out with no explanation.
    if (!hasKey) onNeedKey();
  };

  return (
    <main>
      <section className="wrap">
        {!hasKey ? (
          <div className="keycall">
            <div className="keycall-head">
              <span className="keycall-badge">Step 1</span>
              <h2>Get a free Groq API key</h2>
            </div>
            <p>
              Parrot has no server of its own, so it uses yours. The key stays in this
              browser and talks straight to Groq — nothing is uploaded to us, because
              there is no us to upload it to.
            </p>
            <ol className="keysteps">
              <li>
                Open{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
                  console.groq.com/keys
                </a>{' '}
                and sign in with Google or GitHub. No card needed.
              </li>
              <li>Press <b>Create API Key</b>, give it any name.</li>
              <li>Copy it straight away — Groq shows it once, then never again.</li>
              <li>Paste it below.</li>
            </ol>
            <div className="keycall-actions">
              <button className="cta small" type="button" onClick={onNeedKey}>
                Paste my key
              </button>
              <a
                className="ghost dark"
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Groq console ↗
              </a>
            </div>
            <p className="keyfree">
              The free tier covers roughly <b>8 hours of audio a day</b> — far more than
              this needs.
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
            <label htmlFor="model">Analysis model</label>
            <select id="model" value={model} onChange={(e) => onModel(e.target.value)}>
              {ANALYSIS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="fieldnote">
              All on Groq&apos;s free tier. Bigger models write better grammar notes.
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
            {file && !hasKey ? 'Add your Groq API key first →' : ''}
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
