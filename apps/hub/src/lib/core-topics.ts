import "server-only";

/**
 * core-topics — shared server-side resolution of syllabai-core curriculum
 * identity (ADR-029 tranche 4: the 4CH1 bridge).
 *
 * Both core-wiring consumers (the CLA proxy and the question bridge) need the
 * same two joins — course code → subject rootId, and tree code → topicNodeId —
 * against core's curriculum read models. This module owns them once, with the
 * same in-process caching the CLA proxy used when it was the only consumer:
 *
 *   - subjects list: 5 min TTL (curriculum identity is deploy-immutable in
 *     practice; the TTL only exists so a redeploy of core is picked up
 *     without a hub restart); a failed refetch falls back to the stale list
 *   - rootId by code: positive hits memoized per process; MISSES ARE NEVER
 *     memoized — a Render cold start (fetch timeout/non-200) must poison
 *     neither the next request on this instance nor, via a cached null,
 *     the question bridge for its lifetime
 *   - topic tree: fetched once per root, every node indexed by code
 *
 * All fetches forward the CALLER's bearer token (these read models are
 * authenticated) and return null on any failure — callers degrade honestly,
 * they never hang.
 */
import { coreBaseUrl } from "./core-proxy";
import { v2SurfaceBase } from "./api";
import { pickSubjectRoot, type SubjectView } from "./subject-root";

// the pure selection law + the subject wire view live in ./subject-root
// (unit-testable without the server-only boundary); re-exported here so the
// historical import path stays stable for callers.
export { pickSubjectRoot } from "./subject-root";
export type { SubjectView } from "./subject-root";

export interface NodeView {
  id: string;
  code: string;
  type: string;
  title: string;
  children?: NodeView[];
}

let subjectsCache: { at: number; subjects: SubjectView[] } | null = null;
// key `${code}\u0000${curriculumCode ?? ""}` — the cv pin is part of the
// resolution identity (T-SM-ROLLOUT-0452 r0): two same-code subjects with
// different pins must never share a memo slot.
const subjectRootByCode = new Map<string, string | null>();
const topicIdByCode = new Map<string, string>(); // `${rootId}:${code}` → nodeId

/** Server-side curriculum-read GET with the caller's token; null on any
 *  failure. T-MIG-120: the decision is TABLE-GOVERNED — v2 first (the path's
 *  flip row resolves: /api/v1/curriculum/subjects rides the Wave-1 row, the
 *  knowledge tree rides the 084 row), core only on rollback (the v2 env var
 *  unset — MIGRATION_PLAN §7, the claAskFetch class). The historical name is
 *  kept as the lane anchor; the run-001 two-plane battery (shared-Neon
 *  direct parity) is the capture of record for both paths it serves. */
export async function fetchCoreJson<T>(
  path: string,
  token: string | null,
  timeoutMs = 30_000,
): Promise<T | null> {
  const v2Base = v2SurfaceBase(path, process.env.NEXT_PUBLIC_API_V2_BASE_URL);
  const base = v2Base ?? coreBaseUrl();
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Course code (e.g. "4CH1") → the subject's knowledge-tree rootId.
 *
 * `curriculumCode` (optional, the registry row's cv pin — e.g.
 * "0452-2023-2025") disambiguates codes that legitimately map to several
 * subject rows, one per curriculum version (T-SM-BRIDGE-WIDEN r0's
 * "0452_duplicate_subject_code_ambiguity" exclusion; the selection law is
 * pickSubjectRoot in ./subject-root). Selection misses — including the
 * ambiguous-without-pin refusal — are NEVER memoized, per the module law:
 * a cached null must not outlive the request that earned it. */
export async function rootIdForCourseCode(
  code: string,
  token: string | null,
  curriculumCode?: string | null,
): Promise<string | null> {
  const memoKey = `${code}\u0000${curriculumCode ?? ""}`;
  const memoized = subjectRootByCode.get(memoKey);
  if (memoized) return memoized;
  const stale = !subjectsCache || Date.now() - subjectsCache.at > 300_000;
  if (stale) {
    const subjects = await fetchCoreJson<SubjectView[]>("/api/v1/curriculum/subjects", token);
    if (subjects) subjectsCache = { at: Date.now(), subjects };
  }
  // A failed refetch deliberately falls through to the stale list: curriculum
  // identity is deploy-immutable, so a stale root beats a fabricated null.
  const hit = subjectsCache
    ? pickSubjectRoot(subjectsCache.subjects, code, curriculumCode)
    : null;
  const rootId = hit?.knowledgeNodeId ?? null;
  if (rootId) subjectRootByCode.set(memoKey, rootId);
  return rootId;
}

/** Walk the core tree once per root, indexing every node by code. */
export async function topicNodeIdForCode(
  rootId: string,
  code: string,
  token: string | null,
): Promise<string | null> {
  const key = `${rootId}:${code}`;
  if (topicIdByCode.has(key)) return topicIdByCode.get(key) ?? null;
  const tree = await fetchCoreJson<NodeView>(
    `/api/v1/knowledge/nodes/${rootId}/tree?includeMisconceptions=false`,
    token,
  );
  if (!tree) return null;
  const walk = (node: NodeView) => {
    topicIdByCode.set(`${rootId}:${node.code}`, node.id);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return topicIdByCode.get(key) ?? null;
}
