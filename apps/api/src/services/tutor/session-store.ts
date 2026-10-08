/**
 * TutorSessionService port (T-MIG-060 tranche 1) — frozen source @ 6cad6ef:
 * src/main/java/com/syllabai/tutor/TutorSessionService.java :35-288,
 * line-against-line (the §22 tutor session store, s140 + s143 + V53 + R13).
 *
 * Spec §22 tutor session store: create, append, retrieve — the only
 * sanctioned server-side transcript surface. Ownership is the boundary:
 * every operation resolves the session against the calling learner id, and a
 * foreign session id is INDISTINGUISHABLE from an unknown one. The ask path
 * appends the user turn and the assistant turn together after the pipeline
 * completes — a failed ask persists nothing. Deletion is the learner's
 * data-minimization right (§20): the cross-session memory digest is built
 * from engagement/BKT/review rows, never from these transcripts.
 */
import {
  ROLE_ASSISTANT,
  ROLE_USER,
  stripCitationMarkers,
} from "./conversation";
import { ConflictError, NotFoundError } from "./errors";
import type { SqlFn } from "./sql";

/** the list cap (:43) — an unbounded list must never become a
 *  full-transcript dump by accident. */
export const MAX_LISTED_SESSIONS = 50;
/** title = the opening question, one line, bounded (:47) */
export const MAX_TITLE_CHARS = 120;
/** per-learner open-session cap (R13, :101) */
export const MAX_SESSIONS_PER_LEARNER = 50;
/** stored transcript bound (:281-287) — prompts cap turns at 2000;
 *  transcripts get air */
export const MAX_CONTENT_CHARS = 4000;

/**
 * Scalar-param IN-list — the services/assessment/submit.ts :383 proven wire
 * law at dynamic length. A bound JS array is a SINGLE wire value on both
 * driver adapters: toQuery renders `where x in ${ids}` as `x in $1` and the
 * Neon WebSocket wire answers with a syntax/type error (the 500 the
 * T-MIG-092 run-002 L06 golden-verify caught live on GET /tutor/sessions
 * with a non-empty list). Every id must ride its own $n parameter; the
 * commas are template text. Returns the (strings, ...params) spread exactly
 * in the tagged-call shape the structural SqlFn contract consumes.
 */
function inList(
  prefix: string,
  ids: readonly string[],
  suffix: string,
): [TemplateStringsArray, ...string[]] {
  const parts = [prefix];
  for (let i = 1; i < ids.length; i++) parts.push(", ");
  parts.push(suffix);
  const strings = Object.assign([...parts], {
    raw: [...parts],
  }) as unknown as TemplateStringsArray;
  return [strings, ...ids];
}

export interface TurnView {
  seq: number;
  role: string;
  content: string;
  evidenceCount: number;
  refused: boolean;
  model: string | null;
  provider: string | null;
  latencyMs: number | null;
  at: string; // ISO-8601 instant
}

export interface SessionView {
  sessionId: string;
  createdAt: string;
  lastActiveAt: string;
  /** V53: the course this chat serves (null = course-less history) */
  courseRef: string | null;
  turns: TurnView[];
}

/** One row of the learner's conversation list (s143 :76-78): identity +
 *  recency + a derived title + how much was said. No transcript content
 *  rides the list — the opening question only, which the learner themselves
 *  typed. */
export interface SessionSummaryView {
  sessionId: string;
  createdAt: string;
  lastActiveAt: string;
  courseRef: string | null;
  turnCount: number;
  title: string | null;
}

/** A session id an ask may append to (null = do not persist this ask).
 *  V53: the FIRST non-null ref fixes the session's serving course, a later
 *  DIFFERENT ref is a 409 (never a scope switch). (:84-95) */
export interface AppendRequest {
  sessionId: string;
  question: string;
  answer: string;
  evidenceCount: number;
  refused: boolean;
  model: string | null;
  provider: string | null;
  latencyMs: number | null;
  courseRef: string | null;
}

interface SessionRow {
  id: string;
  learner_id: string;
  created_at: string;
  last_active_at: string;
  course_ref: string | null;
}

