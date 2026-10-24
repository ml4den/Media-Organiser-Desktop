# Media Organiser

A private desktop app for organising photos and videos by dates stored in their
metadata. Windows, macOS and Linux are supported by the Electron application.
No account, upload, cloud service or database is needed.

## Ready-to-run downloads

Open **Help → Desktop downloads** in the browser preview. Only packages actually
built and placed in the release area are offered. The Linux x86-64 AppImage
includes Electron, local fonts, ExifTool, and a private relocatable Perl runtime.
No Node.js, npm, separate Perl installation, internet connection or account is
needed to run it. Checksums are supplied alongside the download.

Linux baseline: an x86-64 graphical desktop, glibc 2.31+ and Electron's standard
desktop libraries (GTK3, NSS, ALSA, libgbm, libxkbcommon and X11/Wayland support).
Ubuntu 22.04/24.04 are intended targets; this is not a promise of compatibility
with every distribution. AppImages bundle application dependencies, not the OS.

1. Download the AppImage and optionally compare `sha256sum` with `SHA256SUMS.txt`.
2. In file properties, allow executing the file as a program, then open it.
3. Alternatively: `chmod +x Media-Organiser-*.AppImage` and run the file.
4. Without FUSE, run `./Media-Organiser-*.AppImage --appimage-extract`, then
   `./squashfs-root/AppRun`. Extraction uses only the contents of the AppImage.

Use a normal graphical user session, not root. If local security policy blocks
Chromium's sandbox/user namespaces, use an administrator-approved policy for
this application; do not disable the sandbox as a normal installation step.

Self-contained Windows portable ZIP builds can be cross-packaged on Linux for testing using
`pnpm --filter @workspace/media-organiser desktop:package:win`. This explicitly
selects the Windows Electron distribution and bundled ExifTool/Perl runtime.
Extract the entire ZIP and run `Media Organiser.exe` from the extracted folder;
all accompanying files must remain together. No Node.js, npm, separate Perl or
installation is needed. Do not run the executable from inside the ZIP.
Executable resource editing/signing is skipped for Linux-hosted test builds;
the default icon may be generic. The user has confirmed that the Windows build works.

`pnpm --filter @workspace/media-organiser desktop:package:mac` builds separate
self-contained Apple Silicon (arm64) and Intel (x64) packages. On Linux these
are ZIP archives containing a complete `.app`, including the matching macOS
Electron and pinned portable Perl runtime; DMG creation requires a native Mac.
Extract the ZIP and drag `Media Organiser.app` to Applications. Builds are unsigned
and not notarised, and have not been run on a Mac. If blocked, use macOS System
Settings → Privacy & Security → Open Anyway only for a download you trust.
Do not disable Gatekeeper globally. Test copies of media with Copy + Rename first.
Windows requires Windows 10+; bundled macOS Perl requires macOS 15+.
Unsigned builds may show Windows SmartScreen/macOS Gatekeeper warnings.
Signing/notarisation credentials are not included or configured.

## Packaging and verification

`desktop:package` builds the interface, materialises only the lockfile-resolved
runtime dependency tree (no workspace links), downloads a pinned and SHA-256
checked portable Perl on Unix, and invokes Electron Builder. Windows uses
ExifTool's own bundled Windows runtime. Native builds target the build machine's
OS and architecture; `desktop:package:win` also supports Linux → Windows x64
test packaging as a portable ZIP without Wine. Native Windows builds retain
the NSIS installer target; AppImage and DMG/ZIP are the other respective targets.

Output: `generated-artifacts/desktop/` relative to the repository root.
`desktop:downloads` copies only built AppImage/EXE/DMG and Windows/macOS ZIP packages into the ignored
public download area and writes the release manifest and SHA-256 checksums.
Run it only after checking the release. Then rebuild/export source if needed.

`.github/workflows/desktop-release.yml` provides manually triggered and
`desktop-v*` tag builds on Linux, Windows and Apple Silicon/Intel macOS runners.
It builds a standalone source input on Linux, avoiding this workspace's
Linux-only package overrides on the native Windows/macOS build runners.
It uploads successful packages and checksums as workflow artifacts, not as
automatic public releases. Running the workflow needs this repository on GitHub;
no remote account or runner has been connected from this workspace.

The packaged executable accepts `--smoke-test`: it opens a hidden renderer,
checks the sandbox bridge and rendered interface, then uses synthetic temporary
images to verify bundled ExifTool, strict date skipping, read-only scans,
SHA-256 copying, collision renaming, and Move source deletion only after a
verified copy. Its temporary directory is cleaned up. Native picker interaction,
installer UI, and physical desktop integration still require a target-OS check.

Current local verification: Linux x86-64 renderer and processing checks passed
from extracted packaged resources with PATH excluding all system commands, so
no system Node.js or Perl was used. This headless container requires a supplied
libxkbcommon library path, virtual display, and `--no-sandbox --disable-gpu` for
the check. Those flags are **test-environment exceptions**, not normal launch
instructions; default sandbox/FUSE startup on a physical desktop remains unverified.

The user has since reported that the downloaded AppImage starts and works well
in initial Ubuntu desktop testing, including source selection and Move
confirmation. The exact Ubuntu release, session type, FUSE versus extraction
launch method and full cancellation checks were not supplied. This is useful
user-reported evidence, not certification of both Ubuntu 22.04 and 24.04.
See [Linux verification notes](desktop/LINUX-VERIFICATION.md).

Third-party notices, licence texts, Perl/libxcrypt source and original runtime
build recipes are included under `resources/runtime`. Runtime downloads are
pinned in the desktop manifests and fail closed on checksum mismatch. Electron
also includes its upstream licences. Bundled Perl can be rebuilt/replaced.

