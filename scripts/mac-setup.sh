#!/bin/bash
# Sets up (or updates) Pandora Dee Desktop's Mac engines in one go, with nothing to type but one line:
#
#   curl -sL <the desktop's address>/mac | bash             songs (the music bridge) and MLX Audio's server
#   curl -sL <the desktop's address>/mac | bash -s voices   the same, plus what Kokoro's voices need (misaki)
#   curl -sL <the desktop's address>/mac | bash -s report   changes nothing: sends how things stand to the desktop
#
# Everything it prints (and the engines' recent logs) is also sent back to the desktop, into its data folder's
# mac-reports, so problems can be read there instead of copied by hand.
#
# The desktop fills in its own address below when it hands this out. It downloads the bridge and the autostart
# script from the desktop into ~/pandora-bridge, finds the Python that has MLX Audio, picks the music model
# you've downloaded, and starts both through launchd (mac-autostart.sh).
BASE="__DESKTOP__"
MODE="${1:-}"
DIR="$HOME/pandora-bridge"
mkdir -p "$DIR"
cd "$DIR" || exit 1
LOG="$DIR/setup.log"
: > "$LOG"

send_report() {
  {
    echo
    echo "===== mac-autostart --status"
    [ -f "$DIR/mac-autostart.sh" ] && bash "$DIR/mac-autostart.sh" --status 2>&1
    for f in "$HOME/Library/Logs/pandora-mlx-audio.log" "$HOME/Library/Logs/pandora-music-bridge.log"; do
      [ -f "$f" ] && { echo; echo "===== last lines of $f"; tail -60 "$f"; }
    done
    echo
    echo "===== this Mac"
    sw_vers 2>/dev/null
    uname -m
    for p in "$PY" "$AUDIO_PY"; do
      [ -n "$p" ] && { echo "Python: $p ($("$p" --version 2>&1))"; "$p" -m pip list 2>/dev/null | grep -iE "mlx|misaki|spacy|numpy|uvicorn|fastapi|webrtc" ; }
    done
  } >> "$LOG" 2>&1
  if curl -fsS -m 30 -X POST --data-binary @"$LOG" "$BASE/mac/report?name=${MODE:-setup}" >/dev/null; then
    echo "(Everything above was sent to the desktop, so it can be read there.)"
  else
    echo "(Couldn't send this to the desktop; it's saved in $LOG.)"
  fi
}

main() {
  # Pythons that have MLX Audio: the active environment first, then the usual places. A Mac can have more than
  # one (one for the songs, another with MLX Audio's server parts), so each engine gets one that can run it.
  PY=""
  AUDIO_PY=""
  FIRST=""
  for c in "${VIRTUAL_ENV:+$VIRTUAL_ENV/bin/python}" "$HOME/mlx-server/.mlx-env/bin/python" "$HOME/.mlx-env/bin/python" "$HOME"/*/.*env*/bin/python "$HOME"/*/*env*/bin/python "$HOME"/.*env*/bin/python "$(command -v python3 2>/dev/null)"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    "$c" -c "import mlx_audio" 2>/dev/null || continue
    [ -z "$PY" ] && "$c" -c "import mlx_audio.music" 2>/dev/null && PY="$c"
    [ -z "$AUDIO_PY" ] && "$c" -c "import mlx_audio, uvicorn, fastapi" 2>/dev/null && AUDIO_PY="$c"
    [ -z "$FIRST" ] && FIRST="$c"
  done
  [ -z "$PY" ] && PY="$FIRST"

  if [ "$MODE" = "report" ]; then
    echo "Sending how things stand to the desktop…"
    return 0
  fi

  echo "Getting the bridge and the autostart script from the desktop ($BASE)…"
  curl -fsSL "$BASE/mac/mlx-music-bridge.py" -o mlx-music-bridge.py || { echo "Couldn't reach the desktop at $BASE."; return 1; }
  curl -fsSL "$BASE/mac/mac-autostart.sh" -o mac-autostart.sh || return 1

  if [ -z "$PY" ]; then
    echo "Couldn't find a Python with MLX Audio installed. If it lives somewhere unusual, enter that environment (source …/bin/activate) and run this line again."
    return 1
  fi
  echo "Songs use:  $PY ($("$PY" --version 2>&1))"
  if [ -z "$AUDIO_PY" ]; then
    # no environment has MLX Audio's server parts yet: add them where the songs run (ready-made packages only)
    echo "MLX Audio's server parts aren't installed anywhere; adding them to $PY…"
    if "$PY" -m pip install --only-binary=:all: uvicorn fastapi python-multipart webrtcvad-wheels && "$PY" -c "import uvicorn, fastapi" 2>/dev/null; then
      AUDIO_PY="$PY"
    else
      echo "Couldn't add them, so MLX Audio's server (voices) isn't started. Songs are unaffected."
    fi
  fi
  [ -n "$AUDIO_PY" ] && echo "Voices use: $AUDIO_PY ($("$AUDIO_PY" --version 2>&1))"

  if [ "$MODE" = "voices" ] && [ -n "$AUDIO_PY" ]; then
    echo "Installing what Kokoro's voices need (misaki, English) for $AUDIO_PY…"
    # ready-made packages only, so nothing needs compiling (Cython); if there are none for this Python, say so
    if "$AUDIO_PY" -m pip install --only-binary=:all: "misaki[en]"; then
      echo "misaki is installed."
    else
      echo "misaki couldn't be installed from ready-made packages for this Python. Songs are unaffected."
    fi
  fi
  # MLX Audio's server imports webrtcvad, which still needs pkg_resources: setuptools 81 and later dropped it
  # (installing other things can bring in a newer one), so keep a version that has it
  if [ -n "$AUDIO_PY" ] && ! "$AUDIO_PY" -c "import webrtcvad" 2>/dev/null; then
    echo "Repairing webrtcvad for MLX Audio's server (it needs setuptools before 81)…"
    "$AUDIO_PY" -m pip install --only-binary=:all: "setuptools<81" || true
    "$AUDIO_PY" -c "import webrtcvad" 2>/dev/null && echo "Repaired." || echo "webrtcvad still won't load; the report will show why."
  fi

  # the music model: one you've downloaded (MiniMax Music 3 mxfp8 if it's there)
  MODELS=$(ls "${HF_HOME:-$HOME/.cache/huggingface}/hub" 2>/dev/null | sed -n 's/^models--//p' | sed 's/--/\//' | grep -iE "music|ace-?step|yue" || true)
  MODEL=$(printf '%s\n' "$MODELS" | grep -i "mxfp8" | head -1)
  [ -z "$MODEL" ] && MODEL=$(printf '%s\n' "$MODELS" | head -1)
  [ -n "$MODEL" ] && echo "Music model: $MODEL"

  PDD_PYTHON="$PY" PDD_AUDIO_PYTHON="$AUDIO_PY" bash mac-autostart.sh ${MODEL:+--music-model "$MODEL"}
  echo
  echo "Done. Check on them any time:  bash ~/pandora-bridge/mac-autostart.sh --status"
}

# everything shown here also goes into the log that's sent to the desktop
main 2>&1 | tee -a "$LOG"
sleep 2
send_report
