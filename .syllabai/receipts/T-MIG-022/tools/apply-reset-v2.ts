/*
 * PROVENANCE (T-MIG-022 H-2 reconciliation) — apply-reset-v2.ts
 *
 * Authored by r7a (round-6, branch t-mig-022/r7a-h2) to reconcile register
 * item H-2: v1 (apply-reset.ts in this directory, sha256
 * 32fee89dac1aeb32e280c16df6c5ab5d6c2f872300e0923b867f4160169cc2c1 as on
 * main 79bdc23) PROMISED in its header that "the curriculum skeleton rows
 * (versions, subjects, knowledge_nodes, PART_OF edges) are preserved" but
 * its step 3 unconditionally DELETEs every public table — the T-MIG-022 run
 * receipt (run-001.json harness_findings H-2) captured the resulting zeros
 * (knowledge_nodes 0, PART_OF 0, active versions 0) and registered the
 * divergence to r7a. V1 IS LEFT UNTOUCHED as the as-run historical artifact
 * (its sha stays verifiable); v2 is the corrected tool going forward and
 * the input for the future CI-side replay runner.
 *
 * WHAT V2 CHANGES vs V1 (nothing else):
 *   1. Truthful documentation of BOTH postures (the false promise becomes a
 *      real, flagged capability instead of a doc/code divergence).
 *   2. An explicit OPT-IN `--preserve-skeleton` posture that actually
 *      implements the promised behavior (v1's default wipe behavior is kept
 *      byte-faithful as the DEFAULT so the T-MIG-022 seed posture and every
 *      case pinned on it are untouched).
 *   3. Unknown-flag usage guard before any DB contact.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * T-MIG-020/022 replay environment reset (branch sandbox, ROWS ONLY).
 *
 * Postures:
 *   DEFAULT (full wipe — byte-faithful to v1's executed behavior):
 *     The sandbox branch is a COW copy of PRODUCTION, so the reset wipes
 *     EVERY public table in FK-dependency order (topological, children
 *     first), then neutralizes the search owning-surface (VALIDATED
 *     structure nodes back to UNVALIDATED = the seed's state) so
 *     resolveActive yields SCOPE_UNRESOLVED, then re-seeds the roles table.
 *     This is the posture the T-MIG-022 seed tranche (25 cases) was replayed
 *     and pinned against: content tables empty AND curriculum tables empty
 *     (the run receipt's probes recorded those zeros — the T-MIG-004-era
 *     docstring's "curriculum skeleton present" claim was v1's H-2
 *     divergence, not the executed reality).
 *   --preserve-skeleton (opt-in — the behavior v1 promised):
 *     Same topological wipe EXCEPT the curriculum skeleton is preserved
 *     exactly as-captured on the branch: subjects, curriculum_versions and
 *     knowledge_nodes are not deleted; of knowledge_edges only the PART_OF
 *     rows are kept (all other edge rows are wiped); the VALIDATED ->
 *     UNVALIDATED neutralization is SKIPPED so resolveActive sees the
 *     captured skeleton as-is. This is the posture for the fixed-uuid
 *     curriculum replays (T-MIG-021's needs).
 *   Roles re-seed (V1__identity.sql verbatim) runs in BOTH postures — roles
 *   are identity, not curriculum skeleton.
 *
 * Why DELETE and not TRUNCATE: API-created branch roles carry
 * neon_superuser privileges via pg_write_all_data (DELETE works) but SET
 * ROLE neon_superuser is Neon-restricted and TRUNCATE privilege is not
 * granted — recorded for future lanes (v1 finding, still true).
 *
 * Scope guard: this NEVER touches production main (C2) and NEVER alters
 * structure (BASELINE_DB §4.1) — rows-only, COW branches only, dropped
 * after use per the fleet replay protocol.
 */
import postgres from "postgres";

const USAGE = "usage: bun apply-reset-v2.ts [--preserve-skeleton]";

// 0. argument guard (BEFORE any DB contact)
const args = process.argv.slice(2);
const preserveSkeleton = args.includes("--preserve-skeleton");
const unknown = args.filter((a) => a !== "--preserve-skeleton");
if (unknown.length > 0) {
  console.error(`unknown argument(s): ${unknown.join(" ")}`);
  console.error(USAGE);
  process.exit(2);
}

const url = process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}
const sql = postgres(url, { max: 1, prepare: false });

console.log(
  preserveSkeleton
    ? "posture: PRESERVE-SKELETON (curriculum skeleton kept as-captured; everything else wiped)"
    : "posture: FULL WIPE (default — byte-faithful to v1's executed behavior)",
);

// 1. FK edges inside the public schema (child → parent)
const edges = (await sql.unsafe(`
  select conrelid::regclass::text as child, confrelid::regclass::text as parent
  from pg_constraint
  where contype = 'f'
    and connamespace = 'public'::regnamespace
    and conrelid::regclass::text <> confrelid::regclass::text
`)) as Array<{ child: string; parent: string }>;

// 2. children-first topological order (cycle-tolerant: self/cross refs retried)
const allTables = (
  (await sql.unsafe(`
    select tablename from pg_tables where schemaname = 'public'
  `)) as Array<{ tablename: string }>
).map((r) => r.tablename);

