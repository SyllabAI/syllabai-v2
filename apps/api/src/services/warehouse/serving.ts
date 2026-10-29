/**
 * The warehouse serving seam — T-OPS-PLANE-001 run-004 (the serving flip
 * build, operator directive "go on the serving flip build").
 *
 * Laws of record (read before touching):
 *   - docs/ADR-038-COURSE_GROUP_VECTOR_WAREHOUSES.md §3.3/§5.3/§5.5: one
 *     Neon project per course GROUP; a static course_slug → warehouse map
 *     lives in MAIN (the `warehouse_registry` table, migration 0013); the
 *     tutor retrieval seam "flips warehouse-first per course behind a
 *     flag"; cross-warehouse queries are forbidden by construction — a
 *     course lives in exactly one group.
 *   - docs/DATA-PLANE-PLACEMENT.md §4: retrieval is two-step — warehouse
 *     vector_search → ids → hydrate by id on MAIN. "Ids are the contract."
 *     Hydration is batched (no N+1; pooler RTT is the budget). Warehouse
 *     credentials are env-only, never committed — the registry row stores
 *     the ENV VAR NAME, never the URL.
 *   - scripts/provisioner/template.sql (frozen wh-v1): the seam query of
 *     record is `select id from warehouse_chunks where course_group = $1
 *     [and kind = $2] order by embedding <=> $3 limit $4`, and warehouses
 *     receive rows regardless of validation state — the SERVING-ELIGIBILITY
 *     AUTHORITY STAYS ON MAIN (embed_rev read filter + the VALIDATED-only
 *     scope EXISTS). This module hydrates with the verbatim
 *     searchServingEligible predicate so a validation-state change made
 *     AFTER a warehouse copy is honored at serving time, exactly as it is
 *     on the main plane.
 *
 * The flip law (how serving moves, and back):
 *   1. Build-time master switch SYLLABAI_WAREHOUSE_SERVING — exactly "on"
 *      enables the seam; anything else (including absent) builds a NULL
 *      seam and every surface keeps the verbatim main-plane path. This is
 *      the one-env emergency rollback that works even without DB access.
 *   2. Per-group flip: UPDATE warehouse_registry SET status='SERVING'
 *      (revert: back to 'ASSIGNED'). A data change in main — instant,
 *      auditable, no redeploy. Statuses: ASSIGNED | SERVING | RETRIRED.
 *
 * Coverage law (v1, deliberately conservative): a curriculum-version scope
 * routes to the warehouse plane ONLY when EVERY subject under the version
 * has a SERVING registry row with a resolvable URL env. Partial coverage
 * keeps the WHOLE scope on main — until the T1 zero-residue drop main still
 * holds every chunk, so the main path is always a complete answer. The
 * mixed-scope fan-out (some groups warehouse, some main) is a later
 * receipted step, not a v1 behavior.
 *
 * Failure posture (never a silent degradation):
 *   - registry row SERVING but its URL env is missing/blank → THROW.
 *     A misconfigured flip must fail loud: by the time a SERVING row
 *     exists, main's corpus may already be dropped (T1), and a silent
 *     main-path fallback would serve an EMPTY corpus as if it were truth.
 *   - warehouse transport failure → PROPAGATES (the frozen vector-arm
 *     law: only the provider-absent case degrades, never a transport).
 *   - registry table ABSENT (migration not yet applied) → the flip is
 *     simply not provisioned → null routing → main path, logged once.
 *     This is honest degradation by construction: pre-provisioning, main
 *     holds the complete corpus.
 *
 * Recalled candidates: the warehouse step-1 fetches limit × OVERFETCH
 * candidates (SYLLABAI_WAREHOUSE_OVERFETCH, default 3, clamp 1..10) BEFORE
 * the main-side eligibility predicate shrinks them — the same top-K of the
 * eligible set as the main plane except at the recall margin (rows ranked
 * below the candidate cap cannot surface). The 4MA1 plane is 6,872
 * embedded rows (run-003), so the default cap (150 at the content limit of
 * 50, 36 at the tutor's 12) is deep. Pinned as a known margin in the
 * run-004 receipt; measured live by scripts/provisioner/probe-serving-flip.mjs.
 *
 * The MIN_COSINE floor, rank fusion, rerank, spec-boost and the 133d
 * page-truth translation stay DOWNSTREAM (vector-arm/karag) — this module
 * only replaces WHERE the cosine order comes from, never WHAT qualifies.
 */