interface TurnRow {
  id: string;
  session_id: string;
  seq: number;
  role: string;
  content: string;
  evidence_count: number;
  refused: boolean;
  answer_model: string | null;
  answer_provider: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface Clock {
  now(): Date;
}

export function buildTutorSessionStore(sql: SqlFn, clock: Clock) {
  const toView = (s: SessionRow, turns: TurnView[]): SessionView => ({
    sessionId: s.id,
    createdAt: s.created_at,
    lastActiveAt: s.last_active_at,
    courseRef: s.course_ref,
    turns,
  });

  const owned = async (learnerId: string, sessionId: string): Promise<SessionRow> => {
    const rows = (await sql`
      select id, learner_id, created_at, last_active_at, course_ref
      from tutor_sessions
      where id = ${sessionId} and learner_id = ${learnerId}`) as unknown as SessionRow[];
    const row = rows[0];
    if (row == null) {
      // a foreign session id is indistinguishable from an unknown one
      // (:276-279) — the error names the type and the id, no existence signal
      throw new NotFoundError("tutor session", sessionId);
    }
    return row;
  };

  const transcriptOf = async (sessionId: string): Promise<TurnView[]> => {
    const rows = (await sql`
      select id, session_id, seq, role, content, evidence_count, refused,
             answer_model, answer_provider, latency_ms, created_at
      from tutor_session_turns
      where session_id = ${sessionId}
      order by seq`) as unknown as TurnRow[];
    return rows.map((t) => ({
      seq: Number(t.seq),
      role: t.role,
      content: t.content,
      evidenceCount: Number(t.evidence_count),
      refused: t.refused,
      model: t.answer_model,
      provider: t.answer_provider,
      latencyMs: t.latency_ms == null ? null : Number(t.latency_ms),
      at: t.created_at,
    }));
  };

  return {
    /**
     * New empty session for the learner ("New chat" / first ask). :104-116 —
     * the R13 cap fires as a Conflict (409).
     */
    async create(learnerId: string): Promise<SessionView> {
      const countRows = (await sql`
        select count(*) as n from tutor_sessions where learner_id = ${learnerId}`) as unknown as Array<{
        n: string | number;
      }>;
      const count = countRows[0]?.n ?? 0;
      if (Number(count) >= MAX_SESSIONS_PER_LEARNER) {
        throw new ConflictError(
          `session limit reached (${MAX_SESSIONS_PER_LEARNER}) — delete an old chat to start a new one`,
        );
      }
      const now = clock.now();
      const inserted = (await sql`
        insert into tutor_sessions (id, learner_id, created_at, last_active_at, course_ref)
        values (gen_random_uuid(), ${learnerId}, ${now.toISOString()}, ${now.toISOString()}, null)
        returning id, learner_id, created_at, last_active_at, course_ref`) as unknown as SessionRow[];
      const session = inserted[0];
      if (session == null) throw new Error("tutor session insert returned no row");
      return toView(session, []);
    },

    /**
     * §22 retrieval: the caller's own session transcript, seq-ordered.
     * A session owned by another learner 404s exactly like an unknown id.
     * (:118-130)
     */
    async view(learnerId: string, sessionId: string): Promise<SessionView> {
      const session = await owned(learnerId, sessionId);
      return toView(session, await transcriptOf(session.id));
    },

    /**
     * The learner's most recent session with its transcript (refresh
     * hydration). Null when the learner has never chatted. (:132-141)
     */
    async latest(learnerId: string): Promise<SessionView | null> {
      const rows = (await sql`
        select id, learner_id, created_at, last_active_at, course_ref
        from tutor_sessions
        where learner_id = ${learnerId}
        order by last_active_at desc
        limit 1`) as unknown as SessionRow[];
      const session = rows[0];
      if (session == null) return null;
      void session;
      return toView(session, await transcriptOf(session.id));
    },

    /**
     * The learner's conversations, most recently active first (s143 :143-179):
     * one summary row per chat — derived title (the opening question) and
     * turn count, never transcript bodies. Empty chats appear honestly with
     * a null title and zero turns. Two batched queries feed every summary.
     */
    async list(learnerId: string): Promise<SessionSummaryView[]> {
      const recent = (await sql`
        select id, learner_id, created_at, last_active_at, course_ref
        from tutor_sessions
        where learner_id = ${learnerId}
        order by last_active_at desc
        limit ${MAX_LISTED_SESSIONS}`) as unknown as SessionRow[];
      if (recent.length === 0) return [];
      const ids = recent.map((s) => s.id);
      const counts = (await sql(
        ...inList(
          "select session_id, count(*) as n from tutor_session_turns where session_id in (",
          ids,
          ") group by session_id",
        ),
      )) as unknown as Array<{ session_id: string; n: string | number }>;
      const countBy = new Map(counts.map((r) => [r.session_id, Number(r.n)]));
      const firstTurns = (await sql(
        ...inList(
          "select session_id, role, content from tutor_session_turns where session_id in (",
          ids,
          ") and seq = 1",
        ),
      )) as unknown as Array<{
        session_id: string;
        role: string;
        content: string;
      }>;
      // defensive: the append contract makes seq 1 the opening USER turn,
      // but the title must never leak an answer row by accident (:165-172)
      const titles = new Map<string, string>();
      for (const first of firstTurns) {
        if (ROLE_USER === first.role) titles.set(first.session_id, titleOf(first.content));
      }
      return recent.map((session) => ({
        sessionId: session.id,
        createdAt: session.created_at,
        lastActiveAt: session.last_active_at,
        courseRef: session.course_ref,
        turnCount: countBy.get(session.id) ?? 0,
        title: titles.get(session.id) ?? null,
      }));
    },

    /**
     * Delete one of the learner's own chats (s143 :189-195): the transcript
     * rows go first, then the session anchor. A foreign or unknown session
     * id 404s exactly like every other operation.
     */
    async delete(learnerId: string, sessionId: string): Promise<void> {
      const session = await owned(learnerId, sessionId);
      await sql`delete from tutor_session_turns where session_id = ${session.id}`;
      await sql`delete from tutor_sessions where id = ${session.id}`;
    },

    /**
     * Ownership probe for the ask path (s140 :205-214): a foreign or unknown
     * session id throws before the pipeline runs, so a tampered client fails
     * fast with a 404 instead of spending an LLM call and failing after.
     */
    async requireOwned(learnerId: string, sessionId: string): Promise<void> {
      await owned(learnerId, sessionId);
    },

    /**
     * V53 course-consistency probe (ADR-030, :216-234): a session that
     * already serves a course refuses a DIFFERENT one up front (409, the
     * same integrity shape as the foreign-session probe). A null stored ref
     * (course-less history) accepts any ref: the first one wins at append.
     */
    async requireCourseConsistent(
      learnerId: string,
      sessionId: string,
      courseRef: string | null,
    ): Promise<void> {
      const session = await owned(learnerId, sessionId);
      const served = session.course_ref;
      if (served != null && courseRef != null && served !== courseRef) {
        throw new ConflictError(
          `this chat serves course ${served} — it cannot switch to ${courseRef}; start a new chat for the other course`,
        );
      }
    },

    /**
     * Append one exchange (user question + tutor answer) after a completed
     * ask (:236-274). Foreign/unknown session id ⇒ 404 — the controller
     * treats a missing session on an ask as "do not persist" before calling
     * here, so this throw is a genuine integrity signal. V53: write-once
     * course attach + 409 mismatch backstop (the race guard). The user turn
     * and the assistant turn save together (nextSeq, nextSeq+1); the
     * assistant content is bound AND citation-marker-stripped (:268-269 —
     * a stored transcript renders as the learner-visible prose).
     */
    async append(learnerId: string, exchange: AppendRequest): Promise<void> {
      const session = await owned(learnerId, exchange.sessionId);
      const now = clock.now();
      let courseRef = session.course_ref;
      if (exchange.courseRef != null && exchange.courseRef.trim().length > 0) {
        const wanted = exchange.courseRef.trim();
        if (courseRef == null) {
          courseRef = wanted; // attachCourse :77-80 — write-once
          await sql`update tutor_sessions set course_ref = ${wanted} where id = ${session.id}`;
        } else if (servedRef(courseRef) !== wanted) {
          throw new ConflictError(
            `this chat serves course ${courseRef} — it cannot switch to ${wanted}; start a new chat for the other course`,
          );
        }
      }
      const topRows = (await sql`
        select seq from tutor_session_turns
        where session_id = ${session.id}
        order by seq desc
        limit 1`) as unknown as Array<{ seq: number }>;
      const nextSeq = (topRows[0] == null ? 0 : Number(topRows[0].seq)) + 1;
      const at = now.toISOString();
      await sql`
        insert into tutor_session_turns
          (id, session_id, seq, role, content, evidence_count, refused,
           answer_model, answer_provider, latency_ms, created_at)
        values (gen_random_uuid(), ${session.id}, ${nextSeq}, ${ROLE_USER},
                ${bound(exchange.question)}, 0, false, null, null, null, ${at})`;
      await sql`
        insert into tutor_session_turns
          (id, session_id, seq, role, content, evidence_count, refused,
           answer_model, answer_provider, latency_ms, created_at)
        values (gen_random_uuid(), ${session.id}, ${nextSeq + 1}, ${ROLE_ASSISTANT},
                ${bound(stripCitationMarkers(exchange.answer) ?? "")},
                ${exchange.evidenceCount}, ${exchange.refused}, ${exchange.model},
                ${exchange.provider}, ${exchange.latencyMs}, ${at})`;
      // markActive :69-73 — lastActiveAt never moves backwards
      await sql`
        update tutor_sessions
        set last_active_at = ${at}
        where id = ${session.id}
          and (last_active_at is null or last_active_at < ${at})`;
    },
  };
}

/** V53 backstop compares the STRIPPED ref (:254 — courseRef().strip()). */
function servedRef(served: string): string {
  return served.trim();
}

/** Title derivation (:197-203): the opening question, one line, bounded —
 *  truncated at MAX_TITLE_CHARS-1 with the trailing whitespace stripped and
 *  an ellipsis appended. */
function titleOf(content: string | null): string {
  const oneLine =
    (content == null ? "" : content.trim()).replace(/\s+/g, " ");
  return oneLine.length <= MAX_TITLE_CHARS
    ? oneLine
    : oneLine.substring(0, MAX_TITLE_CHARS - 1).replace(/\s+$/, "") + "…";
}

/** stored transcript bound (:281-287). */
function bound(content: string | null): string {
  const safe = content == null ? "" : content.trim();
  return safe.length <= MAX_CONTENT_CHARS
    ? safe
    : safe.substring(0, MAX_CONTENT_CHARS) + "…";
}
