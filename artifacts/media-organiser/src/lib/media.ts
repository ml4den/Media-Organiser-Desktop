import type { MediaService } from "./media-types";
import { browserMediaService } from "./media-browser";
export { formatFolder, validateTemplate } from "../../shared/rules.mjs";

declare global {
  interface Window {
    mediaDesktop?: {
      pickSources(kind: "folder" | "files"): ReturnType<MediaService["pickSources"]>;
      addPaths(paths: string[]): ReturnType<MediaService["pickSources"]>;
      pathForFile(file: File): string;
      pickDestination: MediaService["pickDestination"];
      scan(sources: Parameters<MediaService["scan"]>[0], settings: Parameters<MediaService["scan"]>[1], destination: Parameters<MediaService["scan"]>[2]): ReturnType<MediaService["scan"]>;
      run(id: string): ReturnType<MediaService["run"]>;
      cancel(): void;
      onProgress(callback: NonNullable<Parameters<MediaService["scan"]>[3]>): () => void;
    };
  }
}
const native = window.mediaDesktop;
export const mediaService: MediaService = native ? {
  desktop: true,
  canWriteFolders: true,
  pickSources: (kind) => native.pickSources(kind),
  addDropped: async (data) => native.addPaths(Array.from(data.files).map((f) => native.pathForFile(f)).filter(Boolean)),
  pickDestination: () => native.pickDestination(),
  scan: async (sources, settings, destination, onProgress) => {
    const off = native.onProgress(onProgress ?? (() => {}));
    try { return await native.scan(sources, settings, destination); } finally { off(); }
  },
  run: async (plan, onProgress) => {
    if (plan.demo) throw new Error("Example files cannot be processed. Choose your own media first.");
    const off = native.onProgress(onProgress ?? (() => {}));
    try { return await native.run(plan.id); } finally { off(); }
  },
  cancel: () => native.cancel(),
} : browserMediaService;
