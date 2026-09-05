// Parrot — orchestration and playback.
//
// Pipeline: decode locally → downmix to 16 kHz mono → chunk → Whisper for word
// timings → measure locally → LLM for the error analysis → render.

import * as A from './src/audio.js';
import * as G from './src/groq.js';
import * as M from './src/metrics.js';
import * as R from './src/render.js';
import * as Store from './src/store.js';
import { profile, options } from './src/languages.js';
import { systemPrompt, userPrompt } from './src/prompt.js';

const $ = s => document.querySelector(s);
const au = $('#au');

const state = {
  file: null, samples: null, duration: 0, envelope: [],
  words: [], lang: null, analysis: null,
  // Derived once in show(). These were being recomputed inside the animation
  // frame loop, which meant re-deriving line breaks and pauses 60 times a second.
  errors: [], lineStarts: [], pauseList: [],
  wordEls: [], lineEls: [], spanFor: [],
  follow: true, curWord: -1, curEl: null, lastLine: -1, running: false,
};

const SMOOTH = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
const scrollToEl = el => el?.scrollIntoView({ behavior: SMOOTH, block: 'center' });

/* ------------------------------------------------------------- API key */

const dlg = $('#keyDlg');
$('#btnKey').addEventListener('click', () => { $('#keyInput').value = Store.getKey(); dlg.showModal(); });
dlg.addEventListener('close', () => {
  if (dlg.returnValue === 'save') Store.setKey($('#keyInput').value.trim());
  if (dlg.returnValue === 'clear') Store.setKey('');
  paintKeyState();
});
function paintKeyState() {
  const has = !!Store.getKey();
  $('#btnKey').textContent = has ? 'API key ✓' : 'API key';
  $('#btnKey').classList.toggle('on', !has);
  refreshStart();
}

/* ------------------------------------------------------------- pickers */

const langSel = $('#lang');
options().forEach(o => {
  const opt = document.createElement('option');
  opt.value = o.code; opt.textContent = o.name;
  langSel.appendChild(opt);
});
const modelSel = $('#model');
modelSel.value = Store.getModel(modelSel.value);
modelSel.addEventListener('change', () => Store.setModel(modelSel.value));

/* ------------------------------------------------------------ dropzone */

const drop = $('#drop'), fileInput = $('#file');
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => pick(fileInput.files[0]));
['dragenter', 'dragover'].forEach(t =>
  drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t =>
  drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => pick(e.dataTransfer.files[0]));

function pick(file) {
  if (!file) return;
  state.file = file;
  drop.classList.add('has');
  $('.dropmain').textContent = file.name;
  $('.dropsub').textContent = `${(file.size / 1048576).toFixed(1)} MB · ready`;
  refreshStart();
  // Nothing can happen without a key, so ask for it now rather than leaving
  // the button greyed out with no explanation.
  if (!Store.getKey()) { $('#keyInput').value = ''; dlg.showModal(); }
}
function refreshStart() {
  const ready = !!state.file && !!Store.getKey();
  $('#btnStart').disabled = !ready;
  $('#btnStart').textContent = state.file ? 'Analyse this recording' : 'Choose a file to begin';
  $('#startNote').textContent = !state.file ? ''
    : !Store.getKey() ? 'Add your Groq API key first →' : '';
}

/* ------------------------------------------------------------ progress */

const STEPS = [
  ['extract', 'Extracting audio in your browser'],
  ['upload',  'Transcribing with Whisper'],
  ['measure', 'Measuring pace, pauses and stalls'],
  ['analyse', 'Analysing grammar and word choice'],
];
function paintSteps(active, meta = {}) {
  $('#steps').innerHTML = STEPS.map(([id, label], i) => {
    const idx = STEPS.findIndex(s => s[0] === active);
    const cls = i < idx ? 'done' : i === idx ? 'run' : '';
    return `<li class="${cls}"><i class="dotmark"></i><span>${label}</span>
      <span class="meta">${meta[id] || ''}</span></li>`;
  }).join('');
}
function fail(msg) {
  const err = $('#workerr');
  err.hidden = false;
  err.innerHTML = R.rich(msg);
  document.querySelectorAll('#steps li.run').forEach(li => li.className = 'fail');
}

/* ------------------------------------------------------------ pipeline */

$('#btnStart').addEventListener('click', run);
$('#btnCancel').addEventListener('click', () => location.reload());
$('#btnAgain').addEventListener('click', () => location.reload());

