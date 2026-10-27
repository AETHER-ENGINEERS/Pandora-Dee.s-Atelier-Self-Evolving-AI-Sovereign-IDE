// Reading a song a character wrote: "TITLE: …", "STYLE: …", then "LYRICS:" and the words.

export function parseSong(raw: string, instrumental = false): { title: string; style: string; lyrics: string } | null {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\*\*(TITLE|STYLE|LYRICS)\s*(:?)\s*\*\*/gi, "$1$2").trim();
  const title = /^\s*#*\s*TITLE\s*:\s*(.+)$/im.exec(text)?.[1]?.trim().replace(/^["*“]+|["*”]+$/g, "") ?? "";
  const style = /^\s*#*\s*STYLE\s*:\s*(.+)$/im.exec(text)?.[1]?.trim().replace(/^["*]+|["*]+$/g, "") ?? "";
  const lyrics = /^\s*#*\s*LYRICS\s*:\s*\n?([\s\S]+)$/im.exec(text)?.[1]?.trim().replace(/^```\w*\n?|\n?```$/g, "").trim() ?? "";
  if (!style) return null;
  return { title: title || "Untitled", style, lyrics: instrumental ? "" : lyrics };
}
