import fs from "node:fs/promises";
import { createReadStream, constants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ExifTool } from "exiftool-vendored";
import { dateString, exclusionReason, formatFolder, mediaKind, numberedName, parseMetadataDate, validateSettings } from "../shared/rules.mjs";

const PHOTO_FIELDS = ["DateTimeOriginal", "ModifyDate", "CreateDate"];
const VIDEO_FIELDS = ["DateTimeOriginal", "CreationDate", "MediaCreateDate", "TrackCreateDate", "CreateDate"];
const key = (p) => p.toLowerCase();
const overlaps = (a, b) => a === b || (!path.relative(a, b).startsWith(`..${path.sep}`) && path.relative(a, b) !== ".." && !path.isAbsolute(path.relative(a, b)));
const log = (level, message) => ({ time: new Date().toISOString(), level, message });
async function exists(file) {
  try { return await fs.lstat(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const snapshot = (stat) => ({ size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino, dev: stat.dev });
const sameSnapshot = (a, b) => a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino && a.dev === b.dev;

export class MediaEngine {
  sources = new Map();
  destinations = new Map();
  plans = new Map();
  busy = false;
  cancelled = false;
  tool;
  constructor(options = {}) {
    // All metadata processing is local; ExifTool replaces Windows COM APIs.
    this.tool = options.tool ?? new ExifTool({ maxProcs: 2, taskTimeoutMillis: 20000 });
  }
  async addSources(paths) {
    const result = [];
    for (const input of paths) {
      if (typeof input !== "string" || !path.isAbsolute(input)) throw new Error("Select a valid local file or folder.");
      const original = await fs.lstat(input);
      if (original.isSymbolicLink()) throw new Error("Symbolic links are not followed. Select the original file or folder.");
      const absolute = await fs.realpath(input);
      const stat = await fs.stat(absolute);
      if (!stat.isFile() && !stat.isDirectory()) throw new Error("Only files and folders can be selected.");
      const existing = [...this.sources.values()].find((source) => source.path === absolute);
      if (existing) { result.push({ id: existing.id, label: path.basename(absolute), path: absolute }); continue; }
      const source = { id: randomUUID(), path: absolute, folder: stat.isDirectory() };
      this.sources.set(source.id, source);
      result.push({ id: source.id, label: path.basename(absolute), path: absolute });
    }
    return result;
  }
  async addDestination(input) {
    const absolute = await fs.realpath(input);
    if (!(await fs.stat(absolute)).isDirectory()) throw new Error("Select an existing destination folder.");
    const destination = { id: randomUUID(), label: path.basename(absolute), path: absolute };
    this.destinations.set(destination.id, destination);
    return destination;
  }
  cancel() { this.cancelled = true; }
  async close() { await this.tool.end(); }
  async scan(selectedSources, inputSettings, selectedDestination, onProgress = () => {}) {
    if (this.busy) throw new Error("Another operation is still running.");
    validateSettings(inputSettings);
    if (!Array.isArray(selectedSources) || !selectedSources.length) throw new Error("Select at least one source.");
    const destination = this.destinations.get(selectedDestination?.id);
    if (!destination) throw new Error("Select a destination folder.");
    const selected = selectedSources.map((source) => {
      const saved = this.sources.get(source.id);
      if (!saved) throw new Error("Choose your source again.");
      if (saved.folder && (overlaps(saved.path, destination.path) || overlaps(destination.path, saved.path))) throw new Error("Source and destination folders must not overlap. Choose a separate destination.");
      if (!saved.folder && overlaps(destination.path, saved.path)) throw new Error("A source file is already inside the destination. Choose a separate destination.");
      return saved;
    });
    this.busy = true; this.cancelled = false;
    const settings = structuredClone(inputSettings);
    try {
      const candidates = [];
      const seen = new Set();
      const visit = async (absolute, relative, depth = 0) => {
        if (this.cancelled) throw new Error("Scan cancelled. No files were changed.");
        if (depth > 100) throw new Error("Source folder nesting exceeds the safety limit.");
        if (seen.has(absolute)) return;
        seen.add(absolute);
        try {
          const stat = await fs.lstat(absolute);
          if (stat.isSymbolicLink()) {
            candidates.push({ path: absolute, relative, status: "excluded", reason: "Symbolic link: not followed", stat });
          } else if (stat.isDirectory()) {
            const children = await fs.readdir(absolute);
            for (const name of children.sort()) {
              const child = path.join(absolute, name);
              const childStat = await fs.lstat(child).catch(() => null);
              if (childStat?.isDirectory() && !settings.recursive) continue;
              await visit(child, path.join(relative, name), depth + 1);
            }
          } else if (stat.isFile()) candidates.push({ path: absolute, relative, stat });
        } catch (error) {
          if (this.cancelled) throw error;
          candidates.push({ path: absolute, relative, status: "error", reason: `Cannot read: ${error.message}` });
        }
      };
      for (const source of selected) await visit(source.path, source.folder ? "" : path.basename(source.path));
      const entries = [];
      const reserved = new Set();
      for (const item of candidates) {
        if (this.cancelled) throw new Error("Scan cancelled. No files were changed.");
        const name = path.basename(item.path);
        const entry = { id: randomUUID(), name, relativePath: item.relative.replaceAll(path.sep, "/"), size: item.stat?.size ?? 0, kind: mediaKind(name), status: item.status ?? "ready", reason: item.reason };
        const privateEntry = { public: entry, path: item.path, snapshot: item.stat ? snapshot(item.stat) : null };
        const exclusion = exclusionReason(entry.relativePath, settings);
        if (entry.status === "ready" && exclusion) { entry.status = "excluded"; entry.reason = exclusion; }
        if (entry.status === "ready" && (entry.kind === "other" || (entry.kind === "photo" && !settings.photos) || (entry.kind === "video" && !settings.videos))) {
          entry.status = "excluded"; entry.reason = "File type not selected or unsupported";
        }
        if (entry.status === "ready") {
          try {
            const tags = await this.tool.read(item.path);
            let capture = null;
            for (const field of entry.kind === "video" ? VIDEO_FIELDS : PHOTO_FIELDS) {
              const date = parseMetadataDate(tags[field]);
              if (date) { capture = { date, field }; break; }
            }
            if (!capture) { entry.status = "skipped"; entry.reason = "No valid EXIF or media-created date. Filesystem dates are not used."; }
            else {
              entry.date = dateString(capture.date);
              entry.dateSource = capture.field;
              const folder = formatFolder(settings.folderTemplate, capture.date, entry.kind);
              let relative = `${folder}/${entry.name}`, index = 1;
              while (true) {
                const reservedConflict = reserved.has(key(relative));
                const current = await exists(path.join(destination.path, ...relative.split("/")));
                if (!reservedConflict && !current) break;
                if (settings.conflict === "skip") { entry.status = "conflict"; entry.reason = "Destination name already exists"; break; }
                // Two source files must never overwrite one another, even when
                // the user permits replacement of already-existing archive files.
                if (settings.conflict === "overwrite" && !reservedConflict) {
                  if (current.isSymbolicLink() || !current.isFile()) { entry.status = "error"; entry.reason = "Destination is not a regular file"; }
                  else entry.reason = "Existing destination file will be overwritten";
                  break;
                }
                relative = `${folder}/${numberedName(entry.name, index++)}`;
              }
              entry.targetRelative = relative;
              if (entry.status === "ready") reserved.add(key(relative));
            }
          } catch (error) {
            entry.status = "error";
            entry.reason = `Metadata read/parse error: ${error.message}`;
          }
        }
        entries.push(privateEntry);
        onProgress({ phase: "scanning", current: entries.length, total: candidates.length, name, entry: { ...entry }, log: log(entry.status === "ready" ? "info" : entry.status === "error" ? "error" : "warning", `${name}: ${entry.reason ?? entry.targetRelative}`) });
      }
      const plan = { id: randomUUID(), settings, destination: { ...destination }, createdAt: new Date().toISOString(), entries };
      this.plans.clear(); this.plans.set(plan.id, plan);
      return { ...plan, entries: entries.map((entry) => ({ ...entry.public })) };
    } finally { this.busy = false; }
  }
  async safeFolder(root, relativeParts) {
    // Reject path traversal and pre-existing symlinks at every destination level.
    if (await fs.realpath(root) !== root) throw new Error("Destination folder changed. Select it again.");
    let folder = root;
    for (const part of relativeParts) {
      if (!part || part === "." || part === ".." || part.includes(path.sep)) throw new Error("Unsafe destination path.");
      folder = path.join(folder, part);
      await fs.mkdir(folder).catch((error) => { if (error.code !== "EEXIST") throw error; });
      const stat = await fs.lstat(folder);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Destination contains a symbolic link or non-folder. No files were written there.");
    }
    return folder;
  }
  async run(planId, onProgress = () => {}) {
    if (this.busy) throw new Error("Another operation is still running.");
    const plan = this.plans.get(planId);
    if (!plan) throw new Error("This review has expired. Scan again before processing.");
    if (!plan.entries.some((entry) => entry.public.status === "ready")) throw new Error("There are no files ready to organise.");
    this.busy = true; this.cancelled = false; this.plans.delete(planId);
    const summary = {
      id: randomUUID(), startedAt: new Date().toISOString(), finishedAt: "",
      operation: plan.settings.operation, total: plan.entries.length, processed: 0,
      skipped: plan.entries.filter((entry) => ["skipped", "conflict"].includes(entry.public.status)).length,
      excluded: plan.entries.filter((entry) => entry.public.status === "excluded").length,
      errors: plan.entries.filter((entry) => entry.public.status === "error").length,
      cancelled: false, destination: plan.destination.path, delivery: "desktop", entries: [], logs: [],
    };
    const totalReady = plan.entries.filter((entry) => entry.public.status === "ready").length;
    let current = 0;
    try {
      for (const item of plan.entries) {
        const entry = { ...item.public };
        summary.entries.push(entry);
        if (entry.status !== "ready") {
          summary.logs.push(log(entry.status === "error" ? "error" : "warning", `${entry.name}: ${entry.reason}`));
          continue;
        }
        if (this.cancelled) {
          entry.status = "skipped"; entry.reason = "Not processed: run cancelled"; summary.skipped++; summary.cancelled = true;
          summary.logs.push(log("warning", `${entry.name}: ${entry.reason}`));
          continue;
        }
        let temporary;
        try {
          const sourceStat = await fs.lstat(item.path);
          if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || !sameSnapshot(item.snapshot, sourceStat)) throw new Error("Source changed since preview. Scan again.");
          // A source path may have had a parent swapped for a symlink after scan.
          if (await fs.realpath(item.path) !== item.path) throw new Error("Source path changed since preview.");
          const parts = entry.targetRelative.split("/");
          const filename = parts.pop();
          const folder = await this.safeFolder(plan.destination.path, parts);
          let target = path.join(folder, filename);
          if (target === item.path) throw new Error("Source and destination are the same file.");
          let collision = await exists(target), suffix = 1;
          if (collision && plan.settings.conflict === "skip") {
            entry.status = "conflict"; entry.reason = "Destination already exists; skipped"; summary.skipped++;
          } else {
            if (plan.settings.conflict === "rename") {
              while (collision) { target = path.join(folder, numberedName(filename, suffix++)); collision = await exists(target); }
            } else if (collision && (!collision.isFile() || collision.isSymbolicLink())) throw new Error("Refusing to overwrite a symbolic link or non-file.");
            temporary = path.join(folder, `.media-organiser-${randomUUID()}.tmp`);
            await fs.copyFile(item.path, temporary, constants.COPYFILE_EXCL);
            const handle = await fs.open(temporary, "r+");
            try { await handle.sync(); } finally { await handle.close(); }
            const [sourceHash, copyHash] = await Promise.all([hashFile(item.path), hashFile(temporary)]);
            if (sourceHash !== copyHash) throw new Error("Copy verification failed; original kept.");
            if (!sameSnapshot(item.snapshot, await fs.lstat(item.path))) throw new Error("Source changed during copy; original kept.");
            if (plan.settings.conflict === "overwrite") {
              const beforeCommit = await exists(target);
              if (beforeCommit && (!beforeCommit.isFile() || beforeCommit.isSymbolicLink())) throw new Error("Destination changed; refusing overwrite.");
              await fs.rename(temporary, target); // Atomic replacement, never a partial destination.
              temporary = undefined;
            } else {
              // link() commits without clobbering any file created since review.
              while (true) {
                try { await fs.link(temporary, target); break; }
                catch (error) {
                  if (error.code === "EEXIST" && plan.settings.conflict === "rename") { target = path.join(folder, numberedName(filename, suffix++)); continue; }
                  if (error.code === "EEXIST") throw new Error("Destination appeared during copy. Original kept; scan again.");
                  if (!["ENOTSUP", "EOPNOTSUPP", "EPERM", "EXDEV", "ENOSYS"].includes(error.code)) throw error;
                  // FAT/exFAT and some network drives do not support hard links.
                  // Exclusive creation still prevents clobbering an existing file.
                  let output;
                  try {
                    output = await fs.open(target, "wx");
                  } catch (openError) {
                    if (openError.code === "EEXIST" && plan.settings.conflict === "rename") { target = path.join(folder, numberedName(filename, suffix++)); continue; }
                    throw openError;
                  }
                  try {
                    for await (const chunk of createReadStream(temporary)) {
                      let offset = 0;
                      while (offset < chunk.length) {
                        const { bytesWritten } = await output.write(chunk, offset, chunk.length - offset);
                        if (bytesWritten === 0) throw new Error("Destination stopped accepting data.");
                        offset += bytesWritten;
                      }
                    }
                    await output.sync();
                  } catch (writeError) {
                    await output.close();
                    await fs.unlink(target).catch(() => {});
                    throw writeError;
                  }
                  await output.close();
                  if (await hashFile(target) !== copyHash) throw new Error("Destination verification failed; original kept.");
                  break;
                }
              }
              await fs.unlink(temporary); temporary = undefined;
            }
            entry.targetRelative = path.relative(plan.destination.path, target).replaceAll(path.sep, "/");
            // Preserve source timestamps; embedded metadata bytes are unchanged.
            await fs.utimes(target, sourceStat.atime, sourceStat.mtime).catch(() => {});
            if (plan.settings.operation === "move") {
              if (!sameSnapshot(item.snapshot, await fs.lstat(item.path)) || await hashFile(item.path) !== sourceHash) throw new Error("Copy saved, but source changed before deletion. Original kept.");
              await fs.unlink(item.path);
            }
            entry.status = plan.settings.operation === "move" ? "moved" : "copied";
            entry.reason = undefined;
            summary.processed++;
          }
        } catch (error) { entry.status = "error"; entry.reason = error.message; summary.errors++; }
        finally { if (temporary) await fs.unlink(temporary).catch(() => {}); }
        current++;
        const message = log(["copied", "moved"].includes(entry.status) ? "success" : entry.status === "error" ? "error" : "warning", `${entry.name}: ${["copied", "moved"].includes(entry.status) ? `${entry.status} → ${entry.targetRelative}` : entry.reason}`);
        summary.logs.push(message);
        onProgress({ phase: "processing", current, total: totalReady, name: entry.name, entry: { ...entry }, log: message });
      }
      summary.finishedAt = new Date().toISOString();
      summary.logs.push(log("info", `Finished: ${summary.processed} processed, ${summary.skipped} skipped, ${summary.excluded} excluded, ${summary.errors} errors${summary.cancelled ? " (cancelled)" : ""}.`));
      return summary;
    } finally { this.busy = false; }
  }
}