async function run() {
  if (state.running) return;
  state.running = true;
  $('#btnStart').disabled = true;
  const apiKey = Store.getKey();
  $('#setup').hidden = true;
  $('#working').hidden = false;
  $('#workerr').hidden = true;
  $('#workfile').textContent = state.file.name;
  $('#heroCopy').hidden = true;

  try {
    paintSteps('extract');
    const buffer = await A.decode(state.file);
    state.samples = await A.toMono16k(buffer);
    state.duration = state.samples.length / A.TARGET_RATE;
    state.envelope = A.envelope(state.samples);
    const chunks = A.chunk(state.samples);
    paintSteps('upload', { extract: `${(chunks.reduce((s, c) => s + c.blob.size, 0) / 1048576).toFixed(1)} MB` });

    const stt = await G.transcribe({
      chunks, apiKey,
      language: langSel.value || undefined,
      onChunk: (i, n) => { if (n > 1) paintSteps('upload', { upload: `part ${i} of ${n}` }); },
    });
    state.words = stt.words;
    state.lang = profile(stt.language);

    paintSteps('measure');
    const pauseList = M.pauses(state.words);
    const rate = M.rate(state.words, state.duration, state.lang.unit);
    const air = M.deadAir(pauseList, state.duration);
    const stallList = M.stalls(state.words, pauseList);

    paintSteps('analyse');
    const analysis = await G.analyze({
      apiKey, model: modelSel.value,
      system: systemPrompt(),
      user: userPrompt({
        words: state.words,
        language: state.lang.name,
        stats: {
          duration: state.duration, rate, unitLabel: state.lang.unitLabel,
          band: state.lang.band, pauseCount: pauseList.length,
          deadAirSeconds: air.seconds, deadAirPercent: air.percent,
          stallPhrases: stallList.slice(0, 3).map(s => s.phrase),
        },
      }),
    });

    state.analysis = analysis;
    show({ analysis, pauseList, rate, air, stallList });
  } catch (e) {
    if (e instanceof A.UnsupportedFileError) {
      fail(`${e.message}\n\nConvert it first, then try the result:\n\n\`ffmpeg -i "${state.file.name}" -vn -ac 1 -ar 16000 audio.wav\``);
    } else if (e instanceof G.ApiError) {
      fail(e.message);
    } else {
      fail(`Something broke: ${e.message}`);
    }
  } finally {
    state.running = false;
  }
}

/**
 * Model output is not trusted to be well-formed. Indices get clamped to the
 * real word list, overlapping spans are dropped, and anything out of range is
 * discarded — one bad span would otherwise corrupt the whole transcript.
 */
function cleanSpans(list, max) {
  const taken = new Set();
  return (Array.isArray(list) ? list : [])
    .map(e => ({ ...e, start: Math.max(0, Math.min(max, e.start | 0)), end: Math.max(0, Math.min(max, e.end | 0)) }))
    .filter(e => e.end >= e.start && e.end - e.start < 30)
    .sort((a, b) => a.start - b.start)
    .filter(e => {
      for (let i = e.start; i <= e.end; i++) if (taken.has(i)) return false;
      for (let i = e.start; i <= e.end; i++) taken.add(i);
      return true;
    });
}

function show({ analysis, pauseList, rate, air, stallList }) {
  const max = state.words.length - 1;
  const errors = cleanSpans(analysis.errors, max)
    .map((e, i) => ({ ...e, rank: e.rank || i + 1 }))
    .sort((a, b) => a.rank - b.rank);
  const fillers = cleanSpans(analysis.fillers, max);
  const level = { framework: 'CEFR', band: '—', reaching: '', ...(analysis.level || {}) };

  // A line break landing inside an error span would split it across two
  // paragraphs and orphan half of it. Drop those break points instead.
  const lineStarts = M.lines(state.words)
    .filter(s => !errors.some(e => s > e.start && s <= e.end));

  state.errors = errors;
  state.lineStarts = lineStarts;
  state.pauseList = pauseList;

  $('#working').hidden = true;
  $('#report').hidden = false;
  $('#player').hidden = false;
  au.src = A.playableUrl(state.samples);
  $('#dur').textContent = M.fmtTime(state.duration);
  $('#pauseKey').textContent = `Pauses over 0.6s — ${air.seconds}s of the clip`;

  R.score($('#scoreRow'), {
    rate, unit: state.lang.unit, band: state.lang.band, deadAir: air,
    pauseCount: pauseList.length, errorCount: errors.length, level,
    wordCount: state.words.length,
  });

  $('#listenLede').textContent = analysis.summary_line
    ? `${analysis.summary_line} Tap a timestamp to jump. Tap anything underlined in red to see what it should have been.`
    : 'Tap a timestamp to jump. Tap anything underlined in red to see what it should have been.';

  const seek = t => { au.currentTime = Math.max(0, Math.min(state.duration - .05, t)); if (au.paused) au.play().catch(() => {}); tick(); };

  const built = R.transcript($('#transcript'), {
    words: state.words, lineStarts, errors, fillers,
    lang: state.lang, onSeek: seek,
    onToggleFix: sp => toggleFix(sp, errors),
  });
  state.wordEls = built.wordEls;
  state.lineEls = built.lineEls;
  state.spanFor = built.spanFor;

  $('#paceLede').textContent = analysis.pace_note || '';
  R.pace($('#paceBox'), { rate, band: state.lang.band, unitLabel: state.lang.unitLabel, benchmarked: state.lang.benchmarked });
  R.stalls($('#stalls'), stallList, t => { seek(t); $('#listen').scrollIntoView({ behavior: SMOOTH }); });
  $('#stallNote').textContent = analysis.stall_note || '';

  $('#fixLede').textContent = errors.length
    ? 'Ranked by how much each one costs you, not by how often it appears.'
    : '';
  paintFixes(errors, seek);

  R.verdict($('#verdict'), level, Array.isArray(analysis.verdict) ? analysis.verdict : [String(analysis.verdict || '')]);
  R.drills($('#drills'), Array.isArray(analysis.drills) ? analysis.drills : []);

  drawWave();
  tick();
  window.scrollTo({ top: 0 });
}

