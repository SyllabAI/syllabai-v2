/**
 * validate_gradeb_bundle.ts — the T-GRADE-2 run-002 regression guard.
 *
 * Validates the committed grade-boundaries bundle
 * (content/grade-boundaries/bundle.v1.json) against the EXACT zod contract
 * the hub loader enforces (lib/grade-boundaries-schema.ts) plus the
 * renderability invariants the Workspace relies on. Runs in the prebuild
 * chain (package.json prebuild → bun run build:hub → CI hub lane), so a
 * loader/contract drift fails the build BEFORE any deploy instead of
 * nulling the whole bundle at runtime (the run-002 incident: every course
 * card on production fell back to the honest roadmap state because the
 * wave-2 CIE/modular series shapes — no series-level boundaries row —
 * failed the then-strict loader zod).
 *
 * Zero-tolerance: any FAIL exits 1.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  GradeBoundariesSchema,
  type GradeBoundariesBundle,
  type GradeBoundariesCourse,
} from "../src/lib/grade-boundaries-schema";

const BUNDLE = "content/grade-boundaries/bundle.v1.json";

function fail(msg: string): never {
  console.error(`FAIL ${msg}`);
  process.exit(1);
}

const cwd = process.cwd();
const bundlePath = path.join(cwd, BUNDLE);
if (!existsSync(bundlePath)) fail(`${BUNDLE} missing`);
const raw: unknown = JSON.parse(readFileSync(bundlePath, "utf8"));

const parsed = GradeBoundariesSchema.safeParse(raw);
if (!parsed.success) {
  const issues = parsed.error.issues;
  console.error(
    `FAIL bundle fails the loader schema — ${issues.length} issues; first 10:`,
  );
  for (const i of issues.slice(0, 10)) {
    console.error(`  - ${i.path.join(".")}: ${i.message}`);
  }
  process.exit(1);
}

const bundle: GradeBoundariesBundle = parsed.data;
const courses = Object.entries(bundle.courses);
let failures = 0;
const complain = (msg: string) => {
  console.error(`FAIL ${msg}`);
  failures += 1;
};

// counts law: served + roadmap == total == courses present
const served = courses.filter(([, c]) => c.series.length > 0).length;
if (served !== bundle.counts.courses_served)
  complain(
    `counts.courses_served=${bundle.counts.courses_served} but ${served} courses carry series`,
  );
if (
  served + bundle.counts.courses_roadmap !== bundle.counts.courses_total ||
  courses.length !== bundle.counts.courses_total
)
  complain(
    `counts inconsistent: served(${served}) + roadmap(${bundle.counts.courses_roadmap}) != total(${bundle.counts.courses_total}) / entries(${courses.length})`,
  );

// per-course renderability invariants (the shapes the Workspace branches on)
for (const [slug, c] of courses) {
  const mode = c.calculator?.mode ?? "none";
  const withBoundaries = c.series.filter(
    (s) =>
      s.boundaries &&
      Object.values(s.boundaries).some((v) => typeof v === "number"),
  ).length;

  if (c.series.length === 0) {
    if (mode !== "none")
      complain(`${slug}: roadmap course (0 series) must not declare a calculator`);
    continue;
  }
  if (mode === "linear-total") {
    // the mark→grade calculator + the linear table grade EVERY series row,
    // so a linear-total course may not mix shapes
    if (withBoundaries !== c.series.length)
      complain(
        `${slug}: linear-total but ${c.series.length - withBoundaries}/${c.series.length} series lack an overall boundaries row`,
      );
    if (c.calculator?.maxMark == null)
      complain(`${slug}: linear-total without calculator.maxMark`);
  } else if (withBoundaries > 0) {
    complain(
      `${slug}: series carry an overall boundaries row but calculator mode is ${mode} — the workspace would grade through the wrong surface`,
    );
  }

  for (const [i, s] of c.series.entries()) {
    const where = `${slug}.series[${i}] (${s.session})`;
    if (s.units && !s.units.length) complain(`${where}: empty units[]`);
    if (s.cashIns && !s.cashIns.length) complain(`${where}: empty cashIns[]`);
    if (s.components && !s.components.length)
      complain(`${where}: empty components[]`);
    if (s.routes && !s.routes.length) complain(`${where}: empty routes[]`);
    if (s.calculatorUnits && !s.calculatorUnits.length)
      complain(`${where}: empty calculatorUnits[]`);
    for (const u of s.units ?? []) {
      if (!Object.values(u.boundaries).some((v) => typeof v === "number"))
        complain(`${where}: unit ${u.code} has no numeric raw boundary`);
    }
    for (const ci of s.cashIns ?? []) {
      if (!Object.values(ci.boundaries).some((v) => typeof v === "number"))
        complain(`${where}: cash-in ${ci.code} has no numeric boundary`);
    }
  }
}

if (failures) {
  console.error(`FAIL ${BUNDLE} — ${failures} invariant violation(s)`);
  process.exit(1);
}
console.log(
  `OK ${BUNDLE} — schema pass, ${bundle.counts.courses_served}/${bundle.counts.courses_total} served ` +
    `(${courses.filter(([, c]) => c.calculator?.mode === "linear-total").length} linear-total, ` +
    `${courses.filter(([, c]) => c.calculator?.mode === "aggregate-ums").length} aggregate-ums, ` +
    `${courses.filter(([, c]) => (c.calculator?.mode ?? "none") === "display-only").length} display-only), ` +
    `${bundle.counts.courses_roadmap} roadmap`,
);
