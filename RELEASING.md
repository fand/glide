# Releasing

1. Make sure `@vfx-js/core` in `package.json` is a published version, not a `link:` or `file:` path:

   ```
   $ grep vfx-js package.json
   ```

2. Bump `version` in `package.json` (e.g. `0.1.1`, `0.2.0`, `0.2.0-next.0`).
3. Move the `Unreleased` notes in `CHANGELOG.md` under the new version and date.
4. Check the package contents:

   ```
   $ pnpm install --frozen-lockfile
   $ pnpm pack --dry-run      # dist/cli.js, dist/glide.js, dist/glide.iife.js, dist/types/**, README.md, LICENSE
   ```

5. Publish. `prepublishOnly` runs typecheck, tests and build.

   ```
   $ pnpm publish --tag next  # prerelease (alpha, beta, rc)
   $ pnpm publish             # stable
   ```

6. Tag and push:

   ```
   $ git tag v2.x.y
   $ git push origin v2.x.y
   ```
