import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyMacBundleContents } from "./verify-mac.mjs";

// Test-build integrity signing, not Developer ID signing or notarisation.
// Re-seal the entire bundle after Electron Builder has renamed its executables
// and added the app, metadata tool and private Perl runtime.
export async function signMacBundle(app) {
  // The vendored Perl archive includes read-only extension modules. Signing
  // rewrites their Mach-O headers, so grant owner-write on this build copy only.
  async function makeWritable(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      const info = await fs.stat(file);
      await fs.chmod(file, info.mode | 0o200);
      if (entry.isDirectory()) await makeWritable(file);
    }
  }
  await makeWritable(app);
  if (process.platform === "darwin") {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
    execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
    return;
  }
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("Ad-hoc macOS signing requires a Mac or Linux x64 build host.");
  }
  const cache = fileURLToPath(new URL("../../../generated-artifacts/signing-tools/", import.meta.url));
  await fs.mkdir(cache, { recursive: true });
  const name = "apple-codesign-0.29.0-x86_64-unknown-linux-musl";
  const archive = path.join(cache, `${name}.tar.gz`);
  let data = await fs.readFile(archive).catch(() => null);
  if (!data) {
    const response = await fetch(`https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign/0.29.0/${name}.tar.gz`);
    if (!response.ok) throw new Error(`Signing tool download failed: ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(archive, data);
  }
  if (createHash("sha256").update(data).digest("hex") !== "dbe85cedd8ee4217b64e9a0e4c2aef92ab8bcaaa41f20bde99781ff02e600002") {
    throw new Error("Signing tool checksum mismatch.");
  }
  execFileSync("tar", ["xzf", archive, "-C", cache]);
  const tool = path.join(cache, name, "rcodesign");
  execFileSync(tool, ["--config-file", "/dev/null", "sign", app], { stdio: "inherit" });
  // rcodesign 0.29's verifier explicitly warns it is buggy and rejects empty
  // CMS data in valid ad-hoc signatures. Check code pages and sealed resources
  // independently; do not silently ignore that verifier's exit status.
  await verifyMacBundleContents(app);
}
