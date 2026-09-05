// The API key lives in this browser only. No server holds it, because there
// is no server. Every read is guarded: private windows and blocked site data
// make localStorage throw rather than return null.

const KEY = 'parrot.groq.key';
const MODEL = 'parrot.model';

export function getKey(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}
export function setKey(v: string): void {
  try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function getModel(fallback: string): string {
  try { return localStorage.getItem(MODEL) ?? fallback; } catch { return fallback; }
}
export function setModel(v: string): void {
  try { localStorage.setItem(MODEL, v); } catch { /* ignore */ }
}