/* --------------------------------------------------------- fix toggles */

function toggleFix(sp, errors) {
  const e = (errors || state.errors).find(x => String(x.rank) === sp.dataset.rank);
  if (!e) return;
  const card = sp.closest('.tline').querySelector('.fixcard');
  const same = card.classList.contains('open') && card.dataset.rank === sp.dataset.rank;
  document.querySelectorAll('.err.open').forEach(x => x.classList.remove('open'));
  if (same) { card.classList.remove('open'); return; }
  card.querySelector('.fixinner').innerHTML = R.fixBody(e);
  card.dataset.rank = sp.dataset.rank;
  card.classList.add('open');
  sp.classList.add('open');
}

$('#btnAll').addEventListener('click', () => {
  const errors = state.errors;
  const anyClosed = [...document.querySelectorAll('.fixcard')].some(c => !c.classList.contains('open') && c.closest('.tline').querySelector('.err'));
  document.querySelectorAll('.tline').forEach(line => {
    const sp = line.querySelector('.err');
    if (!sp) return;
    const card = line.querySelector('.fixcard');
    if (anyClosed) {
      const e = errors.find(x => String(x.rank) === sp.dataset.rank);
      if (e) card.querySelector('.fixinner').innerHTML = R.fixBody(e);
      card.dataset.rank = sp.dataset.rank;
      card.classList.add('open'); sp.classList.add('open');
    } else { card.classList.remove('open'); sp.classList.remove('open'); }
  });
  $('#btnAll').textContent = anyClosed ? 'Close all fixes' : 'Open all fixes';
});

$('#btnSaid').addEventListener('click', () => setMode(false));
$('#btnFixed').addEventListener('click', () => setMode(true));
function setMode(fixed) {
  document.body.classList.toggle('corrected', fixed);
  $('#btnSaid').setAttribute('aria-pressed', String(!fixed));
  $('#btnFixed').setAttribute('aria-pressed', String(fixed));
  document.querySelectorAll('.err').forEach(sp => {
    if (fixed) sp.textContent = sp.dataset.fixed;
    else sp.innerHTML = sp.dataset.orig;
  });
  document.querySelectorAll('.w[data-i]').forEach(el => { state.wordEls[+el.dataset.i] = el; });
  // The element under the playhead just changed identity; re-resolve it.
  state.curEl?.classList.remove('now');
  state.curEl = null;
  state.curWord = -1;
  tick();
}

function paintFixes(errors, seek) {
  const list = $('#fixlist');
  const f = $('#filters');
  if (!errors.length) {
    f.innerHTML = '';
    list.innerHTML = `<li class="nofix">
      <p><b>Nothing worth correcting.</b> The model found no grammar or word-choice
      errors in this recording. That is a real result, not a failure — but remember
      it says nothing about pronunciation, which a transcript cannot show.</p></li>`;
    return;
  }
  list.innerHTML = errors.map(e => `
    <li data-tag="${R.esc(e.category)}">
      <span class="rank">${String(e.rank).padStart(2, '0')}</span>
      ${R.fixBody(e)}
      <button class="hearit" type="button" data-t="${state.words[e.start].start}">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Hear it
      </button>
    </li>`).join('');
  list.querySelectorAll('.hearit').forEach(b => b.addEventListener('click', () => {
    seek(parseFloat(b.dataset.t) - 0.35);
    $('#listen').scrollIntoView({ behavior: SMOOTH });
  }));

  const tags = ['all', ...new Set(errors.map(e => e.category))];
  f.innerHTML = '';
  tags.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip';
    b.textContent = t === 'all' ? `All ${errors.length}` : t;
    b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', () => {
      f.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      list.querySelectorAll('li').forEach(li =>
        li.classList.toggle('hide', t !== 'all' && li.dataset.tag !== t));
    });
    f.appendChild(b);
  });
}

