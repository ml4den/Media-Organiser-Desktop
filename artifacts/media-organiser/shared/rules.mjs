const photoExtensions = new Set(["jpg", "jpeg", "heic", "heif", "png", "tif", "tiff", "webp", "avif", "dng", "cr2", "cr3", "nef", "arw", "orf", "rw2", "raf"]);
const videoExtensions = new Set(["mp4", "mov", "m4v", "3gp", "avi", "mkv", "mts", "m2ts", "webm"]);
export function mediaKind(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  return photoExtensions.has(ext) ? "photo" : videoExtensions.has(ext) ? "video" : "other";
}
export function validateTemplate(template) {
  if (typeof template !== "string" || !template.trim()) return "Enter a folder structure.";
  if (template.length > 180) return "Keep the folder structure under 180 characters.";
  if (template.includes("\\") || template.startsWith("/") || template.endsWith("/")) return "Use forward slashes between folders, without a leading or trailing slash.";
  if (/[<>:"|?*\x00-\x1f]/.test(template)) return "The structure contains characters that are not valid on every operating system.";
  if (/\{(?!type\})/.test(template) || /(?<!\{type)\}/.test(template)) return "The only named token is {type}.";
  if (template.split("/").some((part) => !part.trim() || part === "." || part === ".." || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return "Use valid folder names without empty folders, '..', reserved names or trailing dots/spaces.";
  return null;
}
export function formatFolder(template, date, kind = "photo") {
  const error = validateTemplate(template);
  if (error) throw new Error(error);
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error("Invalid media date.");
  const tokens = {
    YYYY: String(date.getFullYear()).padStart(4, "0"),
    MMMM: date.toLocaleString("en-GB", { month: "long" }),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
    "{type}": kind === "video" ? "Videos" : "Photos",
  };
  return template.replace(/YYYY|MMMM|MM|DD|\{type\}/g, (token) => tokens[token]);
}
export function exclusionReason(relativePath, settings) {
  const path = relativePath.replace(/\\/g, "/");
  if (!settings.includeHidden && path.split("/").some((part) => part.startsWith("."))) return "Hidden file or folder";
  for (const raw of settings.exclusions) {
    const pattern = raw.trim();
    if (!pattern) continue;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    if (new RegExp(escaped, "i").test(path)) return `Matches exclusion: ${pattern}`;
  }
  return null;
}
export function validateSettings(settings) {
  if (!settings || !["copy", "move"].includes(settings.operation)) throw new Error("Choose copy or move.");
  if (!["rename", "skip", "overwrite"].includes(settings.conflict)) throw new Error("Choose a conflict policy.");
  const error = validateTemplate(settings.folderTemplate);
  if (error) throw new Error(error);
  if (!settings.photos && !settings.videos) throw new Error("Select photos, videos, or both.");
  if (!Array.isArray(settings.exclusions) || settings.exclusions.length > 100 || settings.exclusions.some((x) => typeof x !== "string" || x.length > 200)) throw new Error("Use up to 100 exclusion patterns, each under 200 characters.");
  for (const key of ["photos", "videos", "recursive", "includeHidden"]) {
    if (typeof settings[key] !== "boolean") throw new Error(`Invalid setting: ${key}`);
  }
}
// EXIF dates are wall-clock capture times. Keep their calendar day rather than
// shifting dates around midnight into the computer's local timezone.
export function parseMetadataDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) && value.getFullYear() >= 1904 ? value : null;
  if (value && typeof value === "object" && "year" in value) {
    return dateParts(Number(value.year), Number(value.month), Number(value.day), Number(value.hour || 0), Number(value.minute || 0), Number(value.second || 0));
  }
  if (typeof value !== "string") return null;
  const clean = value.replace(/[^\x20-\x7e]/g, "").trim();
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?/.exec(clean);
  if (m) return dateParts(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  // Invariant parsing is intentionally limited to ISO/EXIF. Ambiguous numeric
  // locale dates are not guessed: skipping is safer than misfiling a photo.
  return null;
}
function dateParts(y, m, d, h, min, s) {
  if (y < 1904 || y > 9999 || m < 1 || m > 12 || d < 1 || h > 23 || min > 59 || s > 59) return null;
  const date = new Date(y, m - 1, d, h, min, s);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}
export function dateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}
export function numberedName(name, index) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} (${index})${name.slice(dot)}` : `${name} (${index})`;
}
