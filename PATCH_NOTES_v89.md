# Wormhole Alpha-0.0.90 - Production Build Pipeline

Alpha-0.0.90 adds a production build system while preserving the readable modular source introduced in 0.0.88.

## Changes
- Added an esbuild production pipeline.
- Bundles and minifies browser JavaScript for deployment.
- Minifies CSS during the build.
- Generates content-hashed production asset filenames for automatic cache busting.
- Keeps Cloudflare Pages Functions separate from browser bundles and copies them into the deployable output.
- Produces a `dist/` directory intended for production deployment.
- Generates `dist/build-manifest.json` so deployed asset names can be inspected.
- Keeps source maps disabled in the public production build.
- Added `npm run build` and `npm run check` commands.
- Advanced release metadata and browser cache identifiers to Alpha-0.0.90.

## Deployment
Run `npm install`, then `npm run check`. Deploy the generated `dist/` directory to Cloudflare Pages while retaining the included Functions support.