import type { DocumentKind } from "@syllabai/contracts";
import { createSql, type SqlFn } from "../identity/users";

/** CURRENT_EMBED_REV = 2 (ChunkVectorRepository.java:64) — read filter of
 *  the verbatim hydration predicate. Keep byte-identical with
 *  services/content/retrieval.ts. */
const EMBED_REV = 2;

/** The env-var master switch: exactly "on" enables the seam. */
const MASTER_SWITCH = "SYLLABAI_WAREHOUSE_SERVING";
const OVERFETCH_ENV = "SYLLABAI_WAREHOUSE_OVERFETCH";
const CACHE_MS_ENV = "SYLLABAI_WAREHOUSE_CACHE_MS";
const DEFAULT_OVERFETCH = 3;
const DEFAULT_CACHE_MS = 30_000;

/** One serving-covered course group resolved for a scope. */
interface ServingGroup {
  courseGroup: string;
  urlEnv: string;
}

/** The input the two-step seam resolves. `kind` mirrors the surface's
 *  DocumentKind filter (tutor passes null — kind-agnostic by design). */
export interface WarehouseSearchInput {
  vector: number[];
  kind: DocumentKind | null;
  curriculumVersionId: string;
  limit: number;
}

/**
 * The seam port both serving surfaces consume. searchRows resolves:
 *   - null            → not covered / not provisioned → the caller keeps
 *                       its verbatim main-plane path (the "not mine" law);
 *   - rows            → the two-step seam result, shaped as the superset
 *                       row both surfaces read (id, document_row_id,
 *                       doc_version, document_id, kind, chunk_index,
 *                       content, page_start, page_end, element_ids,
 *                       spec_codes, embedding_model, score), ordered by
 *                       warehouse cosine DESC, trimmed to `limit`.
 * Transport/config failures THROW — never a silent main fallback.
 */
export interface WarehouseServingSeam {
  searchRows(input: WarehouseSearchInput): Promise<Array<Record<string, unknown>> | null>;
}

/** Rig seam — the composition root injects createSql; tests inject fakes. */
export interface WarehouseSeamDeps {
  clientFactory?: (warehouseUrl: string) => SqlFn;
}

interface RegistryRow {
  course_group: string;
  subject_id: string;
  warehouse_url_env: string;
}

