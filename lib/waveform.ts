import type { Pause } from './types';

/**
 * Draw the waveform. Called on every animation frame while playing, so the
 * two expensive operations are guarded: resizing a canvas reallocates and
 * clears it, and getComputedStyle forces a style flush.
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  opts: { envelope: number[]; pauses: Pause[]; duration: number; currentTime: number },
): void {
  const { envelope, pauses, duration, currentTime } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx || !duration) return;

  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = r.width;
  const H = r.height;
  if (!W) return;

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
  const n = envelope.length;
  const bw = W / n;
  const gap = bw > 3 ? 1 : 0.5;
  const mid = H / 2;
  const maxH = H * 0.92;
  const prog = (currentTime || 0) / duration;

  ctx.fillStyle = pz;
  ctx.globalAlpha = 0.16;
  for (const p of pauses) ctx.fillRect((p.at / duration) * W, 0, (p.seconds / duration) * W, H);
  ctx.globalAlpha = 1;

  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * duration;
    const h = Math.max(2, envelope[i] * maxH);
    const inPause = pauses.some((p) => t >= p.at && t <= p.at + p.seconds);
    const played = t <= (currentTime || 0);
    ctx.fillStyle = played ? (inPause ? pz : on) : off;
    ctx.globalAlpha = played ? 1 : inPause ? 0.75 : 0.95;
    const x = i * bw;
    const w = Math.max(1, bw - gap);
    ctx.beginPath();
    ctx.roundRect(x, mid - h / 2, w, h, Math.min(w / 2, 1.5));
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (prog > 0) {
    ctx.fillStyle = pz;
    ctx.fillRect(prog * W - 1, 0, 2, H);
  }
}
