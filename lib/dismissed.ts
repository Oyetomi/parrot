// Findings the speaker has rejected.
//
// The speaker is the only party here who knows what they meant, and on their
// own dialect and register they outrank the model every time. So a dismissal
// is not feedback to be weighed — it is ground truth, and it wins.
//
// Dismissals are keyed by the claim rather than by the recording, so the same
// false positive stays dismissed on every future recording. A model that keeps
// insisting a natural phrase is wrong gets told once.
//
// This works in all 99 languages Whisper handles, which no grammar library
// or dictionary does.

const KEY = 'parrot.dismissed';
const CAP = 500;

export interface Dismissal {
  language: string;
  said: string;
  correction: string;
  category: string;
  at: number;
}

function norm(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[.,!?;:«»"“”…]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identity of a claim, independent of which recording it came from. */
export function claimKey(language: string, said: string, correction: string): string {
  return `${language}::${norm(said)}::${norm(correction)}`;
}

export function all(): Dismissal[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Dismissal[]) : [];
  } catch {
    return [];
  }
}

export function keys(): Set<string> {
  return new Set(all().map((d) => claimKey(d.language, d.said, d.correction)));
}

export function add(d: Dismissal): void {
  const key = claimKey(d.language, d.said, d.correction);
  const next = [...all().filter((x) => claimKey(x.language, x.said, x.correction) !== key), d]
    .slice(-CAP);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

export function remove(language: string, said: string, correction: string): void {
  const key = claimKey(language, said, correction);
  const next = all().filter((x) => claimKey(x.language, x.said, x.correction) !== key);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

export function countFor(language: string): number {
  return all().filter((d) => d.language === language).length;
}
