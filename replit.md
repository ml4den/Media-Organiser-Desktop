# Media Organiser

A local-first cross-platform desktop utility based on the user's PowerShell media organiser, with a browser preview of the same interface.

## Run & Operate

- `pnpm --filter @workspace/media-organiser desktop:start` — build the renderer and launch Electron locally on a graphical desktop
- `pnpm --filter @workspace/media-organiser desktop:package` — build self-contained packages on the target OS
- `pnpm --filter @workspace/media-organiser desktop:downloads` — expose checked packages with checksums in the download area
- `pnpm --filter @workspace/media-organiser desktop:build` then `desktop:export` — refresh the downloadable desktop project ZIP
- Preview workflow: `artifacts/media-organiser: web`
- Desktop documentation: `artifacts/media-organiser/README.md`

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Media Organiser needs no database, secrets, accounts or external integrations. The shared API template is unused by this product.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- The desktop app is the primary product; browser mode is a useful preview, not a substitute for native filesystem access. **Why:** the user asked for a cross-platform desktop app operating on local media.
- Browser previews must not upload personal files or pretend to move them. ZIP export provides useful local-only functionality when write permissions are unavailable.
- Copy + rename is the safe default rather than the original script's Move + forced overwrite. Destructive choices require explicit confirmation.
- Dates remain strict media-metadata dates, not guessed filesystem or filename dates. Structured ExifTool values replace locale-dependent Windows shell date strings.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- The user values customisable processing and personally prefers `YYYY/MM/media-files-here`, while wanting other users to be able to choose a custom folder hierarchy.
- Keep the app simple and intuitive, with source/destination selection and drag-and-drop files and folders.
- Downloads must be self-contained packages with all application dependencies included, not source projects requiring users to install development tools. **Why:** the user explicitly requested this.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
