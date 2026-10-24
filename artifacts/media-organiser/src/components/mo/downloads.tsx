import { useEffect, useState } from "react";
import { mediaService } from "@/lib/media";

const repository = "https://github.com/ml4den/Media-Organiser-Desktop";
const releasesUrl = `${repository}/releases/latest`;
type Release = { name: string; version: string; os: string; arch: string; size: number; sha256: string | null; url: string };
type Manifest = { files: Release[]; checksumUrl: string | null };
const releaseLink = (url: unknown): url is string => typeof url === "string" && url.startsWith(`${repository}/releases/download/`);

export function Downloads() {
  const [manifest, setManifest] = useState<Manifest>({ files: [], checksumUrl: null });
  const [loaded, setLoaded] = useState(false);
  const base = `${import.meta.env.BASE_URL}downloads/`;
  useEffect(() => {
    if (mediaService.desktop) return;
    const controller = new AbortController();
    fetch(`${base}releases.json`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("Release information unavailable"); return r.json(); })
      .then((data) => setManifest({
        files: Array.isArray(data.files) ? data.files.filter((file: Release) => file && releaseLink(file.url)) : [],
        checksumUrl: releaseLink(data.checksumUrl) ? data.checksumUrl : null,
      }))
      .catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [base]);
  if (mediaService.desktop) return <p>This installed app includes its own runtime and metadata tools. No Node.js, npm, or separate Perl installation is needed.</p>;
  return <div className="space-y-3">
    <p>Desktop packages include the app runtime and metadata tools and work offline. No Node.js, npm or separate Perl installation is needed.</p>
    <p><a className="underline" href={releasesUrl} target="_blank" rel="noreferrer">Open the latest GitHub Release</a> for downloads, release notes and checksums.</p>
    {manifest.files.map((file) => <div key={file.name} className="rounded-lg border p-3 space-y-2">
      <a className="btn btn-primary inline-flex" href={file.url}>
        Download {file.os === "linux" ? "Linux AppImage" : file.os === "win" ? (file.name.endsWith(".zip") ? "Windows portable ZIP" : "Windows installer") : `macOS ${file.arch === "arm64" ? "Apple Silicon" : "Intel"} ${file.name.endsWith(".zip") ? "ZIP" : "DMG"}`}
      </a>
      <p>Version {file.version} · {file.arch === "x86_64" || file.arch === "x64" ? "Intel / AMD 64-bit" : "ARM64"} · {(file.size / 1024 / 1024).toFixed(0)} MB</p>
      {file.sha256 && <details><summary className="cursor-pointer">SHA-256 checksum</summary><code className="block break-all text-xs mt-1">{file.sha256}</code></details>}
    </div>)}
    {!manifest.files.length && <p>{loaded ? "Package details could not be loaded here. Downloads are still available from the GitHub Release linked above." : "Loading download information…"}</p>}
    {manifest.checksumUrl && <p><a className="underline" href={manifest.checksumUrl}>Download checksums</a></p>}
    <p><b>macOS:</b> Apple Silicon and Intel builds require macOS 15+. These are ad-hoc signed, not Apple-notarised. Gatekeeper may prevent opening them; packaged checks do not establish normal first-open acceptance. Do not disable Gatekeeper.</p>
    <p><b>Windows:</b> Windows 10+. Unsigned installers may show SmartScreen warnings. A previous Windows build was user-tested; this is not a guarantee for every system.</p>
    <p><b>Linux:</b> x86-64 graphical desktop, glibc 2.31+ and standard Electron GUI libraries (such as Ubuntu 22.04/24.04). Mark the AppImage as executable, then open it. If FUSE is unavailable, run <code>./Media-Organiser-*.AppImage --appimage-extract</code> then <code>./squashfs-root/AppRun</code>. Do not disable the sandbox.</p>
    <p>Try Copy + Rename on copies of a small media folder first. Keep independent backups.</p>
    <details><summary className="cursor-pointer">Developer source</summary>
      <p className="mt-2">Source code is not an installer and requires Node.js and development tools.</p>
      <a className="underline" href={`${repository}/archive/refs/heads/main.zip`}>Download repository source (.zip)</a>
    </details>
  </div>;
}