export function buildWarehouseServingSeam(
  sql: SqlFn,
  env: Record<string, string | undefined>,
  deps: WarehouseSeamDeps = {},
): WarehouseServingSeam | null {
  if (env[MASTER_SWITCH] !== "on") return null;

  const clientFactory = deps.clientFactory ?? ((url: string) => createSql(url));
  const clients = new Map<string, SqlFn>();
  const overfetch = Math.min(
    Math.max(Number(env[OVERFETCH_ENV] ?? DEFAULT_OVERFETCH) || DEFAULT_OVERFETCH, 1),
    10,
  );
  const cacheMs = Number(env[CACHE_MS_ENV] ?? DEFAULT_CACHE_MS) || DEFAULT_CACHE_MS;

  let registryCache: { at: number; rows: RegistryRow[] | null } | null = null;
  const coverageCache = new Map<string, { at: number; groups: ServingGroup[] | null }>();

  function clientFor(urlEnv: string): SqlFn {
    const url = env[urlEnv];
    if (url == null || url.trim() === "") {
      // fail loud — see the module header's failure posture
      throw new Error(
        `warehouse serving misconfigured: registry status is SERVING but env ${urlEnv} is blank — ` +
          `refusing to serve an empty corpus from main. Set the URL env or flip the row back to ASSIGNED.`,
      );
    }
    const cached = clients.get(urlEnv);
    if (cached) return cached;
    const built = clientFactory(url);
    clients.set(urlEnv, built);
    return built;
  }

  async function registryRows(): Promise<RegistryRow[] | null> {
    const now = Date.now();
    if (registryCache && now - registryCache.at < cacheMs) return registryCache.rows;
    try {
      const rows = (await sql`
        select course_group, subject_id, warehouse_url_env
        from warehouse_registry
        where status = 'SERVING'`) as unknown as RegistryRow[];
      registryCache = { at: now, rows };
      return rows;
    } catch (err) {
      const message = String((err as Error)?.message ?? err);
      if (/does not exist/i.test(message)) {
        // migration 0013 not applied yet — the flip is not provisioned.
        // Cache the negative; every scope keeps the main path.
        console.warn(
          "[warehouse-serving] warehouse_registry not present — serving flip not provisioned, main plane serves",
        );
        registryCache = { at: now, rows: null };
        return null;
      }
      throw err;
    }
  }

  /** The coverage law: EVERY subject under the version must have a SERVING
   *  registry row whose URL env resolves. Returns null when not covered. */
  async function servingGroupsFor(curriculumVersionId: string): Promise<ServingGroup[] | null> {
    const registry = await registryRows();
    if (registry == null || registry.length === 0) return null;
    const cached = coverageCache.get(curriculumVersionId);
    const now = Date.now();
    if (cached && now - cached.at < cacheMs) return cached.groups;

    const rows = (await sql`
      select s.id as subject_id, r.course_group as course_group, r.warehouse_url_env as warehouse_url_env
      from subjects s
      left join warehouse_registry r
        on r.subject_id = s.id and r.status = 'SERVING'
      where s.curriculum_version_id = ${curriculumVersionId}`) as unknown as Array<{
      subject_id: string;
      course_group: string | null;
      warehouse_url_env: string | null;
    }>;
    const bySubject = new Map(registry.map((r) => [r.subject_id, r]));
    const groups: ServingGroup[] = [];
    for (const row of rows) {
      // registry row for this subject (belt-and-braces against the join
      // drifting from the registry cache within a TTL window)
      const pinned = bySubject.get(row.subject_id);
      const urlEnv = pinned?.warehouse_url_env ?? row.warehouse_url_env;
      if (row.course_group == null || urlEnv == null) {
        coverageCache.set(curriculumVersionId, { at: now, groups: null });
        return null; // one uncovered subject keeps the WHOLE scope on main
      }
      groups.push({ courseGroup: row.course_group, urlEnv });
    }
    const resolved = rows.length === 0 ? null : groups;
    coverageCache.set(curriculumVersionId, { at: now, groups: resolved });
    return resolved;
  }

  /** The kind filter folds into the SQL text — never an untyped NULL bind
   *  (the house law both retrieval.ts and vector-arm.ts carry). NOTE: a
   *  ${} slot BINDS — the fold must splice into the static parts (see the
   *  tagged() disclosure in services/content/retrieval.ts). */
  function kindFilterSql(kind: DocumentKind | null): string {
    return kind == null ? "" : `\n            and kind = '${kind}'`;
  }

  function tagged(parts: string[]): TemplateStringsArray {
    return Object.assign([...parts], { raw: [...parts] }) as unknown as TemplateStringsArray;
  }

  return {
    async searchRows(input) {
      const groups = await servingGroupsFor(input.curriculumVersionId);
      if (groups == null) return null;

      const literal = `[${input.vector.join(",")}]`;
      const candidateLimit = Math.max(1, Math.round(input.limit)) * overfetch;

      // STEP 1 — the warehouse plane: cosine order per course group (the
      // frozen template's seam query of record; a group's chunks never
      // span warehouses, so one query per covered group, never cross-
      // warehouse).
      const scored = new Map<string, number>();
      for (const group of groups) {
        const wh = clientFor(group.urlEnv);
        // the frozen template's seam query of record — kind folded as TEXT
        // (a ${} slot would bind the fold and Postgres would reject it)
        const rows = (await wh(
          tagged([
            `select id, 1 - (embedding <=> `,
            `::vector) as score
          from warehouse_chunks
          where course_group = `,
            `${kindFilterSql(input.kind)}
            and embedding is not null
          order by embedding <=> `,
            `::vector
          limit `,
            "",
          ]),
          literal,
          group.courseGroup,
          // T-OPS-PLANE-001 run-008 REPAIR (first live execution of this path
          // during the T1 flip check caught it): the parts array has FOUR
          // bind slots — select vector, course group, ORDER-BY vector (the
          // SQL reuses the literal twice), limit. The shipped code passed
          // only THREE params, so candidateLimit landed in the order-by
          // position and `limit` was left empty -> Postgres 42601 "syntax
          // error at end of input" (position 216) = guaranteed 500 on EVERY
          // covered-group ask. The run-004 live probe never caught it: it
          // ran the rig path (hand-built query), not this function, and the
          // unit fakes do not validate template arity. Transport-only fix —
          // SQL text byte-identical, the missing second literal bind.
          literal,
          candidateLimit,
        )) as unknown as Array<{ id: string; score: unknown }>;
        for (const row of rows) {
          const score = Number(row.score);
          const best = scored.get(String(row.id));
          if (best == null || score > best) scored.set(String(row.id), score);
        }
      }
      if (scored.size === 0) return [];

      // STEP 2 — main hydration, ONE batched query (the T-C32 law), the
      // VERBATIM searchServingEligible predicate: embed_rev read filter +
      // the VALIDATED-only scope EXISTS on both branches + the kind fold.
      // Eligibility authority stays on main — a validation-state change
      // after the copy is honored at serving time. The chunk ids AND the
      // curriculum version ride as BOUND params (the 093 inList wire law
      // extended with trailing binds — the verbatim predicate binds the
      // version, it never interpolates it); only the kind folds into text
      // (the house law: never an untyped NULL bind).
      const ids = [...scored.keys()];
      const cv = input.curriculumVersionId;
      const kindFold = input.kind == null ? "" : `\n  and d.kind = '${input.kind}'`;
      const tails = [
        `)
            and c.embedding is not null
            and c.embed_rev = ${EMBED_REV}
            and (
                  exists (
                        select 1 from exam_papers p
                        join subjects s on s.id = p.subject_id
                        where s.curriculum_version_id = `,
        `
                          and p.validation_state = 'VALIDATED'
                          and (p.question_paper_document_id = d.document_id
                            or p.mark_scheme_document_id = d.document_id))
               or exists (
                        select 1 from subjects s2
                        where s2.curriculum_version_id = `,
        `
                          and s2.id = c.subject_id
                          and d.validation_state = 'VALIDATED'))${kindFold}`,
      ];
      // the 093 wire law's construction shape (inList) extended with
      // trailing bound params: parts.length = params.length + 1 exactly
      const parts: string[] = [
        `select c.id, c.document_row_id, d.doc_version, d.document_id, d.kind, c.chunk_index,
           c.content, c.page_start, c.page_end, c.element_ids, c.spec_codes,
           c.embedding_model
          from document_chunks c
          join documents d on d.id = c.document_row_id
          where c.id in (`,
      ];
      for (let i = 1; i < ids.length; i++) parts.push(", ");
      parts.push(...tails);
      const strings = Object.assign([...parts], {
        raw: [...parts],
      }) as unknown as TemplateStringsArray;
      const hydrated = (await sql(
        strings,
        ...ids,
        cv,
        cv,
      )) as unknown as Array<Record<string, unknown>>;

      // warehouse cosine order restored over the hydrated rows (the main
      // plane's `order by c.embedding <=> ...` equivalent), then trim
      const ordered = hydrated
        .map((row) => ({ row, score: scored.get(String(row.id)) ?? 0 }))
        .sort((a, b) => b.score - a.score || String(a.row.id).localeCompare(String(b.row.id)))
        .slice(0, Math.max(1, Math.round(input.limit)))
        .map(({ row, score }) => ({ ...row, score: String(score) }));
      return ordered;
    },
  };
}
