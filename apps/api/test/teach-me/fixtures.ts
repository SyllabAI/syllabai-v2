/**
 * T-TEACHME-001 · run-002 · apps/api/test/teach-me/fixtures.ts
 *
 * The in-memory test plane for the T-MIG-039 behavioural gate: a FakeStore
 * (TeachMeStore over Maps), a FakeChain (scripted, call-recording), and the
 * makeHarness HTTP shell (the "syllabai.auth" c.set pattern of the house route
 * tests). NO live LLM, NO Neon contact — CI law.
 */
import { Hono, type Context } from "hono";
import {
  TEACH_ME_CONFIG,
} from "../../src/teach-me/config";
import { buildTeachMeRouters } from "../../src/teach-me/index";
import type {
  Clock,
  ReviewInputBundle,
  SpecPointCanonRow,
  TeachMeCandidateRow,
  TeachMeCoverageRow,
  TeachMeChain,
  TeachMeMessageRow,
  TeachMeObjectiveRow,
  TeachMeSessionRow,
  TeachMeStore,
} from "../../src/teach-me/types";

export const USER = "11111111-1111-1111-1111-111111111111";
export const OTHER_USER = "22222222-2222-2222-2222-222222222222";
export const COURSE = "igcse-chemistry-19";
export const SPEC_POINTS = ["2.3", "2.4", "2.5"];

/* ------------------------------------------------------------------ */
/* Fixture content                                                     */
/* ------------------------------------------------------------------ */

export const ELIGIBLE_MESSAGE =
  "In electrolysis the cathode attracts positive ions while the anode attracts negative ions, " +
  "and a molten ionic compound is split into its elements. For example, copper chloride gives " +
  "copper at the cathode and chlorine at the anode, which stays the same whether you use the " +
  "melt or a concentrated solution, because it is the ions moving that matters.";

export const QUOTE_1 = "the cathode attracts positive ions";
export const QUOTE_2 = "copper at the cathode and chlorine at the anode";

/** A ≥40-word verbatim excerpt of the fake note body — the pasted-notes attack. */
export const pastedNotesExcerpt = (body: string): string => {
  const w = body.trim().split(/\s+/);
  return w.slice(0, Math.max(45, w.length)).join(" ");
};

export const CANON_ROWS: SpecPointCanonRow[] = [
  { id: "aaaaaaa1-0000-0000-0000-000000000001", code: "2.3", title: "Electrolysis of molten compounds", description: "Describe electrolysis of a molten ionic compound and name the products at each electrode." },
  { id: "aaaaaaa1-0000-0000-0000-000000000002", code: "2.4", title: "Electrolysis in solution", description: "Explain electrolysis of aqueous solutions, including the role of concentration." },
  { id: "aaaaaaa1-0000-0000-0000-000000000003", code: "2.5", title: "Electroplating", description: "Describe how electroplating works and what the electrolyte does." },
];

export const NOTE_BODY =
  "During electrolysis of molten sodium chloride, sodium ions gain electrons at the cathode and " +
  "chloride ions lose electrons at the anode. The cathode attracts positive ions because it is " +
  "the negative electrode, and oxidation happens at the anode where negative ions are discharged.";

const REGISTRY = [{ code: "M-CATHODE-ANODE-SWAP", statement: "Swapping the electrodes: reduction at the anode instead of the cathode." }];
const ANCHORS = [{ specPointId: "2.3", paperRef: "Edexcel Summer 2024 1CH", questionRef: "3(b)" }];
const PRACTICE = [
  { label: "Question bank — Edexcel Summer 2024 1CH", resourceType: "question_bank" as const, href: "/courses/igcse-chemistry-19/exam-questions" },
  { label: "Revision notes — Electrolysis", resourceType: "revision_notes" as const, href: "/courses/igcse-chemistry-19/revision-notes" },
];

/* ------------------------------------------------------------------ */
/* Scripted chain (T-MIG-039: every LLM output is a checked-in fixture) */
/* ------------------------------------------------------------------ */

