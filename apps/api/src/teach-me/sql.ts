/**
 * T-TEACHME-001 · run-002 · apps/api/src/teach-me/sql.ts
 *
 * The real TeachMeStore over the house structural SqlFn seam (the
 * services/learner-pdf-drawings precedent): every method maps onto the
 * run-001/002 teach_* tables plus the read-only course-input joins
 * (knowledge_nodes canon, revision_note corpus, question_spec_points ⋈
 * questions ⋈ exam_papers anchors). Transactions are NOT used: the write
 * paths are appends + single-row counter updates; the append-only trigger on
 * teach_objective_coverages is the D1 law at the DB layer.
 *
 * Course-input loader notes (Wave-0 laws, disclosed in the run-002 receipt):
 *  - revision_note.spec_point_codes is a delimited TEXT cell — SQL narrows via
 *    strpos, then the JS verifies EXACT code tokens (no substring false hits).
 *  - knowledge_nodes.applicability (course scoping jsonb) is NOT filtered on
 *    in v1: spec-point codes are course-canonical per the curriculum of
 *    record; the flags gate is the course scoping of record (TEACH_ME_PLAN §1).
 *  - prereq warnings (T-C11 KG closure) return [] in v1 — the edge relation
 *    vocabulary gets confirmed by a follow-up before it feeds prompts.
 */
import type {
  ReviewInputBundle,
  SpecPointCanonRow,
  SqlFn,
  TeachMeCandidateRow,
  TeachMeCoverageRow,
  TeachMeMessageRow,
  TeachMeObjectiveRow,
  TeachMeSessionRow,
  TeachMeStore,
} from "./types";

const str = (v: unknown): string => String(v ?? "");
const nul = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => Number(v ?? 0);
const boolOf = (v: unknown): boolean => v === true || v === "t" || v === "true";
const jsonOf = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
};

/** Exact spec-code token check (spec_point_codes is delimited free text). */
const codesTokenize = (cell: string): Set<string> =>
  new Set(cell.toLowerCase().split(/[^a-z0-9._/-]+/).filter(Boolean));

