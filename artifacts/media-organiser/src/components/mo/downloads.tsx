import { useEffect, useState } from "react";
import { mediaService } from "@/lib/media";

type Release = { name: string; version: string; os: string; arch: string; size: number; sha256: string };
export function Downloads() {
  const [files, setFiles] = useState<Release[]>([]);
  const [loaded, setLoaded] = useState(false);
  const base = `${import.meta.env.BASE_URL}downloads/`;
  useEffect(() => {
    if (mediaService.desktop) return;
    const controller = new AbortController();
    fetch(`${base}releases.json`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("No releases"); return r.json(); })
      .then((data) => setFiles(Array.isArray(data.files) ? data.files : []))
      .catch(() => {}).finally(() => setLoaded(true));
    return () => controller.abort();
  }, [base]);
  if (mediaService.desktop) return <p>This installed app includes its own runtime and metadata tools. No Node.js, npm, or separate Perl installation is needed.</p>;
  return <div className="space-y-3">
    <p>Ready-to-run packages include the app runtime and metadata tools and work offline. No Node.js, npm, or separate Perl installation.</p>
    {files.map((file) => <div key={file.name} className="rounded-lg border p-3 space-y-2">
      <a className="btn btn-primary inline-flex" href={`${base}${encodeURIComponent(file.name)}`} download>
        Download {file.os === "linux" ? "Linux AppImage" : file.os === "win" ? (file.name.endsWith(".zip") ? "Windows portable ZIP" : "Windows installer") : `macOS ${file.arch === "arm64" ? "Apple Silicon" : "Intel"} ${file.name.endsWith(".zip") ? "ZIP" : "DMG"}`}
      </a>
      <p>Version {file.version} · {file.arch === "x86_64" || file.arch === "x64" ? "Intel / AMD 64-bit" : "ARM64"} · {(file.size / 1024 / 1024).toFixed(0)} MB</p>
      {file.os === "win" && <p><b>Unsigned build.</b> Reported working on Windows by the user. Test with copies of a small folder first, using Copy + Rename.</p>}
      {file.os === "win" && file.name.endsWith(".zip") && <p>Right-click the ZIP → Extract All. Open the extracted folder and run <b>Media Organiser.exe</b>. Keep all accompanying files and folders together; don’t run the app from inside the ZIP.</p>}
      {file.os === "mac" && <><p><b>Ad-hoc signed test build, not Apple-notarised.</b> Version 1.0.2 replaces the 1.0.1 build reported as damaged. Signature checks pass here; launch on macOS is still unverified. Requires macOS 15+. Test with copies using Copy + Rename.</p><p>Download the new ZIP directly from here, extract it, and replace the old <b>Media Organiser.app</b> in Applications. If macOS reports an unidentified developer, use System Settings → Privacy &amp; Security → Open Anyway only if you trust this download. If it still says “damaged”, stop and report it. Don’t disable Gatekeeper globally.</p></>}
      <details><summary className="cursor-pointer">SHA-256 checksum</summary><code className="block break-all text-xs mt-1">{file.sha256}</code></details>
    </div>)}
    {!files.length && <p>{loaded ? "No packaged releases are available in this preview yet." : "Checking available packages…"}</p>}
    {files.length > 0 && <p><a className="underline" href={`${base}SHA256SUMS.txt`} download>Download checksums</a></p>}
    {!files.some((f) => f.os === "win") && <p>Windows installer: not yet built or verified.</p>}
    {!files.some((f) => f.os === "mac") && <p>macOS DMG: not yet built or verified.</p>}
    <p><b>Linux:</b> x86-64 graphical desktop, glibc 2.31+ and standard Electron GUI libraries (such as Ubuntu 22.04/24.04). Mark the AppImage as executable, then open it. If FUSE is unavailable, run <code>./Media-Organiser-*.AppImage --appimage-extract</code> then <code>./squashfs-root/AppRun</code>. Don’t disable the sandbox as an installation workaround.</p>
    <p><b>Windows/macOS:</b> unsigned builds may show security warnings. Windows 10+; macOS 15+ for the bundled Perl runtime.</p>
    <details><summary className="cursor-pointer">Optional developer source project</summary>
      <p className="mt-2">This is not an installer and requires Node.js 22+ and development tools.</p>
      <a className="underline" href={`${import.meta.env.BASE_URL}Media-Organiser-Desktop.zip`} download>Download source project (.zip)</a>
    </details>
  </div>;
}
