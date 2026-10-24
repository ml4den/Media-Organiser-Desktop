import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { build, Platform, Arch } from "electron-builder";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, "../../generated-artifacts/desktop");
const windowsTarget = process.argv.includes("--win");
const targetPlatform = windowsTarget ? "win32" : process.platform;
const stage = path.join(output, `stage-${targetPlatform}-${process.arch}`);
const original = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const require = createRequire(path.join(root, "package.json"));
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });
for (const name of ["desktop", "shared", "dist/public"]) {
  await fs.cp(path.join(root, name), path.join(stage, name), {
    recursive: true, filter: (file) => !file.includes(`${path.sep}downloads`) && !file.endsWith(".zip"),
  });
}
// Materialise the installed, lockfile-resolved dependency closure: no pnpm
// symlinks or workspace dev dependencies can leak into the distributable.
const notices = [];
async function copyDependency(name, resolver, destination) {
  let source;
  try { source = path.dirname(resolver.resolve(`${name}/package.json`)); }
  catch { source = path.dirname(resolver.resolve(name)); while (true) {
    try { const pkg = JSON.parse(await fs.readFile(path.join(source, "package.json"), "utf8")); if (pkg.name === name) break; } catch {}
    const parent = path.dirname(source); if (parent === source) throw new Error(`Cannot resolve ${name}`); source = parent;
  } }
  const manifest = JSON.parse(await fs.readFile(path.join(source, "package.json"), "utf8"));
  const target = path.join(destination, "node_modules", name);
  await fs.cp(source, target, { recursive: true, dereference: true, filter: (file) => !file.slice(source.length).split(path.sep).includes("node_modules") });
  notices.push(`${name} ${manifest.version} — ${manifest.license ?? "see package licence"}\n`);
  const childRequire = createRequire(path.join(source, "package.json"));
  for (const dep of Object.keys(manifest.dependencies ?? {})) await copyDependency(dep, childRequire, target);
  for (const dep of Object.keys(manifest.optionalDependencies ?? {})) {
    if (dep === "exiftool-vendored.exe" && targetPlatform !== "win32") continue;
    if (dep === "exiftool-vendored.pl" && targetPlatform === "win32") continue;
    // Required runtime optional dependencies must fail the build if missing.
    await copyDependency(dep, childRequire, target);
  }
}
for (const name of Object.keys(original.dependencies)) await copyDependency(name, require, stage);
const manifest = {
  name: "media-organiser", version: original.version, type: "module",
  description: original.description, author: original.author, main: original.main,
  dependencies: original.dependencies,
};
await fs.writeFile(path.join(stage, "package.json"), JSON.stringify(manifest, null, 2));
await fs.mkdir(path.join(stage, "runtime"), { recursive: true });
if (targetPlatform !== "win32") {
  const runtimes = JSON.parse(await fs.readFile(path.join(root, "desktop/perl-runtimes.json"), "utf8"));
  const asset = runtimes.assets[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error("Unsupported Perl runtime target.");
  const cache = path.resolve(root, "../../generated-artifacts/runtime-cache");
  await fs.mkdir(cache, { recursive: true });
  const archive = path.join(cache, asset.name);
  let bytes = await fs.readFile(archive).catch(() => null);
  if (!bytes) {
    const response = await fetch(`https://github.com/skaji/relocatable-perl/releases/download/${runtimes.version}/${asset.name}`);
    if (!response.ok) throw new Error(`Perl download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(archive, bytes);
  }
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("Perl checksum mismatch.");
  const perl = path.join(stage, "runtime/perl");
  await fs.mkdir(perl, { recursive: true });
  execFileSync("tar", ["xzf", archive, "--strip-components=1", "-C", perl]);
  const sources = JSON.parse(await fs.readFile(path.join(root, "desktop/runtime-sources.json"), "utf8"));
  const sourceDir = path.join(stage, "runtime/sources");
  await fs.mkdir(sourceDir, { recursive: true });
  for (const source of sources) {
    const cached = path.join(cache, source.name);
    let data = await fs.readFile(cached).catch(() => null);
    if (!data) {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`Runtime source download failed: ${response.status}`);
      data = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(cached, data);
    }
    if (createHash("sha256").update(data).digest("hex") !== source.sha256) throw new Error(`Source checksum mismatch: ${source.name}`);
    await fs.writeFile(path.join(sourceDir, source.name), data);
  }
  for (const license of ["Artistic", "Copying"]) {
    await fs.writeFile(path.join(stage, "runtime", license + ".txt"), execFileSync("tar", ["xOzf", path.join(sourceDir, "perl-source.tar.gz"), `perl-5.44.0/${license}`]));
  }
  await fs.writeFile(path.join(stage, "runtime/LGPL-2.1.txt"), execFileSync("tar", ["xOJf", path.join(sourceDir, "libxcrypt-source.tar.xz"), "libxcrypt-4.5.2/COPYING.LIB"]));
  await fs.writeFile(path.join(sourceDir, "REBUILD.txt"), "Corresponding source and build recipes for the bundled Perl runtime and static libxcrypt are supplied here. Extract the archives; the relocatable-perl build directory contains the original patches, configuration and platform recipes. Use these with the supplied Perl and libxcrypt sources to rebuild/relink the runtime, including a modified libxcrypt. The resulting bin/perl and lib directory can replace runtime/perl without modifying the application. This application imposes no restriction on modification or reverse engineering of these components for debugging modifications. On macOS an altered app may need local re-signing.\n");
  notices.push(`\nRelocatable Perl ${runtimes.version}: Copyright Shoichi Kaji; https://github.com/skaji/relocatable-perl\nPerl: Copyright Larry Wall and contributors, Artistic License or GPL; App::cpanminus: Copyright Tatsuhiko Miyagawa; App::ChangeShebang: Copyright Shoichi Kaji; both same terms as Perl.\nlibxcrypt: LGPL-2.1-or-later; complete source, copyright notices and build recipes are included in runtime/sources. Licence texts are in runtime.\n`);
}
await fs.writeFile(path.join(stage, "runtime/THIRD-PARTY-NOTICES.txt"), notices.join(""));
const electronVersion = require("electron/package.json").version;
const unpackedOnly = process.argv.includes("--dir");
await build({
  projectDir: stage,
  ...(windowsTarget ? { targets: Platform.WINDOWS.createTarget([process.platform === "win32" ? "nsis" : "zip"], Arch.x64) } : {}),
  config: {
    appId: "com.mediaorganiser.desktop", productName: "Media Organiser",
    electronVersion, directories: { output },
    files: ["desktop/**/*", "shared/**/*", "dist/public/**/*", "package.json", "node_modules/**/*"],
    extraResources: [{ from: "runtime", to: "runtime" }],
    asar: true, asarUnpack: ["node_modules/exiftool-vendored*/**/*", "**/node_modules/exiftool-vendored*/**/*"],
    npmRebuild: false,
    artifactName: "Media-Organiser-${version}-${os}-${arch}.${ext}",
    mac: { category: "public.app-category.photography", minimumSystemVersion: "15.0", target: ["dmg", "zip"], identity: null },
    win: {
      target: ["nsis"],
      // Unsigned portable test ZIPs can be produced on Linux without Wine. Native
      // release builds retain normal executable resource editing/signing support.
      ...(windowsTarget && process.platform !== "win32" ? { signAndEditExecutable: false } : {}),
    }, nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
    linux: { category: "Photography", target: ["AppImage"], executableName: "media-organiser" },
    ...(unpackedOnly ? { targets: [] } : {}),
  },
  ...(unpackedOnly ? { dir: true } : {}),
});
console.log(`Release built in ${output}`);
