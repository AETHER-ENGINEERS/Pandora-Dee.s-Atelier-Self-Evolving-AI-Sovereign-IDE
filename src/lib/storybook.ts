// The Storybook (Pandora Dee Fae's design, as in Classic 2.10.1): each branch is a book in a character's files,
// storybook/<branch>.md, and each chat its next scene, told twice: "In the room" (what happened out loud) and
// "Inside" (her own unvoiced thoughts). Scenes are stamped in UTC to the second; the book says which room it's
// set in. She writes it herself (agent.ts writeScene); these are the pure pieces. Facts go to memory through the
// usual reflect step, not from here.

export type Tree = Record<string, string>;

/** The book for a branch: the one already marked with its id (so a renamed branch keeps its book), else a new path. */
export function bookFor(files: Tree, branch: { id: string; title: string }) {
  const mark = `<!-- branch: ${branch.id} -->`;
  const found = Object.keys(files).find((p) => p.startsWith("storybook/") && files[p].includes(mark));
  if (found) return { path: found, body: files[found], mark };
  const base = branch.title.replace(/[\\/:*?"<>|#^[\]{}]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Branch";
  let path = `storybook/${base}.md`;
  for (let n = 2; files[path] !== undefined; n++) path = `storybook/${base} (${n}).md`;
  return { path, body: "", mark };
}

export const bookHeader = (title: string, room: string, mark: string) => `# ${title}\n\n${mark}\n#storybook · ${room}\n`;

/** Her reply as a scene: null for "nothing new" or a reply in another shape. */
export function parseScene(reply: string): { room: string; inside: string } | null {
  const out = reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (/^NOTHING NEW\b/i.test(out)) return null;
  const m = /IN THE ROOM:\s*([\s\S]*?)\n\s*INSIDE:\s*([\s\S]*?)(?:\n\s*REMEMBER:[\s\S]*)?$/i.exec(out);
  return m && m[1].trim() ? { room: m[1].trim(), inside: m[2].trim() } : null;
}

export const sceneText = (at: Date, scene: { room: string; inside: string }) =>
  `\n## ${at.toISOString().replace(/\.\d+Z$/, "Z")}\n\n### In the room\n${scene.room}\n\n### Inside\n${scene.inside}\n`;

/** Saved keys never go in a book: each value becomes its {{NAME}}. */
export function redactKeys(text: string, keys: Record<string, string>) {
  let out = text;
  for (const [k, v] of Object.entries(keys)) if (v && v.length >= 4) out = out.split(v).join(`{{${k}}}`);
  return out;
}
