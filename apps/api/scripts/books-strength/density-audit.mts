/**
 * T-BOOK-069 — unit Strength Checks: the bank-density audit of record
 * (ADR-BOOK-0004 decision 4; PLAN-4CH1 §126 gate) + the honest selector.
 *
 * READ-ONLY: this vehicle never writes. It counts ACTIVE MCQ_SINGLE bank
 * items per spec point across each unit's band (SME external_ref keying, the
 * T-BOOK-000 convention) and, with --select u<N>, emits the candidate item
 * ids (10–15) ordered for per-point coverage first — the input the authoring
 * agent pins into `strength-u<N>/` blocks per ADR-BOOK-0004 decision 5.
 *
 * Serving law mirrors services/books.ts railChecksForChapter verbatim
 * posture: ACTIVE + MCQ_SINGLE + paper-serving LEFT JOIN + current version.
 * Past-paper-tagged items are OUT of the count of record in v1 (no per-point
 * spec key without the deferred tagging sprint) — ADR-BOOK-0004 consequence.
 *
 * Usage (credentials env-only, NEVER persisted):
 *   DATABASE_URL=<Neon MAIN pooler> bun apps/api/scripts/books-strength/density-audit.mts --audit
 *   DATABASE_URL=... bun apps/api/scripts/books-strength/density-audit.mts --select u1
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import yaml from "js-yaml";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");
const SPEC_YAML = join(
  ROOT, "apps", "api", "src", "services", "teacher", "concept-graph", "specification_points.yaml",
);

// chapter -> canonical subsection (the lint's table of record, scripts/books/lint.mjs — REUSE, never redeclare)
const CHAPTER_SUBSECTION: Record<string, string> = {
  c01: "4CH1-S1-a", c02: "4CH1-S1-b", c03: "4CH1-S1-c", c04: "4CH1-S1-d",
  c05: "4CH1-S1-e", c06: "4CH1-S1-e", c07: "4CH1-S1-f", c08: "4CH1-S1-g",
  c09: "4CH1-S1-h", c10: "4CH1-S1-i",
  c11: "4CH1-S2-a", c12: "4CH1-S2-b", c13: "4CH1-S2-c", c14: "4CH1-S2-d",
  c15: "4CH1-S2-e", c16: "4CH1-S2-f", c17: "4CH1-S2-g", c18: "4CH1-S2-h",
  c19: "4CH1-S3-a", c20: "4CH1-S3-b", c21: "4CH1-S3-c",
  c22: "4CH1-S4-a", c23: "4CH1-S4-b", c24: "4CH1-S4-c", c25: "4CH1-S4-d",
  c26: "4CH1-S4-e", c27: "4CH1-S4-f", c28: "4CH1-S4-g", c29: "4CH1-S4-h",
};
const UNITS: Record<string, string[]> = {
  u1: ["c01","c02","c03","c04","c05","c06","c07","c08","c09","c10"],
  u2: ["c11","c12","c13","c14","c15","c16","c17","c18"],
  u3: ["c19","c20","c21"],
  u4: ["c22","c23","c24","c25","c26","c27","c28","c29"],
};

// SME external_ref keying: "sme-<marker>-<section>-<point(C)?>-..." (T-BOOK-000 convention;
// e.g. sme-eq-1-1-states-of-matter-q3 -> 1.1). Ambiguity-safe: 2-token numeric prefix only.
function specOfExternalRef(ref: string): string | null {
  const m = /^sme-[a-z]+-(\d+)-(\d+C?)-/.exec(ref);
  return m ? `${m[1]}.${m[2]}` : null;
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--audit" && mode !== "--select") {
    console.error("usage: density-audit.mts --audit | --select u<N>");
    process.exit(2);
  }
  const unit = mode === "--select" ? process.argv[3] : undefined;
  if (mode === "--select" && !(unit && UNITS[unit])) {
    console.error("--select requires u1|u2|u3|u4");
    process.exit(2);
  }

  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    // the vehicle's own connect guard (reflip-r4 precedent): honest fail-closed
    console.error("DATABASE_URL missing or not postgres:// — connect guard fired (env-only law; nothing read, nothing written)");
    process.exit(2);
  }
  const sql = postgres(url, { max: 2, idle_timeout: 5 });

  // unit band = the union of its chapters' canonical subsections' official codes
  const spec = yaml.load(readFileSync(SPEC_YAML, "utf8")) as {
    specification_points: Array<{ official_code: string; subsection: string }>;
  };
  const chapters = unit ? UNITS[unit] : Object.values(UNITS).flat();
  const subs = new Set(chapters.map((c) => CHAPTER_SUBSECTION[c]));
  const band = spec.specification_points.filter((p) => subs.has(p.subsection));

  const rows = (await sql`
    select q.external_ref as ref
    from questions q
    left join exam_papers ep on ep.id = q.exam_paper_id
    where q.active
      and q.question_type = 'MCQ_SINGLE'
      and q.external_ref like 'sme-%'
      and (q.exam_paper_id is null or ep.validation_state not in ('REJECTED','FLAGGED'))`) as Array<{ ref: string }>;

  const byPoint = new Map<string, string[]>();
  for (const r of rows) {
    const p = specOfExternalRef(r.ref);
    if (p == null) continue;
    if (!byPoint.has(p)) byPoint.set(p, []);
    byPoint.get(p)!.push(r.ref);
  }

  const zero: string[] = [];
  const lines: string[] = [];
  for (const p of band) {
    const items = (byPoint.get(p.official_code) ?? []).sort();
    if (items.length === 0) zero.push(p.official_code);
    lines.push(`${p.official_code}\t${items.length}\t${items.slice(0, 4).join(",")}`);
  }
  const total = band.length;
  const covered = total - zero.length;
  console.log(`bank density (SME-keyed ACTIVE MCQ_SINGLE): ${covered}/${total} band points covered`);
  if (zero.length) console.log(`ZERO-ITEM POINTS (the gate's honest blockers): ${zero.join(", ")}`);
  if (mode === "--audit") {
    console.log(lines.join("\n"));
    // the plan's gate: a unit with zero-item points FAILS the strength lane for that unit
    if (unit && zero.length) {
      console.error(`GATE FAIL: ${unit} has ${zero.length} zero-item point(s) — ship the largest honest subset + file the gap (ADR-BOOK-0004 decision 4)`);
      process.exit(1);
    }
  } else {
    // selector: per-point coverage first (round-robin over points, 10–15 items)
    const want = Math.max(10, Math.min(15, Math.ceil(covered * 1.3)));
    const picked: string[] = [];
    const cursors = new Map<string, number>();
    while (picked.length < want) {
      let advanced = false;
      for (const p of band) {
        const items = byPoint.get(p.official_code) ?? [];
        const i = cursors.get(p.official_code) ?? 0;
        if (i < items.length) {
          const id = items[i];
          if (!picked.includes(id)) picked.push(id);
          cursors.set(p.official_code, i + 1);
          advanced = true;
          if (picked.length >= want) break;
        }
      }
      if (!advanced) break;
    }
    console.log(`\n${unit} candidate set of record (${picked.length} items, per-point coverage first):`);
    for (const id of picked) console.log(`  ${id}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error("audit failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
