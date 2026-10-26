// Small shared registry for things that live in components but agents need to reach.

let readScreen: (() => Promise<string>) | null = null;

export const gameScreen = {
  register(fn: (() => Promise<string>) | null) {
    readScreen = fn;
  },
  async read(): Promise<string> {
    try {
      return readScreen ? await readScreen() : "";
    } catch {
      return "";
    }
  },
};
