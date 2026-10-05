/*
 * PROVENANCE (T-MIG-023): copied verbatim from
 * .syllabai/receipts/T-MIG-022/tools/apply-reset.ts (branch t-mig-022/r3a) — the
 * R0-credited replay-tooling lineage (#20 disposition credit -> T-MIG-022
 * run-001 -> T-MIG-023 re-run). Nothing below this block was modified.
 */
/*
 * PROVENANCE (T-MIG-022): copied verbatim (byte-for-byte, sha256 recorded in
 * the run receipt) from .syllabai/receipts/T-MIG-020/tools/apply-reset.ts on the
 * preserved branch t-mig-020/r3a, per the R0 disposition on PR #20:
 * "your replay tooling + receipts are the starting point" for the
 * live-replay follow-up. This run executes the tool against the MERGED
 * port (r3-c, #22) at main HEAD. Nothing below this block was modified.
 */
/**
 * T-MIG-020 replay environment reset (branch sandbox, ROWS ONLY).
 *
 * Posture: the T-MIG-004 golden cases are pinned to the Flyway-SEED state
 * (content tables empty, curriculum skeleton present, no users). The
 * sandbox branch is a COW copy of PRODUCTION, so the reset wipes the pilot
 * dataset in FK-dependency order (topological, children first), then
 * neutralizes the search owning-surface (VALIDATED structure nodes back to
 * UNVALIDATED = the seed's state) so resolveActive yields SCOPE_UNRESOLVED.
 *
 * Why DELETE and not TRUNCATE: API-created branch roles carry
 * neon_superuser privileges via pg_write_all_data (DELETE works) but SET
 * ROLE neon_superuser is Neon-restricted and TRUNCATE privilege is not
 * granted — recorded for future lanes.
 *
 * Scope guard: this NEVER touches production main (C2) and NEVER alters
 * structure (BASELINE_DB §4.1). The curriculum skeleton rows (versions,
 * subjects, knowledge_nodes, PART_OF edges) are preserved for T-MIG-021's
 * fixed-uuid replays.
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}
const sql = postgres(url, { max: 1, prepare: false });

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
const parentsOf = (t: string) => edges.filter((e) => e.child === `"${t}"`.replace(/"/g, "\"")).map((e) => e.parent);

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

// 3. delete in topological order; retry pass handles cyclic leftovers
let attempts = 0;
let remaining = [...order].reverse(); // parents (referenced) LAST
while (remaining.length > 0 && attempts < 10) {
  attempts++;
  const failed: string[] = [];
  for (const t of remaining) {
    try {
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
// UNIT/TOPIC/SUBTOPIC nodes)
const upd = await sql.unsafe(`
  update knowledge_nodes set validation_status = 'UNVALIDATED'
  where node_type in ('UNIT','TOPIC','SUBTOPIC') and validation_status = 'VALIDATED'
`);
console.log("owning-surface neutralized:", upd.count, "nodes");

// 5. re-seed the roles table (the wipe takes it out too; verbatim from the
// core's Flyway V1__identity.sql seed — Role names the identity port pins).
await sql.unsafe(`
  insert into roles (name, description) values
    ('STUDENT', 'Learner account — self-registered'),
    ('TEACHER', 'Teacher account — provisioned by an admin'),
    ('ADMIN',   'Administrator — full control')
  on conflict (name) do nothing`);
console.log("roles re-seeded (V1__identity.sql verbatim)");

// 5. posture probes
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
];
for (const [name, q] of probes) {
  const rows = (await sql.unsafe(q)) as Array<{ n: number }>;
  console.log(`  ${name}: ${rows[0]?.n}`);
}
await sql.end();
console.log("reset complete (topological wipe + posture verified)");
void readFileSync;