export type JudgeFixture = "ok" | "contradiction" | "shape_drift" | "affirmation" | "invented_quote";
export type ReviewFixture = "ok" | "flagged";

/** The extractive law is REAL — fixtures must quote the student's own words. */
const wordsOf = (t: string): string[] => t.trim().split(/\s+/).filter(Boolean);

const pickQuote = (texts: string[], preferred: string, offset = 0): string => {
  if (texts.some((t) => t.includes(preferred))) return preferred;
  const w = wordsOf(texts[0] ?? "");
  const slice = w.slice(offset, offset + 6);
  return slice.length >= 4 ? slice.join(" ") : (w.slice(0, 6).join(" ") || preferred);
};

const studentTextsFromPrompt = (user: string): string[] => {
  const transcript = user.split("STUDENT_MESSAGE:")[0] ?? "";
  const lines = [...transcript.matchAll(/^#\d+ STUDENT: (.*)$/gm)].map((m) => m[1] ?? "");
  const current = (user.split("STUDENT_MESSAGE:\n")[1] ?? "").trim();
  return current ? [...lines, current] : lines;
};

const objectiveOrdinalsFromPrompt = (user: string): number[] => {
  const block = (user.split("OBJECTIVES")[1] ?? "").split("DIFFICULTY")[0] ?? "";
  return [...block.matchAll(/^\((\d+)\)/gm)].map((m) => Number(m[1])).filter((n) => n >= 1);
};

const judgeResponse = (fixture: JudgeFixture, text: string): Record<string, unknown> => {
  if (fixture === "shape_drift") {
    // missing pupilMessage + coverage missing an objective — a shape violation
    return { verdict: { label: "Great", feedbackLine: "x" }, coverage: [{ objectiveOrdinal: 1, covered: true, evidenceQuote: QUOTE_1 }] };
  }
  if (fixture === "contradiction") {
    return {
      verdict: { label: "Hmm", feedbackLine: "You walked through which ion goes where, which is the heart of it." },
      coverage: objectiveOrdinalsFromPrompt(text).map((ordinal) =>
        ordinal === 1
          ? { objectiveOrdinal: ordinal, covered: true, evidenceQuote: pickQuote(studentTextsFromPrompt(text), QUOTE_1, 0) }
          : ordinal === 2
            ? { objectiveOrdinal: ordinal, covered: true, evidenceQuote: pickQuote(studentTextsFromPrompt(text), QUOTE_2, 7) }
            : { objectiveOrdinal: ordinal, covered: false, evidenceQuote: null },
      ),
      contradictionDetected: true,
      pupilMessage: "wait — that doesn't match the example you gave me earlier… can you go over it once more?",
    };
  }
  if (fixture === "affirmation") {
    return {
      verdict: { label: "Great", feedbackLine: "x" },
      coverage: [
        { objectiveOrdinal: 1, covered: true, evidenceQuote: QUOTE_1 },
        { objectiveOrdinal: 2, covered: false, evidenceQuote: null },
        { objectiveOrdinal: 3, covered: false, evidenceQuote: null },
      ],
      contradictionDetected: true,
      // D2 violation: an affirmation on a contradiction — the runtime guard must refuse it
      pupilMessage: "Oh, that makes sense now — so which electrode is negative?",
    };
  }
  if (fixture === "invented_quote") {
    return {
      verdict: { label: "Great", feedbackLine: "x" },
      coverage: [
        { objectiveOrdinal: 1, covered: true, evidenceQuote: "electrons flow from the cathode to the anode through the electrolyte" },
        { objectiveOrdinal: 2, covered: false, evidenceQuote: null },
        { objectiveOrdinal: 3, covered: false, evidenceQuote: null },
      ],
      contradictionDetected: false,
      pupilMessage: "Interesting — so how would you plate a spoon then?",
    };
  }
  const texts = studentTextsFromPrompt(text);
  const q1 = pickQuote(texts, QUOTE_1, 0);
  const q2 = pickQuote(texts, QUOTE_2, 7);
  const ordinals = objectiveOrdinalsFromPrompt(text);
  const coverage = ordinals.map((ordinal) =>
    ordinal === 1
      ? { objectiveOrdinal: ordinal, covered: true, evidenceQuote: q1 }
      : ordinal === 2
        ? { objectiveOrdinal: ordinal, covered: true, evidenceQuote: q2 }
        : { objectiveOrdinal: ordinal, covered: false, evidenceQuote: null },
  );
  return {
    verdict: { label: "Great", feedbackLine: "You walked through which ion goes where, which is the heart of it." },
    coverage,
    contradictionDetected: false,
    pupilMessage: "So what I've got now is that ions move to the electrodes — but which electrode does the LESS reactive product come off in solution?",
  };
};

const objectivesResponse = (length: "quick" | "in_depth"): Record<string, unknown> => {
  const n = TEACH_ME_CONFIG.sessionShape.objectivesByLength[length];
  const texts = [
    "Explain electrolysis of molten compounds in your own words.",
    "Walk me through electrolysis in solution and why concentration matters.",
    "Describe electroplating and what the electrolyte does.",
    "Link the three: what changes when you go from melt to solution?",
  ].slice(0, n);
  const spByN: string[][] = n === 3
    ? [["2.3"], ["2.4"], ["2.5"]]
    : [["2.3"], ["2.4"], ["2.5"], ["2.3", "2.4", "2.5"]];
  return { objectives: texts.map((t, i) => ({ text: t, specPointIds: spByN[i] })) };
};

const reviewResponse = (fixture: ReviewFixture, studentTexts: string[]): Record<string, unknown> => ({
  strengths: [{ quote: pickQuote(studentTexts, QUOTE_1, 0), messageSeq: 2 }],
  improvements:
    fixture === "flagged"
      ? []
      : [{ statement: "I said chlorine forms at the cathode.", correction: "Chlorine forms at the anode; the cathode attracts positive metal ions.", specPointIds: ["2.3"] }],
  specPointVerdicts:
    fixture === "flagged"
      ? [
          { specPointId: "2.3", verdict: "flagged", evidenceQuote: null },
          { specPointId: "2.4", verdict: "covered", evidenceQuote: pickQuote(studentTexts, QUOTE_2, 7) },
          { specPointId: "2.5", verdict: "not_covered", evidenceQuote: null },
        ]
      : [
          { specPointId: "2.3", verdict: "covered", evidenceQuote: pickQuote(studentTexts, QUOTE_1, 0) },
          { specPointId: "2.4", verdict: "covered", evidenceQuote: pickQuote(studentTexts, QUOTE_2, 7) },
          { specPointId: "2.5", verdict: "not_covered", evidenceQuote: null },
        ],
  misconceptionNotes: [{ statement: "Chlorine forms at the cathode.", matchedMisconceptionId: "M-CATHODE-ANODE-SWAP", confidence: 0.8 }],
  examAnchors: [{ specPointId: "2.3", paperRef: "Edexcel Summer 2024 1CH", questionRef: "3(b)" }],
  prereqWarnings: [],
  suggestedPractice: PRACTICE,
});

export class FakeChain implements TeachMeChain {
  calls: Array<{ system: string; user: string }> = [];
  availableFlag = true;
  constructor(
    public opts: { judgeFixture?: JudgeFixture; reviewFixture?: ReviewFixture; objectives?: Record<string, unknown> } = {},
  ) {}

  available(): boolean {
    return this.availableFlag;
  }

  async generate(request: { system: string; user: string }): Promise<{ text: string; model: string; providerName: string; finishReason: string | null }> {
    this.calls.push({ system: request.system, user: request.user });
    const text = request.system.startsWith("# Pinned prompt `teachme.objectives.v1`")
      ? JSON.stringify(this.opts.objectives ?? objectivesResponse(/in_depth/i.test(request.user) ? "in_depth" : "quick"))
      : request.system.startsWith("# Pinned prompt `teachme.turn.v1`")
        ? JSON.stringify(judgeResponse(this.opts.judgeFixture ?? "ok", request.user))
        : JSON.stringify(reviewResponse(this.opts.reviewFixture ?? "ok", studentTextsFromPrompt(request.user)));
    return { text, model: "fixture-model", providerName: "fixture", finishReason: null };
  }
}

/* ------------------------------------------------------------------ */
/* In-memory store                                                     */
/* ------------------------------------------------------------------ */

export interface StoreAuditEntry {
  method: string;
  args: unknown[];
}

export class FakeStore implements TeachMeStore {
  sessions = new Map<string, TeachMeSessionRow>();
  objectives = new Map<string, TeachMeObjectiveRow[]>();
  messages = new Map<string, TeachMeMessageRow[]>();
  coverage: TeachMeCoverageRow[] = [];
  reviewCards = new Map<string, Record<string, unknown>>();
  candidates: TeachMeCandidateRow[] = [];
  masteryRows: Record<string, number> = { "2.3": 0.5, "2.4": 0.2, "2.5": 0 };
  audit: StoreAuditEntry[] = [];
  preExistingEvidenceAt: Date | null = null; // seeds recentCreditSpecPointIds

  constructor(
    public opts: {
      canonRows?: SpecPointCanonRow[];
      notes?: Array<{ noteId: string; title: string; bodyMd: string }>;
      sessionsToday?: number;
      registry?: ReviewInputBundle["registry"];
      anchors?: ReviewInputBundle["anchors"];
      practice?: ReviewInputBundle["practice"];
    } = {},
  ) {
    for (let i = 0; i < (opts.sessionsToday ?? 0); i++) {
      const id = `99999999-0000-0000-0000-${String(i).padStart(12, "0")}`;
      this.sessions.set(id, {
        id,
        userId: USER,
        courseId: COURSE,
        specPointIds: [...SPEC_POINTS],
        difficulty: "medium",
        length: "quick",
        mode: "chat",
        status: "completed",
        messageCount: 0,
        llmCallCount: 0,
        tokensUsed: 0,
        flags: {},
        createdAt: new Date().toISOString(),
        endedAt: null,
      });
    }
  }

  private log(method: string, args: unknown[]) {
    this.audit.push({ method, args });
  }

  async countSessionsToday(userId: string, dayStartUtc: Date): Promise<number> {
    this.log("countSessionsToday", [userId, dayStartUtc.toISOString()]);
    return [...this.sessions.values()].filter((s) => s.userId === userId && new Date(s.createdAt) >= dayStartUtc).length;
  }

  async insertSession(session: TeachMeSessionRow, objectives: TeachMeObjectiveRow[]): Promise<void> {
    this.log("insertSession", [session.id]);
    this.sessions.set(session.id, { ...session });
    this.objectives.set(session.id, objectives.map((o) => ({ ...o })));
  }

  async findSession(id: string) {
    this.log("findSession", [id]);
    const session = this.sessions.get(id);
    if (!session) return null;
    return { session: { ...session, flags: { ...session.flags } }, objectives: (this.objectives.get(id) ?? []).map((o) => ({ ...o })) };
  }

  async updateSession(id: string, patch: Partial<TeachMeSessionRow>): Promise<void> {
    this.log("updateSession", [id, { ...patch }]);
    const s = this.sessions.get(id);
    if (s) Object.assign(s, patch);
  }

  async appendMessage(row: TeachMeMessageRow): Promise<void> {
    this.log("appendMessage", [row.seq, row.role, row.kind]);
    const list = this.messages.get(row.sessionId) ?? [];
    list.push({ ...row });
    this.messages.set(row.sessionId, list);
  }

  async listMessages(sessionId: string): Promise<TeachMeMessageRow[]> {
    this.log("listMessages", [sessionId]);
    return (this.messages.get(sessionId) ?? []).map((m) => ({ ...m }));
  }

  async appendCoverage(rows: TeachMeCoverageRow[]): Promise<void> {
    this.log("appendCoverage", [rows.length]);
    for (const r of rows) this.coverage.push({ ...r });
  }

  async listCoverage(sessionId: string): Promise<TeachMeCoverageRow[]> {
    this.log("listCoverage", [sessionId]);
    return this.coverage.filter((c) => c.sessionId === sessionId).map((c) => ({ ...c }));
  }

  async recentCreditSpecPointIds(userId: string, specPointIds: string[], sinceUtc: Date): Promise<string[]> {
    this.log("recentCreditSpecPointIds", [userId, [...specPointIds], sinceUtc.toISOString()]);
    void this.preExistingEvidenceAt; // seeded-window hook for future dedupe fixtures
    const wanted = new Set(specPointIds);
    const hits = new Set<string>();
    for (const c of this.coverage) {
      const session = this.sessions.get(c.sessionId);
      if (!session || session.userId !== userId) continue;
      if (new Date(c.createdAt) < sinceUtc) continue;
      for (const o of this.objectives.get(c.sessionId) ?? []) {
        if (o.id !== c.objectiveId) continue;
        for (const sp of o.specPointIds) if (wanted.has(sp)) hits.add(sp);
      }
    }
    return [...hits];
  }

  async insertMisconceptionCandidates(rows: TeachMeCandidateRow[]): Promise<number> {
    this.log("insertMisconceptionCandidates", [rows.length]);
    let inserted = 0;
    for (const r of rows) {
      if (this.candidates.some((c) => c.sessionId === r.sessionId && c.status === "candidate")) continue;
      this.candidates.push({ ...r });
      inserted++;
    }
    return inserted;
  }

  async insertReviewCard(sessionId: string, card: Record<string, unknown>): Promise<void> {
    this.log("insertReviewCard", [sessionId]);
    this.reviewCards.set(sessionId, { ...card });
  }

  async findReviewCard(sessionId: string): Promise<Record<string, unknown> | null> {
    this.log("findReviewCard", [sessionId]);
    const card = this.reviewCards.get(sessionId);
    return card ? { ...card } : null;
  }

  async updateObjectivesStatus(objectiveIds: string[], status: TeachMeObjectiveRow["status"]): Promise<void> {
    this.log("updateObjectivesStatus", [[...objectiveIds], status]);
    for (const [sid, list] of this.objectives) {
      for (const o of list) {
        if (objectiveIds.includes(o.id)) {
          const target = this.objectives.get(sid)?.find((x) => x.id === o.id);
          if (target) target.status = status;
        }
      }
    }
  }

  async listSessions(userId: string, courseId: string | null): Promise<Array<TeachMeSessionRow>> {
    this.log("listSessions", [userId, courseId]);
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId && (courseId == null || s.courseId === courseId))
      .map((s) => ({ ...s }));
  }

  async loadSpecPointCanon(specPointCodes: string[]): Promise<SpecPointCanonRow[]> {
    this.log("loadSpecPointCanon", [[...specPointCodes]]);
    const rows = this.opts.canonRows ?? CANON_ROWS;
    return rows.filter((r) => specPointCodes.includes(r.code)).map((r) => ({ ...r }));
  }

  async loadNoteCorpus(specPointCodes: string[]): Promise<Array<{ noteId: string; title: string; bodyMd: string }>> {
    this.log("loadNoteCorpus", [[...specPointCodes]]);
    const notes = this.opts.notes ?? [{ noteId: "n1", title: "Electrolysis", bodyMd: NOTE_BODY }];
    return specPointCodes.length > 0 ? notes.map((n) => ({ ...n })) : [];
  }

  async loadReviewInputs(input: { specPointCodes: string[]; specPointNodeIds: string[] }): Promise<ReviewInputBundle> {
    this.log("loadReviewInputs", [[...input.specPointCodes]]);
    return {
      registry: this.opts.registry ?? REGISTRY,
      anchors: this.opts.anchors ?? ANCHORS,
      practice: this.opts.practice ?? PRACTICE,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Harness — the HTTP shell (house "syllabai.auth" c.set pattern)      */
/* ------------------------------------------------------------------ */

export interface Harness {
  store: FakeStore;
  chain: FakeChain;
  createSession(body?: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>;
  postMessage(sessionId: string, text: string): Promise<{ status: number; body: Record<string, unknown> }>;
  postMessageAs(user: string, sessionId: string, text: string): Promise<{ status: number; body: Record<string, unknown> }>;
  end(sessionId: string): Promise<{ status: number; body: Record<string, unknown> }>;
  permalink(sessionId: string): Promise<{ status: number; body: Record<string, unknown> }>;
  history(course?: string): Promise<{ status: number; body: { items?: Array<Record<string, unknown>> } }>;
  sessionRowCount(): Promise<number>;
  coverageRowCount(sessionId?: string): Promise<number>;
  creditRecords(sessionId: string): Promise<Array<Record<string, unknown>>>;
  masterySnapshot(): Promise<Record<string, number>>;
  playTurns(sessionId: string, n: number, text?: string): Promise<Array<{ status: number; body: Record<string, unknown> }>>;
}

const authAs = (userId: string) => (c: Context, next: () => Promise<void>) => {
  c.set("syllabai.auth" as never, { userId, roles: ["LEARNER"], email: "t@example.com" } as never);
  return next();
};

export type HarnessOptions = ConstructorParameters<typeof FakeStore>[0] &
  ConstructorParameters<typeof FakeChain>[0] & { user?: string };

export function makeHarness(opts: HarnessOptions = {}): Harness {
  const store = new FakeStore(opts);
  const chain = new FakeChain(opts);
  const { teachMeRoute } = buildTeachMeRouters({ chain, store });
  const app = new Hono().use("*", (c, next) => authAs(opts.user ?? USER)(c, next)).route("/", teachMeRoute);

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json as Record<string, unknown> };
  };

  const create = (body?: Record<string, unknown>) =>
    call("POST", "/teach-me/sessions", {
      courseId: COURSE,
      specPointIds: [...SPEC_POINTS],
      difficulty: "medium",
      length: "quick",
      mode: "chat",
      ...body,
    });

  const callAs = async (user: string, method: string, path: string, body?: unknown) => {
    const altApp = new Hono().use("*", (c, next) => authAs(user)(c, next)).route("/", teachMeRoute);
    const res = await altApp.request(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json as Record<string, unknown> };
  };

  const h: Harness = {
    store,
    chain,
    createSession: (body) => create(body),
    postMessage: (sessionId, text) => call("POST", `/teach-me/sessions/${sessionId}/message`, { text }),
    postMessageAs: (user, sessionId, text) => callAs(user, "POST", `/teach-me/sessions/${sessionId}/message`, { text }),
    end: (sessionId) => call("POST", `/teach-me/sessions/${sessionId}/end`),
    permalink: (sessionId) => call("GET", `/teach-me/sessions/${sessionId}`),
    history: (course) => call("GET", `/teach-me/sessions${course ? `?course=${course}` : ""}`),
    sessionRowCount: async () => {
      void store.opts.sessionsToday; // seeded quota rows are not the create's writes
      const seeded = store.opts.sessionsToday ?? 0;
      return Math.max(0, store.sessions.size - seeded);
    },
    coverageRowCount: async (sessionId) => (sessionId ? store.coverage.filter((c) => c.sessionId === sessionId).length : store.coverage.length),
    creditRecords: async (sessionId) => {
      const s = store.sessions.get(sessionId);
      return Array.isArray(s?.flags.evidenceCredits) ? (s!.flags.evidenceCredits as Array<Record<string, unknown>>) : [];
    },
    masterySnapshot: async () => ({ ...store.masteryRows }),
    playTurns: async (sessionId, n, text) => {
      const out: Array<{ status: number; body: Record<string, unknown> }> = [];
      for (let i = 0; i < n; i++) out.push(await h.postMessage(sessionId, text ?? ELIGIBLE_MESSAGE));
      return out;
    },
  };
  return h;
}