const order: string[] = [];
const state = new Map<string, "pending" | "visiting" | "done">(allTables.map((t) => [t, "pending"]));

function visit(t: string) {
  const s = state.get(t);
  if (s === "done" || s === "visiting") return; // visiting → cycle: delete later, retry loop handles
  state.set(t, "visiting");
  for (const e of edges) {
    if (e.child === `"${t}"` || e.child === t) {
      const parent = e.parent.replace(/"/g, "");
      if (state.get(parent) === "pending") visit(parent);
    }
  }
  state.set(t, "done");
  order.push(t);
}
for (const t of allTables) visit(t);

// 3. delete in topological order; retry pass handles cyclic leftovers.
// In --preserve-skeleton the curriculum skeleton is excluded from the wipe:
//   - subjects / curriculum_versions / knowledge_nodes: skipped entirely
//   - knowledge_edges: only non-PART_OF rows are deleted (at the table's own
//     topological position — PART_OF edges are exactly as-captured)
const PRESERVE_TABLES = new Set(["subjects", "curriculum_versions", "knowledge_nodes"]);
const EDGE_TABLE = "knowledge_edges";
let attempts = 0;
let remaining = [...order].reverse(); // parents (referenced) LAST
while (remaining.length > 0 && attempts < 10) {
  attempts++;
  const failed: string[] = [];
  for (const t of remaining) {
    try {
      if (preserveSkeleton && PRESERVE_TABLES.has(t)) {
        console.log(`  preserved: ${t} (skeleton, as-captured)`);
        continue;
      }
      if (preserveSkeleton && t === EDGE_TABLE) {
        const del = await sql.unsafe(
          `delete from "${EDGE_TABLE}" where relation_type <> 'PART_OF'`,
        );
        console.log(`  wiped non-skeleton edges: ${del.count} rows (PART_OF kept)`);
        continue;
      }
      await sql.unsafe(`delete from "${t}"`);
    } catch (e) {
      if (String(e).includes("violates foreign key constraint")) {
        failed.push(t); // a referenced table — try again after its children
      } else {
        throw e;
      }
    }
  }
  remaining = failed;
  if (failed.length > 0 && attempts === 10) {
    console.error("FK graph did not settle; remaining tables:", failed);
    await sql.end();
    process.exit(1);
  }
}

// 4. neutralize the search owning-surface (seed posture: zero VALIDATED
// UNIT/TOPIC/SUBTOPIC nodes) — FULL-WIPE posture only; in --preserve-skeleton
// the captured validation status IS the posture under test.
if (preserveSkeleton) {
  console.log("owning-surface neutralization: SKIPPED (preserve-skeleton: skeleton stays as-captured)");
} else {
  const upd = await sql.unsafe(`
    update knowledge_nodes set validation_status = 'UNVALIDATED'
    where node_type in ('UNIT','TOPIC','SUBTOPIC') and validation_status = 'VALIDATED'
  `);
  console.log("owning-surface neutralized:", upd.count, "nodes");
}

// 5. re-seed the roles table (the wipe takes it out too; verbatim from the
// core's Flyway V1__identity.sql seed — Role names the identity port pins).
// Runs in BOTH postures: roles are identity, not curriculum skeleton.
await sql.unsafe(`
  insert into roles (name, description) values
    ('STUDENT', 'Learner account — self-registered'),
    ('TEACHER', 'Teacher account — provisioned by an admin'),
    ('ADMIN',   'Administrator — full control')
  on conflict (name) do nothing`);
console.log("roles re-seeded (V1__identity.sql verbatim)");

// 6. posture probes (same set as v1 — the skeleton counters read 0 in the
// full-wipe posture and the as-captured counts in --preserve-skeleton)
const probes = [
  ["documents", "select count(*)::int as n from documents"],
  ["exam_papers", "select count(*)::int as n from exam_papers"],
  ["questions", "select count(*)::int as n from questions"],
  ["question_asset", "select count(*)::int as n from question_asset"],
  ["users", "select count(*)::int as n from users"],
  ["attempts", "select count(*)::int as n from attempts"],
  ["validated structure nodes", "select count(*)::int as n from knowledge_nodes where node_type in ('UNIT','TOPIC','SUBTOPIC') and validation_status = 'VALIDATED'"],
  ["active curriculum versions", "select count(*)::int as n from curriculum_versions where status = 'ACTIVE'"],
  ["curriculum skeleton nodes", "select count(*)::int as n from knowledge_nodes"],
  ["PART_OF edges", "select count(*)::int as n from knowledge_edges where relation_type = 'PART_OF'"],
  ["subjects", "select count(*)::int as n from subjects"],
  ["curriculum_versions rows", "select count(*)::int as n from curriculum_versions"],
];
for (const [name, q] of probes) {
  const rows = (await sql.unsafe(q)) as Array<{ n: number }>;
  console.log(`  ${name}: ${rows[0]?.n}`);
}
await sql.end();
console.log(
  preserveSkeleton
    ? "reset complete (posture: preserve-skeleton — skeleton as-captured, content wiped)"
    : "reset complete (posture: full wipe + posture verified)",
);
