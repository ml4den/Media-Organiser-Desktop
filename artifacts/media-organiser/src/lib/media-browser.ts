import exifr from "exifr";
import { Zip, ZipPassThrough } from "fflate";
import { dateString, exclusionReason, formatFolder, mediaKind, numberedName, parseMetadataDate, validateSettings } from "../../shared/rules.mjs";
import type { ActivityLog, MediaDestination, MediaEntry, MediaPlan, MediaService, MediaSource, OrganiseSettings, ProgressEvent, RunSummary } from "./media-types";

interface FileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob | Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}
interface DirectoryHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterable<[string, FileHandle | DirectoryHandle]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  isSameEntry(other: DirectoryHandle): Promise<boolean>;
  resolve(other: DirectoryHandle): Promise<string[] | null>;
}
interface FsWindow extends Window {
  showDirectoryPicker?: (options: { mode: string; id: string }) => Promise<DirectoryHandle>;
}
interface BrowserItem { file: File; relative: string }
type BrowserSource = { handle: DirectoryHandle } | { files: BrowserItem[] };
const sources = new Map<string, BrowserSource>();
const destinations = new Map<string, DirectoryHandle>();
const planItems = new Map<string, Map<string, File>>();
const plans = new Map<string, MediaPlan>();
let cancelled = false;
let busy = false;
const id = () => crypto.randomUUID();
const fsWindow = window as FsWindow;
// Cross-origin preview frames generally cannot request directory write access.
const folderAccess = typeof fsWindow.showDirectoryPicker === "function" && window.self === window.top;
const log = (level: ActivityLog["level"], message: string): ActivityLog => ({ time: new Date().toISOString(), level, message });

