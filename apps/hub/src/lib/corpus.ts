/**
 * Corpus loader (server-only) — the bundle-offload seam.
 *
 * WHY THIS EXISTS (perf/hub-bundle-offload band, operator order
 * "offload the ~102MB corpus from hub function bundles"): the hub reads the
 * committed `content/` (~185MB across 95 courses) and `content-maps/`
 * (~36MB) trees at runtime through fs calls whose dynamic segments
 * (`content/<slug>/notes.json`) made the file tracer include the whole tree
 * into every bundle. `lib/courses.ts` is imported by ~35 page/route
 * functions, so EVERY function bundle carried a full corpus copy — measured
 * at c455906: 68 routes, 10.4GB of traced bytes, 9.99GB of it corpus
 * (≈ the observed ~2.04GB per Vercel deployment after lambda zip
 * compression).
 *
 * THE MECHANISM (attempt r0.5, measurement-driven — receipt:
 * download/offload_trace_*.json):
 *
 *   1. The fs roots stay HONEST resolvable cwd-literals — one NAMED const
 *      per tree, flowing DIRECTLY into each fs call, the exact dataflow
 *      shape the baseline used (`CONTENT_DIR` → `path.join(dir, f)`), which
 *      the tracer resolves into a PRECISE per-dir glob with no fallback.
 *      Four opacity/indirection attempts were built and measured and ALL
 *      backfired by triggering Turbopack's "Dynamic filesystem access
 *      causes tracing of the whole project" sweep (env-composed root,
 *      getBuiltinModule handle, computed module id, and a
 *      Record<CorpusRoot,string> lookup feeding the calls): 22.6GB traced,
 *      worse than baseline. The tracer is happy only with the literal
 *      const→call shape; give it that and take the bytes out later.
 *
 *   2. The corpus leaves the PACKAGED functions via the native knob:
 *      next.config's outputFileTracingExcludes strips content/**,
 *      content-maps/**, the public/corpus copies and public/kg/data from
 *      every route's trace. Prerendering at build time is unaffected — the
 *      build container has the trees on disk.
 *
 *   3. Runtime lambdas therefore find NO corpus on disk and this loader
 *      heals to the fetch plane: the build step (scripts/
 *      build_corpus_static.mjs) copies content/ → public/corpus and
 *      content-maps/ → public/corpus-maps, served as static CDN assets.
 *      Files under public/ upload ONCE per deployment as static assets —
 *      not per function — so the deployment carries the corpus exactly
 *      once instead of once per function.
 *
 * PLANE SELECTION: fs is used when the tree exists next to the app
 * (existsSync gate — build container, dev checkout, self-host standalone
 * with the copied trees). On a Vercel lambda content/ is not in the
 * package, so every read misses to the fetch plane. The ENOENT heal below
 * covers any residual edge (tree half-present etc.).
 *
 * SELF-FETCH SAFETY: the fetch origin is the deployment's own URL
 * (HUB_CORPUS_STATIC_ORIGIN override, else VERCEL_URL — both auto-provided
 * on Vercel). `/corpus/*` and `/corpus-maps/*` live under public/, so they
 * are served by the static CDN layer and never re-enter a lambda — no
 * recursion; previews fetch their own deployment's copy.
 *
 * CACHING: corpus files are committed and immutable between deploys
 * (ADR-021 discipline), so fetches use `next: { revalidate: 300 }` — the
 * same 300s bounded staleness the CDN responses already declare.
 */
import "server-only";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The three corpus roots — named cwd-literals. Do NOT merge these into a
 * Record/map or route them through variables: the measured r0.x attempts
 * show any indirection between the literal and the fs call flips the
 * tracer into whole-project sweep mode.
 */
const CONTENT_DIR = path.join(process.cwd(), "content");
const CONTENT_MAPS_DIR = path.join(process.cwd(), "content-maps");
const KG_DATA_DIR = path.join(process.cwd(), "public", "kg", "data");

