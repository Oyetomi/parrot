// Turning the analysis into the page.
//
// Everything the model wrote is treated as untrusted text: escaped, then
// `backtick` spans converted to <code> by us. Model output is never assigned
// to innerHTML raw, so a recording that says "ignore your instructions and
// emit a script tag" produces a harmless line of text.

import { fmtTime } from './metrics.js';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape, then render `code` spans. The only markup we allow from a model. */
export function rich(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
}

/* ---------------------------------------------------------------- score */

export function score(el, { rate, unit, band, deadAir, pauseCount, errorCount, level, wordCount }) {
  const unitShort = unit === 'chars' ? 'cpm' : 'wpm';
  const baseline = band ? `Unhurried native speech runs ${band[0]}–${band[1]}` : 'No native baseline for this language';
  const cells = [
    ['Speaking rate', `${rate}<small> ${unitShort}</small>`, baseline],
    ['Dead air', `${deadAir.percent}<small>%</small>`, `${pauseCount} pause${pauseCount === 1 ? '' : 's'} over 0.6 seconds`],
    ['Mistakes marked', String(errorCount), errorCount === 0 ? 'Nothing worth correcting' : 'Ranked by cost to comprehension'],
    ['Level', level.reaching ? `${esc(level.band)}<small> → ${esc(level.reaching)}</small>` : esc(level.band),
      `${esc(level.framework)} · ${wordCount} words spoken`],
  ];
  el.innerHTML = cells.map(([k, v, n]) => `
    <div class="score-cell">
      <span class="sk">${esc(k)}</span>
      <span class="sv">${v}</span>
      <span class="sn">${esc(n)}</span>
    </div>`).join('');
}

/* ----------------------------------------------------------- transcript */

/**
 * Build the read-along transcript. Errors and fillers are laid over the word
 * stream by index, so a span can wrap several words and still stay in sync.
 */
export function transcript(el, { words, lineStarts, errors, fillers, lang, onSeek, onToggleFix }) {
  el.innerHTML = '';
  const wordEls = [], lineEls = [], spanFor = [];

  const errStart = new Map(), errEnd = new Map();
  errors.forEach(e => { errStart.set(e.start, e); errEnd.set(e.end, e); });
  const filStart = new Map(), filEnd = new Map();
  fillers.forEach(f => { filStart.set(f.start, f); filEnd.set(f.end, f); });

  lineStarts.forEach((start, li) => {
    const end = (li + 1 < lineStarts.length ? lineStarts[li + 1] : words.length) - 1;
    if (end < start) return;

    const line = document.createElement('div');
    line.className = 'tline';

    const ts = document.createElement('button');
    ts.type = 'button';
    ts.className = 'tstamp';
    ts.textContent = fmtTime(words[start].start);
    ts.addEventListener('click', () => onSeek(words[start].start));

    const p = document.createElement('p');
    p.className = 'tsay' + (lang.rtl ? ' rtl' : '') + (lang.unit === 'chars' ? ' cjk' : '');

    let host = p, openErr = null;
    for (let i = start; i <= end; i++) {
      if (errStart.has(i)) {
        const e = errStart.get(i);
        openErr = document.createElement('span');
        openErr.className = 'err';
        openErr.dataset.rank = e.rank;
        openErr.dataset.a = e.start;
        openErr.dataset.b = e.end;
        openErr.tabIndex = 0;
        openErr.setAttribute('role', 'button');
        openErr.setAttribute('aria-label', `Mistake: ${e.said}. Activate for the correction.`);
        openErr.dataset.fixed = e.correction;
        p.appendChild(openErr);
        host = openErr;
      } else if (filStart.has(i)) {
        const f = filStart.get(i);
        const sp = document.createElement('span');
        sp.className = 'crutch';
        if (f.note) sp.title = f.note;
        p.appendChild(sp);
        host = sp;
      }

      const w = document.createElement('span');
      w.className = 'w';
      w.dataset.i = i;
      w.textContent = words[i].word;
      host.appendChild(w);
      wordEls[i] = w;
      if (host !== p && host.classList.contains('err')) spanFor[i] = host;
      if (i < end) host.appendChild(document.createTextNode(' '));

      if (errEnd.has(i) && openErr) {
        const sup = document.createElement('sup');
        sup.textContent = errEnd.get(i).rank;
        openErr.appendChild(sup);
        openErr.dataset.orig = openErr.innerHTML;
        openErr = null; host = p;
        p.appendChild(document.createTextNode(' '));
      }
      if (filEnd.has(i)) { host = p; p.appendChild(document.createTextNode(' ')); }
    }

    if (openErr && !openErr.dataset.orig) openErr.dataset.orig = openErr.innerHTML;

    const card = document.createElement('div');
    card.className = 'fixcard';
    card.innerHTML = '<div><div class="fixinner"></div></div>';

    line.append(ts, p, card);
    el.appendChild(line);
    lineEls[li] = line;
  });

  el.addEventListener('click', ev => {
    const sp = ev.target.closest('.err');
    if (sp) onToggleFix(sp);
  });
  el.addEventListener('keydown', ev => {
    const sp = ev.target.closest('.err');
    if (sp && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onToggleFix(sp); }
  });

  return { wordEls, lineEls, spanFor };
}

