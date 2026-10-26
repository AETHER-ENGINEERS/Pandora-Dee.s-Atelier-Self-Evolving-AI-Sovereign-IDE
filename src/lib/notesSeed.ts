// Starter notes for an empty vault: what notes can do, and a few to play with.

export const STARTER: Record<string, string> = {
  "Welcome.md": `# Welcome to your notes

Every note is a markdown file in the desktop's data folder (vault). The characters can read, write,
search and link them with you, when you're the one asking.

## Start here
- [[Markdown Reference]]: everything the editor shows
- [[Linking Notes]]: how links and backlinks work
- [[Todo List]]: tick a box in Read view
- [[Inbox]]: quick thoughts, to sort later

## Ask the characters
- "Read my Inbox and turn each idea into its own linked note"
- "Which notes link to [[Linking Notes]]?"
- "Make an index note that links every note by tag"

#start
`,
  "Inbox.md": `# Inbox

Quick capture. Ask a character to sort these into notes.

- Look into spaced repetition for the notes tagged #learning
- A weekly review note every Sunday
- [[Project Ideas]] needs a plan
`,
  "Todo List.md": `# Todo List

- [x] Open Notes
- [ ] Write a note with a [[link]] in it
- [ ] Click a missing (dashed) link to create that note
- [ ] Open the graph
- [ ] Ask a character to summarise your notes

#tasks
`,
  "guides/Markdown Reference.md": `# Markdown Reference

## Text
**Bold**, *italic*, ~~strike~~, \`inline code\` and [links to the web](https://ollama.com).

## Lists
- Bullet
  - Nested bullet
1. Numbered
2. Items

## Tasks
- [ ] Open task
- [x] Done task

## Quote
> Notes are thinking you can come back to.

## Code
\`\`\`js
const note = "[[Welcome]]"; // links inside code don't count
\`\`\`

## Math
Inline $e^{i\\pi} + 1 = 0$, or on its own line:

$$\\int_0^1 x^2\\,dx = \\tfrac13$$

## Table
| Write | You get |
| --- | --- |
| \`[[Note]]\` | a link to a note |
| \`[[Note\\|label]]\` | a link with your own words |
| \`[[Note#Heading]]\` | a link to a heading |
| \`![[Note]]\` | the note shown inside this one |
| \`![[picture.png\\|300]]\` | a picture, 300 pixels wide |
| \`#tag\` | a tag: click it to see every note with it |

---
Back to [[Welcome]] · #guide
`,
  "guides/Linking Notes.md": `# Linking Notes

Type \`[[\` in the editor and pick a note from the list. Links go by the note's name, so you can move
notes between folders without breaking them, and renaming a note updates the links to it.

- A solid link points at a note that exists.
- A dashed link points at a note that doesn't exist yet: click it to create it.
- The panel on the right shows what this note links to, what links here, and links still to write.

Tags work the same way: \`#project/alpha\` sits inside \`#project\`.

Back to [[Welcome]] · #guide
`,
  "Templates/Daily note.md": `# <% tp.date.now("dddd D MMMM YYYY") %>

## Plans
- [ ] <% tp.file.cursor() %>

## Notes

## Thanks
`,
};
