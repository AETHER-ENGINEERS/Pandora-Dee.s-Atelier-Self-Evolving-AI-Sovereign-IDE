// When a new song starts (and "comment on new songs" is on), the character in focus listens for a few
// seconds and may say something about it. Off by default: it uses the AI for every song.

import { desk } from "./store.ts";
import { current, listen, nowPlayingText, onStart } from "./music.ts";
import { remark } from "./agent.ts";

let timer = 0;

onStart((it) => {
  window.clearTimeout(timer);
  if (!desk().music.comment) return;
  timer = window.setTimeout(async () => {
    if (current() !== it) return;
    const heard = await listen(8);
    if (current() !== it) return;
    const sound = heard
      ? ` Listening for a few seconds, it sounds ${heard.loudness} and ${heard.brightness}${heard.tempo ? `, around ${heard.tempo} beats a minute` : ""}.`
      : "";
    await remark(
      `[Desk] ${it.kind === "radio" ? "The radio just came on." : "A new song just started on the music player."} ${nowPlayingText()}${sound} If you like, say something short about it in your own voice, the way a friend in the room would (don't read the details back). Answer NO_REPLY to let it play.`,
    );
  }, 5000);
});
