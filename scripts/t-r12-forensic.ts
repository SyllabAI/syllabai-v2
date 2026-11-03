/**
 * r12 forensic — read-only census of the r12 smoke sessions in PROD DB:
 * how far did each HTTP call actually get? (rows written or not)
 *   PROD_DATABASE_URL=postgres://... bun run scripts/t-r12-forensic.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.PROD_DATABASE_URL!);
const UIDS = ["c4e1b601-07e7-45df-9e86-f6b00243a33a"];
const SESSIONS = ["fb354809-a9e2-4f47-a62f-0f1751ad27e6", "c252ff04-0d21-4f72-882a-e0e87263ce1e"];

const sessions = (await sql`
  select id, user_id, status, flags, llm_call_count, message_count, created_at, updated_at
  from teach_sessions where user_id = any(${UIDS}) order by created_at
`) as any[];
console.log("== teach_me_sessions ==");
for (const s of sessions) console.log(JSON.stringify({ id: s.id.slice(0, 8), status: s.status, flags: s.flags, llm: s.llm_call_count, mc: s.message_count, created: s.created_at, updated: s.updated_at }));

const sids = sessions.length ? sessions.map((s) => s.id) : SESSIONS;
const messages = (await sql`
  select session_id, seq, role, kind, length(text) as chars, created_at
  from teach_messages where session_id = any(${sids}) order by session_id, seq
`) as any[];
console.log("== teach_me_messages ==");
for (const m of messages) console.log(JSON.stringify({ session: m.session_id.slice(0, 8), seq: m.seq, role: m.role, kind: m.kind, chars: m.chars }));

const coverage = (await sql`
  select session_id, objective_ordinal, covered, length(coalesce(evidence_quote,'')) as qlen
  from teach_objective_coverages where session_id = any(${sids}) order by session_id, objective_ordinal
`) as any[];
console.log("== teach_me_coverage ==");
for (const c of coverage) console.log(JSON.stringify({ session: c.session_id.slice(0, 8), ord: c.objective_ordinal, covered: c.covered, qlen: c.qlen }));

const reviews = (await sql`
  select session_id, created_at from teach_review_cards where session_id = any(${sids})
`) as any[];
console.log("== teach_review_cards ==");
for (const r of reviews) console.log(JSON.stringify({ session: r.session_id.slice(0, 8), created: r.created_at }));
