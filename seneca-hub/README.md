# Seneca hub images — harvested display assets (Task 40)

- 8,139 images harvested from image-v2.cdn.app.senecalearning.com (public CDN, no auth)
  sourced from `seneca-image-cdn:///` + absolute URLs in seneca_resources content.
- Small originals (<350KB) stored byte-for-byte (.png/.jpg/.gif); larger ones
  downscaled to max 1000px WebP q80. Total ~693MB.
- `manifest.jsonl`: {key, url, file, origBytes, width, height, finalSize} —
  key = rewrite identity (seneca-image-cdn:///... or absolute URL).
- `failures.json`: 752 unreachable (mostly `courseImages/*` + `memory-location-images/*`
  which 404 upstream even with redirect resolution — decorative covers only).
- Served by the app from /seneca-images/<file>; rewriting via src/lib/seneca-images.ts.