/** The static origin serving public/corpus (fetch plane), or null. */
function corpusStaticOrigin(): string | null {
  const configured = process.env.HUB_CORPUS_STATIC_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

function staticUrl(urlPrefix: string, rel: string): string {
  const cleanRel = rel.replace(/^\/+/, "");
  return `${corpusStaticOrigin()}${urlPrefix}/${cleanRel}`;
}

async function fetchStaticJson<T>(urlPrefix: string, rel: string): Promise<T | null> {
  const origin = corpusStaticOrigin();
  if (!origin) return null;
  try {
    const res = await fetch(staticUrl(urlPrefix, rel), {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchStaticExists(urlPrefix: string, rel: string): Promise<boolean> {
  const index = await corpusIndex();
  if (!index) return false;
  const cleanRel = rel.replace(/^\/+/, "");
  return index.has(`${urlPrefix}/${cleanRel}`);
}

// ── public API: one specialized pair per tree (tracer-visible dataflow) ───

/**
 * Read a JSON file from the committed content/ tree, e.g.
 * loadContentJson("igcse-chemistry-19/notes.json").
 * Returns null when the file does not exist on either plane.
 */
export async function loadContentJson<T = unknown>(rel: string): Promise<T | null> {
  if (existsSync(CONTENT_DIR)) {
    try {
      const raw = await readFile(path.join(CONTENT_DIR, rel), "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      // tree present but the file is missing → heal to the fetch plane; a
      // genuinely absent file resolves to null below, matching the old
      // existsSync/readFile contracts.
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.error(`[corpus] fs read failed for content/${rel}`, err);
        return null;
      }
    }
  }
  return fetchStaticJson<T>("/corpus", rel);
}

/** Existence probe for content/ files (the old hasBundle existsSync). */
export async function hasContentFile(rel: string): Promise<boolean> {
  if (existsSync(path.join(CONTENT_DIR, rel))) return true;
  return fetchStaticExists("/corpus", rel);
}

/** Read a JSON file from the committed content-maps/ tree. */
export async function loadContentMapJson<T = unknown>(rel: string): Promise<T | null> {
  if (existsSync(CONTENT_MAPS_DIR)) {
    try {
      const raw = await readFile(path.join(CONTENT_MAPS_DIR, rel), "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.error(`[corpus] fs read failed for content-maps/${rel}`, err);
        return null;
      }
    }
  }
  return fetchStaticJson<T>("/corpus-maps", rel);
}

/** Read a JSON file from public/kg/data (already static at /kg/data). */
export async function loadKgDataJson<T = unknown>(rel: string): Promise<T | null> {
  if (existsSync(KG_DATA_DIR)) {
    try {
      const raw = await readFile(path.join(KG_DATA_DIR, rel), "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.error(`[corpus] fs read failed for kg/${rel}`, err);
        return null;
      }
    }
  }
  return fetchStaticJson<T>("/kg/data", rel);
}

/**
 * Existence probe for public/kg/data files (the old hasGraph existsSync).
 * Fetch plane consults the build-generated corpus index instead of issuing
 * per-file HEADs.
 */
export async function hasKgDataFile(rel: string): Promise<boolean> {
  if (existsSync(path.join(KG_DATA_DIR, rel))) return true;
  return fetchStaticExists("/kg/data", rel);
}

// ── corpus index (fetch-plane existence) ──────────────────────────────────

let indexPromise: Promise<Set<string> | null> | null = null;

/**
 * The build step writes public/corpus-index.json: every corpus file as
 * `{ urlPrefix }/{ rel }` entries. One ~40KB fetch replaces 95+ HEAD probes
 * on the KG picker and hasBundle checks.
 */
async function corpusIndex(): Promise<Set<string> | null> {
  const origin = corpusStaticOrigin();
  if (!origin) return null;
  indexPromise ??= (async () => {
    try {
      const res = await fetch(`${origin}/corpus-index.json`, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return null;
      const list = (await res.json()) as string[];
      return new Set(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("[corpus] index fetch failed — existence probes degrade to false", err);
      return null;
    }
  })();
  return indexPromise;
}
