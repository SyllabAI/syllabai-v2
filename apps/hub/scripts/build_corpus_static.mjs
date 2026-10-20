#!/usr/bin/env node
/**
 * Bundle-offload build step (perf/hub-bundle-offload band).
 *
 * Copies the committed corpus trees into public/ so the runtime fetch plane
 * of src/lib/corpus.ts can serve them as static CDN assets:
 *
 *   content/      → public/corpus/       (served at /corpus/*)
 *   content-maps/ → public/corpus-maps/  (served at /corpus-maps/*)
 *   public/kg/data → already static (served at /kg/data/*) — indexed only
 *
 * and writes public/corpus-index.json — every corpus file as
 * "{urlPrefix}/{rel}" entries — the one fetch that powers fetch-plane
 * existence probes (hasBundle / hasGraph) without per-file HEAD requests.
 *
 * The corpus stays the git-tracked source of truth; these copies are build
 * artifacts (gitignored). Under public/ they are uploaded ONCE per
 * deployment as static assets instead of being copied into every serverless
 * function package by the file tracer — the ~2GB/deploy multiplier is the
 * thing this step retires. Deterministic: wipes + rewrites every run.
 *
 * Runs BEFORE `next build` (wired in package.json) so prerenders see the
 * static files, and so a mid-build read never races the copy.
 */
import { cpSync, rmSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const appRoot = process.cwd();

const TREES = [
  { src: "content", dest: "public/corpus", urlPrefix: "/corpus" },
  { src: "content-maps", dest: "public/corpus-maps", urlPrefix: "/corpus-maps" },
];

/** urlPrefix-relative files already static under public/ (indexed, not copied). */
const ALREADY_STATIC = [
  { src: "public/kg/data", urlPrefix: "/kg/data" },
];

function listFilesRecursively(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursively(full));
    else out.push(full);
  }
  return out;
}

const index = [];
let copiedBytes = 0;

for (const tree of TREES) {
  const src = join(appRoot, tree.src);
  const dest = join(appRoot, tree.dest);
  if (!existsSync(src)) {
    console.error(`[corpus-static] MISSING source tree ${tree.src} — refusing to build a corpus-less deployment`);
    process.exit(1);
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  for (const f of listFilesRecursively(src)) {
    copiedBytes += statSync(f).size;
    index.push(tree.urlPrefix + "/" + relative(src, f).split(sep).join("/"));
  }
  console.log(`[corpus-static] ${tree.src} → ${tree.dest} (${index.length} entries so far)`);
}

for (const tree of ALREADY_STATIC) {
  const src = join(appRoot, tree.src);
  for (const f of listFilesRecursively(src)) {
    index.push(tree.urlPrefix + "/" + relative(src, f).split(sep).join("/"));
  }
}

const outPath = join(appRoot, "public", "corpus-index.json");
writeFileSync(outPath, JSON.stringify(index));

console.log(
  `[corpus-static] done: ${(copiedBytes / 1024 / 1024).toFixed(1)}MB copied as static assets, ` +
    `${index.length} index entries → public/corpus-index.json`,
);
