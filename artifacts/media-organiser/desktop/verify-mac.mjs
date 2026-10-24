import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const builderRequire = createRequire(import.meta.resolve("electron-builder"));
const dependencyRequire = createRequire(builderRequire.resolve("app-builder-lib"));
const plist = dependencyRequire("plist");
const digest = (bytes, type) => createHash(type).update(bytes).digest();

// Independent content checks for cross-builds. These do not replace native
// codesign --verify / Gatekeeper assessment or a launch test on macOS.
export async function verifyMacBundleContents(app) {
  let binaries = 0, resources = 0;
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) continue;
      if (entry.name === "CodeResources" && path.basename(dir) === "_CodeSignature") {
        const manifest = plist.parse(await fs.readFile(file, "utf8"));
        for (const [relative, seal] of Object.entries(manifest.files2 ?? {})) {
          const target = path.resolve(dir, "..", relative);
          if (seal.hash2) {
            assert.deepEqual(digest(await fs.readFile(target), "sha256"), seal.hash2, `Resource hash: ${target}`);
            resources++;
          }
          if (seal.symlink) assert.equal(await fs.readlink(target), seal.symlink);
        }
      }
      const handle = await fs.open(file, "r");
      const magic = Buffer.alloc(4);
      try { await handle.read(magic, 0, 4, 0); } finally { await handle.close(); }
      if (magic.toString("hex") !== "cffaedfe") continue;
      const bytes = await fs.readFile(file);
      let offset = 32, signature;
      for (let i = 0; i < bytes.readUInt32LE(16); i++) {
        const command = bytes.readUInt32LE(offset);
        if (command === 0x1d) {
          const start = bytes.readUInt32LE(offset + 8);
          signature = bytes.subarray(start, start + bytes.readUInt32LE(offset + 12));
        }
        offset += bytes.readUInt32LE(offset + 4);
      }
      assert.ok(signature, `Missing Mach-O signature: ${file}`);
      let cd;
      for (let i = 0; i < signature.readUInt32BE(8); i++) {
        if (signature.readUInt32BE(12 + i * 8) === 0) {
          cd = signature.subarray(signature.readUInt32BE(16 + i * 8));
          cd = cd.subarray(0, cd.readUInt32BE(4));
        }
      }
      assert.ok(cd, `Missing CodeDirectory: ${file}`);
      assert.ok(cd.readUInt32BE(12) & 2, `Expected ad-hoc signature: ${file}`);
      const hashOffset = cd.readUInt32BE(16), slots = cd.readUInt32BE(28);
      const limit = cd.readUInt32BE(32), hashSize = cd[36], pageSize = 2 ** cd[39];
      assert.equal(cd[37], 2, `Expected SHA-256: ${file}`);
      for (let i = 0; i < slots; i++) {
        assert.deepEqual(digest(bytes.subarray(i * pageSize, Math.min((i + 1) * pageSize, limit)), "sha256"),
          cd.subarray(hashOffset + i * hashSize, hashOffset + (i + 1) * hashSize), `Code page ${i}: ${file}`);
      }
      if (file === path.join(app, "Contents/MacOS/Media Organiser")) {
        assert.ok(cd.readUInt32BE(24) >= 3, "Main executable must seal Info.plist and CodeResources");
        for (const [slot, relative] of [[1, "Info.plist"], [3, "_CodeSignature/CodeResources"]]) {
          assert.deepEqual(digest(await fs.readFile(path.join(app, "Contents", relative)), "sha256"),
            cd.subarray(hashOffset - slot * hashSize, hashOffset - (slot - 1) * hashSize), `Bundle seal: ${relative}`);
        }
      }
      binaries++;
    }
  }
  await fs.access(path.join(app, "Contents/_CodeSignature/CodeResources"));
  await walk(app);
  assert.ok(binaries > 10, "Expected Electron, nested helpers and Perl binaries");
  console.log(`macOS content checks passed: ${binaries} Mach-O signatures and ${resources} sealed resource hashes. Native acceptance remains unverified.`);
}
