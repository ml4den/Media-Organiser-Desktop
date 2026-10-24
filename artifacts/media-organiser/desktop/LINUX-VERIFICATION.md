# Linux desktop verification

## Status: initial Ubuntu desktop success reported; full matrix incomplete

Ubuntu 22.04 and 24.04 x86-64 graphical desktops are intended targets, not yet
verified supported environments. Passing an extracted-package check in a
development container does not establish desktop compatibility.

## User-reported desktop result

On 2026-10-24 the user reported that the downloaded AppImage worked well in
initial Ubuntu tests. Screenshots show selected sources and Move confirmation.
The exact Ubuntu release, session type, FUSE/extraction launch method, sandbox
diagnostics and cancellation results were not supplied. Do not infer those
checks passed.

That feedback identified search-icon overlap, two consecutive confirmation
prompts and an expanding source list. Version 1.0.1 fixes these with explicit
search padding, one authoritative native destructive-operation prompt and a
bounded source list with 50 entries per page.

## Version 1.0.1 supplemental checks

The AppImage extracted successfully into a disposable directory. Its packaged
smoke test passed with PATH excluding system commands: renderer, bundled
metadata processing, read-only scanning, strict missing-date skipping, SHA-256
copying, collision-safe Move and original retention on Copy. The workspace
required its supplied libxkbcommon path and test-only sandbox/GPU overrides.
These are not normal installation instructions or evidence of sandboxed
desktop startup. Fixtures and extracted files were removed afterward.

Six native-consent unit tests cover Copy/Move with Rename/Skip/Overwrite,
ready-only counts, destination/conflict/backup details, cancellation and safe
default buttons. These tests do not automate OS-native dialogs.

The current package checksum is supplied alongside its download in
`SHA256SUMS.txt`. Supplemental checks do not complete the desktop matrix below.

## Original workspace package checked

- Filename: `Media-Organiser-1.0.0-linux-x86_64.AppImage`
- SHA-256: `0e67cd4fe45b30695bbc3a7a4e44e796e302730d2a80bc59b26c69405155b4a3`
- Check date: 2026-10-24

These results apply only to those bytes. Rebuilt packages require a new
checksum and another acceptance pass.

## Workspace observations

The workspace reports Ubuntu 24.04.4 LTS, but has development tools and is not
a clean Ubuntu Desktop installation. It exposes an X display socket but no
normal desktop session was established. Neither `/dev/fuse` nor `/dev/kvm`
is available.

| Check | Observed result |
| --- | --- |
| AppImage `--appimage-mount` | Exit 1: cannot load `libfuse.so.2`; FUSE mounting not verified |
| AppImage `--appimage-extract` in a new temporary directory | Exit 0 |
| Extracted `AppRun --smoke-test`, without sandbox/GPU overrides or a supplied library path | Exit 127: missing `libxkbcommon.so.0`, before application startup |
| Normal sandboxed renderer startup | Not reached |
| Native folder pickers, OS file-manager drag/drop, cancellation | Not exercised |
| Clean Ubuntu 22.04 desktop | Unavailable |
| Clean Ubuntu 24.04 desktop | Unavailable |

The extraction directory was deleted after the check. No user media was used.
The older headless smoke results described in the README remain supplemental
evidence only. Missing workspace OS libraries are not evidence that the
AppImage fails on a stock Ubuntu Desktop installation.

## Required acceptance pass

Run this checklist separately on clean Ubuntu Desktop 22.04 and 24.04 x86-64
machines or graphical VMs, as an ordinary non-root user. Do not install
development tools or a separate Perl runtime for the app. Record the exact OS
point release, desktop/session type (X11 or Wayland), installed OS dependency
changes, AppImage checksum, commands, exit codes, and observed results. Do not
claim an untested session type is supported.

1. **Normal launch and FUSE:** Verify the checksum, make the AppImage executable,
   and open it normally. Confirm an actual FUSE-mounted run rather than automatic
   extraction. If FUSE support is missing, record the original failure and the
   distribution-provided FUSE compatibility package needed, without removing or
   replacing the desktop's existing FUSE packages.
2. **Sandbox:** Keep Chromium's sandbox enabled. Run the packaged
   `--smoke-test` from a terminal and retain `MEDIA_SMOKE_RESULT` and its exit
   code. A smoke report alone does not prove sandbox enforcement: confirm the
   renderer is sandboxed using Chromium diagnostics or process inspection.
   Record any Ubuntu security-policy denial. Do not use `--no-sandbox`,
   `--disable-setuid-sandbox`, run as root, or disable security policy globally.
   If an application-specific administrator-approved policy is necessary,
   document and retest it; qualify support accordingly.
3. **Extraction fallback:** In a fresh writable directory run
   `./Media-Organiser-1.0.0-linux-x86_64.AppImage --appimage-extract`, then
   `./squashfs-root/AppRun`. Confirm the same sandboxed startup and packaged
   smoke test work without a development-tool PATH or supplied library path.
4. **Disposable fixtures:** Use only a new temporary source and destination,
   with expendable dated media and an undated file. Keep a separate reference
   copy outside the selected source. Record source/destination hashes before
   and after each operation. Never select a real photo archive for this pass.
5. **Native pickers:** Choose source folders, multiple source files, and a
   destination using the native dialogs. Cancel each dialog separately and
   confirm existing selections are unchanged. Include paths containing spaces
   and non-ASCII characters.
6. **Drag/drop:** Drag actual files and folders from the desktop file manager
   into the app. Confirm they appear as sources and produce the same reviewed
   plan as picker-selected sources. A browser-synthesized drop is not a
   substitute for this check.
7. **Read-only review and copy:** Scan fixtures and confirm no files changed.
   Check dated paths, missing-date skipping, verified copying, and preservation
   of source hashes. Rerun with rename conflicts and verify both copies survive.
8. **Move and consent:** On fresh disposable fixtures, cancel the native Move
   confirmation and verify no changes. Then accept Move and verify only
   successfully copied, hash-matching files lose their source copy.
9. **Cancellation:** With enough disposable files for an observable operation,
   cancel a scan and then a separate copy/move run. Cancellation allows the
   current file to finish; verify no incomplete destination files, no lost
   originals for unprocessed files, and that another scan/run works afterward.
   Check closing during a run is blocked until cancellation finishes.
10. **Evidence and cleanup:** Save command output, screenshots of native
    interactions, and hash comparisons before deleting fixtures. Record each
    result as pass, fail, or not tested. Fix application failures and rerun the
    affected checks before promoting either desktop to verified support.

Real Ubuntu desktop access is required to close this checklist. The workspace
results above must not be reported as completing it.
