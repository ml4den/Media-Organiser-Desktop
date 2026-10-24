import { app, BrowserWindow, dialog, ipcMain, Menu, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MediaEngine } from "./engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererPath = path.resolve(here, "../dist/public/index.html");
let window;
let engine;
let closing = false;
function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith("file://")) throw new Error("Untrusted request.");
}
function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => { trusted(event); return callback(...args); });
}
function createWindow() {
  window = new BrowserWindow({
    title: "Media Organiser", width: 1240, height: 920, minWidth: 860, minHeight: 640,
    backgroundColor: "#eef3f0",
    webPreferences: { preload: path.join(here, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("close", (event) => {
    if (engine.busy) {
      event.preventDefault();
      dialog.showMessageBox(window, { type: "info", title: "Operation in progress", message: "Cancel the operation and wait for the current file to finish before closing.", buttons: ["OK"] });
    }
  });
  window.loadFile(rendererPath);
}
app.whenReady().then(() => {
  engine = new MediaEngine();
  // No renderer network access: files and metadata never leave this computer.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_details, callback) => callback({ cancel: true }));
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
  ]));
  handle("media:pick-sources", async (kind) => {
    if (!["folder", "files"].includes(kind)) throw new Error("Invalid selection type.");
    const result = await dialog.showOpenDialog(window, {
      title: kind === "folder" ? "Choose source folders" : "Choose media files",
      properties: kind === "folder" ? ["openDirectory", "multiSelections"] : ["openFile", "multiSelections"],
    });
    return result.canceled ? [] : engine.addSources(result.filePaths);
  });
  handle("media:add-paths", async (paths) => {
    if (!Array.isArray(paths) || paths.length > 10000) throw new Error("Drop up to 10,000 files or folders at a time.");
    return engine.addSources(paths);
  });
  handle("media:pick-destination", async () => {
    const result = await dialog.showOpenDialog(window, { title: "Choose destination", properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : engine.addDestination(result.filePaths[0]);
  });
  const progress = (event) => { if (window && !window.isDestroyed()) window.webContents.send("media:progress", event); };
  handle("media:scan", (...args) => engine.scan(...args, progress));
  handle("media:run", async (id) => {
    const plan = engine.plans.get(id);
    if (!plan) throw new Error("Scan your media before processing.");
    // Require native confirmation too: IPC cannot bypass destructive consent.
    if (plan.settings.operation === "move" || plan.settings.conflict === "overwrite") {
      const result = await dialog.showMessageBox(window, {
        type: "warning", title: "Confirm file changes",
        message: "Proceed with the reviewed changes?",
        detail: [
          plan.settings.operation === "move" ? "MOVE: Originals will be deleted only after each copy is SHA-256 verified." : "COPY: Original source files will be kept.",
          plan.settings.conflict === "overwrite" ? "OVERWRITE: Existing destination files with matching names will be permanently replaced. This cannot be undone." : "Existing destination files will not be overwritten.",
          `Destination: ${plan.destination.path}`,
        ].join("\n\n"),
        buttons: ["Cancel", "Organise files"], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (result.response !== 1) throw new Error("Operation cancelled. No files were changed.");
    }
    return engine.run(id, progress);
  });
  ipcMain.on("media:cancel", (event) => { trusted(event); engine.cancel(); });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", (event) => {
  if (engine?.busy) { event.preventDefault(); engine.cancel(); return; }
  if (!closing && engine) {
    event.preventDefault(); closing = true;
    engine.close().finally(() => app.quit());
  }
});
