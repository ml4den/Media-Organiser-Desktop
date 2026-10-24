import type { ActivityLog, MediaEntry, OrganiseSettings, RunSummary } from "@/lib/media-types";
import { defaultSettings } from "@/lib/media-types";

export const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < 3);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
};
export const fmtWhen = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};
export const derivedStatus = (e: MediaEntry): string =>
  !e.date && e.status !== "excluded" && e.status !== "error" && e.status !== "copied" && e.status !== "moved" ? "missing-date" : e.status;

export const download = (name: string, data: BlobPart, type = "text/plain") => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const logsToText = (logs: ActivityLog[]) =>
  logs.map((l) => `${l.time}\t${l.level.toUpperCase()}\t${l.message}`).join("\n") + "\n";

const SK = "mo.settings.v1", HK = "mo.history.v1";
export function loadSettings(): OrganiseSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SK) || "null");
    if (!raw || typeof raw !== "object") return { ...defaultSettings };
    return {
      operation: raw.operation === "move" ? "move" : "copy",
      conflict: ["rename", "skip", "overwrite"].includes(raw.conflict) ? raw.conflict : "rename",
      folderTemplate: typeof raw.folderTemplate === "string" && raw.folderTemplate ? raw.folderTemplate : defaultSettings.folderTemplate,
      recursive: raw.recursive !== false,
      includeHidden: !!raw.includeHidden,
      exclusions: Array.isArray(raw.exclusions) ? raw.exclusions.filter((x: unknown) => typeof x === "string") : [...defaultSettings.exclusions],
      photos: raw.photos !== false,
      videos: raw.videos !== false,
    };
  } catch { return { ...defaultSettings }; }
}
export const saveSettings = (s: OrganiseSettings) => { try { localStorage.setItem(SK, JSON.stringify(s)); } catch { /* ignore */ } };
export function loadHistory(): RunSummary[] {
  try { const h = JSON.parse(localStorage.getItem(HK) || "[]"); return Array.isArray(h) ? h : []; } catch { return []; }
}
export function saveHistory(h: RunSummary[]) {
  let list = h.slice(0, 30).map((r) => ({ ...r, entries: r.entries.slice(0, 1500), logs: r.logs.slice(-1500) }));
  for (;;) {
    try { localStorage.setItem(HK, JSON.stringify(list)); return; }
    catch { if (list.length <= 1) return; list = list.slice(0, Math.ceil(list.length / 2)); }
  }
}