export function createTeachMeStore(sql: SqlFn): TeachMeStore {
  const store: TeachMeStore = {
    async countSessionsToday(userId, dayStartUtc) {
      const rows = await sql`
        SELECT COUNT(*)::int AS n
        FROM teach_sessions
        WHERE user_id = ${userId} AND created_at >= ${dayStartUtc.toISOString()}`;
      return num(rows[0]?.n);
    },

    async insertSession(session, objectives) {
      await sql`
        INSERT INTO teach_sessions
          (id, user_id, course_id, spec_point_ids, difficulty, length, mode, status,
           message_count, llm_call_count, tokens_used, flags, created_at, ended_at)
        VALUES (${session.id}, ${session.userId}, ${session.courseId},
                ${JSON.stringify(session.specPointIds)}::jsonb, ${session.difficulty},
                ${session.length}, ${session.mode}, ${session.status},
                ${session.messageCount}, ${session.llmCallCount}, ${session.tokensUsed},
                ${JSON.stringify(session.flags)}::jsonb, ${session.createdAt}, ${session.endedAt})`;
      for (const o of objectives) {
        await sql`
          INSERT INTO teach_objectives (id, session_id, ordinal, text, spec_point_ids, status, created_at)
          VALUES (${o.id}, ${o.sessionId}, ${o.ordinal}, ${o.text},
                  ${JSON.stringify(o.specPointIds)}::jsonb, ${o.status}, ${o.createdAt})`;
      }
    },

    async findSession(id) {
      const rows = await sql`SELECT * FROM teach_sessions WHERE id = ${id}`;
      const s = rows[0];
      if (!s) return null;
      const oRows = await sql`
        SELECT * FROM teach_objectives WHERE session_id = ${id} ORDER BY ordinal ASC`;
      const session: TeachMeSessionRow = {
        id: str(s.id),
        userId: str(s.user_id),
        courseId: str(s.course_id),
        specPointIds: jsonOf<string[]>(s.spec_point_ids, []),
        difficulty: str(s.difficulty) as TeachMeSessionRow["difficulty"],
        length: str(s.length) as TeachMeSessionRow["length"],
        mode: str(s.mode) as TeachMeSessionRow["mode"],
        status: str(s.status) as TeachMeSessionRow["status"],
        messageCount: num(s.message_count),
        llmCallCount: num(s.llm_call_count),
        tokensUsed: num(s.tokens_used),
        flags: jsonOf<Record<string, unknown>>(s.flags, {}),
        createdAt: new Date(str(s.created_at)).toISOString(),
        endedAt: s.ended_at == null ? null : new Date(str(s.ended_at)).toISOString(),
      };
      const objectives: TeachMeObjectiveRow[] = oRows.map((o) => ({
        id: str(o.id),
        sessionId: str(o.session_id),
        ordinal: num(o.ordinal),
        text: str(o.text),
        specPointIds: jsonOf<string[]>(o.spec_point_ids, []),
        status: str(o.status) as TeachMeObjectiveRow["status"],
        createdAt: new Date(str(o.created_at)).toISOString(),
      }));
      return { session, objectives };
    },

    async updateSession(id, patch) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      const push = (clause: string, value: unknown) => {
        vals.push(value);
        sets.push(clause.replace("?", `$${vals.length}`));
      };
      if (patch.status !== undefined) push("status = ?", patch.status);
      if (patch.messageCount !== undefined) push("message_count = ?", patch.messageCount);
      if (patch.llmCallCount !== undefined) push("llm_call_count = ?", patch.llmCallCount);
      if (patch.tokensUsed !== undefined) push("tokens_used = ?", patch.tokensUsed);
      if (patch.endedAt !== undefined) push("ended_at = ?", patch.endedAt);
      if (patch.flags !== undefined) push("flags = ?::jsonb", JSON.stringify(patch.flags));
      if (sets.length === 0) return;
      const stmt = `UPDATE teach_sessions SET ${sets.join(", ")} WHERE id = $${vals.length + 1}`;
      await sql([stmt] as unknown as TemplateStringsArray, ...vals, id);
    },

    async appendMessage(row) {
      await sql`
        INSERT INTO teach_messages (id, session_id, seq, role, kind, text, created_at)
        VALUES (${row.id}, ${row.sessionId}, ${row.seq}, ${row.role}, ${row.kind}, ${row.text}, ${row.createdAt})`;
    },

    async listMessages(sessionId) {
      const rows = await sql`
        SELECT * FROM teach_messages WHERE session_id = ${sessionId} ORDER BY seq ASC`;
      return rows.map<TeachMeMessageRow>((m) => ({
        id: str(m.id),
        sessionId: str(m.session_id),
        seq: num(m.seq),
        role: str(m.role) as TeachMeMessageRow["role"],
        kind: nul(m.kind) as TeachMeMessageRow["kind"],
        text: str(m.text),
        createdAt: new Date(str(m.created_at)).toISOString(),
      }));
    },

    async appendCoverage(rowsIn) {
      for (const r of rowsIn) {
        await sql`
          INSERT INTO teach_objective_coverages
            (id, session_id, objective_id, message_seq, covered, evidence_quote, verdict, contradiction_detected, created_at)
          VALUES (${r.id}, ${r.sessionId}, ${r.objectiveId}, ${r.messageSeq}, ${r.covered},
                  ${r.evidenceQuote}, ${r.verdict}, ${r.contradictionDetected}, ${r.createdAt})`;
      }
    },

    async listCoverage(sessionId) {
      const rows = await sql`
        SELECT * FROM teach_objective_coverages WHERE session_id = ${sessionId} ORDER BY message_seq ASC`;
      return rows.map<TeachMeCoverageRow>((c) => ({
        id: str(c.id),
        sessionId: str(c.session_id),
        objectiveId: str(c.objective_id),
        messageSeq: num(c.message_seq),
        covered: boolOf(c.covered),
        evidenceQuote: str(c.evidence_quote),
        verdict: str(c.verdict),
        contradictionDetected: boolOf(c.contradiction_detected),
        createdAt: new Date(str(c.created_at)).toISOString(),
      }));
    },

    async recentCreditSpecPointIds(userId, specPointIds, sinceUtc) {
      if (specPointIds.length === 0) return [];
      const rows = await sql`
        SELECT DISTINCT o.spec_point_ids AS sps
        FROM teach_objective_coverages c
        JOIN teach_objectives o ON o.id = c.objective_id
        JOIN teach_sessions s ON s.id = c.session_id
        WHERE s.user_id = ${userId} AND c.created_at >= ${sinceUtc.toISOString()}`;
      const wanted = new Set(specPointIds);
      const hits = new Set<string>();
      for (const r of rows) {
        for (const sp of jsonOf<string[]>(r.sps, [])) if (wanted.has(sp)) hits.add(sp);
      }
      return [...hits];
    },

    async insertMisconceptionCandidates(rowsIn) {
      let inserted = 0;
      for (const r of rowsIn) {
        try {
          await sql`
            INSERT INTO teach_misconception_candidates
              (id, session_id, spec_point_ids, statement, matched_misconception_id, confidence, status, created_at)
            VALUES (${r.id}, ${r.sessionId}, ${JSON.stringify(r.specPointIds)}::jsonb, ${r.statement},
                    ${r.matchedMisconceptionId}, ${r.confidence}, ${r.status}, ${r.createdAt})`;
          inserted++;
        } catch (e) {
          // 23505 = the re-scoped partial unique index (one open candidate per
          // session) — an idempotent re-end must not fail the session.
          if (str((e as { code?: string }).code) === "23505") continue;
          throw e;
        }
      }
      return inserted;
    },

    async insertReviewCard(sessionId, card, createdAt) {
      await sql`
        INSERT INTO teach_review_cards (id, session_id, card, created_at)
        VALUES (${crypto.randomUUID()}, ${sessionId}, ${JSON.stringify(card)}::jsonb, ${createdAt})
        ON CONFLICT (session_id) DO NOTHING`;
    },

    async findReviewCard(sessionId) {
      const rows = await sql`
        SELECT card FROM teach_review_cards WHERE session_id = ${sessionId} LIMIT 1`;
      return rows[0] ? jsonOf<Record<string, unknown>>(rows[0].card, {}) : null;
    },

    async updateObjectivesStatus(objectiveIds, status) {
      for (const id of objectiveIds) {
        await sql`UPDATE teach_objectives SET status = ${status} WHERE id = ${id}`;
      }
    },

    async listSessions(userId, courseId) {
      const rows =
        courseId == null
          ? await sql`
              SELECT * FROM teach_sessions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`
          : await sql`
              SELECT * FROM teach_sessions WHERE user_id = ${userId} AND course_id = ${courseId}
              ORDER BY created_at DESC LIMIT 50`;
      return rows.map<TeachMeSessionRow>((s) => ({
        id: str(s.id),
        userId: str(s.user_id),
        courseId: str(s.course_id),
        specPointIds: jsonOf<string[]>(s.spec_point_ids, []),
        difficulty: str(s.difficulty) as TeachMeSessionRow["difficulty"],
        length: str(s.length) as TeachMeSessionRow["length"],
        mode: str(s.mode) as TeachMeSessionRow["mode"],
        status: str(s.status) as TeachMeSessionRow["status"],
        messageCount: num(s.message_count),
        llmCallCount: num(s.llm_call_count),
        tokensUsed: num(s.tokens_used),
        flags: jsonOf<Record<string, unknown>>(s.flags, {}),
        createdAt: new Date(str(s.created_at)).toISOString(),
        endedAt: s.ended_at == null ? null : new Date(str(s.ended_at)).toISOString(),
      }));
    },

    async loadSpecPointCanon(specPointCodes) {
      if (specPointCodes.length === 0) return [];
      const rows = await sql`
        SELECT id, code, title, description
        FROM knowledge_nodes
        WHERE node_type = 'SPEC_POINT' AND code = ANY(${specPointCodes}::text[])`;
      return rows.map<SpecPointCanonRow>((r) => ({
        id: str(r.id),
        code: str(r.code),
        title: str(r.title),
        description: nul(r.description),
      }));
    },

    async loadNoteCorpus(specPointCodes) {
      if (specPointCodes.length === 0) return [];
      const wanted = new Set(specPointCodes.map((c) => c.toLowerCase()));
      // one REGEX parameter (codes are pre-escaped, never raw SQL); the exact
      // code-token verification happens below (strpos/regex alone would match
      // 2.3 inside 2.34)
      const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = `(^|[^a-z0-9._/-])(${specPointCodes.map(esc).join("|")})([^a-z0-9._/-]|$)`;
      const rows = await sql`
        SELECT note_id, title, body_md, spec_point_codes
        FROM revision_note
        WHERE spec_point_codes ~* ${pattern}
        LIMIT 24`;
      return rows
        .filter((r) => {
          const tokens = codesTokenize(str(r.spec_point_codes));
          for (const c of wanted) if (tokens.has(c)) return true;
          return false;
        })
        .map((r) => ({ noteId: str(r.note_id), title: str(r.title), bodyMd: str(r.body_md) }));
    },

    async loadReviewInputs(input) {
      const { specPointCodes, specPointNodeIds, courseHrefBase } = input;
      const bundle: ReviewInputBundle = { registry: [], anchors: [], practice: [] };

      // misconception registry excerpt (MISCONCEPTION nodes edge-adjacent to these spec points)
      if (specPointNodeIds.length > 0) {
        const rows = await sql`
          SELECT DISTINCT n.code, COALESCE(n.description, n.title) AS statement
          FROM knowledge_edges e
          JOIN knowledge_nodes n
            ON (n.id = e.source_node_id OR n.id = e.target_node_id)
          WHERE n.node_type = 'MISCONCEPTION'
            AND (e.source_node_id = ANY(${specPointNodeIds}::uuid[]) OR e.target_node_id = ANY(${specPointNodeIds}::uuid[]))
          LIMIT 12`;
        bundle.registry = rows.map((r) => ({ code: str(r.code), statement: str(r.statement) }));
      }

      // real past-paper anchors (serving corpus, never invented)
      if (specPointNodeIds.length > 0) {
        const rows = await sql`
          SELECT kn.code AS spec_code, q.external_ref AS question_ref,
                 ep.board, ep.session_label, ep.series, ep.year, ep.paper_code
          FROM question_spec_points qsp
          JOIN questions q ON q.id = qsp.question_id AND q.active = true
          JOIN knowledge_nodes kn ON kn.id = qsp.spec_point_node_id
          JOIN exam_papers ep ON ep.id = q.exam_paper_id
          WHERE qsp.spec_point_node_id = ANY(${specPointNodeIds}::uuid[])
          LIMIT 6`;
        bundle.anchors = rows.map((r) => ({
          specPointId: str(r.spec_code),
          paperRef: [str(r.board), nul(r.session_label) ?? str(r.series), str(r.year), str(r.paper_code)]
            .filter(Boolean)
            .join(" "),
          questionRef: str(r.question_ref),
        }));
      }

      // real practice resources: the course's revision notes + question-bank pages
      const notes = await this.loadNoteCorpus(specPointCodes);
      for (const note of notes.slice(0, 3)) {
        bundle.practice.push({
          label: `Revision notes — ${note.title}`,
          resourceType: "revision_notes",
          href: `${courseHrefBase}/revision-notes`,
        });
      }
      const papers = new Set(bundle.anchors.map((a) => a.paperRef));
      for (const p of [...papers].slice(0, 3)) {
        bundle.practice.push({
          label: `Question bank — ${p}`,
          resourceType: "question_bank",
          href: `${courseHrefBase}/exam-questions`,
        });
      }
      return bundle;
    },
  };
  return store;
}