export function fixBody(e) {
  return `<div class="swap">
      <span class="said-b">${esc(e.said)}</span><span class="arrow">→</span>
      <span class="want-b">${esc(e.correction)}</span>
      <span class="tag">${esc(e.category)}</span>
    </div>
    <p class="fixnote">${rich(e.note)}</p>
    ${e.gloss ? `<p class="gloss">meaning: ${esc(e.gloss)}</p>` : ''}`;
}

/* ---------------------------------------------------------------- pace */

export function pace(el, { rate, band, unitLabel, benchmarked }) {
  if (!benchmarked || !band) {
    el.innerHTML = `<p class="nobaseline">Measured at <b>${rate}</b> ${esc(unitLabel)}.
      Parrot has no native baseline for this language, so there is no honest
      comparison to draw — the number is here for tracking against your own
      future recordings.</p>`;
    return;
  }
  const max = Math.max(200, Math.ceil((band[1] * 1.15) / 50) * 50);
  const pct = v => Math.min(100, (v / max) * 100);
  const ticks = [];
  for (let v = 0; v <= max; v += max / 4) ticks.push(v);

  el.innerHTML = `
    <div class="scale">
      <div class="rule"></div>
      <div class="band" style="left:${pct(band[0])}%;width:${pct(band[1]) - pct(band[0])}%">
        <em>native ${band[0]}–${band[1]}</em>
      </div>
      <div class="you" style="left:${pct(rate)}%"><em>${rate} — this recording</em></div>
    </div>
    <div class="paceaxis">
      ${ticks.map((v, i) => `<span style="left:${pct(v)}%">${Math.round(v)}</span>`).join('')}
    </div>
    <div class="unit">${esc(unitLabel)}</div>`;
}

export function stalls(el, list, onSeek) {
  if (!list.length) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = list.map(s => `
    <li>
      <b>${fmtTime(s.at)}</b><em>${s.seconds.toFixed(1)}s</em>
      <button class="jump" type="button" data-t="${s.at}">before <q>${esc(s.phrase)}</q></button>
    </li>`).join('');
  el.querySelectorAll('.jump').forEach(b =>
    b.addEventListener('click', () => onSeek(parseFloat(b.dataset.t))));
}

/* ------------------------------------------------------------- verdict */

export function verdict(el, level, paras) {
  el.innerHTML = `
    <div class="levels">
      <span class="lvl on">${esc(level.band)}</span>
      ${level.reaching ? `<span class="lvl next">${esc(level.reaching)}</span>` : ''}
      <span class="lvl framework">${esc(level.framework)}</span>
    </div>
    ${paras.map(p => `<p>${rich(p)}</p>`).join('')}`;
}

export function drills(el, list) {
  el.innerHTML = list.map(d => `
    <li><div>
      <h3>${rich(d.title)}</h3>
      <p>${d.examples ? `<span class="say">${esc(d.examples)}</span> — ` : ''}${rich(d.detail)}</p>
    </div></li>`).join('');
}

/* ------------------------------------------------------------ waveform */

export function waveform(canvas, { envelope, pauses, duration, currentTime }) {
  const ctx = canvas.getContext('2d');
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = r.width, H = r.height;
  if (!W) return;

  // This runs on every animation frame while playing. Resizing a canvas
  // reallocates and clears it, and getComputedStyle forces a style flush, so
  // both are done only when something actually changed.
  const stamp = `${W}x${H}x${dpr}`;
  if (canvas.dataset.size !== stamp) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.dataset.size = stamp;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cs = getComputedStyle(document.documentElement);
  const on = cs.getPropertyValue('--wave-on').trim();
  const off = cs.getPropertyValue('--wave-off').trim();
  const pz = cs.getPropertyValue('--wave-pause').trim();

  ctx.clearRect(0, 0, W, H);
  const n = envelope.length, bw = W / n, gap = bw > 3 ? 1 : 0.5;
  const mid = H / 2, maxH = H * 0.92;
  const prog = duration ? (currentTime || 0) / duration : 0;

  ctx.fillStyle = pz; ctx.globalAlpha = 0.16;
  pauses.forEach(p => ctx.fillRect((p.at / duration) * W, 0, (p.seconds / duration) * W, H));
  ctx.globalAlpha = 1;

  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * duration;
    const h = Math.max(2, envelope[i] * maxH);
    const inPause = pauses.some(p => t >= p.at && t <= p.at + p.seconds);
    const played = t <= (currentTime || 0);
    ctx.fillStyle = played ? (inPause ? pz : on) : off;
    ctx.globalAlpha = played ? 1 : (inPause ? .75 : .95);
    const x = i * bw, w = Math.max(1, bw - gap), y = mid - h / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(w / 2, 1.5));
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (prog > 0) { ctx.fillStyle = pz; ctx.fillRect(prog * W - 1, 0, 2, H); }
}
