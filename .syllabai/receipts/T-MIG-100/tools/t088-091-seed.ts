// T-MIG-088/089/091 golden-verify — seed the LOCAL scratch PG (db
// syllabai_v2_verify @127.0.0.1:5433, the surviving Task-33 cluster, schema
// pushed at 0f43156 — zero schema drift to 990d37a of record). Zero prod /
// Neon contact. Idempotent (upsert).
//
// Substrate law (the 083/084 pattern of record): content tables stay EMPTY
// (questions=0 / exam_series=0 / glm_ocr_bridge_records=0 / exam_papers=0) —
// the families' 200-shape legs are empty-result laws and the 404 legs are the
// 404-first law on unknown ids. PLUS run-fresh synthetic harness users
// (STUDENT/TEACHER/ADMIN via honest user_roles rows; tokens minted by the
// api's own JwtService — passwords never used).
const postgres = (await import("/home/z/my-project/repos/syllabai-v2/node_modules/postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 30 });

// pre-flight: the substrate MUST be the empty-content law
for (const t of ["questions", "exam_series", "glm_ocr_bridge_records", "exam_papers"]) {
  const [{ n }] = await sql`select count(*)::int as n from ${sql(t)}`;
  if (n !== 0) {
    console.error(`seed: substrate law violated — ${t} has ${n} rows (want 0)`);
    process.exit(2);
  }
}

const ROLES = [
  { name: "STUDENT", description: "Learner — the synthetic verify identities ride the honest role rows" },
  { name: "TEACHER", description: "Teacher — the synthetic verify identities ride the honest role rows" },
  { name: "ADMIN", description: "Admin — the synthetic verify identities ride the honest role rows" },
];
for (const r of ROLES) {
  await sql`insert into roles (name, description) values (${r.name}, ${r.description}) on conflict (name) do nothing`;
}
const USERS = [
  { id: "08800000-0000-4000-8000-000000000001", email: "t088-learner@verify.local", role: "STUDENT" },
  { id: "08800000-0000-4000-8000-000000000002", email: "t088-teacher@verify.local", role: "TEACHER" },
  { id: "08800000-0000-4000-8000-000000000003", email: "t088-admin@verify.local", role: "ADMIN" },
];
for (const u of USERS) {
  await sql`
    insert into users (id, email, password_hash, display_name, enabled, token_version, created_at)
    values (${u.id}, ${u.email}, ${"bcrypt-harness-no-login"}, ${"T088 " + u.role}, true, 1, now())
    on conflict (id) do update set enabled = true, token_version = 1`;
  await sql`insert into user_roles (user_id, role) values (${u.id}, ${u.role}) on conflict do nothing`;
  const row = await sql`
    select u.id, u.email, u.enabled, u.token_version,
           coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
    from users u left join user_roles r on r.user_id = u.id
    where u.id = ${u.id} group by u.id`;
  console.log("seeded:", JSON.stringify(row[0]));
}
// guard for 088 leg-04: no knowledge node may carry the cap-node code (the
// structured leg's resolvedNodeTitle=null law is exercised on ABSENCE)
const [{ n: cap }] = await sql`select count(*)::int as n from knowledge_nodes where lower(code) = 'cap-node'`;
if (cap !== 0) { console.error("seed: cap-node present in knowledge_nodes — leg-04 substrate law violated"); process.exit(2); }
await sql.end({ timeout: 5 });
console.log("SEED DONE (empty-content law + 3 synthetic users)");
