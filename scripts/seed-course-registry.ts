/**
 * T-TEACH-002 (ADR-CLASS-0001 §2) — the course_registry seed: COPIES the
 * hub registry of record (apps/hub/content/courses.json) into the
 * course_registry table, verbatim and idempotently. NEVER DERIVED — the
 * registry's own law; the API is a consumer of the file of record.
 *
 * Run (operator/agent step, receipt required — never an api-boot effect):
 *   DATABASE_URL="postgresql://…" bun scripts/seed-course-registry.ts
 *
 * Sync law: when apps/hub/content/courses.json changes, re-run and disclose
 * the delta in the receipt. Rows deleted from the registry file are REPORTED
 * (and removed only with --prune, explicit operator intent).
 */
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../apps/api/src/services/identity/users";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "apps/hub/content/courses.json";

interface RegistryCourse {
  slug: string;
  level: string;
  subject: string;
  label?: string;
  code: string;
  status: string;
  board?: string;
  curriculumCode?: string;
}

const url = requireDatabaseUrl(process.env as { DATABASE_URL?: string });
const sql = createSql(url);

const raw = JSON.parse(readFileSync(join(import.meta.dir, "..", SOURCE), "utf8")) as {
  courses: RegistryCourse[];
};
const courses = raw.courses;

let inserted = 0;
let updated = 0;
const now = new Date().toISOString();

for (const c of courses) {
  const source = `${SOURCE} @ slug=${c.slug}`;
  const res = (await sql`
    insert into course_registry
      (course_slug, curriculum_code, level, subject, code, board, label, status, source, synced_at)
    values (${c.slug}, ${c.curriculumCode ?? null}, ${c.level}, ${c.subject}, ${c.code},
            ${c.board ?? null}, ${c.label ?? null}, ${c.status}, ${source}, ${now}::timestamptz)
    on conflict (course_slug) do update set
      curriculum_code = excluded.curriculum_code,
      level = excluded.level,
      subject = excluded.subject,
      code = excluded.code,
      board = excluded.board,
      label = excluded.label,
      status = excluded.status,
      source = excluded.source,
      synced_at = excluded.synced_at
    returning (xmax = 0) as inserted`) as Array<{ inserted: boolean }>;
  if (res[0]?.inserted) inserted++;
  else updated++;
}

// Drift report: registry rows whose slug left the file (removal is an
// explicit --prune decision, never a silent side effect).
const dbRows = (await sql`select course_slug from course_registry`) as Array<{ course_slug: string }>;
const fileSlugs = new Set(courses.map((c) => c.slug));
const orphans = dbRows.map((r) => r.course_slug).filter((s) => !fileSlugs.has(s));
if (orphans.length > 0 && process.argv.includes("--prune")) {
  await sql`delete from course_registry where course_slug = any(${orphans}::text[])`;
}

const unbridged = courses.filter((c) => !c.curriculumCode).length;
console.log(
  `course_registry seed: ${courses.length} registry rows (` +
    `${inserted} inserted, ${updated} updated, ${orphans.length} orphaned` +
    `${process.argv.includes("--prune") ? ", pruned" : ""}); ` +
    `${unbridged} rows without curriculumCode (question-chain surfaces stay OPEN for them per ADR-CLASS-0001 §4)`,
);
