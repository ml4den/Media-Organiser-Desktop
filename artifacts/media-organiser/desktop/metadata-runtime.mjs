import path from "node:path";
import { spawn } from "node:child_process";
import { ExifTool, DefaultExifToolOptions, exiftoolPath } from "exiftool-vendored";

// Packaged Unix builds must never fall back to /usr/bin/perl or a user's PATH.
export function createMetadataTool(resourcesPath) {
  const common = { maxProcs: 2, taskTimeoutMillis: 20000 };
  if (!resourcesPath || process.platform === "win32") return new ExifTool(common);
  const perl = path.join(resourcesPath, "runtime", "perl", "bin", "perl");
  return new ExifTool({
    ...common, checkPerl: false,
    processFactory: async () => spawn(perl, [await exiftoolPath(), ...DefaultExifToolOptions.exiftoolArgs], {
      stdio: "pipe", shell: false, windowsHide: true, detached: false,
      env: { LANG: "C", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp" },
    }),
  });
}
