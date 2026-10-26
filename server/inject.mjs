// Scripts placed at the top of every app and game page served on the app origin.

/** Lets the desktop read what's on screen and keeps desktop shortcuts working while a game has focus. */
export function helperScript() {
  return `(${helper.toString()})();`;
}

function helper() {
  if (window.__pddHelper) return;
  window.__pddHelper = true;
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data || e.data.__pdd !== "screen") return;
    let text = "";
    try {
      text = (document.body && document.body.innerText) || "";
    } catch (err) {
      text = "";
    }
    window.parent.postMessage({ __pdd: "screen-reply", rid: e.data.rid, text: text.slice(0, 6000), title: document.title }, "*");
  });
  // Sound from games follows the desktop's app volume (audio and video elements, and Web Audio).
  let volume = 1;
  const apply = (el) => {
    try {
      el.volume = Math.min(1, (el.__pddBase ?? (el.__pddBase = el.volume)) * volume);
    } catch (err) {
      /* not a media element */
    }
  };
  const all = () => document.querySelectorAll("audio, video").forEach(apply);
  const NativeAudio = window.Audio;
  if (NativeAudio) {
    window.Audio = function (src) {
      const a = new NativeAudio(src);
      a.__pddBase = 1;
      a.volume = volume;
      return a;
    };
    window.Audio.prototype = NativeAudio.prototype;
  }
  const gains = [];
  const proto = window.BaseAudioContext ? window.BaseAudioContext.prototype : window.AudioContext && window.AudioContext.prototype;
  const realDest = proto && Object.getOwnPropertyDescriptor(proto, "destination");
  if (realDest && realDest.get) {
    // Everything a game plays through Web Audio passes one gain node per context.
    Object.defineProperty(proto, "destination", {
      configurable: true,
      get() {
        if (!this.__pddGain) {
          const real = realDest.get.call(this);
          const g = this.createGain();
          g.gain.value = volume;
          g.connect(real);
          g.__pddReal = real;
          this.__pddGain = g;
          gains.push(g);
        }
        return this.__pddGain;
      },
    });
  }
  new MutationObserver(all).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data || e.data.__pdd !== "volume") return;
    volume = Math.max(0, Math.min(1, Number(e.data.volume)));
    all();
    gains.forEach((g) => (g.gain.value = volume));
  });
  window.parent.postMessage({ __pdd: "volume-ready" }, "*");
  window.addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        window.parent.postMessage({ __pdd: "key", key: e.key, code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey }, "*");
      }
    },
    true,
  );
}

/** The webxdc API, storage kept per app, plus the helper. */
export function webxdcScript({ scope, addr, name, lan }) {
  const cfg = JSON.stringify({ scope, addr, name, lan: Boolean(lan) }).replace(/</g, "\\u003c");
  return `(${helper.toString()})();(${webxdc.toString()})(${cfg});`;
}

