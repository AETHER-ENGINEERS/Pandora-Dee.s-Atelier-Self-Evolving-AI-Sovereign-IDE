#!/bin/bash
# Sets up (or updates) Pandora Dee Desktop's Mac engines in one go, with nothing to type but one line:
#
#   curl -sL <the desktop's address>/mac | bash            songs (the music bridge) and MLX Audio's server
#   curl -sL <the desktop's address>/mac | bash -s voices  the same, plus what Kokoro's voices need (misaki)
#
# The desktop fills in its own address below when it hands this out. It downloads the bridge and the autostart
# script from the desktop into ~/pandora-bridge, finds the Python that has MLX Audio, picks the music model
# you've downloaded, and starts both through launchd (mac-autostart.sh).
set -e
BASE="__DESKTOP__"
DIR="$HOME/pandora-bridge"
mkdir -p "$DIR"
cd "$DIR"

echo "Getting the bridge and the autostart script from the desktop ($BASE)…"
curl -fsSL "$BASE/mac/mlx-music-bridge.py" -o mlx-music-bridge.py
curl -fsSL "$BASE/mac/mac-autostart.sh" -o mac-autostart.sh

# the Python that has MLX Audio: the active environment first, then the usual places
PY=""
for c in "${VIRTUAL_ENV:+$VIRTUAL_ENV/bin/python}" "$HOME/mlx-server/.mlx-env/bin/python" "$HOME/.mlx-env/bin/python" "$HOME"/*/.*env*/bin/python "$HOME"/*/*env*/bin/python "$HOME"/.*env*/bin/python "$(command -v python3 2>/dev/null)"; do
  [ -n "$c" ] && [ -x "$c" ] || continue
  if "$c" -c "import mlx_audio" 2>/dev/null; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "Couldn't find a Python with MLX Audio installed. If it lives somewhere unusual, enter that environment (source …/bin/activate) and run this line again."
  exit 1
fi
echo "Using MLX Audio's Python: $PY"

if [ "${1:-}" = "voices" ]; then
  echo "Installing what Kokoro's voices need (misaki, English)…"
  "$PY" -m pip install --quiet "misaki[en]" || echo "(misaki didn't install; voices may not work yet, songs are unaffected)"
fi

# the music model: one you've downloaded (MiniMax Music 3 mxfp8 if it's there)
MODELS=$(ls "${HF_HOME:-$HOME/.cache/huggingface}/hub" 2>/dev/null | sed -n 's/^models--//p' | sed 's/--/\//' | grep -iE "music|ace-?step|yue" || true)
MODEL=$(printf '%s\n' "$MODELS" | grep -i "mxfp8" | head -1)
[ -z "$MODEL" ] && MODEL=$(printf '%s\n' "$MODELS" | head -1)
[ -n "$MODEL" ] && echo "Music model: $MODEL"

PDD_PYTHON="$PY" bash mac-autostart.sh ${MODEL:+--music-model "$MODEL"}
echo
echo "Done. Check on them any time:  bash ~/pandora-bridge/mac-autostart.sh --status"
