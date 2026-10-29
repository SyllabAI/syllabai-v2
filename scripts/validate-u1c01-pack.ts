/**
 * T-BOOK-032/T-BOOK-033 G4 gate — validate a CourseLessons-emitted
 * lessonPackV1.json against the platform contract of record
 * (packages/contracts books-lesson.ts), proving the corpus→platform wire.
 *
 * Usage: bun scripts/validate-u1c01-pack.ts [packJsonPath]
 *   default: apps/hub/content/igcse-chemistry-19/lessons/u1-c01-states-of-matter.json
 *   (the baked copy; pass the CourseLessons qa/lessonPackV1.json path to
 *    validate the corpus-side emit before baking)
 */
import { readFileSync } from "node:fs";
import { lessonPackSchema, lessonShelfEntrySchema } from "@syllabai/contracts";

const packPath =
  process.argv[2] ??
  "apps/hub/content/igcse-chemistry-19/lessons/u1-c01-states-of-matter.json";
const pack = JSON.parse(readFileSync(packPath, "utf-8"));

const r = lessonPackSchema.safeParse(pack);
if (!r.success) {
  console.error("PACK VALIDATION FAILED:");
  for (const issue of r.error.issues) console.error(" -", issue.path.join("."), ":", issue.message);
  process.exit(1);
}
console.log(
  `lessonPackV1 OK: ${r.data.packId} chapter=${r.data.chapterKey} paperRoute=${r.data.paperRoute} status=${r.data.status} sections=${r.data.sections.length}`,
);

// per-section contract spot-laws (V rules mirrored platform-side)
for (const s of r.data.sections) {
  if (!/^u\d+:c\d{2}:s\d{2}$/.test(s.id)) throw new Error(`bad id ${s.id}`);
  if (s.chunkRefs.length < 1) throw new Error(`${s.id}: chunkRefs < 1`);
  if (s.specRefs.length < 1) throw new Error(`${s.id}: specRefs < 1`);
  if (typeof s.bookPage !== "number") throw new Error(`${s.id}: bookPage not pinned`);
}
console.log("per-section laws OK (id grammar, chunkRefs>=1, specRefs>=1, bookPage pinned)");

// shelf entry is the status-absent mirror (T-C20): only validates the
// non-leaking shape a shelf row must have
const shelfProbe = lessonShelfEntrySchema.safeParse({
  packId: r.data.packId,
  chapterKey: r.data.chapterKey,
  courseId: r.data.courseId,
  title: r.data.title,
  learningObjective: r.data.learningObjective,
  paperRoute: r.data.paperRoute,
  sectionCount: r.data.sections.length,
  blockCount: 0, // blocks live in Neon L3; joined by bookPage at serve time
  version: r.data.version,
});
console.log(
  "lessonShelfEntry (T-C20 status-absent mirror) probe:",
  shelfProbe.success ? "OK" : `shape issues: ${JSON.stringify(shelfProbe.error.issues.map((i) => i.path.join(".")))}`,
);
