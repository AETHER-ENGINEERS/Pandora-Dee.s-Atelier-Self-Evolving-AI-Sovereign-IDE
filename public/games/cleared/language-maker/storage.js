const KEY = 'language-maker-v1';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { words: [], letters: [], settings: { reverse: false, reverseSpeech: false } };
    const data = JSON.parse(raw);
    return {
      words: data.words ?? [],
      letters: data.letters ?? [],
      settings: data.settings ?? { reverse: false, reverseSpeech: false }
    };
  } catch {
    return { words: [], letters: [], settings: { reverse: false, reverseSpeech: false } };
  }
}

export function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}