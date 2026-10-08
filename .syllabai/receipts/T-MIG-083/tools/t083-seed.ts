// T-MIG-083 golden-verify — seed 3 synthetic harness users on the LOCAL scratch PG
// (disposable user-tree postgres, db syllabai_v2_verify; zero prod/Neon contact). Idempotent.
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 30 });

const USERS = [
  { id: "08300000-0000-4000-8000-000000000001", email: "t083-learner@verify.local", role: "STUDENT" },
  { id: "08300000-0000-4000-8000-000000000002", email: "t083-teacher@verify.local", role: "TEACHER" },
  { id: "08300000-0000-4000-8000-000000000003", email: "t083-admin@verify.local", role: "ADMIN" },
];

for (const u of USERS) {
  await sql`
    insert into users (id, email, password_hash, display_name, enabled, token_version, created_at)
    values (${u.id}, ${u.email}, ${"bcrypt-harness-no-login"}, ${"T083 " + u.role}, true, 1, now())
    on conflict (id) do update set enabled = true, token_version = 1`;
  await sql`
    insert into user_roles (user_id, role) values (${u.id}, ${u.role})
    on conflict do nothing`;
  const row = await sql`
    select u.id, u.email, u.enabled, u.token_version,
           coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
    from users u left join user_roles r on r.user_id = u.id
    where u.id = ${u.id} group by u.id`;
  console.log("seeded:", JSON.stringify(row[0]));
}
await sql.end({ timeout: 5 });
console.log("SEED DONE");
