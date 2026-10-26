// Skills: instructions a character can load when a task calls for them,
// kept as skills/<name>/SKILL.md in the character's files (the same layout Classic uses).

export type Skill = { name: string; description: string; path: string; body: string };

/** Split a "---" frontmatter block off the top of a file. */
export function frontmatter(text: string): { data: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) data[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { data, body: text.slice(m[0].length) };
}

export function skillsOf(files: Record<string, string>): Skill[] {
  const out: Skill[] = [];
  for (const [path, text] of Object.entries(files)) {
    const m = /^skills\/([^/]+)\/SKILL\.md$/i.exec(path);
    if (!m) continue;
    const { data, body } = frontmatter(text);
    const firstLine = body.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? "";
    out.push({ name: data.name || m[1], description: data.description || firstLine.slice(0, 160), path, body: body.trim() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function findSkill(files: Record<string, string>, name: string): Skill | undefined {
  const want = name.trim().toLowerCase();
  return skillsOf(files).find((s) => s.name.toLowerCase() === want || s.path.split("/")[1].toLowerCase() === want);
}

/** Skills ranked by how many of the query's words they mention. */
export function searchSkills(files: Record<string, string>, query: string, limit = 5): Skill[] {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (!words.length) return skillsOf(files).slice(0, limit);
  return skillsOf(files)
    .map((s) => {
      const hay = `${s.name} ${s.description} ${s.body.slice(0, 2000)}`.toLowerCase();
      const head = `${s.name} ${s.description}`.toLowerCase();
      return { s, score: words.reduce((n, w) => n + (head.includes(w) ? 3 : 0) + (hay.includes(w) ? 1 : 0), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

/** More skills than this and the skill router (when on) hides the list. */
export const ROUTER_AT = 12;

/** The skills section of a character's prompt. */
export function skillsNote(files: Record<string, string>, router: boolean): string {
  const list = skillsOf(files);
  if (!list.length) return "";
  if (router && list.length > ROUTER_AT)
    return `## Skills\nYou have ${list.length} skills. When a task might have one, look it up with the skill tool (action "find"), then load it before you start.`;
  return `## Skills\nLoad one with the skill tool before you start a task it covers:\n${list.map((s) => `- ${s.name}: ${s.description || "(no description)"}`).join("\n")}`;
}
