'use client';

// Playback is deliberately imperative.
//
// The read-along highlights a new word up to several times a second and
// redraws a canvas every frame. Driving that through React state would
// re-render the whole transcript on every tick for no benefit, so the loop
// mutates registered DOM nodes directly and React never re-renders during
// playback. Components register their nodes here and otherwise stay static.

import { createContext, useContext, useCallback, useEffect, useMemo, useRef } from 'react';
import { drawWaveform } from '@/lib/waveform';
import type { Pause, Word } from '@/lib/types';

export const SMOOTH: ScrollBehavior =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';

interface Ctx {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  registerWord: (i: number, el: HTMLElement | null) => void;
  registerSpan: (from: number, to: number, el: HTMLElement | null) => void;
  registerLine: (i: number, el: HTMLElement | null) => void;
  registerTime: (el: HTMLElement | null) => void;
  registerNowWord: (el: HTMLElement | null) => void;
  registerBar: (el: HTMLElement | null) => void;
  seek: (t: number) => void;
  toggle: () => void;
  setFollow: (v: boolean) => void;
  setCorrected: (v: boolean) => void;
  redraw: () => void;
  duration: number;
}

const PlaybackCtx = createContext<Ctx | null>(null);
export const usePlayback = () => {
  const c = useContext(PlaybackCtx);
  if (!c) throw new Error('usePlayback must be used inside <Playback>');
  return c;
};

export function Playback({
  words,
  lineStarts,
  pauses,
  envelope,
  duration,
  src,
  children,
}: {
  words: Word[];
  lineStarts: number[];
  pauses: Pause[];
  envelope: number[];
  duration: number;
  src: string;
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wordEls = useRef<(HTMLElement | null)[]>([]);
  const spanEls = useRef<(HTMLElement | null)[]>([]);
  const lineEls = useRef<(HTMLElement | null)[]>([]);
  const timeEl = useRef<HTMLElement | null>(null);
  const nowEl = useRef<HTMLElement | null>(null);
  const barEl = useRef<HTMLElement | null>(null);

  const follow = useRef(true);
  const corrected = useRef(false);
  const curIndex = useRef(-1);
  const curEl = useRef<HTMLElement | null>(null);
  const curLine = useRef(-1);
  const raf = useRef(0);

  const registerWord = useCallback((i: number, el: HTMLElement | null) => { wordEls.current[i] = el; }, []);
  const registerSpan = useCallback((from: number, to: number, el: HTMLElement | null) => {
    for (let i = from; i <= to; i++) spanEls.current[i] = el;
  }, []);
  const registerLine = useCallback((i: number, el: HTMLElement | null) => { lineEls.current[i] = el; }, []);
  const registerTime = useCallback((el: HTMLElement | null) => { timeEl.current = el; }, []);
  const registerNowWord = useCallback((el: HTMLElement | null) => { nowEl.current = el; }, []);
  const registerBar = useCallback((el: HTMLElement | null) => { barEl.current = el; }, []);

  const fmt = (t: number) => {
    const v = Math.max(0, t || 0);
    return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
  };

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (c) drawWaveform(c, { envelope, pauses, duration, currentTime: audioRef.current?.currentTime ?? 0 });
  }, [envelope, pauses, duration]);

  const tick = useCallback(() => {
    const au = audioRef.current;
    if (!au) return;
    const t = au.currentTime || 0;

    if (timeEl.current) timeEl.current.textContent = fmt(t);
    if (barEl.current) barEl.current.style.width = `${duration ? (t / duration) * 100 : 0}%`;

    let idx = -1;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (t >= w.start && t < Math.max(w.end, w.start + 0.12)) { idx = i; break; }
      if (w.start > t) break;
    }

    if (idx !== curIndex.current) {
      curEl.current?.classList.remove('now');
      curEl.current = null;
      curIndex.current = idx;

      if (idx >= 0) {
        // In the corrected view the original word nodes inside an error are
        // gone, replaced by the correction, so highlight the whole span.
        curEl.current = (corrected.current ? spanEls.current[idx] : null) ?? wordEls.current[idx] ?? null;
        curEl.current?.classList.add('now');
        if (nowEl.current) nowEl.current.textContent = words[idx].word;

        let li = 0;
        for (let k = 0; k < lineStarts.length; k++) if (idx >= lineStarts[k]) li = k;
        if (li !== curLine.current) {
          lineEls.current.forEach((el, k) => el?.classList.toggle('on', k === li));
          if (follow.current && !au.paused) {
            lineEls.current[li]?.scrollIntoView({ behavior: SMOOTH, block: 'center' });
          }
          curLine.current = li;
        }
      } else if (nowEl.current) {
        nowEl.current.textContent = au.paused ? 'paused' : '…';
      }
    }

    redraw();
    if (!au.paused) raf.current = requestAnimationFrame(tick);
  }, [words, lineStarts, duration, redraw]);

  const seek = useCallback((t: number) => {
    const au = audioRef.current;
    if (!au) return;
    au.currentTime = Math.max(0, Math.min(duration - 0.05, t));
    if (au.paused) void au.play().catch(() => {});
    tick();
  }, [duration, tick]);

  const toggle = useCallback(() => {
    const au = audioRef.current;
    if (!au) return;
    if (au.paused) void au.play().catch(() => {});
    else au.pause();
  }, []);

  const setFollow = useCallback((v: boolean) => { follow.current = v; }, []);
  const setCorrected = useCallback((v: boolean) => {
    corrected.current = v;
    // The node under the playhead just changed identity; force a re-resolve.
    curEl.current?.classList.remove('now');
    curEl.current = null;
    curIndex.current = -1;
    tick();
  }, [tick]);

  useEffect(() => {
    const au = audioRef.current;
    if (!au) return;
    const onPlay = () => { document.body.classList.add('playing'); tick(); };
    const onPause = () => { document.body.classList.remove('playing'); cancelAnimationFrame(raf.current); };
    au.addEventListener('play', onPlay);
    au.addEventListener('pause', onPause);
    au.addEventListener('ended', onPause);
    au.addEventListener('seeked', tick);
    const onResize = () => redraw();
    window.addEventListener('resize', onResize);
    tick();
    return () => {
      au.removeEventListener('play', onPlay);
      au.removeEventListener('pause', onPause);
      au.removeEventListener('ended', onPause);
      au.removeEventListener('seeked', tick);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf.current);
      document.body.classList.remove('playing');
    };
  }, [tick, redraw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const au = audioRef.current;
      if (!au) return;
      if (e.code === 'Space' && !el.closest('button')) { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(au.currentTime + 5); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(au.currentTime - 5); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seek]);

  const value = useMemo<Ctx>(() => ({
    audioRef, canvasRef, registerWord, registerSpan, registerLine,
    registerTime, registerNowWord, registerBar,
    seek, toggle, setFollow, setCorrected, redraw, duration,
  }), [registerWord, registerSpan, registerLine, registerTime, registerNowWord,
       registerBar, seek, toggle, setFollow, setCorrected, redraw, duration]);

  return (
    <PlaybackCtx.Provider value={value}>
      <audio ref={audioRef} src={src} preload="metadata" />
      {children}
    </PlaybackCtx.Provider>
  );
}
