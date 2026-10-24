# Media Organiser

Organise photos and videos into custom dated folders using dates stored in the
media. Review the plan before copying. Files without a media date are flagged,
not guessed from filenames or filesystem timestamps.

**[Open the web app](https://ml4den.github.io/Media-Organiser-Desktop/)** ·
**[Download desktop apps](https://github.com/ml4den/Media-Organiser-Desktop/releases/latest)** ·
**[Full documentation](artifacts/media-organiser/README.md)**

## Web app

A functional, static GitHub Pages app. Choose or drop files/folders, customise
the folder structure, scan and review, then download an organised ZIP. Compatible
desktop Chrome/Edge browsers can also save copies into a permitted destination
folder. Media is processed locally and never uploaded.

Browser mode is copy-only, has narrower metadata support than desktop, and
limits in-memory ZIP export to 512 MB per batch. Browser folder writes lack
desktop-level atomic creation and disk verification; use a separate destination
and keep backups. Use desktop for large or valuable archives.

## Desktop apps

GitHub Releases contain Windows installers, Linux AppImages, and Apple Silicon
and Intel macOS DMG/ZIP packages with SHA-256 checksums. Application runtimes and
metadata tools are bundled.

**macOS:** current packages are ad-hoc signed, not Apple-notarised. Gatekeeper
may block opening them. Do not disable Gatekeeper.

## Development and publication

Use Node.js 24 and pnpm 10.28.2. See the full documentation for local development,
platform requirements and packaging.

- Main-branch pushes deploy the web app through GitHub Actions.
- A `desktop-v<version>` tag matching the app version builds and publishes desktop
  releases; successful desktop builds also refresh web download information.
- Both workflows can be started manually. A manual desktop build does not
  publish a release.

The website needs no processing backend, database or user accounts.