### Optional developer source ZIP

The secondary source ZIP is **not** an installer. Developers need Node.js 22+
and `npm install`, then `npm start`. Development launches on Unix can use system
Perl; packaged launches always use the included runtime. To rebuild the interface
use `npm run build`; to package use `npm run package`. Source builds download
development dependencies; end users of the AppImage do not.

## Working in the original pnpm repository

From the repository root:

```sh
pnpm install
pnpm --filter @workspace/media-organiser desktop:start
pnpm --filter @workspace/media-organiser desktop:package
pnpm --filter @workspace/media-organiser desktop:downloads
```

The repository's installer output is `generated-artifacts/desktop/`.
To regenerate the downloadable desktop project:

```sh
pnpm --filter @workspace/media-organiser desktop:build
pnpm --filter @workspace/media-organiser desktop:export
```

Use the managed preview workflow for the browser interface.

## Using the app

1. Choose source folders/files or drop them into the app.
2. Select a separate destination folder.
3. Set your options. Defaults: **Copy**, **Rename conflicts**, `YYYY/MM`,
   include subfolders, exclude dot-hidden names and `.trashed`, `temp`, `delete`.
4. Scan and review: no files are written during scanning.
5. Run the reviewed plan. Move and Overwrite both require confirmation.

On desktop, a single native confirmation includes the ready-file count,
destination, whether originals will be removed, conflict behavior and a backup
warning. Cancel is the default. Selected sources appear in a scrollable list
with 50 entries per page; full paths are available on hover.

Change sources, destination or settings to discard the old review and scan again.
Cancel finishes the current file safely before stopping. Summary and activity logs
can be viewed in History, and logs can be exported. Settings and recent runs are
saved only on this computer. Full exported logs should be retained for large runs;
stored history caps each run at 1,500 entries and 1,500 log lines and up to 30 runs.

### Folder templates

Use `YYYY` for year, `MM` for month, `MMMM` for English month name, `DD` for day,
and `{type}` for `Photos` or `Videos`.

- `YYYY/MM` → `2026/10/IMG_0001.jpg`
- `YYYY/MM/DD` → `2026/10/24/IMG_0001.jpg`
- `{type}/YYYY/MMMM` → `Photos/2026/October/IMG_0001.jpg`
- `Family/YYYY/MM` → `Family/2026/10/IMG_0001.jpg`

Slashes separate folders. Absolute paths, traversal and Windows-reserved folder
names are rejected. Original filenames and embedded metadata are preserved.

### Dates and supported formats

Desktop uses ExifTool, not Windows COM. Images use `DateTimeOriginal`, `ModifyDate`
(EXIF DateTime) and `CreateDate` (DateTimeDigitized), in that order. Videos use
`DateTimeOriginal`, `CreationDate`, `MediaCreateDate`, `TrackCreateDate`, then
`CreateDate`. Files with no valid metadata dates are skipped; filesystem timestamps
and filenames are never used as date fallbacks. Structured dates and cleaned
EXIF/ISO strings avoid locale-dependent month/day ambiguity. The stored calendar
date is retained instead of being shifted to the computer's current time zone.

Photos: JPEG, HEIC/HEIF, PNG, TIFF, WebP, AVIF, DNG, CR2/CR3, NEF, ARW, ORF, RW2,
RAF. Videos: MP4, MOV, M4V, 3GP, AVI, MKV, MTS/M2TS, WebM. Metadata availability
depends on the file; a supported extension does not guarantee a capture date.

Exclusions are case-insensitive substring matches against the relative path, with
`*` and `?` wildcard support. Dot-prefixed files/folders count as hidden; native
Windows hidden attributes are not read. Symbolic links are not followed.

### Conflicts and file safety

- **Rename:** keep both files, adding ` (1)`, ` (2)`, etc.
- **Skip:** leave the source and existing destination alone.
- **Overwrite:** permanently replace matching destination files after explicit
  confirmation. Within one batch, duplicate source names are renamed rather than
  overwriting one another.

Desktop copies are staged, flushed and SHA-256 verified. Original files are
removed in Move mode only after copy verification and a recheck that the source
has not changed. Existing destination symlinks and overlapping source/destination
folders are rejected. Files changed since preview produce errors rather than
being processed blindly. Keep an independent backup: there is no undo.

### Browser preview

The preview uses the same renderer with browser-local processing. No media is
uploaded. It supports EXIF image dates and MP4/MOV container dates; desktop has
broader metadata support. Browser mode is **copy-only**.

Folder write access requires a compatible browser in a top-level window and
explicit permission. Embedded previews generally cannot obtain that permission,
so an organised ZIP is downloaded instead. ZIP export is limited to 512 MB per
batch and held in memory. Browser folder APIs do not offer the same atomic,
exclusive destination writes or disk verification as the desktop engine; use
desktop for valuable archives or large batches.

## Architecture

- `desktop/main.mjs`: sandboxed Electron window, permission-scoped IPC, native
  pickers and native confirmations for destructive operations.
- `desktop/preload.cjs`: narrow context bridge; no Node access in the renderer.
- `desktop/engine.mjs`: local metadata extraction, scanning and verified copying.
- `shared/rules.mjs`: shared date parsing, folder template and exclusion rules.
- `src/lib/media.ts`: selects the native or browser adapter.
- `src/lib/media-browser.ts`: browser file access, local metadata and ZIP export.
- `src/App.tsx`: source → destination → settings → review/run workflow.

No processing endpoints are exposed by the API server. The desktop renderer
blocks outgoing HTTP/WebSocket requests. User media is never sent to that server.
