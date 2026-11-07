/**
 * verify_subject_identity.ts — the subject-identity coverage law.
 *
 * T-HUB-COURSES-UI-1 run-001 (the /courses redesign plan, stage 1). Runs in
 * the prebuild chain (package.json prebuild → bun run build:hub → CI hub
 * lane), so a registry change that outruns the identity lib fails the build
 * BEFORE any deploy instead of rendering an unmapped subject at runtime.
 *
 * The laws (zero-tolerance — any FAIL exits 1):
 *  R1 registry shape   content/courses.json parses to a non-empty courses
 *                      array where every row carries string slug + subject.
 *  R2 slug coverage    EVERY course row's subject resolves to an identity
 *                      in lib/subject-identity.ts (exact, alias or
 *                      case-insensitive). An unknown subject fails the
 *                      build — add the identity in the same commit that
 *                      adds the course.
 *  R3 no stale mapping every canonical identity is used by ≥ 1 row. An
 *                      unused identity means the registry renamed a subject
 *                      out from under the lib — the two must move together.
 *  R4 glyph set valid  every identity's glyph is a known SubjectGlyphId
 *                      (the component side is compile-gated in
 *                      components/icons/subject-glyph.tsx) and every glyph
 *                      is rendered by ≥ 1 identity (no dead glyphs).
 *  R5 colour pairs     every tile bg/fg is strict #rrggbb (case-insensitive).
 *  R6 family integrity SUBJECT_FAMILIES has no duplicates, every identity's
 *                      family is a known family, and every family owns ≥ 1
 *                      subject.
 *
 * Style note: pure node:fs + the identity lib (client-safe, no server-only
 * import) so the script runs identically in CI and locally via prebuild.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  CANONICAL_SUBJECTS,
  FAMILY_LABELS,
  SUBJECT_FAMILIES,
  SUBJECT_GLYPH_IDS,
  SUBJECT_IDENTITY,
  getSubjectIdentity,
} from "../src/lib/subject-identity";

const REGISTRY = "content/courses.json";

function fail(msg: string): never {
  console.error(`FAIL ${msg}`);
  process.exit(1);
}

const cwd = process.cwd();
const registryPath = path.join(cwd, REGISTRY);
if (!existsSync(registryPath)) fail(`${REGISTRY} missing (run from apps/hub)`);
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(registryPath, "utf8"));
} catch (e) {
  fail(`${REGISTRY} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
}

// R1 — registry shape (deliberately looser than the hub loader's zod: this
// gate only needs enough shape to walk rows; the loader owns the contract).
const courses = (raw as { courses?: unknown })?.courses;
if (!Array.isArray(courses) || courses.length === 0) {
  fail(`R1 ${REGISTRY} has no non-empty courses array`);
}
type Row = { slug: string; subject: string };
const rows: Row[] = [];
const shapeErrors: string[] = [];
for (const [i, r] of courses.entries()) {
  const row = r as { slug?: unknown; subject?: unknown };
  if (typeof row?.slug !== "string" || !row.slug) shapeErrors.push(`courses[${i}].slug`);
  if (typeof row?.subject !== "string" || !row.subject) shapeErrors.push(`courses[${i}].subject`);
  else rows.push({ slug: String(row.slug), subject: row.subject });
}
if (shapeErrors.length) fail(`R1 rows without string slug+subject: ${shapeErrors.join(", ")}`);

// R2 — every slug resolves.
const unresolved: Array<{ slug: string; subject: string }> = [];
for (const row of rows) {
  if (!getSubjectIdentity(row.subject)) unresolved.push(row);
}
if (unresolved.length) {
  const list = unresolved.map((r) => `${r.slug} (subject "${r.subject}")`).join(", ");
  fail(
    `R2 ${unresolved.length}/${rows.length} course slugs have NO subject identity — ` +
      `add them to src/lib/subject-identity.ts: ${list}`,
  );
}

// R3 — every identity is used (no stale mappings).
const usedSubjects = new Set(
  rows.flatMap((r) => {
    const id = getSubjectIdentity(r.subject);
    return id ? [id.subject] : [];
  }),
);
const stale = CANONICAL_SUBJECTS.filter((s) => !usedSubjects.has(s));
if (stale.length) {
  fail(
    `R3 identity entries used by NO registry row (stale mapping — registry renamed a ` +
      `subject without updating the lib?): ${stale.join(", ")}`,
  );
}

// The raw table for the structural laws (typed per-entry).
const identities = Object.values(SUBJECT_IDENTITY) as Array<{
  subject: string;
  family: string;
  glyph: string;
  tile: { bg: string; fg: string };
}>;

// R4 — glyph ids known + every glyph rendered by ≥ 1 identity.
const HEX = /^#[0-9a-f]{6}$/;
const glyphErrors: string[] = [];
const renderedGlyphs = new Set<string>();
for (const id of identities) {
  if (!(SUBJECT_GLYPH_IDS as readonly string[]).includes(id.glyph)) {
    glyphErrors.push(`${id.subject}: unknown glyph "${id.glyph}"`);
  }
  renderedGlyphs.add(id.glyph);
  if (!HEX.test(id.tile.bg) || !HEX.test(id.tile.fg)) {
    glyphErrors.push(`${id.subject}: bad colour pair ${id.tile.bg}/${id.tile.fg}`);
  }
}
for (const g of SUBJECT_GLYPH_IDS) {
  if (!renderedGlyphs.has(g)) glyphErrors.push(`glyph "${g}" has no identity (dead glyph)`);
}
if (glyphErrors.length) fail(`R4/R5 glyph/colour law: ${glyphErrors.join("; ")}`);

// R6 — family integrity.
const familyErrors: string[] = [];
const familySet = new Set<string>(SUBJECT_FAMILIES);
if (familySet.size !== SUBJECT_FAMILIES.length) fail("R6 SUBJECT_FAMILIES has duplicates");
const byFamily = new Map<string, number>();
for (const id of identities) {
  if (!familySet.has(id.family)) familyErrors.push(`${id.subject}: unknown family "${id.family}"`);
  byFamily.set(id.family, (byFamily.get(id.family) ?? 0) + 1);
}
for (const f of SUBJECT_FAMILIES) {
  if (!byFamily.get(f)) familyErrors.push(`family "${f}" owns no subject`);
}
if (familyErrors.length) fail(`R6 family law: ${familyErrors.join("; ")}`);

// Census — the reviewer-facing proof line.
const glyphBySubject = new Map<string, string[]>();
for (const r of rows) {
  const id = getSubjectIdentity(r.subject);
  if (!id) continue;
  const list = glyphBySubject.get(id.subject) ?? [];
  if (!list.includes(r.slug)) list.push(r.slug);
  glyphBySubject.set(id.subject, list);
}
console.log("SUBJECT-IDENTITY VERIFY");
console.log(
  `  registry: ${rows.length} course rows → ${glyphBySubject.size} canonical subjects ` +
    `(from ${new Set(rows.map((r) => r.subject)).size} raw subject strings)`,
);
for (const f of SUBJECT_FAMILIES) {
  const members = identities.filter((id) => id.family === f).map((id) => id.subject);
  const courseCount = members.reduce((n, s) => n + (glyphBySubject.get(s)?.length ?? 0), 0);
  console.log(
    `  ${FAMILY_LABELS[f]}: ${members.length} subject(s), ${courseCount} course(s) — ${members.join(", ")}`,
  );
}
console.log(
  `  glyphs: ${renderedGlyphs.size}/${SUBJECT_GLYPH_IDS.length} bespoke in use; ` +
    `families: ${SUBJECT_FAMILIES.length}`,
);
console.log(
  `SUBJECT-IDENTITY VERIFY: PASS — ${rows.length}/${rows.length} slugs resolved, ` +
    `${glyphBySubject.size} identities, no stale mappings, no dead glyphs`,
);
