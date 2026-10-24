export type Operation = "copy" | "move";
export type ConflictPolicy = "rename" | "skip" | "overwrite";
export interface OrganiseSettings {
  operation: Operation;
  conflict: ConflictPolicy;
  folderTemplate: string;
  recursive: boolean;
  includeHidden: boolean;
  exclusions: string[];
  photos: boolean;
  videos: boolean;
}
export const defaultSettings: OrganiseSettings = {
  operation: "copy",
  conflict: "rename",
  folderTemplate: "YYYY/MM",
  recursive: true,
  includeHidden: false,
  exclusions: [".trashed", "temp", "delete"],
  photos: true,
  videos: true,
};
export interface MediaSource {
  id: string;
  label: string;
  path?: string;
}
export interface MediaDestination {
  id: string;
  label: string;
  path?: string;
}
export type EntryStatus = "ready" | "skipped" | "excluded" | "conflict" | "error" | "copied" | "moved";
export interface MediaEntry {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  kind: "photo" | "video" | "other";
  date?: string;
  dateSource?: string;
  targetRelative?: string;
  status: EntryStatus;
  reason?: string;
}
export interface MediaPlan {
  id: string;
  entries: MediaEntry[];
  settings: OrganiseSettings;
  destination?: MediaDestination;
  createdAt: string;
  demo?: boolean;
}
export interface ActivityLog {
  time: string;
  level: "info" | "warning" | "error" | "success";
  message: string;
}
export interface ProgressEvent {
  phase: "scanning" | "processing";
  current: number;
  total: number;
  name: string;
  entry?: MediaEntry;
  log?: ActivityLog;
}
export interface RunSummary {
  id: string;
  startedAt: string;
  finishedAt: string;
  operation: Operation;
  total: number;
  processed: number;
  skipped: number;
  excluded: number;
  errors: number;
  cancelled: boolean;
  destination: string;
  entries: MediaEntry[];
  logs: ActivityLog[];
  delivery: "desktop" | "folder" | "zip";
}
export interface MediaService {
  desktop: boolean;
  canWriteFolders: boolean;
  pickSources(kind: "folder" | "files"): Promise<MediaSource[]>;
  addDropped(data: DataTransfer): Promise<MediaSource[]>;
  pickDestination(): Promise<MediaDestination | null>;
  scan(sources: MediaSource[], settings: OrganiseSettings, destination: MediaDestination | null, onProgress?: (event: ProgressEvent) => void): Promise<MediaPlan>;
  run(plan: MediaPlan, onProgress?: (event: ProgressEvent) => void): Promise<RunSummary>;
  cancel(): void;
}
