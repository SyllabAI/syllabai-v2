/**
 * T-SM-UNBLOCK-1 — the multi-axis serving unblock vehicle of record
 * (ADR-041; the unblock lever named by the OD-1 live probe receipt
 * `.syllabai/receipts/T-SM-ROLLOUT/od1-live-ma-probe-r0.json`).
 *
 * STRUCTURAL FACT (probe r0, runtime+code+DB triple-proven): all 147
 * multi-axis parts (>=2 VALIDATED part-bound LEVELS sibling schemes on the
 * NEWEST version of a STRUCTURED active question) sit on question versions
 * whose validation_state is SUGGESTED — the ADR-040 G-lanes birthed these
 * versions SUGGESTED and the VERSION state never walked the review
 * lifecycle. `assessment/submit.ts` submitStructured step 3 fails closed
 * (404) on any non-VALIDATED newest version, so 0/147 parts can receive a
 * learner answer through the sanctioned surface. Every other R4 piece is
 * byte-current on main (per-axis dispatch, band decisions summed at the
 * part, PR-B #641).
 *
 * THE UNBLOCK LAW (ADR-041): walk the chosen question versions through the
 * corpus's OWN review surface — `POST /api/v1/teacher/content/question-
 * versions/:id/validate` (TEACHER/ADMIN, one transactional UPDATE +
 * one audit row per version, `recordAudit(... "VALIDATE" ...)`). This
 * vehicle enforces that law mechanically:
 *
 *   - census/plan read the DB **read-only** (introspection is sanctioned);
 *   - fire NEVER touches the DB — the only writes ride the product API,
 *     which does the transaction + audit row itself;
 *   - there is deliberately NO mode that writes the DB.
 *
 * Modes (credentials env-only, NEVER persisted; no token ever reaches a
 * receipt, a log line, or this file):
 *
 *   DATABASE_URL=<Neon pooler> bun apps/api/scripts/smart-mark/promote-multi-axis-versions.mts --census [--out FILE]
 *     Recompute the multi-axis census of record (expected: 147 parts /
 *     492 VALIDATED axis-suffixed LEVELS schemes over 101 SUGGESTED newest
 *     versions — reconcile against the r0 numbers and fail loudly on drift)
 *     and emit the promotion manifest (per-version parts/axes/paper state).
 *
 *   DATABASE_URL=... bun ...mtts --plan --ids <id[,id...]|all>
 *     Human-review plan for the chosen subset (stage-1 law: ONE version).
 *
 *   bun ...mts --fire --api https://<host> --bearer <jwt> (--ids a[,b...] | --manifest FILE) [--dry-run] [--delay-ms N]
 *     Walk the review surface sequentially, one validate call per version,
 *     stop fail-closed on the first non-2xx. `--dry-run` prints the calls
 *     it would make. Requires an EXPLICIT scope (--ids/--manifest) — there
 *     is no implicit "all"; scope choice is the operator's.
 *
 * Exit codes: 0 ok · 1 fire stopped on non-2xx (fail-closed) · 2 usage /
 * connect / bearer guard (honest refusal, nothing read or sent).
 */
import fs from "node:fs";
import postgres from "postgres";

interface AxisScheme {
  scheme_id: string;
  version_label: string;
  bands: number;
}
interface PartRow {
  part_id: string;
  label: string;
  marks: number;
  axes: AxisScheme[];
}
interface VersionRow {
  version_id: string;
  question_id: string;
  version_no: number;
  validation_state: string;
  exam_paper_id: string | null;
  paper_state: string | null;
  ma_parts: number;
  axes_total: number;
  parts: PartRow[];
}

const EXPECTED = { parts: 147, axes: 492 };

function die(msg: string): never {
  console.error(msg);
  process.exit(2);
}

function usage(): never {
  die(
    "usage:\n" +
      "  promote-multi-axis-versions.mts --census [--out FILE]\n" +
      "  promote-multi-axis-versions.mts --plan --ids <id[,id...]|all>\n" +
      "  promote-multi-axis-versions.mts --fire --api <https base> --bearer <jwt> (--ids <id[,id...]>|--manifest FILE) [--dry-run] [--delay-ms N]",
  );
}

function connectGuard(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    // the vehicle's own connect guard (reflip-r4 precedent): honest fail-closed
    die(
      "DATABASE_URL missing or not postgres:// — connect guard fired (env-only law; nothing read, nothing written)",
    );
  }
  return postgres(url, { max: 2, idle_timeout: 5 });
}

/** The census of record: PART-unit (>=2 VALIDATED LEVELS schemes bound to the
 *  SAME part) on the NEWEST version of a STRUCTURED active question. */
