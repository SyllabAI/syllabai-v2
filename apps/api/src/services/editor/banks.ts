/**
 * Editor banks inventory — ADR-044 run-011 (GET /api/v1/editor/banks).
 *
 * "GET /banks — the corpus inventory derived from the resources HEAD,
 * read-only" (ADR §8). The core has no corpus plane of its own, so the
 * inventory derives LIVE from the corpus of record's git HEAD through
 * read-only GitHub REST — the SAME transport the hub's editor-history lib
 * uses (SyllabAI/syllabai-resources is a public repo; unauthenticated by
 * default, an optional GITHUB_TOKEN raises the rate ceiling; 60 req/h per
 * instance unauthenticated, so the inventory caches in-module for 5
 * minutes — the editor-history revalidate law).
 *
 * What is SIMULATED in Phase 2 (disclosed on every response): the PR/merge
 * transport only. This read path is real; no corpus byte is written by
 * anything on the editor plane (E-0).
 *
 * Derivation law of record (pure functions, pinned by banks.test.ts):
 *   - questions: `SME-ExamQuestion/<course>/<section>/<topic>/questions.md`
 *     (the corpusBankPathOfRecord structural law, verbatim) — one count per
 *     bank file. Official paper sets are excluded in Phase 2 (their dirs
 *     carry no course slug of record) — disclosed on every response.
 *   - notes:     `SME-RevisionNotes/<course>/...` markdown files.
 *   - flashcards:`SME-Flashcards/<course>/...` markdown files.
 *   - the course vocabulary = the union of the three planes' course dirs.
 *
 * Typed upstream failures (the editor-history error class, verbatim):
 * not_found / rate_limited / upstream_unavailable — the router renders
 * 502s; a failure NEVER serves a stale inventory as current.
 */
import { createHash } from "node:crypto";

export const RESOURCES_REPO = "SyllabAI/syllabai-resources";

export type BankHistoryErrorCode = "not_found" | "rate_limited" | "upstream_unavailable";

export class BanksInventoryError extends Error {
  constructor(
    public readonly code: BankHistoryErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface BankCounts {
  questions: number;
  notes: number;
  flashcards: number;
}

export interface BankInventory {
  headSha: string;
  fetchedAt: string;
  truncated: boolean;
  courses: Array<{ slug: string; counts: BankCounts }>;
}

// ── the derivation law (pure; pinned) ────────────────────────────────────────

const QUESTION_RE = /^SME-ExamQuestion\/([a-z0-9-]+)\/[^/]+\/[^/]+\/questions\.md$/;
const NOTE_RE = /^SME-RevisionNotes\/([a-z0-9-]+)\/.+$/;
const FLASHCARD_RE = /^SME-Flashcards\/([a-z0-9-]+)\/.+$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface TreeEntry {
  path: string;
  type: string;
}

/** The inventory of record from a (possibly truncated) recursive tree.
 * Course slugs are the union of the three SME planes; README.md never
 * counts; a path that matches no plane law is ignored (the corpus carries
 * lane artifacts — receipts, runbooks — that are not editor banks). */
export function deriveInventory(headSha: string, tree: TreeEntry[], truncated: boolean): BankInventory {
  const counts = new Map<string, BankCounts>();
  const bump = (slug: string, key: keyof BankCounts) => {
    const c = counts.get(slug) ?? { questions: 0, notes: 0, flashcards: 0 };
    c[key] += 1;
    counts.set(slug, c);
  };
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const p = entry.path;
    const q = QUESTION_RE.exec(p);
    if (q?.[1]) {
      bump(q[1], "questions");
      continue;
    }
    const n = NOTE_RE.exec(p);
    if (n?.[1] && !p.endsWith("/README.md")) {
      bump(n[1], "notes");
      continue;
    }
    const f = FLASHCARD_RE.exec(p);
    if (f?.[1] && !p.endsWith("/README.md")) {
      bump(f[1], "flashcards");
      continue;
    }
  }
  const courses = [...counts.entries()]
    .filter(([slug]) => SLUG_RE.test(slug))
    .map(([slug, c]) => ({ slug, counts: c }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    headSha,
    fetchedAt: new Date().toISOString(),
    truncated,
    courses,
  };
}

/** The propose-time freshness evidence: sha256 of the field delta (the
 * receipt's before/after hashes — hex, 64 chars, never the raw values). */
export function fieldHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// ── the live fetch (the one I/O seam; the router maps its errors) ────────────

interface CachedInventory {
  inventory: BankInventory;
  expiresAt: number;
}

let cache: CachedInventory | null = null;
/** Test seam: forget the cached inventory. */
export function resetBanksCache(): void {
  cache = null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

function githubHeaders(env: Record<string, string | undefined>): HeadersInit {
  const token = env["GITHUB_TOKEN"] ?? env["GH_TOKEN"];
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function fetchJson(url: string, env: Record<string, string | undefined>): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: githubHeaders(env),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new BanksInventoryError("upstream_unavailable", "the corpus of record is unreachable");
  }
  if (res.status === 404) {
    throw new BanksInventoryError("not_found", "the corpus of record HEAD was not found");
  }
  if (res.status === 403 || res.status === 429) {
    throw new BanksInventoryError("rate_limited", "the GitHub REST ceiling is exhausted for this instance");
  }
  if (!res.ok) {
    throw new BanksInventoryError("upstream_unavailable", `the corpus HEAD fetch failed (status ${res.status})`);
  }
  return (await res.json().catch(() => null)) as unknown;
}

/** The live inventory of record (cached 5 minutes per instance). */
export async function fetchBankInventory(env: Record<string, string | undefined>): Promise<BankInventory> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.inventory;
  const head = (await fetchJson(`https://api.github.com/repos/${RESOURCES_REPO}/commits/main`, env)) as {
    sha?: unknown;
  } | null;
  const sha = typeof head?.sha === "string" ? head.sha : null;
  if (!sha) throw new BanksInventoryError("upstream_unavailable", "the corpus HEAD response carried no sha");
  const tree = (await fetchJson(
    `https://api.github.com/repos/${RESOURCES_REPO}/git/trees/${sha}?recursive=1`,
    env,
  )) as { tree?: unknown; truncated?: unknown } | null;
  if (!tree || !Array.isArray(tree.tree)) {
    throw new BanksInventoryError("upstream_unavailable", "the corpus tree response carried no tree");
  }
  const entries = tree.tree.filter(
    (t): t is TreeEntry =>
      !!t && typeof t === "object" && typeof (t as TreeEntry).path === "string" && typeof (t as TreeEntry).type === "string",
  );
  const inventory = deriveInventory(sha, entries, tree.truncated === true);
  cache = { inventory, expiresAt: now + CACHE_TTL_MS };
  return inventory;
}
