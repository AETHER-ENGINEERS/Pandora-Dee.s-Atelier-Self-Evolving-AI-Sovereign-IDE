#!/bin/bash
# Pandora Dee Desktop on a Mac (or Linux): double-click in Finder, or run ./"Start Pandora Dee.command"
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed. Install it from https://nodejs.org (or: brew install node) and run this again."
  read -r -p "Press Return to close." _
  exit 1
fi
# node_modules copied from another kind of computer (e.g. scp'd from Windows) has the wrong build tools: start fresh
plat="$(uname | tr '[:upper:]' '[:lower:]')"
if [ -d node_modules/@esbuild ] && ! ls node_modules/@esbuild | grep -q "^$plat-"; then
  echo "node_modules came from another kind of computer; reinstalling for this one."
  rm -rf node_modules
fi
if [ ! -d node_modules ]; then
  echo "First run: installing. This takes a minute."
  npm install || { read -r -p "Press Return to close." _; exit 1; }
fi
( sleep 4; if command -v open >/dev/null 2>&1; then open http://localhost:15693; else xdg-open http://localhost:15693 >/dev/null 2>&1; fi ) &
npm run dev
