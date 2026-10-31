// What the app gives the desktop's page (and nothing else: browser tabs get no preload at all). The desktop can
// tell it's running in the app (window.seasideApp) and drive the real browser tabs through it.
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld("seasideApp", {
  version: 1,
  browser: {
    call: (req) => ipcRenderer.invoke("seaside:browser", req),
    onTabs: on("seaside:browser-tabs"),
    onNote: on("seaside:browser-note"),
  },
});
