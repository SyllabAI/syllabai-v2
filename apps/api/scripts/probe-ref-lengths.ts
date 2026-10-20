/**
 * Offline probe (sandbox, zero DB): build the real 1.0 package for the
 * varchar(80)-failing slugs and scan EVERY string that lands in a varchar
 * column of the ingest's INSERT targets:
 *   questions.external_ref (80) + the derived member refs (-pK / -s)
 *   question_versions.source_document_id / mark_schemes.source_document_id (80)
 *   question_parts.label (12), command_word (30)
 *   question_options.label (4)
 *   mark_points.ref
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSmePackage, bundleQuestionsZip, BundleQuestionsError, type BundleQuestionSet } from "../src/services/sme/bundle-questions";
import { emittedRowRefs } from "../src/services/sme/index";
import type { BundleCurriculum } from "../src/services/curriculum/bundle-seed";

const HUB = join(import.meta.dir, "../../../apps/hub/content");
const SLUGS = process.argv.slice(2);

for (const slug of SLUGS) {
  const dir = join(HUB, slug);
  const curriculum = JSON.parse(readFileSync(join(dir, "curriculum.json"), "utf8")) as BundleCurriculum;
  const sets = JSON.parse(readFileSync(join(dir, "questions.json"), "utf8")) as BundleQuestionSet[];
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { generatedUtc: string; importSource: { repo: string; ref: string } };
  try {
    const pkg = buildSmePackage({
      courseSlug: slug,
      curriculum,
      sets,
      generatedUtc: manifest.generatedUtc,
      importRef: manifest.importSource.ref.replace(/^main@/, ""),
    });
    const worst = { ref: 0, refSample: "", cmd: 0, cmdSample: "", label: 0, src: 0 };
    for (const q of pkg.questions ?? []) {
      const refs = emittedRowRefs(q);
      for (const r of refs) {
        if (r.length > worst.ref) { worst.ref = r.length; worst.refSample = r; }
      }
      if ((q.commandWord ?? "").length > worst.cmd) { worst.cmd = (q.commandWord as string).length; worst.cmdSample = q.commandWord as string; }
      if ((pkg.source ?? "").length > worst.src) worst.src = (pkg.source as string).length;
      for (const p of q.parts ?? []) {
        if ((p.commandWord ?? "").length > worst.cmd) { worst.cmd = (p.commandWord as string).length; worst.cmdSample = p.commandWord as string; }
        for (const o of p.options ?? []) {
          if ((o.label ?? "").length > worst.label) worst.label = (o.label as string).length;
        }
      }
    }
    console.log(slug, "| questions:", (pkg.questions ?? []).length, "| maxRef:", worst.ref, worst.ref > 80 ? "OVERFLOW " + worst.refSample : "ok", "| maxCmd:", worst.cmd, worst.cmd > 30 ? "OVERFLOW " + worst.cmdSample : "ok", "| maxOptLabel:", worst.label, "| srcLen:", worst.src);
  } catch (e) {
    console.log(slug, "| BUILD FAIL:", e instanceof BundleQuestionsError ? e.message : (e as Error).message);
  }
}
