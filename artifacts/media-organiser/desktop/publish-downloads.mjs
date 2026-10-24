import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.resolve(process.argv[2] ?? path.join(root, "../../generated-artifacts/desktop"));
const destination = path.join(root, "public/downloads");
await fs.mkdir(destination, { recursive: true });
const files = [];
const candidates = (await fs.readdir(release)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
const seen = new Set();
for (const name of candidates) {
  if (!/^Media-Organiser-[\d.]+-(linux|win|mac)-[\w_]+\.(AppImage|exe|dmg|zip)$/.test(name)) continue;
  if (name.endsWith(".zip") && !name.includes("-win-") && !name.includes("-mac-")) continue;
  const [, version, os, arch] = name.match(/^Media-Organiser-([\d.]+)-(linux|win|mac)-([\w_]+)\./);
  // Withdraw the macOS test release reported as damaged. Do not re-offer it
  // if a later package is absent from a local or CI output directory.
  if (os === "mac" && version === "1.0.1") continue;
  const key = `${os}-${arch}-${path.extname(name)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const bytes = await fs.readFile(path.join(release, name));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await fs.writeFile(path.join(destination, name), bytes);
  files.push({ name, version, os, arch, size: bytes.length, sha256 });
}
if (!files.length) throw new Error("No built release packages found; downloads were not changed.");
await fs.writeFile(path.join(destination, "releases.json"), JSON.stringify({ files }, null, 2));
await fs.writeFile(path.join(destination, "SHA256SUMS.txt"), files.map((f) => `${f.sha256}  ${f.name}\n`).join(""));
for (const name of await fs.readdir(destination)) {
  if (/^Media-Organiser-1\.0\.1-mac-(arm64|x64)\.(zip|dmg)$/.test(name)) {
    await fs.unlink(path.join(destination, name));
  }
}
console.log(`Published ${files.length} built package(s) to the preview download area.`);
