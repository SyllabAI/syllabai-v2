/**
 * CLA thread store — DC-6 phase 3, the sync tier
 * (docs/DC6-CLA-SYNC-TIER-PLAN.md §3).
 *
 * V2-NATIVE additive family (feasibility path (iii) of record): there is NO
 * frozen-core counterpart for CLA threads, so nothing here pins path parity
 * — the laws are the ones this file declares, mirroring the tutor §22 store
 * where the shapes agree (ownership oracle, list-summary discipline, caps).
 * The hub's local thread stores are the source of truth; this store is the
 * best-effort full-state MIRROR that makes history follow the learner
 * across devices (operator ruling, trace 1a15a73da1a77c05).
 *
 * Ownership is the boundary (the §22 law, tutorsessions store parity): every
 * operation resolves the thread against the calling learner id, and a
 * foreign thread id is INDISTINGUISHABLE from an unknown one.
 *
 * The mirror write (sync) is a full-state upsert: per-row
 * INSERT … ON CONFLICT (thread_id, seq) DO UPDATE + a tail delete beyond
 * the incoming length — there is never a window where the stored transcript
 * is empty while the client believes it synced (plan §5.1). lastActiveAt
 * never moves backwards (the markActive law, session-store parity).
 */
import type { SqlFn } from "../assessment/sql";
import type { Clock } from "../tutor/session-store";
import { ConflictError, NotFoundError } from "../tutor/errors";
import type { ClaThreadSyncMessage, ClaThreadViewMessage } from "@syllabai/contracts";

/** list cap (the tutor MAX_LISTED_SESSIONS law — an unbounded list must
 *  never become a transcript dump by accident). */
export const MAX_LISTED_THREADS = 50;
/** per-learner thread cap (the R13 law shape: 409, never silent eviction —
 *  silent eviction would lose history without a signal). */
export const MAX_THREADS_PER_LEARNER = 200;
/** title bound (the local titleFrom law is 52+ellipsis; the column is the
 *  tutor MAX_TITLE_CHARS bound). */
export const MAX_TITLE_CHARS = 120;
/** transcript bound per thread (the local MAX_MESSAGES_PER_THREAD law). */
export const MAX_MESSAGES_PER_THREAD = 100;

/** The wire message (the contracts union verbatim — the store constructs
 *  EXACTLY the ratified shape, so the route's defensive parse never fires). */
export type ClaThreadMessageView = ClaThreadViewMessage;

export interface ClaThreadRecordView {
  threadId: string;
  surface: string;
  questionId: string | null;
  questionNumber: number | null;
  courseSlug: string | null;
  title: string;
  createdAt: string;
  lastActiveAt: string;
  messages: ClaThreadMessageView[];
}

export interface ClaThreadSummaryRecord {
  threadId: string;
  surface: string;
  questionId: string | null;
  questionNumber: number | null;
  courseSlug: string | null;
  title: string;
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
}

export interface ClaThreadCreateInput {
  surface: string;
  questionId: string;
  questionNumber: number | null;
  courseSlug: string | null;
  title: string;
}

export interface ClaThreadSyncInput {
  title: string;
  questionNumber: number | null;
  courseSlug: string | null;
  messages: ClaThreadSyncMessage[];
}

interface ThreadRow {
  id: string;
  learner_id: string;
  surface: string;
  question_id: string | null;
  question_number: number | null;
  course_slug: string | null;
  title: string;
  created_at: string;
  last_active_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  seq: number;
  kind: string;
  text: string | null;
  question: string | null;
  payload: unknown | null;
  payload_version: number;
  occurred_at: string;
}

/** The structural store seam the router consumes (the module composition
 *  pattern — services/tutor/index.ts's buildTutorModule return shape). */
export type ClaThreadStore = ReturnType<typeof buildClaThreadStore>;

