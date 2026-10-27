#!/bin/bash
# Keep Pandora Dee Desktop's Mac engines running: MLX Audio's server (voices and listening, port 15666) and the
# music bridge (songs, port 11235). Uses launchd, the Mac's own service manager: they start when you log in,
# restart if they stop, and write logs to ~/Library/Logs/pandora-*.log. No terminal has to stay open.
#
# Run it once from inside the Python environment that has MLX Audio (so it uses that Python):
#   source ~/.mlx-env/bin/activate        (or however you enter it)
#   bash mac-autostart.sh --music-model mlx-community/MiniMax-Music3-mxfp8
#
#   bash mac-autostart.sh --stop          stops both and removes them from login
#   bash mac-autostart.sh --status        shows whether they're running and the last log lines
set -euo pipefail

AUDIO_PORT=15666
MUSIC_PORT=11235
MUSIC_MODEL=""
ACTION=start
USAGE="Options: --music-model NAME   --audio-port N   --music-port N   --status   --stop"
while [ $# -gt 0 ]; do
  # forgiving about copy-paste: a long dash (—, –) for "--", "--name=value", and "-- name" with a space
  arg="$1"
  case "$arg" in "—"*) arg="--${arg#—}" ;; "–"*) arg="--${arg#–}" ;; esac
  case "$arg" in
    --) shift; [ $# -gt 0 ] && set -- "--$1" "${@:2}"; continue ;;
    --*=*) val="${arg#*=}"; arg="${arg%%=*}"; shift; set -- "$arg" "$val" "$@"; continue ;;
  esac
  case "$arg" in
    --music-model) MUSIC_MODEL="${2:?--music-model needs the model name}"; shift 2 ;;
    --audio-port) AUDIO_PORT="${2:?--audio-port needs a number}"; shift 2 ;;
    --music-port) MUSIC_PORT="${2:?--music-port needs a number}"; shift 2 ;;
    --stop) ACTION=stop; shift ;;
    --status) ACTION=status; shift ;;
    */*) MUSIC_MODEL="$arg"; shift ;; # a bare model name like mlx-community/MiniMax-Music3-mxfp8
    *) echo "Unknown option: $1"; echo "$USAGE"; exit 1 ;;
  esac
done

AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs"
HERE="$(cd "$(dirname "$0")" && pwd)"
BRIDGE="$HERE/mlx-music-bridge.py"
ID=$(id -u)

# launchd has a "gui" domain (your login session at the Mac) and a "user" domain (background, which is what an SSH
# session like PuTTY can reach): stop, start and look in both
unload() {
  launchctl bootout "gui/$ID/$1" 2>/dev/null || true
  launchctl bootout "user/$ID/$1" 2>/dev/null || true
  rm -f "$AGENTS/$1.plist"
}
where() {
  if launchctl print "gui/$ID/$1" >/dev/null 2>&1; then echo "gui/$ID"
  elif launchctl print "user/$ID/$1" >/dev/null 2>&1; then echo "user/$ID"
  fi
}

if [ "$ACTION" = stop ]; then
  unload org.pandoradee.mlx-audio
  unload org.pandoradee.music-bridge
  echo "Stopped both, and they won't start at login any more."
  exit 0
fi

if [ "$ACTION" = status ]; then
  for name in mlx-audio music-bridge; do
    dom=$(where "org.pandoradee.$name")
    if [ -n "$dom" ]; then
      state=$(launchctl print "$dom/org.pandoradee.$name" | awk '/state =/{print $3; exit}')
      echo "$name: set up ($state, $dom)"
    else
      echo "$name: not set up"
    fi
    [ -f "$LOGS/pandora-$name.log" ] && tail -5 "$LOGS/pandora-$name.log" | sed 's/^/    /'
  done
  exit 0
fi

PY="$(command -v python3 || command -v python)"
if ! "$PY" -c "import mlx_audio" 2>/dev/null; then
  echo "This Python ($PY) doesn't have MLX Audio. Enter the environment that does (e.g. source ~/.mlx-env/bin/activate) and run this again."
  exit 1
fi
mkdir -p "$AGENTS" "$LOGS"

# write one LaunchAgent: label, then the program and its arguments
agent() {
  local label="$1"; shift
  local log="$LOGS/pandora-${label#org.pandoradee.}.log"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "  <key>Label</key><string>$label</string>"
    echo '  <key>ProgramArguments</key><array>'
    for a in "$@"; do printf '    <string>%s</string>\n' "$(printf '%s' "$a" | sed 's/&/\&amp;/g; s/</\&lt;/g')"; done
    echo '  </array>'
    echo '  <key>RunAtLoad</key><true/>'
    echo '  <key>KeepAlive</key><true/>'
    echo '  <key>ThrottleInterval</key><integer>15</integer>'
    echo "  <key>WorkingDirectory</key><string>$HOME</string>"
    echo "  <key>StandardOutPath</key><string>$log</string>"
    echo "  <key>StandardErrorPath</key><string>$log</string>"
    echo '  <key>EnvironmentVariables</key><dict>'
    echo "    <key>PATH</key><string>$(dirname "$PY"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>"
    echo '    <key>PYTHONUNBUFFERED</key><string>1</string>'
    echo '  </dict>'
    echo '</dict></plist>'
  } > "$AGENTS/$label.plist"
  if ! plutil -lint -s "$AGENTS/$label.plist"; then
    echo "The settings file for $label came out wrong; nothing was started. ($AGENTS/$label.plist)"
    exit 1
  fi
  launchctl bootout "gui/$ID/$label" 2>/dev/null || true
  launchctl bootout "user/$ID/$label" 2>/dev/null || true
  # your login session when this runs at the Mac; the background domain when it runs over SSH
  if launchctl bootstrap "gui/$ID" "$AGENTS/$label.plist" 2>/dev/null; then
    echo "Started $label (log: $log)"
  elif launchctl bootstrap "user/$ID" "$AGENTS/$label.plist"; then
    echo "Started $label in the background domain, since this is an SSH session (log: $log)"
  else
    echo "launchd wouldn't start $label. Running this script once in Terminal at the Mac itself usually works."
    exit 1
  fi
}

agent org.pandoradee.mlx-audio "$PY" -m mlx_audio.server --host 0.0.0.0 --port "$AUDIO_PORT"

if [ -f "$BRIDGE" ]; then
  if [ -n "$MUSIC_MODEL" ]; then
    agent org.pandoradee.music-bridge "$PY" "$BRIDGE" --port "$MUSIC_PORT" --model "$MUSIC_MODEL"
  else
    agent org.pandoradee.music-bridge "$PY" "$BRIDGE" --port "$MUSIC_PORT"
  fi
else
  echo "(mlx-music-bridge.py isn't next to this script, so the music bridge wasn't set up.)"
fi

sleep 4
echo
echo "MLX Audio:    http://$(ipconfig getifaddr en0 2>/dev/null || echo this-mac):$AUDIO_PORT   (voices, listening)"
echo "Music bridge: http://$(ipconfig getifaddr en0 2>/dev/null || echo this-mac):$MUSIC_PORT   (songs)"
echo "Check on them any time:  bash $0 --status"
