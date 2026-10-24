---
name: Desktop platform testing
description: User-confirmed platform execution versus packaging checks.
---

The user confirmed “Yes, it works on Windows” after testing the self-contained Windows ZIP.

**Why:** Native execution cannot be established by checking an archive on Linux; the user supplied the Windows execution confirmation.

**How to apply:** Describe Windows as user-tested, not as independently certified. Do not infer macOS execution or signing verification from Windows success.

The first Linux-cross-packaged macOS download was reported as “damaged and can’t be opened” on launch. ZIP integrity and correct Mach-O architecture are not sufficient desktop acceptance checks. macOS app bundles need complete integrity seals after all packaging mutations, including nested code and bundled runtimes.

**Why:** Electron's linker-generated executable signatures alone did not produce a sealed application bundle; the user hit a real macOS launch failure that archive checks missed.

**How to apply:** Require post-packaging ad-hoc signing at minimum for macOS test builds; do not confuse it with Developer ID signing, notarisation or Gatekeeper acceptance. Keep replacement launch status unverified until native testing confirms it.

rcodesign's verifier can reject valid ad-hoc signatures because their CMS payload is empty; the tool itself warns that its verify command is buggy.

**Why:** This occurred while repairing the macOS packages, even though independent code-page hashes and the Info.plist/CodeResources seal hashes matched.

**How to apply:** Never suppress verifier failures blindly. Use independent content/seal checks for cross-builds and Apple's native `codesign --verify --deep --strict` plus Gatekeeper/launch checks on a Mac for acceptance.
