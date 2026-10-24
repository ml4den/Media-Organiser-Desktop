import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchReleaseManifest } from "./release-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.MEDIA_PAGES = "1";
process.env.NODE_ENV = "production";
process.env.BASE_PATH ||= "/Media-Organiser-Desktop/";
if (!/^\/(?:[\w.-]+\/)*$/.test(process.env.BASE_PATH)) throw new Error("BASE_PATH must be an absolute directory path ending with /");
const { build } = await import("vite");
await build({ configFile: path.join(root, "vite.config.ts") });
const output = path.join(root, "dist/public");
await mkdir(path.join(output, "downloads"), { recursive: true });
for (const asset of ["favicon.svg", "robots.txt"]) {
  await copyFile(path.join(root, "public", asset), path.join(output, asset));
}
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(path.join(output, "downloads/releases.json"), JSON.stringify(await fetchReleaseManifest(), null, 2) + "\n");
console.log(`Static browser app built for ${process.env.BASE_PATH}; no desktop installers included.`);
