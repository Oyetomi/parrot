'use client';

import { useCallback, useRef, useState } from 'react';
import { usePlayback } from './Playback';
import { fmtTime } from '@/lib/metrics';

const RATES = [0.75, 1, 1.25];

export function Player({ duration, deadAirSeconds }: { duration: number; deadAirSeconds: number }) {
  const { canvasRef, audioRef, registerTime, registerNowWord, toggle, redraw } = usePlayback();
  const [rate, setRate] = useState(1);
  const scrubbing = useRef(false);

  const seekFromX = useCallback((clientX: number) => {
    const c = canvasRef.current;
    const au = audioRef.current;
    if (!c || !au) return;
    const r = c.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    au.currentTime = p * duration;
    if (au.paused) void au.play().catch(() => {});
    redraw();
  }, [canvasRef, audioRef, duration, redraw]);

  return (
    <div className="player">
      <div className="ptop">
        <button className="playbtn" type="button" onClick={toggle} aria-label="Play or pause">
          <PlayIcons />
        </button>
        <div className="wavebox">
          <canvas
            id="wave"
            ref={(el) => { canvasRef.current = el; if (el) redraw(); }}
            aria-label="Waveform. Click to jump to a point."
            onPointerDown={(e) => { scrubbing.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekFromX(e.clientX); }}
            onPointerMove={(e) => { if (scrubbing.current) seekFromX(e.clientX); }}
            onPointerUp={() => { scrubbing.current = false; }}
            onPointerCancel={() => { scrubbing.current = false; }}
          />
        </div>
      </div>

      <div className="pbot">
        <div className="timecode">
          <b ref={registerTime}>0:00</b> / {fmtTime(duration)} &nbsp;·&nbsp;{' '}
          <span ref={registerNowWord}>press play</span>
        </div>
        <div className="rates">
          <span className="lab">Speed</span>
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              className="rate"
              aria-pressed={rate === r}
              onClick={() => { setRate(r); if (audioRef.current) audioRef.current.playbackRate = r; }}
            >
              {r}×
            </button>
          ))}
        </div>
      </div>

      <div className="wavekey">
        <span><i style={{ background: 'var(--wave-on)' }} />Speech</span>
        <span><i style={{ background: 'var(--wave-pause)' }} />Pauses over 0.6s — {deadAirSeconds}s of the clip</span>
      </div>
    </div>
  );
}

export function PlayIcons() {
  return (
    <>
      <svg className="ic-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      <svg className="ic-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
    </>
  );
}

export function MiniPlayer({ visible }: { visible: boolean }) {
  const { toggle, registerBar, audioRef, duration } = usePlayback();
  return (
    <div className={`mini${visible ? ' show' : ''}`}>
      <button className="playbtn" type="button" onClick={toggle} aria-label="Play or pause">
        <PlayIcons />
      </button>
      <div
        className="miniprog"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (audioRef.current) audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration;
        }}
      >
        <i ref={registerBar} />
      </div>
    </div>
  );
}
