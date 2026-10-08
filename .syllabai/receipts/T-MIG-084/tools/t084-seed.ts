// T-MIG-084 golden-verify — seed the LOCAL scratch PG (db syllabai_v2_verify).
// Zero prod / Neon contact. Idempotent (upsert).
//
// Knowledge substrate is DERIVED FROM THE GOLDEN FIXTURES THEMSELVES (the
// leg-03 tree body) — zero manual transcription: every node row's id/code/
// title/description/validationStatus/provenance is read verbatim from the
// capture of record (fake UUIDs 00000000-0000-4000-8000-{seq} are the
// capture's stable-fake law, so replay paths + bodies need no remap).
// PART_OF edges: child = source, parent = target (the v2 service's walk
// contract, services/knowledge/index.ts).
// PLUS the 083-pattern synthetic harness users (STUDENT/TEACHER/ADMIN via
// honest user_roles rows; tokens are minted by the api's own JwtService —
// passwords never used).
import { readFileSync } from "node:fs";
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 30 });

// ── knowledge substrate from the fixture of record ──
const tree = JSON.parse(
  readFileSync("/home/z/my-project/repos/syllabai-v2/golden-captures/t-mig-084/leg-03-tree-200.json", "utf8"),
).body as NodeView;

interface NodeView {
  id: string; code: string; type: string; title: string; description: string | null;
  validationStatus: string; provenance: string | null; applicability: unknown;
  children?: NodeView[];
}
const NODES: NodeView[] = [];
const EDGES: Array<[string, string]> = []; // (child, parent)
(function walk(n: NodeView, parent: string | null) {
  NODES.push(n);
  if (parent) EDGES.push([n.id, parent]);
  for (const c of n.children ?? []) walk(c, n.id);
})(tree, null);

if (NODES.length !== 11 || EDGES.length !== 10) {
  console.error(`seed: fixture shape unexpected — nodes=${NODES.length} edges=${EDGES.length} (want 11/10)`);
  process.exit(2);
}
// the 404 leg's node id MUST NOT exist (leg-06 law: ...0012 unknown)
if (NODES.some((n) => n.id === "00000000-0000-4000-8000-000000000012")) {
  console.error("seed: fixture contains the leg-06 unknown id — abort");
  process.exit(2);
}

let n = 0;
for (const k of NODES) {
  await sql`
    insert into knowledge_nodes (id, code, node_type, title, description, validation_status, provenance, applicability, version, created_at)
    values (${k.id}::uuid, ${k.code}, ${k.type}, ${k.title}, ${k.description}, ${k.validationStatus}, ${k.provenance},
            ${k.applicability === undefined ? null : (k.applicability as never)}, 1, now())
    on conflict (id) do update set code = excluded.code, title = excluded.title,
      description = excluded.description, validation_status = excluded.validation_status,
      provenance = excluded.provenance, applicability = excluded.applicability`;
  n++;
}
let e = 0;
for (const [child, parent] of EDGES) {
  await sql`
    insert into knowledge_edges (id, source_node_id, target_node_id, relation_type, validation_status, version, created_at)
    values (${"e0000000-0000-4000-8000-" + String(e).padStart(12, "0")}::uuid,
            ${child}::uuid, ${parent}::uuid, 'PART_OF', 'VALIDATED', 1, now())
    on conflict (id) do nothing`;
  e++;
}
console.log(`seeded knowledge: ${n} nodes / ${e} PART_OF edges (root ${tree.id})`);

// ── harness users (083 pattern; roles table seeded first — user_roles.role FK) ──
const ROLES = [
  { name: "STUDENT", description: "Learner — the synthetic verify identities ride the honest role rows" },
  { name: "TEACHER", description: "Teacher — the synthetic verify identities ride the honest role rows" },
  { name: "ADMIN", description: "Admin — the synthetic verify identities ride the honest role rows" },
];
for (const r of ROLES) {
  await sql`insert into roles (name, description) values (${r.name}, ${r.description}) on conflict (name) do nothing`;
}
const USERS = [
  { id: "08400000-0000-4000-8000-000000000001", email: "t084-learner@verify.local", role: "STUDENT" },
  { id: "08400000-0000-4000-8000-000000000002", email: "t084-teacher@verify.local", role: "TEACHER" },
  { id: "08400000-0000-4000-8000-000000000003", email: "t084-admin@verify.local", role: "ADMIN" },
];
for (const u of USERS) {
  await sql`
    insert into users (id, email, password_hash, display_name, enabled, token_version, created_at)
    values (${u.id}, ${u.email}, ${"bcrypt-harness-no-login"}, ${"T084 " + u.role}, true, 1, now())
    on conflict (id) do update set enabled = true, token_version = 1`;
  await sql`insert into user_roles (user_id, role) values (${u.id}, ${u.role}) on conflict do nothing`;
  const row = await sql`
    select u.id, u.email, u.enabled, u.token_version,
           coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
    from users u left join user_roles r on r.user_id = u.id
    where u.id = ${u.id} group by u.id`;
  console.log("seeded:", JSON.stringify(row[0]));
}
await sql.end({ timeout: 5 });
console.log("SEED DONE");
