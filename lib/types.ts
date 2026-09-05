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

export interface LanguageProfile {
  code: string;
  name: string;
  band: [number, number] | null;
  unit: CountUnit;
  unitLabel: string;
  framework: string;
  rtl: boolean;
  benchmarked: boolean;
}

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
