export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface Pause {
  at: number;
  seconds: number;
  beforeIndex: number;
  before: string;
}

export interface Stall extends Pause {
  phrase: string;
}

export interface DeadAir {
  seconds: number;
  percent: number;
}

export type CountUnit = 'words' | 'chars';

/**
 * Two different questions about speed, and they have different answers.
 * `overall` divides by the whole clip, so thinking time drags it down —
 * it measures output per minute of recording. `articulation` divides by
 * time actually spent speaking, which is how fast the words come out once
 * they have been found. The gap between them IS the hesitation, measured
 * rather than guessed at.
 */
export interface Pace {
  overall: number;
  articulation: number;
  speechSeconds: number;
}

export interface LanguageProfile {
  code: string;
  name: string;
  band: [number, number] | null;
  unit: CountUnit;
  unitLabel: string;
  framework: string;
  rtl: boolean;
  benchmarked: boolean;
  /** The band is an informed estimate, not a measured constant. Say so. */
  estimated: boolean;
}

/** Below this much speech, a level estimate is not worth printing. */
export const MIN_WORDS_FOR_LEVEL = 150;

export interface Stats {
  duration: number;
  rate: number;
  unitLabel: string;
  band: [number, number] | null;
  pauseCount: number;
  deadAirSeconds: number;
  deadAirPercent: number;
  stallPhrases: string[];
}

export type Phase = 'setup' | 'working' | 'report';
export type StepId = 'extract' | 'upload' | 'measure' | 'analyse';
export type StepState = 'idle' | 'run' | 'done' | 'fail';
