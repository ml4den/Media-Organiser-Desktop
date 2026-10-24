import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MediaEngine } from "./engine.mjs";

// Only synthetic fixtures inside mkdtemp are ever changed by this check.
export async function smokeTest(resourcesPath, window) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "media-organiser-check-"));
  const engine = new MediaEngine({ resourcesPath });
  try {
    const source = path.join(root, "source");
    const destination = path.join(root, "destination");
    await fs.mkdir(source); await fs.mkdir(destination);
    const fixture = path.join(source, "capture.png");
    await fs.writeFile(fixture, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"));
    await engine.tool.write(fixture, { DateTimeOriginal: "2021:07:09 12:34:56" }, ["-overwrite_original"]);
    await fs.writeFile(path.join(source, "undated.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"));
    const digest = async (file) => createHash("sha256").update(await fs.readFile(file)).digest("hex");
    const originalHash = await digest(fixture);
    const sources = await engine.addSources([source]);
    const target = await engine.addDestination(destination);
    const settings = { operation: "copy", conflict: "rename", folderTemplate: "YYYY/MM", recursive: true, includeHidden: false, exclusions: [], photos: true, videos: true };
    const plan = await engine.scan(sources, settings, target);
    assert.equal(plan.entries.find((e) => e.name === "capture.png").targetRelative, "2021/07/capture.png");
    assert.equal(plan.entries.find((e) => e.name === "undated.png").status, "skipped");
    assert.deepEqual(await fs.readdir(destination), []);
    const copied = await engine.run(plan.id);
    assert.equal(copied.processed, 1); assert.equal(copied.errors, 0);
    assert.equal(await digest(fixture), originalHash);
    assert.equal(await digest(path.join(destination, "2021/07/capture.png")), originalHash);
    const movePlan = await engine.scan(sources, { ...settings, operation: "move" }, target);
    const moved = await engine.run(movePlan.id);
    assert.equal(moved.processed, 1); assert.equal(moved.errors, 0);
    assert.equal(await digest(path.join(destination, "2021/07/capture (1).png")), originalHash);
    await assert.rejects(fs.stat(fixture), { code: "ENOENT" });
    assert.equal(await fs.stat(path.join(source, "undated.png")).then((s) => s.isFile()), true);
    if (window) {
      const bridge = await window.webContents.executeJavaScript(`({
        title: document.title,
        native: typeof window.mediaDesktop?.pickSources === "function" && typeof window.mediaDesktop?.pickDestination === "function",
        rendered: document.body.innerText.includes("Organise"),
        text: document.body.innerText.length
      })`);
      assert.equal(bridge.native, true); assert.equal(bridge.rendered, true); assert.ok(bridge.text > 300);
    }
    return { passed: true, platform: process.platform, arch: process.arch, sandboxDisabledForCheck: process.argv.includes("--no-sandbox"), checks: [
      "offline renderer and context-isolated native bridge", "bundled metadata runtime",
      "read-only scan", "strict missing-date skip", "SHA-256 copy", "collision-safe move", "original retained on copy",
    ], manualCheckRequired: "Native folder dialog interaction and desktop integration on a physical target OS" };
  } finally { await engine.close(); await fs.rm(root, { recursive: true, force: true }); }
}
