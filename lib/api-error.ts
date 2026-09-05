export class ApiError extends Error {
  status: number;
  code: string;
  /** A provider's partial output when generation failed, where it gives one. */
  partial: string;
  constructor(message: string, status: number, code = '', partial = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.partial = partial;
  }
}

/** Shared wording, so every provider fails in the same voice. */
export function friendly(status: number, detail: string, provider: string): string {
  if (status === 401 || status === 403)
    return `That ${provider} API key was rejected. Check it in the API key dialog.`;
  if (status === 413) return 'That file is too large for the free tier.';
  if (status === 429)
    return `${provider} rate limit hit. Wait a moment and try again.`;
  return detail || `${provider} returned ${status}.`;
}