function webxdc(cfg) {
  if (window.webxdc && window.webxdc.__pdd) return;
  // Refuse to run beside the desktop itself: there, an app could read the desktop's keys.
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(window.parent !== window && window.parent.document);
  } catch (e) {
    sameOrigin = false;
  }
  if (sameOrigin && !cfg.lan) {
    window.stop();
    document.documentElement.innerHTML = "<body style='font:15px sans-serif;padding:24px'>This app has to run on its own address. Open the desktop at http://localhost to use apps.</body>";
    throw new Error("webxdc app blocked: same origin as the desktop");
  }

  // ---- storage, kept separate for each app ----
  const prefix = "xdc:" + cfg.scope + ":";
  function wrap(real) {
    const keys = () => {
      const out = [];
      for (let i = 0; i < real.length; i++) {
        const k = real.key(i);
        if (k && k.indexOf(prefix) === 0) out.push(k.slice(prefix.length));
      }
      return out;
    };
    const api = {
      getItem: (k) => real.getItem(prefix + k),
      setItem: (k, v) => real.setItem(prefix + k, String(v)),
      removeItem: (k) => real.removeItem(prefix + k),
      clear: () => keys().forEach((k) => real.removeItem(prefix + k)),
      key: (i) => keys()[i] ?? null,
      get length() {
        return keys().length;
      },
    };
    return new Proxy(api, {
      get: (t, p) => (p in t ? t[p] : typeof p === "string" ? t.getItem(p) : undefined),
      set: (t, p, v) => {
        t.setItem(p, v);
        return true;
      },
      deleteProperty: (t, p) => {
        t.removeItem(p);
        return true;
      },
      ownKeys: () => keys(),
      getOwnPropertyDescriptor: (t, p) => (t.getItem(p) !== null ? { value: t.getItem(p), enumerable: true, configurable: true } : undefined),
    });
  }
  try {
    const local = wrap(window.localStorage);
    const session = wrap(window.sessionStorage);
    Object.defineProperty(window, "localStorage", { value: local, configurable: true });
    Object.defineProperty(window, "sessionStorage", { value: session, configurable: true });
  } catch (e) {
    /* storage not available */
  }
  try {
    const open = indexedDB.open.bind(indexedDB);
    const del = indexedDB.deleteDatabase.bind(indexedDB);
    indexedDB.open = (n, v) => (v === undefined ? open(prefix + n) : open(prefix + n, v));
    indexedDB.deleteDatabase = (n) => del(prefix + n);
  } catch (e) {
    /* no IndexedDB */
  }

  // ---- the webxdc API, carried to the desktop by postMessage ----
  const parent = window.parent;
  let seq = 0;
  const waiting = new Map();
  let listener = null;
  let lastSerial = 0;
  let rtListener = null;
  const post = (msg) => parent.postMessage(Object.assign({ __pdd: "xdc" }, msg), "*");
  const ask = (msg) =>
    new Promise((resolve) => {
      const rid = ++seq;
      waiting.set(rid, resolve);
      post(Object.assign({ rid }, msg));
    });
  const deliver = (updates) => {
    for (const u of updates) {
      if (u.serial <= lastSerial) continue;
      lastSerial = u.serial;
      if (listener) {
        try {
          listener(u);
        } catch (e) {
          console.error(e);
        }
      }
    }
  };
  window.addEventListener("message", (e) => {
    if (e.source !== parent || !e.data || e.data.__pdd !== "xdc") return;
    const m = e.data;
    if (m.type === "updates") deliver(m.updates || []);
    if (m.type === "rt" && rtListener) rtListener(new Uint8Array(m.data));
    if (m.rid && waiting.has(m.rid)) {
      waiting.get(m.rid)(m.value);
      waiting.delete(m.rid);
    }
  });

  window.webxdc = {
    __pdd: true,
    selfAddr: cfg.addr,
    selfName: cfg.name,
    sendUpdateInterval: 1000,
    sendUpdateMaxSize: 128000,
    sendUpdate(update, descr) {
      post({ type: "send", update: JSON.parse(JSON.stringify(update)), descr: descr || "" });
    },
    setUpdateListener(cb, serial) {
      listener = cb;
      lastSerial = serial || 0;
      return ask({ type: "listen", since: lastSerial }).then((updates) => {
        deliver(updates || []);
      });
    },
    getAllUpdates() {
      return ask({ type: "listen", since: 0 });
    },
    sendToChat(content) {
      const out = Object.assign({}, content);
      const file = out.file;
      if (file && file.blob) {
        return new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => {
            out.file = { name: file.name, dataUrl: r.result };
            ask({ type: "chat", content: out }).then(resolve);
          };
          r.readAsDataURL(file.blob);
        });
      }
      return ask({ type: "chat", content: out });
    },
    importFiles(filter) {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = Boolean(filter && filter.multiple);
        const accept = [].concat((filter && filter.mimeTypes) || [], (filter && filter.extensions) || []);
        if (accept.length) input.accept = accept.join(",");
        input.onchange = () => resolve(Array.from(input.files || []));
        input.click();
      });
    },
    joinRealtimeChannel() {
      post({ type: "rt-join" });
      return {
        setListener(cb) {
          rtListener = cb;
        },
        send(data) {
          post({ type: "rt-send", data: Array.from(data) });
        },
        leave() {
          rtListener = null;
          post({ type: "rt-leave" });
        },
      };
    },
  };
  post({ type: "hello" });
}

/**
 * For the Classic pages: send their outside requests through the desktop's relay (no CORS problems),
 * unless Settings → Classic says to send them from the browser. The desktop page provides __pddRelay.
 */
export function classicRelayScript() {
  return `(${classicRelay.toString()})();`;
}

function classicRelay() {
  try {
    const P = window.parent;
    if (!P || P === window || !P.__pddRelay) return;
    const own = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, location.href);
        const outside = (url.protocol === "http:" || url.protocol === "https:") && url.origin !== location.origin;
        if (outside && P.__pddRelay.via() !== "browser") return P.__pddRelay.fetch(url.href, input, init);
      } catch {
        /* fall through to the browser */
      }
      return own(input, init);
    };
  } catch {
    /* not inside the desktop */
  }
}
