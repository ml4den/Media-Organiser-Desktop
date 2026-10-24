import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// File URLs need relative asset imports. Preview workflows keep their normal
// base path and port; this mode changes only the local desktop build.
process.env.MEDIA_DESKTOP = "1";
await build({ configFile: path.join(root, "vite.config.ts") });
