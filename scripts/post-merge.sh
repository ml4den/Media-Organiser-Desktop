#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Release files are deliberately ignored by Git; rebuild them in the main
# workspace after merging so the download does not serve the previous version.
node --test artifacts/media-organiser/desktop/confirmation.test.mjs
pnpm --filter @workspace/media-organiser desktop:package
release_dir=$(mktemp -d)
trap 'rm -rf "$release_dir"' EXIT
version=$(node -p "JSON.parse(require('fs').readFileSync('artifacts/media-organiser/package.json', 'utf8')).version")
package_name="Media-Organiser-${version}-linux-x86_64.AppImage"
ln -s "$PWD/generated-artifacts/desktop/$package_name" "$release_dir/$package_name"
node artifacts/media-organiser/desktop/publish-downloads.mjs "$release_dir"
pnpm --filter @workspace/media-organiser desktop:export
