#!/usr/bin/env python3
"""
A song engine for Pandora Dee Desktop on an Apple Silicon Mac, using MLX Audio's music models
(MiniMax Music 3 and others under mlx_audio.music).

MLX Audio's own server does speech, not songs. This small server answers the way mlx-serve's music endpoint
does, so the desktop's "mlx-serve" song engine works with it unchanged:

    POST /v1/audio/music-generations   {"model", "prompt", "lyrics", "duration_seconds", "seed", "steps"}  -> WAV
    GET  /v1/models                    the music models found in the Hugging Face cache

Run it in the same Python that has mlx-audio installed:

    python mlx-music-bridge.py                       # all addresses, port 11235
    python mlx-music-bridge.py --model mlx-community/MiniMax-Music3-mxfp8 --port 11235 --key SECRET

Then in the desktop: Music -> Make a song -> engines -> mlx-serve, address http://<the Mac>:11235.
Only the standard library is used besides mlx-audio (and numpy, which comes with it). One song at a time; the
model stays loaded between songs. Listening on all addresses lets your other devices reach it (use it on your
own network or Tailscale; --key makes requests carry "Authorization: Bearer SECRET").
"""

import argparse
import io
import json
import os
import re
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MUSIC = re.compile(r"music|ace-?step|yue|song", re.I)

args = None
lock = threading.Lock()
loaded = {"name": None, "model": None}


def cached_models():
    """Music models already downloaded to the Hugging Face cache (models--owner--name folders)."""
    hub = Path(os.environ.get("HF_HUB_CACHE") or Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub")
    names = []
    if hub.is_dir():
        for d in hub.iterdir():
            if d.name.startswith("models--"):
                name = d.name[len("models--"):].replace("--", "/")
                if MUSIC.search(name):
                    names.append(name)
    if args.model and args.model not in names:
        names.insert(0, args.model)
    return sorted(set(names), key=lambda n: (n != args.model, n.lower()))


def model_for(name):
    from mlx_audio.music import load  # imported here so --help works without mlx-audio

    name = name or args.model
    if not name:
        raise ValueError("No music model given: pass --model when starting the bridge, or put its name in the desktop's engine.")
    if loaded["name"] != name:
        loaded["model"] = None  # let the old one go before loading the next
        print(f"Loading {name} ...", flush=True)
        t = time.time()
        loaded["model"] = load(name)
        loaded["name"] = name
        print(f"Loaded {name} in {time.time() - t:.0f} s", flush=True)
    return loaded["model"]


def to_wav(audio, rate):
    """A float array (channels x samples or samples x channels, or mono) as 16-bit PCM WAV bytes."""
    import numpy as np

    a = np.array(audio, dtype=np.float32)
    if a.ndim == 1:
        a = a[:, None]
    elif a.ndim == 2 and a.shape[0] in (1, 2) and a.shape[1] > a.shape[0]:
        a = a.T  # channels first -> samples first
    elif a.ndim > 2:
        a = a.reshape(-1, a.shape[-1]) if a.shape[-1] in (1, 2) else a.reshape(a.shape[-2], -1).T
    a = np.clip(a, -1.0, 1.0)
    pcm = (a * 32767.0).astype("<i2")
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(pcm.shape[1])
        w.setsampwidth(2)
        w.setframerate(int(rate))
        w.writeframes(pcm.tobytes())
    return out.getvalue()


def make_song(req):
    style = str(req.get("prompt") or req.get("caption") or "").strip()
    lyrics = str(req.get("lyrics") or "").strip()
    # MiniMax Music 3 always wants lyrics: an instrumental is written as [instrumental]
    if not lyrics or lyrics.lower() == "[instrumental]":
        lyrics = "[instrumental]"
    seconds = max(5, min(360, int(float(req.get("duration_seconds") or req.get("duration") or 60))))
    seed = req.get("seed")
    steps = int(req.get("steps") or args.steps)
    model = model_for(str(req.get("model") or ""))
    kwargs = dict(text=style, lyrics=lyrics, duration=seconds, steps=steps)
    if seed is not None and int(seed) >= 0:
        kwargs["seed"] = int(seed)
    t = time.time()
    result = next(model.generate(**kwargs))
    print(f"Made a {seconds} s song in {time.time() - t:.0f} s: {style[:60]!r}", flush=True)
    return to_wav(result.audio, getattr(result, "sample_rate", 44100))


class Handler(BaseHTTPRequestHandler):
    server_version = "PandoraMusicBridge/1"

    def _allowed(self):
        if not args.key:
            return True
        if self.headers.get("Authorization", "") == f"Bearer {args.key}":
            return True
        self._json(401, {"error": "This bridge needs its key (Authorization: Bearer ...)."})
        return False

    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._allowed():
            return
        path = self.path.split("?")[0]
        if path in ("/v1/models", "/models"):
            now = int(time.time())
            return self._json(200, {"object": "list", "data": [{"id": n, "object": "model", "created": now, "owned_by": n.split("/")[0], "capabilities": ["music"]} for n in cached_models()]})
        if path in ("/", "/health"):
            return self._json(200, {"ok": True, "service": "Pandora Dee music bridge (MLX Audio)", "loaded": loaded["name"]})
        self._json(404, {"error": "Not found."})

    def do_POST(self):
        if not self._allowed():
            return
        if self.path.split("?")[0] != "/v1/audio/music-generations":
            return self._json(404, {"error": "Not found."})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(min(n, 1_000_000)) or b"{}")
        except Exception:
            return self._json(400, {"error": "The request wasn't JSON."})
        if not lock.acquire(timeout=1800):
            return self._json(503, {"error": "Still busy with another song."})
        try:
            wav = make_song(req)
        except Exception as e:  # say what went wrong instead of dropping the connection
            print(f"Couldn't make the song: {e}", flush=True)
            return self._json(500, {"error": f"{type(e).__name__}: {e}"})
        finally:
            lock.release()
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.end_headers()
        self.wfile.write(wav)

    def log_message(self, fmt, *a):
        print(f"{self.address_string()} {fmt % a}", flush=True)


def main():
    global args
    p = argparse.ArgumentParser(description="A song engine for Pandora Dee Desktop, using MLX Audio's music models.")
    p.add_argument("--host", default="0.0.0.0", help="address to listen on (default: all, so your other devices can reach it)")
    p.add_argument("--port", type=int, default=11235)
    p.add_argument("--model", default="", help="music model to use when a request names none, e.g. mlx-community/MiniMax-Music3-mxfp8")
    p.add_argument("--steps", type=int, default=30, help="diffusion steps (default 30)")
    p.add_argument("--key", default="", help="require Authorization: Bearer KEY on every request")
    p.add_argument("--preload", action="store_true", help="load the --model now instead of on the first song")
    args = p.parse_args()
    if args.preload and args.model:
        model_for(args.model)
    found = cached_models()
    print(f"Music bridge on http://{args.host}:{args.port}  (models: {', '.join(found) or 'none found yet; pass --model'})", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
