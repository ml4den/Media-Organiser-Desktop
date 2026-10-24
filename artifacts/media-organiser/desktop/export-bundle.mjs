import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = {};
const prefix = "Media-Organiser/";
async function collect(dir, filter = () => true) {
  for (const file of await fs.readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = `${dir}/${file.name}`;
    if (file.name === "downloads" || !filter(relative)) continue;
    if (file.isDirectory()) await collect(relative, filter);
    else bundle[prefix + relative] = new Uint8Array(await fs.readFile(path.join(root, relative)));
  }
}
await collect("desktop");
await collect("shared");
await collect("src");
await collect("dist/public", (name) => !name.endsWith(".zip"));
await collect("public", (name) => !name.endsWith(".zip"));
for (const name of ["README.md", "index.html"]) bundle[prefix + name] = new Uint8Array(await fs.readFile(path.join(root, name)));
const original = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const runtime = ["exiftool-vendored"];
const dev = ["electron", "electron-builder", "vite", "@vitejs/plugin-react", "@tailwindcss/vite", "tailwindcss", "@tailwindcss/typography", "tw-animate-css", "react", "react-dom", "lucide-react", "exifr", "fflate", "@fontsource/fraunces", "@fontsource/dm-sans", "@fontsource/spline-sans-mono"];
async function versions(packages) {
  return Object.fromEntries(await Promise.all(packages.map(async (name) => [name, JSON.parse(await fs.readFile(path.join(root, "node_modules", name, "package.json"), "utf8")).version])));
}
const manifest = {
  name: "media-organiser-desktop", version: original.version, private: true, type: "module",
  description: original.description, author: original.author, license: "MIT",
  main: "desktop/main.mjs", engines: { node: ">=22" },
  scripts: {
    start: "electron .",
    build: "vite build",
    package: "node desktop/package-release.mjs",
  },
  dependencies: await versions(runtime),
  devDependencies: await versions(dev),
};
bundle[prefix + "package.json"] = strToU8(JSON.stringify(manifest, null, 2) + "\n");
bundle[prefix + "electron-builder.yml"] = strToU8((await fs.readFile(path.join(root, "electron-builder.yml"), "utf8")).replace("../../generated-artifacts/desktop", "release"));
bundle[prefix + "vite.config.ts"] = strToU8(`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  base: "./", plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: { outDir: "dist/public", emptyOutDir: true },
});
`);
bundle[prefix + "tsconfig.json"] = strToU8(JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", strict: true, skipLibCheck: true, esModuleInterop: true, lib: ["ESNext", "DOM", "DOM.Iterable"], types: ["vite/client"], paths: { "@/*": ["./src/*"] }, noEmit: true }, include: ["src", "shared"] }, null, 2));
bundle[prefix + "Start Media Organiser.cmd"] = strToU8('@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul || (echo Install Node.js 22 or newer first. & pause & exit /b 1)\r\nif not exist node_modules call npm install\r\ncall npm start\r\npause\r\n');
bundle[prefix + "Start Media Organiser.command"] = strToU8('#!/bin/sh\ncd "$(dirname "$0")"\ncommand -v node >/dev/null || { echo "Install Node.js 22 or newer first."; exit 1; }\n[ -d node_modules ] || npm install\nnpm start\n');
const bytes = zipSync(bundle, { level: 6 });
await fs.mkdir(path.join(root, "public"), { recursive: true });
await fs.writeFile(path.join(root, "public/Media-Organiser-Desktop.zip"), bytes);
await fs.writeFile(path.join(root, "dist/public/Media-Organiser-Desktop.zip"), bytes);
process.stdout.write(`Desktop project bundle created (${(bytes.length / 1024 / 1024).toFixed(2)} MB).\n`);