/* ------------------------------------------------------------ playback */

const cvs = $('#wave');
function drawWave() {
  R.waveform(cvs, {
    envelope: state.envelope, pauses: state.pauseList,
    duration: state.duration, currentTime: au.currentTime,
  });
}
let scrubbing = false;
function seekFromX(x) {
  const r = cvs.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (x - r.left) / r.width));
  au.currentTime = p * state.duration;
  if (au.paused) au.play().catch(() => {});
  tick();
}
cvs.addEventListener('pointerdown', e => { scrubbing = true; cvs.setPointerCapture(e.pointerId); seekFromX(e.clientX); });
cvs.addEventListener('pointermove', e => { if (scrubbing) seekFromX(e.clientX); });
['pointerup', 'pointercancel'].forEach(t => cvs.addEventListener(t, () => { scrubbing = false; }));

document.querySelectorAll('#play,[data-play]').forEach(b =>
  b.addEventListener('click', () => au.paused ? au.play().catch(() => {}) : au.pause()));
au.addEventListener('play', () => { document.body.classList.add('playing'); tick(); });
au.addEventListener('pause', () => document.body.classList.remove('playing'));
au.addEventListener('seeked', tick);

document.querySelectorAll('.rate').forEach(b => b.addEventListener('click', () => {
  au.playbackRate = parseFloat(b.dataset.rate);
  document.querySelectorAll('.rate').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
}));

$('#btnFollow').addEventListener('click', () => {
  state.follow = !state.follow;
  $('#btnFollow').setAttribute('aria-pressed', String(state.follow));
});

$('#miniprog').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  au.currentTime = ((e.clientX - r.left) / r.width) * state.duration;
  tick();
});
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => $('#mini').classList.toggle('show', !e.isIntersecting && !$('#report').hidden))
    .observe($('#player'));
}

function tick() {
  const t = au.currentTime || 0;
  $('#cur').textContent = M.fmtTime(t);
  $('#cur2').textContent = M.fmtTime(t);
  $('#minibar').style.width = (state.duration ? (t / state.duration) * 100 : 0) + '%';

  let idx = -1;
  for (let i = 0; i < state.words.length; i++) {
    const w = state.words[i];
    if (t >= w.start && t < Math.max(w.end, w.start + 0.12)) { idx = i; break; }
    if (w.start > t) break;
  }
  if (idx !== state.curWord) {
    state.curEl?.classList.remove('now');
    state.curEl = null;
    state.curWord = idx;
    if (idx >= 0) {
      // In the corrected view the original word spans inside an error are gone,
      // replaced by the correction, so highlight the whole span instead.
      const corrected = document.body.classList.contains('corrected');
      state.curEl = (corrected && state.spanFor[idx]) || state.wordEls[idx] || null;
      state.curEl?.classList.add('now');
      $('#nowword').textContent = state.words[idx].word;
      const starts = state.lineStarts;
      let li = 0;
      for (let k = 0; k < starts.length; k++) if (idx >= starts[k]) li = k;
      if (li !== state.lastLine) {
        state.lineEls.forEach((el, k) => el?.classList.toggle('on', k === li));
        if (state.follow && !au.paused) scrollToEl(state.lineEls[li]);
        state.lastLine = li;
      }
    } else {
      $('#nowword').textContent = au.paused ? 'paused' : '…';
    }
  }
  drawWave();
  if (!au.paused) requestAnimationFrame(tick);
}

/* ------------------------------------------------------------- exports */

$('#btnJson').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({
    file: state.file?.name, language: state.lang, duration: state.duration,
    words: state.words, analysis: state.analysis,
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.file?.name || 'parrot').replace(/\.[^.]+$/, '') + '.parrot.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

addEventListener('keydown', e => {
  if ($('#report').hidden) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.code === 'Space' && !e.target.closest('button')) { e.preventDefault(); au.paused ? au.play() : au.pause(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); au.currentTime += 5; tick(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); au.currentTime -= 5; tick(); }
});
addEventListener('resize', () => { if (!$('#report').hidden) drawWave(); });

paintKeyState();
