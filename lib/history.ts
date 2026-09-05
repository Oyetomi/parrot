// Past recordings, kept in this browser.
//
// This is the part of Parrot that can be trusted as a measurement. An absolute
// level from ninety seconds of speech is a guess; the same speaker's dead air
// falling from 17% to 9% across six recordings is a fact, computed the same way
// every time, with the speaker as their own control.
//
// Only derived numbers are stored — never audio, never the transcript.

import type { CountUnit } from './types';

const KEY = 'parrot.history';
const CAP = 60;

export interface Session {
  id: string;
  at: number;
  filename: string;
  language: string;
  languageName: string;
  words: number;
  duration: number;
  overallRate: number;
  articulationRate: number;
  unit: CountUnit;
  deadAirPercent: number;
  errorCount: number;
  confirmedErrors: number;
  /** The comparable figure: error density, independent of recording length. */
  errorsPer100: number;
  level: string;
  framework: string;
  levelReliable: boolean;
}

export function all(): Session[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch {
    return [];
  }
}

export function add(s: Session): Session[] {
  const next = [...all(), s].slice(-CAP);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function clear(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Earlier sessions in the same language — the only fair comparison. */
export function priorIn(language: string, before: number): Session[] {
  return all()
    .filter((s) => s.language === language && s.at < before)
    .sort((a, b) => a.at - b.at);
}

export interface Trend {
  metric: 'errorsPer100' | 'deadAirPercent' | 'articulationRate';
  label: string;
  first: number;
  latest: number;
  delta: number;
  /** Is a fall in this number an improvement? */
  lowerIsBetter: boolean;
  unit: string;
}

/**
 * Change between the earliest and newest session. Deliberately not a trend
 * line through every point: with a handful of recordings a fitted slope
 * implies far more precision than the data carries.
 */
export function trends(sessions: Session[]): Trend[] {
  if (sessions.length < 2) return [];
  const first = sessions[0];
  const latest = sessions[sessions.length - 1];

  const build = (
    metric: Trend['metric'], label: string, lowerIsBetter: boolean, unit: string,
  ): Trend => ({
    metric, label, lowerIsBetter, unit,
    first: first[metric],
    latest: latest[metric],
    delta: +(latest[metric] - first[metric]).toFixed(1),
  });

  return [
    build('errorsPer100', 'Mistakes per 100 words', true, ''),
    build('deadAirPercent', 'Dead air', true, '%'),
    build('articulationRate', 'Articulation rate', false, ''),
  ];
}