export function buildClaThreadStore(sql: SqlFn, clock: Clock) {
  const owned = async (learnerId: string, threadId: string): Promise<ThreadRow> => {
    const rows = (await sql`
      select id, learner_id, surface, question_id, question_number, course_slug,
             title, created_at, last_active_at
      from cla_threads
      where id = ${threadId} and learner_id = ${learnerId}`) as unknown as ThreadRow[];
    const row = rows[0];
    if (row == null) {
      // a foreign thread id is indistinguishable from an unknown one
      // (the §22 oracle law, session-store parity)
      throw new NotFoundError("cla thread", threadId);
    }
    return row;
  };

  const messagesOf = async (threadId: string): Promise<ClaThreadMessageView[]> => {
    const rows = (await sql`
      select id, thread_id, seq, kind, text, question, payload, payload_version, occurred_at
      from cla_thread_messages
      where thread_id = ${threadId}
      order by seq`) as unknown as MessageRow[];
    // the wire union EXACTLY (plan §3): assistant carries payload; error
    // carries text + question; user/gate carry text. at = epoch ms.
    return rows.map((m): ClaThreadMessageView => {
      const at = new Date(m.occurred_at).getTime();
      switch (m.kind) {
        case "assistant":
          return { kind: "assistant", at, payload: m.payload };
        case "error":
          return { kind: "error", at, text: m.text ?? "", question: m.question ?? "" };
        case "gate":
          return { kind: "gate", at, text: m.text ?? "" };
        default:
          return { kind: "user", at, text: m.text ?? "" };
      }
    });
  };

  return {
    /** New empty mirror anchor (the lazy-bind moment). 409 at the cap —
     *  never silent eviction (the R13 law shape). */
    async create(learnerId: string, input: ClaThreadCreateInput): Promise<ClaThreadRecordView> {
      const countRows = (await sql`
        select count(*) as n from cla_threads where learner_id = ${learnerId}`) as unknown as Array<{
        n: string | number;
      }>;
      const count = countRows[0]?.n ?? 0;
      if (Number(count) >= MAX_THREADS_PER_LEARNER) {
        throw new ConflictError(
          `thread limit reached (${MAX_THREADS_PER_LEARNER}) — delete an old chat to start a new one`,
        );
      }
      const now = clock.now().toISOString();
      const inserted = (await sql`
        insert into cla_threads
          (id, learner_id, surface, question_id, question_number, course_slug,
           title, created_at, last_active_at)
        values (gen_random_uuid(), ${learnerId}, ${input.surface}, ${input.questionId},
                ${input.questionNumber}, ${input.courseSlug}, ${boundTitle(input.title)},
                ${now}, ${now})
        returning id, learner_id, surface, question_id, question_number, course_slug,
                  title, created_at, last_active_at`) as unknown as ThreadRow[];
      const thread = inserted[0];
      if (thread == null) throw new Error("cla thread insert returned no row");
      return toView(thread, []);
    },

    /** The learner's threads for one question (or surface-wide), newest
     *  active first — summaries only, never transcript bodies (s143). */
    async list(
      learnerId: string,
      scope: { surface?: string; questionId?: string },
    ): Promise<ClaThreadSummaryRecord[]> {
      const recent = (await sql`
        select t.id, t.learner_id, t.surface, t.question_id, t.question_number,
               t.course_slug, t.title, t.created_at, t.last_active_at,
               (select count(*) from cla_thread_messages m where m.thread_id = t.id) as message_count
        from cla_threads t
        where t.learner_id = ${learnerId}
          and (${scope.surface ?? null}::text is null or t.surface = ${scope.surface ?? null})
          and (${scope.questionId ?? null}::text is null or t.question_id = ${scope.questionId ?? null})
        order by t.last_active_at desc
        limit ${MAX_LISTED_THREADS}`) as unknown as Array<
        ThreadRow & { message_count: string | number }
      >;
      return recent.map((t) => ({
        threadId: t.id,
        surface: t.surface,
        questionId: t.question_id,
        questionNumber: t.question_number == null ? null : Number(t.question_number),
        courseSlug: t.course_slug,
        title: t.title,
        createdAt: t.created_at,
        lastActiveAt: t.last_active_at,
        messageCount: Number(t.message_count ?? 0),
      }));
    },

    /** Full transcript, seq-ordered; foreign/unknown 404 (the oracle law). */
    async view(learnerId: string, threadId: string): Promise<ClaThreadRecordView> {
      const thread = await owned(learnerId, threadId);
      return toView(thread, await messagesOf(thread.id));
    },

    /**
     * The mirror write: full-state upsert. Messages ride their array index
     * as seq (1..n); each row upserts on (thread_id, seq), the tail beyond
     * the incoming length is deleted (shrink law), the thread metadata +
     * lastActiveAt refresh together. There is never an empty-transcript
     * window (plan §5.1).
     */
    async sync(
      learnerId: string,
      threadId: string,
      input: ClaThreadSyncInput,
    ): Promise<{ threadId: string; lastActiveAt: string }> {
      const thread = await owned(learnerId, threadId);
      const messages = input.messages;
      if (messages.length > MAX_MESSAGES_PER_THREAD) {
        throw new ConflictError(
          `thread transcript exceeds ${MAX_MESSAGES_PER_THREAD} messages`,
        );
      }
      const now = clock.now().toISOString();
      // metadata refresh — ALWAYS applies (the markActive guard gates ONLY
      // the recency stamp below, never the content of the mirror)
      await sql`
        update cla_threads
        set title = ${boundTitle(input.title)},
            question_number = ${input.questionNumber},
            course_slug = ${input.courseSlug}
        where id = ${thread.id}`;
      // markActive (session-store parity): lastActiveAt never moves backwards
      await sql`
        update cla_threads
        set last_active_at = ${now}
        where id = ${thread.id}
          and (last_active_at is null or last_active_at < ${now})`;
      // the full-state upsert — same seq = same row (idempotent on retry)
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m == null) continue; // bounds guard (noUncheckedIndexedAccess)
        const text = m.kind === "assistant" ? null : m.text;
        const question = m.kind === "error" ? m.question : null;
        const payload = m.kind === "assistant" ? m.payload : null;
        const at = new Date(m.at).toISOString();
        await sql`
          insert into cla_thread_messages
            (id, thread_id, seq, kind, text, question, payload, payload_version, occurred_at, created_at)
          values (gen_random_uuid(), ${thread.id}, ${i + 1}, ${m.kind}, ${text}, ${question},
                  ${payload == null ? null : JSON.stringify(payload)}::jsonb, 1, ${at}, ${now})
          on conflict (thread_id, seq) do update
            set kind = excluded.kind,
                text = excluded.text,
                question = excluded.question,
                payload = excluded.payload,
                payload_version = 1,
                occurred_at = excluded.occurred_at`;
      }
      // shrink law: the tail beyond the incoming length is gone
      await sql`
        delete from cla_thread_messages
        where thread_id = ${thread.id} and seq > ${messages.length}`;
      const fresh = (await sql`
        select last_active_at from cla_threads where id = ${thread.id}`) as unknown as Array<{
        last_active_at: string;
      }>;
      return { threadId: thread.id, lastActiveAt: fresh[0]?.last_active_at ?? now };
    },

    /** Data-minimization delete (the §20 right, session-store parity):
     *  messages first, then the anchor. Foreign/unknown 404. */
    async delete(learnerId: string, threadId: string): Promise<void> {
      const thread = await owned(learnerId, threadId);
      await sql`delete from cla_thread_messages where thread_id = ${thread.id}`;
      await sql`delete from cla_threads where id = ${thread.id}`;
    },
  };
}

function toView(t: ThreadRow, messages: ClaThreadMessageView[]): ClaThreadRecordView {
  return {
    threadId: t.id,
    surface: t.surface,
    questionId: t.question_id,
    questionNumber: t.question_number == null ? null : Number(t.question_number),
    courseSlug: t.course_slug,
    title: t.title,
    createdAt: t.created_at,
    lastActiveAt: t.last_active_at,
    messages,
  };
}

/** title bound at the store edge (the client truncates at 52+ellipsis; this
 *  is the column-law backstop, session-store titleOf shape). */
function boundTitle(title: string): string {
  const oneLine = title.replace(/\s+/g, " ").trim();
  if (!oneLine) return "New chat";
  return oneLine.length <= MAX_TITLE_CHARS
    ? oneLine
    : oneLine.substring(0, MAX_TITLE_CHARS - 1).replace(/\s+$/, "") + "…";
}
