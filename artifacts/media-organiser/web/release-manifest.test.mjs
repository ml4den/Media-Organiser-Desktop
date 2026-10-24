import test from "node:test";
import assert from "node:assert/strict";
import { releaseManifest } from "./release-manifest.mjs";

const prefix = "https://github.com/ml4den/Media-Organiser-Desktop/releases/download/desktop-v1.0.2/";
const asset = (name, extra = {}) => ({ name, size: 100, state: "uploaded", browser_download_url: prefix + name, digest: `sha256:${"a".repeat(64)}`, ...extra });
test("published assets become external download links and checksums", () => {
  const names = ["linux-x86_64.AppImage", "win-x64.exe", "mac-arm64.dmg", "mac-arm64.zip", "mac-x64.dmg", "mac-x64.zip"];
  const manifest = releaseManifest({ assets: [...names.map((name) => asset(`Media-Organiser-1.0.2-${name}`)), asset("SHA256SUMS.txt")] });
  assert.equal(manifest.files.length, 6);
  assert.equal(manifest.checksumUrl, prefix + "SHA256SUMS.txt");
  assert.equal(manifest.files[0].sha256, "a".repeat(64));
  assert.ok(manifest.files.every((file) => file.url.startsWith(prefix)));
});
test("unavailable or incomplete metadata has a working release-page fallback", () => {
  assert.deepEqual(releaseManifest(null), {
    releaseUrl: "https://github.com/ml4den/Media-Organiser-Desktop/releases/latest",
    files: [], checksumUrl: null,
  });
  const manifest = releaseManifest({ assets: [asset("Media-Organiser-1.0.2-win-x64.exe", { digest: undefined })] });
  assert.equal(manifest.files[0].sha256, null);
});
test("rejects external links, incomplete uploads and unrelated assets", () => {
  const manifest = releaseManifest({ assets: [
    asset("Media-Organiser-1.0.2-win-x64.exe", { browser_download_url: "https://evil.example/installer.exe" }),
    asset("Media-Organiser-1.0.2-mac-arm64.zip", { state: "new" }),
    asset("Media-Organiser-Desktop.zip"),
    asset("Media-Organiser-1.0.2-linux-x86_64.AppImage", { size: 0 }),
  ] });
  assert.equal(manifest.files.length, 0);
});
