// The stand-in for Tauri inside the desktop: Vector's own interface calls window.__TAURI__ as it does in its app;
// here calls and events go to the Vector host through the desktop (server/vectorHost.mjs), and the parts that
// belong to a window (file pickers, links, focus, the updater) are done by this page.
(() => {
  const API = "/api/vector-host";
  const b64 = (u8) => {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  // bytes as base64 when they're the whole argument; as plain number lists inside an object (as Tauri sends them)
  const encArgs = (a) =>
    a instanceof ArrayBuffer ? { __b64: b64(new Uint8Array(a)) } : ArrayBuffer.isView(a) ? { __b64: b64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) } : a;
  const replacer = (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v instanceof ArrayBuffer ? Array.from(new Uint8Array(v)) : v instanceof Map ? Object.fromEntries(v) : v);
  const decOut = (v) => (v && typeof v === "object" && typeof v.__b64 === "string" ? unb64(v.__b64).buffer : v);

  // ── asking the desktop's window (Explorer, its dialogs, Games & Apps); the page is on the desktop's own address ──
  const deskWaits = new Map();
  let deskSeq = 0;
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || e.origin !== location.origin || !e.data?.pddReply) return;
    deskWaits.get(e.data.id)?.(e.data.value);
    deskWaits.delete(e.data.id);
  });
  const inDesk = window.parent !== window;
  const askDesk = (type, data = {}) =>
    new Promise((resolve) => {
      const id = ++deskSeq;
      deskWaits.set(id, resolve);
      window.parent.postMessage({ pddVector: type, id, ...data }, location.origin);
    });

  async function invoke(cmd, args = {}) {
    // a Mini App opens in Games & Apps (added there first if this version is new), not in a window of its own
    if (cmd === "miniapp_open" && inDesk) {
      const r = await askDesk("miniapp", { path: args.filePath });
      if (r?.error) throw r.error;
      return null;
    }
    const r = await fetch(`${API}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd, args: encArgs(args) }, replacer),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw "error" in j ? j.error : `Vector answered ${r.status}`;
    return decOut(j.ok);
  }

  // ── events: one stream per page, Vector's events on request ────────────────
  const handlers = new Map(); // event → Map(id → fn)
  let seq = 0;
  let client = null;
  const ready = new Promise((resolve) => {
    const es = new EventSource(`${API}/events`);
    es.addEventListener("hello", (e) => {
      client = JSON.parse(e.data).client;
      // after a reconnect, ask again for everything listened to
      for (const name of handlers.keys()) subscribe(name);
      resolve();
    });
    es.addEventListener("msg", (e) => {
      const { event, payload } = JSON.parse(e.data);
      for (const [id, fn] of handlers.get(event) ?? []) {
        try {
          fn({ event, id, payload });
        } catch (err) {
          console.error(err);
        }
      }
    });
  });
  const subscribe = (event) =>
    fetch(`${API}/sub`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client, event }) });
  async function listen(event, fn) {
    const id = ++seq;
    if (!handlers.has(event)) handlers.set(event, new Map());
    handlers.get(event).set(id, fn);
    await ready;
    await subscribe(event);
    return () => handlers.get(event)?.delete(id);
  }
  async function once(event, fn) {
    const un = await listen(event, (e) => (un(), fn(e)));
    return un;
  }
  // through Vector, so its engine hears it and it comes back to listeners here as in its app
  async function emit(event, payload) {
    await fetch(`${API}/emit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, payload }) });
  }

  // ── files: the browser's own picker; the file goes to the desktop, Vector gets its path there ───────────
  async function uploadFile(f) {
    const r = await fetch(`${API}/upload`, { method: "POST", headers: { "X-Filename": encodeURIComponent(f.name) }, body: f });
    const j = await r.json();
    if (!r.ok) throw j.error || "Upload failed";
    return j.path;
  }
  async function pick({ multiple = false, filters = [], directory = false, title } = {}) {
    // inside the desktop: Explorer is the picker (it can upload from the device being used, too)
    if (inDesk) {
      const paths = await askDesk("pick", { mode: directory ? "folder" : "open", multiple, filters, title });
      return paths?.length ? (multiple ? paths : paths[0]) : null;
    }
    return browserPick({ multiple, filters, directory });
  }
  async function save({ defaultPath = "", filters = [], title } = {}) {
    if (!inDesk) return null;
    const paths = await askDesk("pick", { mode: "save", filters, title, defaultName: String(defaultPath).split(/[\\/]/).pop() });
    return paths?.[0] ?? null;
  }
  function browserPick({ multiple = false, filters = [], directory = false } = {}) {
    if (directory) {
      alert("Choosing a folder isn't available inside the desktop yet. Use Vector's app on this computer for that.");
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = multiple;
      const exts = filters.flatMap((f) => f.extensions || []).filter((e) => e !== "*");
      if (exts.length) input.accept = exts.map((e) => `.${e}`).join(",");
      input.style.display = "none";
      document.body.append(input);
      let done = false;
      input.onchange = async () => {
        done = true;
        const files = [...input.files];
        input.remove();
        if (!files.length) return resolve(null);
        const paths = await Promise.all(files.map(uploadFile));
        resolve(multiple ? paths : paths[0]);
      };
      // closed without choosing
      window.addEventListener("focus", () => setTimeout(() => !done && (input.remove(), resolve(null)), 800), { once: true });
      input.click();
    });
  }

  // ── window bits: the desktop's window is Vector's window ───────────────────
  const focusFns = new Set();
  window.addEventListener("focus", () => focusFns.forEach((f) => f({ payload: true })));
  window.addEventListener("blur", () => focusFns.forEach((f) => f({ payload: false })));
  const noop = async () => undefined;
  const win = new Proxy(
    {
      label: "main",
      show: noop, hide: noop, close: noop, setFocus: async () => window.focus(), setOverlayIcon: noop, setBadgeCount: noop,
      setTitle: async (t) => void (document.title = t), isVisible: async () => true, isFocused: async () => document.hasFocus(),
      isMaximized: async () => false, isMinimized: async () => false, isFullscreen: async () => Boolean(document.fullscreenElement),
      innerSize: async () => ({ width: innerWidth, height: innerHeight }), outerSize: async () => ({ width: innerWidth, height: innerHeight }),
      scaleFactor: async () => devicePixelRatio,
      onFocusChanged: async (fn) => (focusFns.add(fn), () => focusFns.delete(fn)),
      onDragDropEvent: async (fn) => dragDrop(fn),
      onCloseRequested: async () => noop, onResized: async () => noop, onMoved: async () => noop,
      listen: (event, fn) => listen(event, fn), once: (event, fn) => once(event, fn), emit: (event, p) => emit(event, p),
    },
    { get: (t, k) => (k in t ? t[k] : noop) }, // anything else a window can do: nothing to do here
  );
  // dropped files: uploaded, then handed to Vector as paths, the way its app sees them
  function dragDrop(fn) {
    const pos = (e) => ({ x: e.clientX, y: e.clientY });
    const over = (e) => {
      if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
      e.preventDefault();
      fn({ payload: { type: "over", position: pos(e) } });
    };
    const enter = (e) => [...(e.dataTransfer?.types || [])].includes("Files") && fn({ payload: { type: "enter", paths: [], position: pos(e) } });
    const leave = (e) => !e.relatedTarget && fn({ payload: { type: "leave" } });
    const drop = async (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      const paths = await Promise.all([...e.dataTransfer.files].map(uploadFile));
      fn({ payload: { type: "drop", paths, position: pos(e) } });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }

  window.__TAURI__ = {
    core: {
      invoke,
      convertFileSrc: (p) => `${API}/asset?p=${encodeURIComponent(p)}`,
      transformCallback: (fn) => fn,
      isTauri: () => true,
    },
    event: { listen, once, emit, TauriEvent: {} },
    dialog: {
      open: pick,
      save,
      // the desktop's own dialogs (a browser one would pause its music and animations)
      message: async (m, o = {}) => (inDesk ? void (await askDesk("ask", { title: o.title || "Vector", body: String(m), yes: o.okLabel || "OK", no: "" })) : alert(m)),
      ask: async (m, o = {}) => (inDesk ? Boolean(await askDesk("ask", { title: o.title || "Vector", body: String(m), yes: o.okLabel || "Yes", no: o.cancelLabel || "No" })) : confirm(m)),
      confirm: async (m, o = {}) => (inDesk ? Boolean(await askDesk("ask", { title: o.title || "Vector", body: String(m), yes: o.okLabel || "OK", no: o.cancelLabel || "Cancel" })) : confirm(m)),
    },
    app: { getVersion: () => invoke("plugin:app|version"), getName: async () => "Vector" },
    opener: {
      openUrl: async (u) => void window.open(u, "_blank", "noopener,noreferrer"),
      // the desktop's Explorer, at that file
      openPath: async (p) => inDesk && void (await askDesk("open", { path: String(p) })),
      revealItemInDir: async (p) => inDesk && void (await askDesk("reveal", { path: String(p) })),
    },
    window: { getCurrentWindow: () => win, getAllWindows: async () => [win] },
    webview: { getCurrentWebview: () => win },
    webviewWindow: { getCurrentWebviewWindow: () => win },
    updater: { check: async () => null },
    process: { relaunch: async () => location.reload(), exit: noop },
    notification: {
      isPermissionGranted: async () => "Notification" in window && Notification.permission === "granted",
      requestPermission: async () => ("Notification" in window ? Notification.requestPermission() : "denied"),
      sendNotification: (o) => "Notification" in window && Notification.permission === "granted" && new Notification(typeof o === "string" ? o : o.title, { body: o.body }),
    },
    clipboardManager: {
      writeText: (t) => navigator.clipboard.writeText(t),
      readText: () => navigator.clipboard.readText(),
    },
  };
})();
