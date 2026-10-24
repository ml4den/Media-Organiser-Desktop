# Media Organiser

A private desktop app for organising photos and videos by dates stored in their
metadata. Windows, macOS and Linux are supported by the Electron application.
No account, upload, cloud service or database is needed.

## Run the downloaded desktop project

The ZIP includes the built interface, full source, and Electron shell. It is a
desktop **project**, not a signed, ready-to-install operating-system installer.

1. Install Node.js 22 or newer.
2. Extract the ZIP and open a terminal in the `Media-Organiser` folder.
3. Run `npm install`.
4. Run `npm start`.

On Windows, `Start Media Organiser.cmd` performs steps 3–4. On macOS/Linux, run
`sh "Start Media Organiser.command"` from the extracted folder if preferred.
The first installation downloads Electron and ExifTool; after installation,
the desktop app works offline. Fonts are bundled.

On macOS and Linux, ExifTool needs Perl available on PATH (`perl -v`). On Windows,
ExifTool's runtime is bundled automatically. Linux also needs the standard GUI
libraries required by Electron; run from a graphical desktop session.

### Build an installer

From the extracted folder, run `npm run package`. Output is in `release/`:

- Windows: NSIS setup executable.
- macOS: DMG and ZIP.
- Linux: AppImage and DEB.

Build on the operating system you intend to distribute to. Builds are unsigned;
public distribution requires your own platform signing/notarisation setup.
Windows and macOS installers have not been built or launched in this Linux
development environment.

The renderer is prebuilt. After changing source, run `npm run build` before
starting or packaging the app.

## Working in the original pnpm repository

From the repository root:

```sh
pnpm install
pnpm --filter @workspace/media-organiser desktop:start
pnpm --filter @workspace/media-organiser desktop:package
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
