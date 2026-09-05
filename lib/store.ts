// Keys live in this browser only. No server holds them, because there is no
// server. Every read is guarded: private windows and blocked site data make
// localStorage throw rather than return null.
//
// Keys are stored per provider, so switching between them to compare results
// does not mean pasting a key back in each time.

const KEY_PREFIX = 'parrot.key.';
const PROVIDER = 'parrot.provider';
const MODEL_PREFIX = 'parrot.model.';

function read(k: string): string {
  try { return localStorage.getItem(k) ?? ''; } catch { return ''; }
}
function write(k: string, v: string): void {
  try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ }
}

export function getKey(provider: string): string { return read(KEY_PREFIX + provider); }
export function setKey(provider: string, v: string): void { write(KEY_PREFIX + provider, v); }

export function getProvider(fallback: string): string { return read(PROVIDER) || fallback; }
export function setProvider(v: string): void { write(PROVIDER, v); }

export function getModel(provider: string, fallback: string): string {
  return read(MODEL_PREFIX + provider) || fallback;
}
export function setModel(provider: string, v: string): void { write(MODEL_PREFIX + provider, v); }
