const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("mediaDesktop", {
  pickSources: (kind) => ipcRenderer.invoke("media:pick-sources", kind),
  addPaths: (paths) => ipcRenderer.invoke("media:add-paths", paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  pickDestination: () => ipcRenderer.invoke("media:pick-destination"),
  scan: (sources, settings, destination) => ipcRenderer.invoke("media:scan", sources, settings, destination),
  run: (id) => ipcRenderer.invoke("media:run", id),
  cancel: () => ipcRenderer.send("media:cancel"),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("media:progress", listener);
    return () => ipcRenderer.removeListener("media:progress", listener);
  },
});
