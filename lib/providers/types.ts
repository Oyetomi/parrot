import type { Analysis } from '../schema';

export interface AnalysisRequest {
  system: string;
  user: string;
  apiKey: string;
  model: string;
}

export interface ModelChoice {
  id: string;
  label: string;
}

export interface Provider {
  id: string;
  name: string;
  /** Where a person actually goes to get a key. */
  keyUrl: string;
  keyHint: string;
  /** Stated plainly in the UI when it is true. */
  trainsOnYourData: boolean;
  freeTierNote: string;
  /**
   * Models are discovered from the provider at runtime rather than hardcoded.
   * Model names churn faster than any release cycle, and a stale identifier is
   * an error the user cannot diagnose or fix. These are only the fallback if
   * discovery fails.
   */
  fallbackModels: ModelChoice[];
  listModels(apiKey: string): Promise<ModelChoice[]>;
  analyze(req: AnalysisRequest): Promise<Analysis>;
}
