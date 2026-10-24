const defaultRepository = "ml4den/Media-Organiser-Desktop";

export function releaseManifest(release, repository = defaultRepository) {
  const releaseUrl = `https://github.com/${repository}/releases/latest`;
  const prefix = `https://github.com/${repository}/releases/download/`;
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const files = assets.flatMap((asset) => {
    const match = /^Media-Organiser-(\d+\.\d+\.\d+)-(linux|win|mac)-(x86_64|x64|arm64)\.(AppImage|exe|dmg|zip)$/.exec(asset.name ?? "");
    if (!match || asset.state !== "uploaded" || !(asset.size > 0) || !asset.browser_download_url?.startsWith(prefix)) return [];
    return [{
      name: asset.name, version: match[1], os: match[2], arch: match[3],
      size: asset.size, url: asset.browser_download_url,
      sha256: /^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "") ? asset.digest.slice(7) : null,
    }];
  });
  const checksums = assets.find((asset) => asset.name === "SHA256SUMS.txt" && asset.state === "uploaded" && asset.browser_download_url?.startsWith(prefix));
  return { releaseUrl, files, checksumUrl: checksums?.browser_download_url ?? null };
}

export async function fetchReleaseManifest() {
  const repository = process.env.GITHUB_REPOSITORY || defaultRepository;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Invalid GitHub repository name");
  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`GitHub release lookup returned HTTP ${response.status}`);
    const release = await response.json();
    if (release.draft || release.prerelease) throw new Error("No stable public release available");
    return releaseManifest(release, repository);
  } catch (error) {
    // The organiser remains deployable when GitHub has no release or is unavailable.
    // Visitors get an explicit release-page fallback, never broken local binaries.
    console.warn(`Release metadata unavailable: ${error.message}. Using the GitHub Releases link.`);
    return releaseManifest(null, repository);
  }
}