const CENSUS_SQL = `
with newest as (
  select q.id as question_id, v.id as version_id, v.version, v.validation_state,
         q.exam_paper_id
  from questions q
  join question_versions v on v.question_id = q.id
  where v.version = (select max(version) from question_versions where question_id = q.id)
    and q.active = true and q.question_type = 'STRUCTURED'
),
partaxes as (
  select p.id as part_id, p.question_version_id, p.label, p.marks,
         count(distinct ms.id) as axis_schemes
  from question_parts p
  join mark_schemes ms on ms.question_part_id = p.id
    and ms.scheme_kind = 'LEVELS' and ms.validation_state = 'VALIDATED'
  group by p.id, p.question_version_id, p.label, p.marks
  having count(distinct ms.id) >= 2
)
select n.version_id, n.question_id, n.version, n.validation_state, n.exam_paper_id,
       pa.part_id, pa.label, pa.marks, pa.axis_schemes,
       ep.validation_state as paper_state
from partaxes pa
join newest n on n.version_id = pa.question_version_id
left join exam_papers ep on ep.id = n.exam_paper_id
order by n.question_id, pa.label`;

async function runCensus(outPath?: string) {
  const sql = connectGuard();
  const rows = (await sql.unsafe(CENSUS_SQL)) as unknown as Array<{
    version_id: string;
    question_id: string;
    version: number;
    validation_state: string;
    exam_paper_id: string | null;
    part_id: string;
    label: string;
    marks: number;
    axis_schemes: number;
    paper_state: string | null;
  }>;
  await sql.end();

  const byVersion = new Map<string, VersionRow>();
  for (const r of rows) {
    let v = byVersion.get(r.version_id);
    if (!v) {
      v = {
        version_id: r.version_id,
        question_id: r.question_id,
        version_no: Number(r.version),
        validation_state: r.validation_state,
        exam_paper_id: r.exam_paper_id,
        paper_state: r.paper_state,
        ma_parts: 0,
        axes_total: 0,
        parts: [],
      };
      byVersion.set(r.version_id, v);
    }
    v.ma_parts += 1;
    v.axes_total += Number(r.axis_schemes);
    v.parts.push({
      part_id: r.part_id,
      label: r.label,
      marks: Number(r.marks),
      axes: [], // filled below
    });
  }

  // axes per part — postgres-js expands the array into the IN-list (house style,
  // same client as the books-strength vehicle; parameterized, never interpolated)
  const allPartIds = rows.map((r) => r.part_id);
  const axisByPart = new Map<string, AxisScheme[]>();
  for (let i = 0; i < allPartIds.length; i += 200) {
    const chunk = allPartIds.slice(i, i + 200);
    const sql2 = connectGuard();
    const arows = (await sql2`
      select ms.question_part_id, ms.id, ms.version_label,
             (select count(*) from mark_bands mb where mb.mark_scheme_id = ms.id) as bands
      from mark_schemes ms
      where ms.question_part_id = any(${chunk}::uuid[])
        and ms.scheme_kind = 'LEVELS' and ms.validation_state = 'VALIDATED'
      order by ms.version_label`) as unknown as Array<{
      question_part_id: string;
      id: string;
      version_label: string;
      bands: string | number;
    }>;
    await sql2.end();
    for (const a of arows) {
      const list = axisByPart.get(a.question_part_id) ?? [];
      list.push({
        scheme_id: a.id,
        version_label: a.version_label,
        bands: Number(a.bands),
      });
      axisByPart.set(a.question_part_id, list);
    }
  }

  for (const v of byVersion.values()) {
    for (const p of v.parts) p.axes = axisByPart.get(p.part_id) ?? [];
  }

  const versions = [...byVersion.values()].sort(
    (a, b) => b.ma_parts - a.ma_parts || a.question_id.localeCompare(b.question_id),
  );
  const totalParts = versions.reduce((s, v) => s + v.ma_parts, 0);
  const totalAxes = versions.reduce((s, v) => s + v.axes_total, 0);

  // reconcile against the numbers of record — drift = fail loudly (exit 1)
  if (totalParts !== EXPECTED.parts || totalAxes !== EXPECTED.axes) {
    console.error(
      `CENSUS DRIFT: got ${totalParts} parts / ${totalAxes} axes; of record ${EXPECTED.parts} / ${EXPECTED.axes}. ` +
        "Do NOT fire against a drifted manifest — re-run the of-record census and reconcile first.",
    );
    process.exit(1);
  }

  const manifest = {
    vehicle: "apps/api/scripts/smart-mark/promote-multi-axis-versions.mts",
    mode: "census",
    law: "ADR-041: >=2 VALIDATED part-bound LEVELS sibling schemes on the SAME part, newest version, STRUCTURED+active; version promotion scope = whole question_versions row (validate per version, review surface)",
    expected_of_record: EXPECTED,
    census: { multi_axis_parts: totalParts, axis_schemes: totalAxes, versions: versions.length },
    versions,
    generated_at: new Date().toISOString(),
    notes:
      "read-only DB introspection; zero writes; drift-reconciled against od1-ma10-census-r0.json (147/492)",
  };
  const body = JSON.stringify(manifest, null, 1);
  if (outPath) {
    fs.writeFileSync(outPath, body);
    console.log(
      `manifest written ${outPath}: ${totalParts} parts / ${totalAxes} axes / ${versions.length} versions — drift check OK`,
    );
  } else {
    console.log(body);
  }
}