function rememberFiles(files: BrowserItem[], label: string): MediaSource[] {
  if (!files.length) return [];
  const key = id();
  sources.set(key, { files });
  return [{ id: key, label }];
}
function inputFiles(folder: boolean): Promise<MediaSource[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (folder) input.setAttribute("webkitdirectory", "");
    input.style.display = "none";
    document.body.append(input);
    const finish = (result: MediaSource[]) => { input.remove(); resolve(result); };
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      const label = folder ? (files[0]?.webkitRelativePath.split("/")[0] || "Selected folder") : `${files.length} selected file${files.length === 1 ? "" : "s"}`;
      finish(rememberFiles(files.map((file) => ({ file, relative: folder ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name })), label));
    };
    input.addEventListener("cancel", () => finish([]), { once: true });
    input.click();
  });
}
async function collectDirectory(handle: DirectoryHandle, settings: OrganiseSettings, prefix = ""): Promise<BrowserItem[]> {
  const result: BrowserItem[] = [];
  for await (const [name, child] of handle.entries()) {
    if (cancelled) break;
    const relative = prefix + name;
    if (child.kind === "file") result.push({ file: await child.getFile(), relative });
    else if (settings.recursive) result.push(...await collectDirectory(child, settings, relative + "/"));
  }
  return result;
}
async function collectEntry(entry: FileSystemEntry, prefix = ""): Promise<BrowserItem[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, relative: prefix + file.name }];
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const files: BrowserItem[] = [];
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) files.push(...await collectEntry(child, prefix + entry.name + "/"));
    }
    return files;
  }
  return [];
}
async function videoDate(file: File): Promise<Date | null> {
  // Walk ISO Base Media boxes without reading the potentially multi-GB mdat.
  async function walk(start: number, end: number, depth: number): Promise<Date | null> {
    if (depth > 5) return null;
    let offset = start;
    while (offset + 8 <= end) {
      const header = new DataView(await file.slice(offset, Math.min(offset + 40, end)).arrayBuffer());
      let size = header.getUint32(0);
      const type = String.fromCharCode(...new Uint8Array(header.buffer, 4, 4));
      let head = 8;
      if (size === 1) { if (header.byteLength < 16) return null; size = Number(header.getBigUint64(8)); head = 16; }
      if (size === 0) size = end - offset;
      if (size < head || offset + size > end) return null;
      if (type === "mvhd" || type === "mdhd") {
        const body = new DataView(await file.slice(offset + head, offset + head + 16).arrayBuffer());
        if (body.byteLength < 12) return null;
        const seconds = body.getUint8(0) === 1 ? Number(body.getBigUint64(4)) : body.getUint32(4);
        if (seconds > 0) {
          const utc = new Date(Date.UTC(1904, 0, 1) + seconds * 1000);
          if (utc.getUTCFullYear() >= 1970 && utc.getUTCFullYear() < 10000) return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds());
        }
      }
      if (["moov", "trak", "mdia"].includes(type)) {
        const date = await walk(offset + head, offset + size, depth + 1);
        if (date) return date;
      }
      offset += size;
    }
    return null;
  }
  return walk(0, file.size, 0);
}
async function readDate(file: File, kind: string): Promise<{ date: Date; field: string } | null> {
  if (kind === "video") {
    if (!/\.(mp4|mov|m4v|3gp)$/i.test(file.name)) return null;
    const date = await videoDate(file);
    return date ? { date, field: "Media created (container UTC)" } : null;
  }
  const tags = await exifr.parse(file, { pick: ["DateTimeOriginal", "ModifyDate", "CreateDate"], reviveValues: false });
  for (const field of ["DateTimeOriginal", "ModifyDate", "CreateDate"]) {
    const date = parseMetadataDate(tags?.[field]);
    if (date) return { date, field };
  }
  return null;
}
async function pathExists(root: DirectoryHandle, relative: string): Promise<boolean> {
  const parts = relative.split("/");
  try {
    let folder = root;
    for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part);
    // getFileHandle throws TypeMismatchError for an existing directory, which is
    // also a collision (never turn it into a file).
    await folder.getFileHandle(parts[parts.length - 1]!);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return false;
    if (error instanceof DOMException && error.name === "TypeMismatchError") return true;
    throw error;
  }
}
async function chooseTarget(root: DirectoryHandle | undefined, relative: string, reserved: Set<string>, policy: string): Promise<{ relative: string; conflict: boolean }> {
  let current = relative, index = 1;
  while (reserved.has(current.toLowerCase()) || (root && await pathExists(root, current))) {
    if (policy === "skip") return { relative: current, conflict: true };
    if (policy === "overwrite" && !reserved.has(current.toLowerCase())) {
      reserved.add(current.toLowerCase());
      return { relative: current, conflict: true };
    }
    const slash = relative.lastIndexOf("/");
    current = relative.slice(0, slash + 1) + numberedName(relative.slice(slash + 1), index++);
  }
  reserved.add(current.toLowerCase());
  return { relative: current, conflict: false };
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export const browserMediaService: MediaService = {
  desktop: false,
  canWriteFolders: folderAccess,
  async pickSources(kind) {
    if (kind === "folder" && folderAccess) {
      try {
        const handle = await fsWindow.showDirectoryPicker!({ mode: "read", id: "media-source" });
        const key = id(); sources.set(key, { handle });
        return [{ id: key, label: handle.name }];
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return [];
        if (!(error instanceof DOMException && error.name === "SecurityError")) throw error;
      }
    }
    return inputFiles(kind === "folder");
  },
  async addDropped(data) {
    // Read entries synchronously while the drop event's DataTransfer is live.
    const entries = Array.from(data.items).map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => !!entry);
    const fileFallback = Array.from(data.files);
    if (entries.length) {
      const result: MediaSource[] = [];
      for (const entry of entries) result.push(...rememberFiles(await collectEntry(entry), entry.name));
      return result;
    }
    return rememberFiles(fileFallback.map((file) => ({ file, relative: file.name })), `${fileFallback.length} dropped files`);
  },
  async pickDestination() {
    if (!folderAccess) throw new Error("This browser cannot grant local folder write access here. Download an organised ZIP instead, open the site directly in desktop Chrome or Edge, or use the desktop app.");
    try {
      const handle = await fsWindow.showDirectoryPicker!({ mode: "readwrite", id: "media-destination" });
      const key = id(); destinations.set(key, handle);
      return { id: key, label: handle.name };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) throw new Error("Folder permission was denied. Choose an allowed destination folder, or use ZIP output without folder access.");
      throw error;
    }
  },
  async scan(selectedSources, settings, destination, onProgress) {
    if (busy) throw new Error("Another operation is still running.");
    validateSettings(settings);
    if (settings.operation === "move") throw new Error("Move is available in the desktop app only. Use Copy in the browser.");
    if (!selectedSources.length) throw new Error("Choose some source media first.");
    busy = true; cancelled = false;
    try {
      const root = destination ? destinations.get(destination.id) : undefined;
      if (destination && !root) throw new Error("Choose your destination folder again.");
      const all: BrowserItem[] = [];
      for (const source of selectedSources) {
        const stored = sources.get(source.id);
        if (!stored) throw new Error("Choose your source again; folder access does not persist after reload.");
        if ("handle" in stored) {
          if (root && (await stored.handle.isSameEntry(root) || await stored.handle.resolve(root) !== null || await root.resolve(stored.handle) !== null)) throw new Error("Source and destination folders must not overlap.");
          all.push(...await collectDirectory(stored.handle, settings));
        } else all.push(...stored.files.filter((item) => settings.recursive || !item.relative.includes("/")));
      }
      const entries: MediaEntry[] = [];
      const files = new Map<string, File>();
      const seen = new Set<File>();
      const reserved = new Set<string>();
      for (const item of all) {
        if (cancelled) throw new Error("Scan cancelled. No files were changed.");
        if (seen.has(item.file)) continue;
        seen.add(item.file);
        const entry: MediaEntry = { id: id(), name: item.file.name, relativePath: item.relative, size: item.file.size, kind: mediaKind(item.file.name), status: "ready" };
        const excluded = exclusionReason(item.relative, settings);
        if (excluded) { entry.status = "excluded"; entry.reason = excluded; }
        else if (entry.kind === "other" || (entry.kind === "photo" && !settings.photos) || (entry.kind === "video" && !settings.videos)) {
          entry.status = "excluded"; entry.reason = "File type not selected or unsupported";
        } else {
          try {
            const metadata = await readDate(item.file, entry.kind);
            if (!metadata) { entry.status = "skipped"; entry.reason = "No valid media date. Filesystem dates are never used. More formats are supported by the desktop app."; }
            else {
              entry.date = dateString(metadata.date); entry.dateSource = metadata.field;
              const target = await chooseTarget(root, `${formatFolder(settings.folderTemplate, metadata.date, entry.kind)}/${entry.name}`, reserved, settings.conflict);
              entry.targetRelative = target.relative;
              if (target.conflict && settings.conflict === "skip") { entry.status = "conflict"; entry.reason = "Destination name already exists"; }
              else if (target.conflict) { entry.reason = "Existing destination file will be overwritten"; reserved.add(target.relative.toLowerCase()); }
            }
          } catch (error) {
            entry.status = "skipped";
            entry.reason = `Metadata could not be read: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        entries.push(entry); files.set(entry.id, item.file);
        onProgress?.({ phase: "scanning", current: entries.length, total: all.length, name: entry.name, entry: { ...entry }, log: log(entry.status === "ready" ? "info" : "warning", `${entry.name}: ${entry.reason ?? entry.targetRelative}`) });
        // Yield so cancellation and progress can render for large selections.
        if (entries.length % 20 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      const plan: MediaPlan = { id: id(), entries, settings: structuredClone(settings), destination: destination ?? undefined, createdAt: new Date().toISOString() };
      // Only the latest review remains executable, and file objects stay private.
      plans.clear(); planItems.clear(); plans.set(plan.id, structuredClone(plan)); planItems.set(plan.id, files);
      return plan;
    } finally { busy = false; }
  },
  async run(requested, onProgress) {
    if (busy) throw new Error("Another operation is still running.");
    const plan = plans.get(requested.id), files = planItems.get(requested.id);
    if (!plan || !files || requested.demo) throw new Error("Scan your own media again before processing.");
    const ready = plan.entries.filter((entry) => entry.status === "ready");
    if (!ready.length) throw new Error("There are no files ready to organise.");
    const root = plan.destination ? destinations.get(plan.destination.id) : undefined;
    if (plan.destination && !root) throw new Error("Choose your destination folder again.");
    // Browsers cannot guarantee exclusive atomic creation; ZIP is the safest
    // option for archive building. Folder writes use explicit user permission.
    const bytes = ready.reduce((sum, entry) => sum + entry.size, 0);
    if (!root && bytes > 512 * 1024 * 1024) throw new Error("This selection is too large for an in-memory ZIP (512 MB limit). Choose a smaller batch, a writable folder, or use the desktop app.");
    busy = true; cancelled = false;
    plans.delete(plan.id);
    const summary: RunSummary = { id: id(), startedAt: new Date().toISOString(), finishedAt: "", operation: "copy", total: plan.entries.length, processed: 0, skipped: plan.entries.filter((e) => ["skipped", "conflict"].includes(e.status)).length, excluded: plan.entries.filter((e) => e.status === "excluded").length, errors: plan.entries.filter((e) => e.status === "error").length, cancelled: false, destination: root?.name ?? "Organised ZIP download", entries: structuredClone(plan.entries), logs: [], delivery: root ? "folder" : "zip" };
    const chunks: Uint8Array[] = [];
    const zip = root ? null : new Zip((error, chunk) => { if (error) throw error; chunks.push(chunk); });
    const reserved = new Set<string>();
    let current = 0;
    try {
      for (const entry of summary.entries) {
        if (cancelled) { summary.cancelled = true; break; }
        if (entry.status !== "ready" || !entry.targetRelative) {
          summary.logs.push(log(entry.status === "error" ? "error" : "warning", `${entry.name}: ${entry.reason ?? entry.status}`));
          continue;
        }
        try {
          const file = files.get(entry.id)!;
          const target = await chooseTarget(root, entry.targetRelative, reserved, plan.settings.conflict);
          if (target.conflict && plan.settings.conflict === "skip") {
            entry.status = "conflict"; entry.reason = "Destination file appeared after preview; skipped"; summary.skipped++;
          } else {
            entry.targetRelative = target.relative;
            if (root) {
              let folder = root;
              const parts = target.relative.split("/");
              for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
              // Recheck immediately before writing; browser mode is copy-only.
              if (plan.settings.conflict !== "overwrite" && await pathExists(root, target.relative)) throw new Error("Destination changed after review. Scan again to resolve the conflict safely.");
              const handle = await folder.getFileHandle(parts[parts.length - 1]!, { create: true });
              const writer = await handle.createWritable();
              try { await writer.write(file); await writer.close(); } catch (error) { await writer.abort().catch(() => {}); throw error; }
            } else {
              const zipFile = new ZipPassThrough(target.relative);
              zip!.add(zipFile);
              const reader = file.stream().getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) { zipFile.push(new Uint8Array(0), true); break; }
                zipFile.push(value);
              }
            }
            entry.status = "copied"; summary.processed++;
          }
        } catch (error) { entry.status = "error"; entry.reason = error instanceof Error ? error.message : String(error); summary.errors++; }
        const message = log(entry.status === "copied" ? "success" : entry.status === "error" ? "error" : "warning", `${entry.name}: ${entry.status === "copied" ? `Copied to ${entry.targetRelative}` : entry.reason}`);
        summary.logs.push(message);
        current++;
        onProgress?.({ phase: "processing", current, total: ready.length, name: entry.name, entry: { ...entry }, log: message });
        await new Promise((r) => setTimeout(r, 0));
      }
      if (zip) {
        zip.end();
        if (summary.processed) download(new Blob(chunks.map((chunk) => new Uint8Array(chunk)), { type: "application/zip" }), `Media-Organiser-${new Date().toISOString().slice(0, 10)}.zip`);
      }
      summary.finishedAt = new Date().toISOString();
      for (const entry of summary.entries) if (entry.status === "ready") { entry.status = "skipped"; entry.reason = "Not processed: run cancelled"; summary.skipped++; }
      summary.logs.push(log("info", `Finished: ${summary.processed} copied, ${summary.skipped} skipped, ${summary.excluded} excluded, ${summary.errors} errors${summary.cancelled ? " (cancelled)" : ""}.`));
      return summary;
    } finally { busy = false; planItems.delete(plan.id); }
  },
  cancel() { cancelled = true; },
};
