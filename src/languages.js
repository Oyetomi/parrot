// Per-language speaking-rate baselines and level frameworks.
//
// Speech rate is NOT comparable across languages: a Spanish speaker packs far
// more syllables per second than an English one, and "words per minute" is
// close to meaningless for languages Whisper tokenises by character. Comparing
// every learner to one universal number would silently mis-grade most of them.
//
// So: each language carries its own band and its own counting unit, and any
// language missing from this table shows no baseline at all rather than a
// number invented for it.
//
// These bands are rough ranges for unhurried conversational speech, good
// enough to tell "halting" from "fluent". They are not measured constants.

const CJK = { unit: 'chars', unitLabel: 'characters per minute' };
const WORDS = { unit: 'words', unitLabel: 'words per minute' };

export const LANGUAGES = {
  en: { name: 'English',    band: [140, 180], ...WORDS, framework: 'CEFR' },
  fr: { name: 'French',     band: [150, 180], ...WORDS, framework: 'CEFR' },
  es: { name: 'Spanish',    band: [160, 200], ...WORDS, framework: 'CEFR' },
  it: { name: 'Italian',    band: [150, 190], ...WORDS, framework: 'CEFR' },
  pt: { name: 'Portuguese', band: [150, 190], ...WORDS, framework: 'CEFR' },
  de: { name: 'German',     band: [130, 165], ...WORDS, framework: 'CEFR' },
  nl: { name: 'Dutch',      band: [135, 170], ...WORDS, framework: 'CEFR' },
  sv: { name: 'Swedish',    band: [135, 170], ...WORDS, framework: 'CEFR' },
  pl: { name: 'Polish',     band: [130, 165], ...WORDS, framework: 'CEFR' },
  ru: { name: 'Russian',    band: [120, 155], ...WORDS, framework: 'CEFR' },
  uk: { name: 'Ukrainian',  band: [120, 155], ...WORDS, framework: 'CEFR' },
  tr: { name: 'Turkish',    band: [110, 145], ...WORDS, framework: 'CEFR' },
  ar: { name: 'Arabic',     band: [120, 155], ...WORDS, framework: 'ACTFL', rtl: true },
  he: { name: 'Hebrew',     band: [120, 155], ...WORDS, framework: 'ACTFL', rtl: true },
  fa: { name: 'Persian',    band: [120, 155], ...WORDS, framework: 'ACTFL', rtl: true },
  hi: { name: 'Hindi',      band: [120, 160], ...WORDS, framework: 'ACTFL' },
  id: { name: 'Indonesian', band: [130, 170], ...WORDS, framework: 'ACTFL' },
  vi: { name: 'Vietnamese', band: [140, 180], ...WORDS, framework: 'ACTFL' },
  ko: { name: 'Korean',     band: [110, 150], ...WORDS, framework: 'TOPIK' },
  ja: { name: 'Japanese',   band: [300, 400], ...CJK,   framework: 'JLPT' },
  zh: { name: 'Chinese',    band: [200, 280], ...CJK,   framework: 'HSK' },
  th: { name: 'Thai',       band: [200, 280], ...CJK,   framework: 'CEFR' },
};

/** Everything the report needs to talk about a language, baseline or not. */
export function profile(code) {
  const key = (code || '').slice(0, 2).toLowerCase();
  const hit = LANGUAGES[key];
  if (hit) return { code: key, benchmarked: true, rtl: false, ...hit };
  return {
    code: key || 'und',
    name: displayName(key) || 'this language',
    band: null,
    unit: 'words',
    unitLabel: 'words per minute',
    framework: 'CEFR',
    rtl: false,
    benchmarked: false,
  };
}

function displayName(code) {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
  } catch {
    return null;
  }
}

/** Options for the language override dropdown. */
export function options() {
  return Object.entries(LANGUAGES)
    .map(([code, l]) => ({ code, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
