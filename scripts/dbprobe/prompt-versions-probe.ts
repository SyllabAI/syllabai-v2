/**
 * T-DBPROBE-PROMPT-1 run-001 — READ-ONLY production DB probe.
 *
 * WHY: the toolkit walls (rubric/sow/lesson-plan 502 "failed validation twice")
 * persisted after the #918 bake even though the sandbox→US-egress repro of the
 * repo's migration-0008 templates + the exact wire shape returns COMPLETE JSON
 * from groq in 1.4-1.7s per call (diag-918, 2026-11-12). The remaining unknown
 * is the PRODUCTION prompt_versions template text (loadTemplate reads the prod
 * DB, templateCache per lambda) and the persisted failure forensics of the
 * recent FAILED rows (the /resources read path does not project failure_reason).
 *
 * READS ONLY — no INSERT/UPDATE/DELETE anywhere in this script.
 * Key-safety: the URI is never printed; templates are non-secret prompt text.
 *
 * Usage: bun scripts/dbprobe/prompt-versions-probe.ts "<SMOKE_DB_URI>"
 */
import postgres from "postgres";

const uri = process.argv[2] ?? "";
if (!uri) {
  console.error("usage: prompt-versions-probe.ts <DB_URI> (uri never printed)");
  process.exit(1);
}

const sql = postgres(uri, { max: 1, idle_timeout: 5, connect_timeout: 15 });

try {
  const versions = (await sql`
    select registry_key, version, template, created_at
    from prompt_versions
    order by registry_key, version`) as Array<{
    registry_key: string; version: string; template: string; created_at: Date;
  }>;
  console.log(`prompt_versions rows: ${versions.length}`);
  for (const v of versions) {
    const tpl = v.template ?? "";
    console.log(`\n===== ${v.registry_key} v${v.version} len=${tpl.length} created=${v.created_at?.toISOString?.() ?? v.created_at} =====`);
    console.log(tpl);
  }

  const failed = (await sql`
    select id, tool_type, status, model, provider_name, failure_reason, elapsed_ms, created_at
    from teaching_toolkit_resources
    where status = 'FAILED'
    order by created_at desc
    limit 12`) as Array<Record<string, unknown>>;
  console.log(`\n===== recent FAILED toolkit rows: ${failed.length} =====`);
  for (const r of failed) console.log(JSON.stringify(r));

  const ok = (await sql`
    select id, tool_type, status, model, provider_name, elapsed_ms, created_at
    from teaching_toolkit_resources
    where status <> 'FAILED'
    order by created_at desc
    limit 8`) as Array<Record<string, unknown>>;
  console.log(`\n===== recent non-FAILED toolkit rows: ${ok.length} =====`);
  for (const r of ok) console.log(JSON.stringify(r));
} finally {
  await sql.end();
}