function resolveScope(
  flag: string | undefined,
  manifestPath: string | undefined,
): string[] {
  if (manifestPath) {
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      versions: Array<{ version_id: string }>;
    };
    const ids = m.versions.map((v) => v.version_id);
    if (ids.length === 0) die("manifest has zero versions");
    return ids;
  }
  if (flag === "all") die("--ids all is deliberately unsupported for fire: scope choice is the operator's");
  if (!flag) usage();
  const ids = flag.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) usage();
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) die(`not a uuid: ${id}`);
  }
  return ids;
}

async function runPlan(idsFlag: string) {
  const sql = connectGuard();
  const rows = (await sql.unsafe(CENSUS_SQL)) as unknown as Array<{
    version_id: string;
    question_id: string;
    version: number;
    validation_state: string;
    exam_paper_id: string | null;
    part_id: string;
    label: string;
    marks: number;
    axis_schemes: number;
    paper_state: string | null;
  }>;
  await sql.end();
  const wantAll = idsFlag === "all";
  const want = new Set(wantAll ? [] : idsFlag.split(",").map((s) => s.trim()));
  const chosen = rows.filter((r) => wantAll || want.has(r.version_id));
  if (!wantAll && chosen.length === 0) {
    die("no chosen id is a multi-axis SUGGESTED newest version — check the census manifest");
  }
  const perVersion = new Map<string, typeof rows>();
  for (const r of chosen) {
    const list = perVersion.get(r.version_id) ?? [];
    list.push(r);
    perVersion.set(r.version_id, list);
  }
  console.log(`PROMOTION PLAN — ${perVersion.size} version(s), review surface: POST /api/v1/teacher/content/question-versions/:id/validate\n`);
  for (const [vid, rs] of perVersion) {
    console.log(`version ${vid}`);
    console.log(`  question   ${rs[0].question_id} (newest version ${rs[0].version}, state ${rs[0].validation_state})`);
    console.log(`  paper      ${rs[0].exam_paper_id ?? "—"} (${rs[0].paper_state ?? "n/a"}) — V20 gate blocks only REJECTED/FLAGGED`);
    for (const r of rs) {
      console.log(`  part ${r.part_id} ${r.label} ${r.marks}m — ${r.axis_schemes} VALIDATED LEVELS axes`);
    }
    console.log(`  effect     one UPDATE + one audit row (VALIDATE ${rs[0].validation_state} -> VALIDATED); serves submitStructured step 3\n`);
  }
}

async function runFire(opts: {
  api: string;
  bearer: string;
  ids: string[];
  dryRun: boolean;
  delayMs: number;
}) {
  const { api, bearer, ids, dryRun, delayMs } = opts;
  if (!api.startsWith("https://")) die("--api must be https");
  if (bearer.length < 20) die("--bearer missing/too short — the operator's key turn is required (exit 2, nothing sent)");
  console.log(`FIRE plan: ${ids.length} validate call(s) -> ${api}/api/v1/teacher/content/question-versions/:id/validate${dryRun ? " (DRY-RUN)" : ""}`);
  const results: Array<{ version_id: string; http_status: number | null; ok: boolean; body: string }> = [];
  let stopped: number | null = null;
  for (const id of ids) {
    const url = `${api}/api/v1/teacher/content/question-versions/${id}/validate`;
    if (dryRun) {
      console.log(`DRY-RUN POST ${url}`);
      results.push({ version_id: id, http_status: null, ok: true, body: "(dry-run)" });
      continue;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}` },
    });
    const text = (await res.text()).slice(0, 300);
    const ok = res.status >= 200 && res.status < 300;
    console.log(`POST ${id} -> ${res.status} ${ok ? "OK" : "FAIL"} ${text}`);
    results.push({ version_id: id, http_status: res.status, ok, body: text });
    if (!ok) {
      stopped = res.status;
      break; // fail-closed: stop on the first non-2xx, report, exit 1
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  const okCount = results.filter((r) => r.ok && !dryRun).length;
  console.log(
    JSON.stringify(
      {
        mode: "fire",
        dry_run: dryRun,
        attempted: results.length,
        validated: okCount,
        stopped_at_http: stopped,
        results,
        law: "each 2xx = one transactional UPDATE + one recordAudit(VALIDATE) row written by the product surface; this vehicle wrote nothing to the DB",
      },
      null,
      1,
    ),
  );
  if (stopped !== null) process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (mode === "--census") {
    await runCensus(flag("--out"));
  } else if (mode === "--plan") {
    const ids = flag("--ids");
    if (!ids) usage();
    await runPlan(ids);
  } else if (mode === "--fire") {
    const api = flag("--api");
    const bearer = flag("--bearer");
    const manifest = flag("--manifest");
    const idsFlag = flag("--ids");
    if (!api || !bearer || (!manifest && !idsFlag)) usage();
    await runFire({
      api,
      bearer,
      ids: resolveScope(idsFlag, manifest),
      dryRun: argv.includes("--dry-run"),
      delayMs: Number(flag("--delay-ms") ?? "250"),
    });
  } else {
    usage();
  }
}

main().catch((e) => {
  console.error("vehicle error:", e instanceof Error ? e.message : String(e));
  process.exit(2);
});
