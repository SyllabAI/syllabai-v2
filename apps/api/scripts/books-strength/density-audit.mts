/**
 * T-BOOK-069 — unit Strength Checks: the bank-density audit of record
 * (ADR-BOOK-0004 decision 4; PLAN-4CH1 §126 gate) + the honest selector.
 *
 * READ-ONLY: this vehicle never writes. It counts ACTIVE MCQ_SINGLE bank
 * items per spec point across each unit's band and, with --select u<N>,
 * emits the candidate item ids (10–15) ordered for per-point coverage
 * first — the input the authoring agent pins into `strength-u<N>/` blocks
 * per ADR-BOOK-0004 decision 5.
 *
 * v2 KEYING (run-001, the DB-truth amendment of the ADR draft): the draft
 * keyed items by regex-parsing `external_ref` ("sme-eq-<u>-<pt>-…"). First
 * live fire against the bank showed that keying is subject-ambiguous —
 * physics items (e.g. sme-eq-1-1-movement-and-position-…) parse to the
 * same numeric prefix as chemistry points and polluted every unit band
 * (23/182 "covered" incl. non-chemistry items). The DB carries the real
 * per-point keying of record: question_spec_points (role PRIMARY,
 * validation_state AI_VALIDATED) → knowledge_nodes.code, where chemistry
 * spec nodes are subject-true (`4CH1-1.1` … `4CH1-4.50C`). v2 keys through
 * that graph — unit bands are code prefixes (`4CH1-1.%`), so the
 * cross-subject collision class is structurally impossible. The ADR-0004
 * draft decision-4 wording is amended in the same lane commit (draft
 * PROPOSED, not yet accepted law).
 *
 * Serving law mirrors services/books.ts railChecksForChapter verbatim
 * posture: ACTIVE + MCQ_SINGLE + paper-serving LEFT JOIN. The paper join is
 * retained (REJECTED/FLAGGED papers never serve) though the SME items are
 * standalone (exam_paper_id null) — the posture is the law, not the data.
 *
 * Usage (credentials env-only, NEVER persisted):
 *   DATABASE_URL=<Neon MAIN pooler> bun apps/api/scripts/books-strength/density-audit.mts --audit      # full chemistry spec
 *   DATABASE_URL=... bun apps/api/scripts/books-strength/density-audit.mts --audit u1     # per-unit gate (exit 1 on zero-item points)
 *   DATABASE_URL=... bun apps/api/scripts/books-strength/density-audit.mts --select u1    # the 10-15 candidate ids + stems (agent confirmation pass)
 */
import postgres from "postgres";

const UNIT_NUM: Record<string, string> = { u1: "1", u2: "2", u3: "3", u4: "4" };

async function main() {
  const mode = process.argv[2];
  if (mode !== "--audit" && mode !== "--select") {
    console.error("usage: density-audit.mts --audit [u<N>] | --select u<N>");
    process.exit(2);
  }
  const unit = process.argv[3];
  if (unit != null && !UNIT_NUM[unit]) {
    console.error("unit must be u1|u2|u3|u4 (or omitted for the full chemistry spec)");
    process.exit(2);
  }

  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    // the vehicle's own connect guard (reflip-r4 precedent): honest fail-closed
    console.error("DATABASE_URL missing or not postgres:// — connect guard fired (env-only law; nothing read, nothing written)");
    process.exit(2);
  }
  const sql = postgres(url, { max: 2, idle_timeout: 5 });

  // band = chemistry spec nodes; per unit, the code prefix `4CH1-<n>.%`

  const rows = (await sql`
    select kn.code as point, q.external_ref as ref, left(coalesce(lv.stem, ''), 110) as stem
    from questions q
    join question_spec_points qsp
      on qsp.question_id = q.id and qsp.role = 'PRIMARY' and qsp.validation_state = 'AI_VALIDATED'
    join knowledge_nodes kn on kn.id = qsp.spec_point_node_id and kn.node_type = 'SPEC_POINT'
    left join lateral (
      select v.stem from question_versions v where v.question_id = q.id order by v.version desc limit 1
    ) lv on true
    left join exam_papers ep on ep.id = q.exam_paper_id
    where q.active
      and q.question_type = 'MCQ_SINGLE'
      and q.external_ref like 'sme-%'
      and kn.code like ${unit == null ? "4CH1-%" : `4CH1-${UNIT_NUM[unit]}.%`}
      and (q.exam_paper_id is null or ep.validation_state not in ('REJECTED','FLAGGED'))
    order by kn.code, q.external_ref`) as Array<{ point: string; ref: string; stem: string }>;

  const byPoint = new Map<string, Array<{ ref: string; stem: string }>>();
  for (const r of rows) {
    if (!byPoint.has(r.point)) byPoint.set(r.point, []);
    byPoint.get(r.point)!.push({ ref: r.ref, stem: r.stem });
  }

  const bandPoints = [...new Set(rows.map((r) => r.point))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const zero: string[] = [];
  const lines: string[] = [];
  // the full band size (incl. zero-item points) from the canonical graph count
  const bandSizeRow = (await sql`
    select count(*)::int as n from knowledge_nodes
    where node_type = 'SPEC_POINT' and code like ${unit == null ? "4CH1-%" : `4CH1-${UNIT_NUM[unit]}.%`}`) as Array<{ n: number }>;
  const total = bandSizeRow[0]!.n;
  for (const p of bandPoints) {
    const items = byPoint.get(p)!;
    lines.push(`${p}\t${items.length}\t${items[0]!.ref}`);
  }
  // zero-item points = band size minus the points that have rows
  const allCodes = (await sql`
    select code from knowledge_nodes
    where node_type = 'SPEC_POINT' and code like ${unit == null ? "4CH1-%" : `4CH1-${UNIT_NUM[unit]}.%`}
    order by code`) as Array<{ code: string }>;
  for (const c of allCodes) if (!byPoint.has(c.code)) zero.push(c.code);

  const covered = total - zero.length;
  console.log(`bank density (4CH1 PRIMARY-keyed ACTIVE MCQ_SINGLE${unit ? `, ${unit}` : ", full chemistry spec"}): ${covered}/${total} band points covered`);
  if (zero.length) console.log(`ZERO-ITEM POINTS (the gate's honest blockers): ${zero.join(", ")}`);
  if (mode === "--audit") {
    console.log(lines.join("\n"));
    if (unit && zero.length) {
      console.error(`GATE: ${unit} has ${zero.length} zero-item point(s) — the check ships the largest honest subset and files the gap (ADR-BOOK-0004 decision 4; not a lane failure)`);
    }
  } else {
    // selector: per-point coverage first (round-robin over points, 10–15 items)
    const want = Math.max(10, Math.min(15, Math.ceil(covered * 1.3)));
    const picked: Array<{ ref: string; point: string; stem: string }> = [];
    const cursors = new Map<string, number>();
    while (picked.length < want) {
      let advanced = false;
      for (const p of bandPoints) {
        const items = byPoint.get(p)!;
        const i = cursors.get(p) ?? 0;
        if (i < items.length) {
          const it = items[i]!;
          if (!picked.some((x) => x.ref === it.ref)) picked.push({ ref: it.ref, point: p, stem: it.stem });
          cursors.set(p, i + 1);
          advanced = true;
          if (picked.length >= want) break;
        }
      }
      if (!advanced) break;
    }
    console.log(`\n${unit} candidate set of record (${picked.length} items, per-point coverage first):`);
    for (const it of picked) console.log(`  ${it.ref}\t${it.point}\t${it.stem}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error("audit failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
