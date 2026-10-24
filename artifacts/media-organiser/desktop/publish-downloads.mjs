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
  if (name.endsWith(".zip") && !name.includes("-win-")) continue;
  const [, version, os, arch] = name.match(/^Media-Organiser-([\d.]+)-(linux|win|mac)-([\w_]+)\./);
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
console.log(`Published ${files.length} built package(s) to the preview download area.`);
