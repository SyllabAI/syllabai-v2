/**
 * T-TEACHME-001 · run-002 · apps/api/src/teach-me/service.ts
 *
 * The Teach-Me lane's LAW (pure, injected deps — no Hono, no Neon, no live LLM):
 *   D1  evidence is TEACH_SESSION / AI_SUGGESTED / append-only — this module
 *       writes teach_objective_coverages + teach_review_cards +
 *       teach_misconception_candidates ONLY; of-record mastery has no write
 *       path here (the behavioural suite proves the invariant on a snapshot).
 *   D2  contradiction ⇒ confusion, never affirmation — enforced at runtime:
 *       an in-character affirmation marker on contradictionDetected:true is
 *       LLM_SHAPE_DRIFT (fail-closed), and corrections live ONLY in the review.
 *   D3  quota (3/day) + ceilings (Quick ≤5 / In-Depth ≤6 messages; ≤10 LLM
 *       calls; ≤60k estimated tokens) — server-side, fail-closed, typed.
 *   D4  ≥40-word floor (sub-floor ⇒ in-character nudge, no judge call, no
 *       credit), ≥0.80 verbatim overlap ⇒ flagged (no credit, fail-closed),
 *       7-day repeat-credit dedupe per (user, spec point).
 *
 * Every LLM output is zod-validated against the pinned prompt's JSON shape
 * (T-MIG-039): shape drift, truncation, non-extractive quotes, invented ids or
 * invented resource refs are ALL LLM_SHAPE_DRIFT refusals — never coercion.
 */
import { z } from "zod";
import {
  createSessionRequestSchema,
  postMessageRequestSchema,
  type PupilMessage,
  type ReviewCard,
  type SessionHistoryItem,
  type TeachObjective,
  type TeachSession,
  type TeachMeErrorCode,
  type VerdictChip,
} from "@syllabai/contracts";
import { isTruncationFinish } from "../services/llmchain";
import { TEACH_ME_CONFIG } from "./config";
import { OBJECTIVES_SYSTEM_V1, PUPIL_CHARTER_V1, TEACHME_REVIEW_V1, TEACHME_TURN_V1 } from "./prompts";
import type {
  Clock,
  SpecPointCanonRow,
  TeachMeCandidateRow,
  TeachMeChain,
  TeachMeCoverageRow,
  TeachMeMessageRow,
  TeachMeObjectiveRow,
  TeachMeSessionRow,
  TeachMeStore,
} from "./types";

/* ------------------------------------------------------------------ */
/* Typed failures (the route maps these; the service never sees HTTP)  */
/* ------------------------------------------------------------------ */

export class TeachMeFailClosed extends Error {
  constructor(
    public readonly code: TeachMeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TeachMeFailClosed";
  }
}

/** The honest chain-down posture (toolkit PROVIDER_UNAVAILABLE precedent) — NOT a shape drift. */
export class TeachMeProviderUnavailable extends Error {
  constructor(message = "no available LLM provider in chain") {
    super(message);
    this.name = "TeachMeProviderUnavailable";
  }
}

export class TeachMeNotFound extends Error {
  constructor(message = "session not found") {
    super(message);
    this.name = "TeachMeNotFound";
  }
}

/* ------------------------------------------------------------------ */
/* Internal LLM-output contracts — the pinned prompts' JSON shapes     */
/* ------------------------------------------------------------------ */

const objectivesOutputSchema = z
  .object({
    objectives: z
      .array(
        z
          .object({ text: z.string().min(1), specPointIds: z.array(z.string().min(1)).min(1) })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();

const turnOutputSchema = z
  .object({
    verdict: z.object({ label: z.string().min(1), feedbackLine: z.string().min(1) }).strict(),
    coverage: z
      .array(
        z
          .object({
            objectiveOrdinal: z.number().int().min(1),
            covered: z.boolean(),
            evidenceQuote: z.string().min(1).nullable(),
          })
          .strict(),
      )
      .min(1),
    contradictionDetected: z.boolean(),
    pupilMessage: z.string().min(1),
  })
  .strict();

const reviewOutputSchema = z
  .object({
    strengths: z
      .array(z.object({ quote: z.string().min(1), messageSeq: z.number().int().min(1) }).strict())
      .max(6),
    improvements: z
      .array(
        z
          .object({
            statement: z.string().min(1),
            correction: z.string().min(1),
            specPointIds: z.array(z.string().min(1)).min(1).max(3),
          })
          .strict(),
      )
      .max(6),
    specPointVerdicts: z
      .array(
        z
          .object({
            specPointId: z.string().min(1),
            verdict: z.enum(["covered", "partially_covered", "not_covered", "flagged"]),
            evidenceQuote: z.string().min(1).nullable(),
          })
          .strict(),
      )
      .min(1),
    misconceptionNotes: z
      .array(
        z
          .object({
            statement: z.string().min(1),
            matchedMisconceptionId: z.string().min(1).nullable(),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(8),
    examAnchors: z
      .array(
        z.object({ specPointId: z.string().min(1), paperRef: z.string().min(1), questionRef: z.string().min(1) }).strict(),
      )
      .max(6),
    prereqWarnings: z
      .array(
        z
          .object({ specPointId: z.string().min(1), prereqSpecPointId: z.string().min(1), note: z.string().min(1) })
          .strict(),
      )
      .max(6),
    suggestedPractice: z
      .array(
        z
          .object({
            label: z.string().min(1),
            resourceType: z.enum(["question_bank", "revision_notes", "past_paper"]),
            href: z.string().min(1),
          })
          .strict(),
      )
      .max(6),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                               */
/* ------------------------------------------------------------------ */

const CFG = TEACH_ME_CONFIG;

const words = (t: string): string[] => t.trim().split(/\s+/).filter(Boolean);
const wordCount = (t: string): number => words(t).length;

const objectivesFor = (length: "quick" | "in_depth"): number =>
  CFG.sessionShape.objectivesByLength[length];
const maxMessagesFor = (length: "quick" | "in_depth"): number =>
  CFG.sessionShape.maxMessagesByLength[length];

/** chars/4 estimate (config law) — never under-counts spend risk. */
const estimateTokens = (...texts: string[]): number => {
  const chars = texts.reduce((n, t) => n + t.length, 0);
  return Math.ceil(chars / CFG.cost.charsPerTokenEstimate);
};

const normalizeWords = (t: string): string[] =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Deterministic verbatim shingles (D4) — width from config. */
const shingles = (t: string): Set<string> => {
  const w = normalizeWords(t);
  const k = CFG.antiGaming.overlapShingleWords;
  const out = new Set<string>();
  if (w.length < k) return out;
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(" "));
  return out;
};

/** Verbatim overlap of the student text against the spec-point note corpus (0..1, null = no corpus). */
const overlapScore = (studentText: string, corpusBodies: string[]): number | null => {
  if (corpusBodies.length === 0) return null;
  const student = shingles(studentText);
  if (student.size === 0) return 0;
  const corpus = new Set<string>();
  for (const body of corpusBodies) for (const s of shingles(body)) corpus.add(s);
  if (corpus.size === 0) return 0;
  let hits = 0;
  for (const s of student) if (corpus.has(s)) hits++;
  return hits / student.size;
};

const AFFIRMATION_MARKERS = ["that clicks", "that makes sense", "got it", "exactly right", "perfect, thanks"];

const containsAffirmation = (t: string): boolean => {
  const low = t.toLowerCase();
  return AFFIRMATION_MARKERS.some((m) => low.includes(m));
};

/** toolkitExtractJsonBody law (bridges.ts) — first { to last }, never a coercion. */
function extractJsonBody(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("no JSON object body");
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

const utcDayStart = (now: Date): Date => {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const iso = (d: Date): string => d.toISOString();

const OPENING_TEXT = "Okay — teach me about these, please! Where do you want to start?";

/* ------------------------------------------------------------------ */
/* DTO mappers (the contract shapes, strictly)                         */
/* ------------------------------------------------------------------ */

const objectiveToDto = (o: TeachMeObjectiveRow): TeachObjective => ({
  id: o.id,
  ordinal: o.ordinal,
  text: o.text,
  specPointIds: o.specPointIds,
  status: o.status,
});

const sessionToDto = (s: TeachMeSessionRow, objectives: TeachMeObjectiveRow[]): TeachSession => ({
  id: s.id,
  courseId: s.courseId,
  specPointIds: s.specPointIds,
  difficulty: s.difficulty,
  length: s.length,
  mode: s.mode,
  status: s.status,
  objectives: objectives.map(objectiveToDto),
  messageCount: s.messageCount,
  llmCallCount: s.llmCallCount,
  tokensUsed: s.tokensUsed,
  createdAt: s.createdAt,
  endedAt: s.endedAt,
});

/* ------------------------------------------------------------------ */
/* Prompt block builders (deterministic fill of the pinned placeholders) */
/* ------------------------------------------------------------------ */

const canonBlock = (canon: SpecPointCanonRow[]): string =>
  canon
    .map((c) => `- [${c.code}] ${c.title}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");

const transcriptBlock = (messages: TeachMeMessageRow[]): string =>
  messages.length === 0
    ? "(session start — no turns yet)"
    : messages
        .map((m) =>
          m.role === "student"
            ? `#${m.seq} STUDENT: ${m.text}`
            : `#${m.seq} PUPIL${m.kind && m.kind !== "opening" ? ` (${m.kind})` : ""}: ${m.text}`,
        )
        .join("\n");

const objectivesStatusBlock = (objectives: TeachMeObjectiveRow[]): string =>
  objectives.map((o) => `(${o.ordinal}) [${o.specPointIds.join(", ")}] ${o.text} — status: ${o.status}`).join("\n");

const requireAvailable = (chain: TeachMeChain): void => {
  if (!chain.available()) throw new TeachMeProviderUnavailable();
};

const readChainText = (text: string, finishReason: string | null | undefined): unknown => {
  if (isTruncationFinish(finishReason)) throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "output truncated before the JSON object completed");
  try {
    return extractJsonBody(text);
  } catch {
    throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "output was not a single JSON object");
  }
};

/** Extractive check: quote must be a verbatim substring of one of the student's own messages. */
const isExtractive = (quote: string, studentTexts: string[]): boolean =>
  studentTexts.some((t) => t.includes(quote));

const flagsWith = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> => ({ ...base, ...patch });

export interface EvidenceCreditRecord {
  specPointId: string;
  objectiveId: string;
  messageSeq: number;
  credited: boolean;
  kind: string;
  tier: string;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

export function createTeachMeService(deps: {
  store: TeachMeStore;
  chain: TeachMeChain;
  clock: Clock;
  idgen: { uuid(): string };
}) {
  const { store, chain, clock, idgen } = deps;

  /* -- createSession (plan §6 route 1) ------------------------------ */
  async function createSession(
    userId: string,
    rawInput: unknown,
  ): Promise<{ session: TeachSession; opening: PupilMessage }> {
    const req = createSessionRequestSchema.parse(rawInput);

    // flags gate (serving scope of record)
    if (!CFG.flags.teachMe.enabled || !(CFG.flags.teachMe.courses as readonly string[]).includes(req.courseId)) {
      throw new TeachMeFailClosed("TEACH_ME_FLAG_DISABLED", "Teach-Me is not enabled for this course yet");
    }

    // G1: canon exists with per-point descriptions (objectives must be spec-grounded)
    const canon = await store.loadSpecPointCanon(req.specPointIds);
    const found = new Map(canon.map((c) => [c.code, c]));
    const missing = req.specPointIds.filter((code) => !found.has(code));
    const undescribed = req.specPointIds.filter((code) => {
      const row = found.get(code);
      return !row || row.description == null || row.description.trim() === "";
    });
    if (missing.length > 0 || undescribed.length > 0) {
      throw new TeachMeFailClosed("COURSE_NOT_ELIGIBLE", "this course's canonical spec tree is not Teach-Me-ready yet");
    }

    // G2: note corpus present — without it the overlap detector fails open (forbidden)
    const notes = await store.loadNoteCorpus(req.specPointIds);
    if (notes.length === 0) {
      throw new TeachMeFailClosed("COURSE_NOT_ELIGIBLE", "this course's note corpus is not indexed yet");
    }

    // D3 quota — count sessions started today (UTC), fail-closed at cap
    const started = await store.countSessionsToday(userId, utcDayStart(clock.now()));
    if (started >= CFG.quota.dailySessionCap) {
      throw new TeachMeFailClosed("QUOTA_EXCEEDED", "Daily Teach-Me session cap reached — back tomorrow.");
    }

    requireAvailable(chain);

    // LLM call 1 — objectives from the canon (spec-grounded, never invented)
    const userPrompt = [
      "SPEC POINTS (the only ground truth):",
      canonBlock(canon),
      "",
      `SESSION LENGTH: ${req.length} (exactly ${objectivesFor(req.length)} objectives).`,
      `PUPIL DIFFICULTY: ${req.difficulty}.`,
      "Cover every listed spec point at least once; no objective may cite a spec point outside this list.",
    ].join("\n");
    const res = await chain.generate({
      system: OBJECTIVES_SYSTEM_V1,
      user: userPrompt,
      temperature: CFG.llm.objectivesTemperature,
      maxTokens: CFG.llm.maxTokens,
    });
    let tokensUsed = estimateTokens(OBJECTIVES_SYSTEM_V1, userPrompt, res.text);

    let parsed: z.infer<typeof objectivesOutputSchema>;
    try {
      parsed = objectivesOutputSchema.parse(readChainText(res.text, res.finishReason));
    } catch (e) {
      if (e instanceof TeachMeFailClosed) throw e;
      throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "objective generation returned the wrong shape");
    }

    const expected = objectivesFor(req.length);
    const objs = parsed.objectives;
    const requested = new Set(req.specPointIds);
    const coveredByObjectives = new Set(objs.flatMap((o) => o.specPointIds));
    const shapeOk =
      objs.length === expected &&
      objs.every((o) => o.specPointIds.every((sp) => requested.has(sp))) &&
      req.specPointIds.every((sp) => coveredByObjectives.has(sp));
    if (!shapeOk) {
      throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "objective generation returned the wrong count or grounding");
    }

    const now = clock.now();
    const session: TeachMeSessionRow = {
      id: idgen.uuid(),
      userId,
      courseId: req.courseId,
      specPointIds: [...req.specPointIds],
      difficulty: req.difficulty,
      length: req.length,
      mode: req.mode,
      status: "active",
      messageCount: 0,
      llmCallCount: 1,
      tokensUsed,
      flags: { objectivesPrompt: CFG.prompts.objectives, judgeShapeRefusals: 0 },
      createdAt: iso(now),
      endedAt: null,
    };
    const objectives: TeachMeObjectiveRow[] = objs.map((o, i) => ({
      id: idgen.uuid(),
      sessionId: session.id,
      ordinal: i + 1, // ordinals are server-assigned; the LLM never numbers
      text: o.text,
      specPointIds: [...o.specPointIds],
      status: "not_started",
      createdAt: iso(now),
    }));
    await store.insertSession(session, objectives);

    const opening: TeachMeMessageRow = {
      id: idgen.uuid(),
      sessionId: session.id,
      seq: 1,
      role: "pupil",
      kind: "opening",
      text: OPENING_TEXT,
      createdAt: iso(now),
    };
    await store.appendMessage(opening);

    return {
      session: sessionToDto(session, objectives),
      opening: { kind: "opening", text: OPENING_TEXT },
    };
  }

  /* -- postMessage (plan §6 route 2) -------------------------------- */
  async function postMessage(
    userId: string,
    sessionId: string,
    rawInput: unknown,
  ): Promise<{
    chip: VerdictChip | null;
    pupilMessage: PupilMessage | null;
    objectives: TeachObjective[];
    session: TeachSession;
  }> {
    const req = postMessageRequestSchema.parse(rawInput);
    const loaded = await store.findSession(sessionId);
    if (!loaded) throw new TeachMeNotFound();
    const { session, objectives } = loaded;
    if (session.userId !== userId) throw new TeachMeFailClosed("NOT_OWNER", "not your session");
    if (session.status !== "active") throw new TeachMeFailClosed("SESSION_NOT_ACTIVE", "session is not active");

    if (session.llmCallCount >= CFG.cost.maxLlmCallsPerSession) {
      throw new TeachMeFailClosed("TOKEN_CEILING", "per-session LLM call ceiling reached");
    }
    if (session.messageCount >= maxMessagesFor(session.length)) {
      throw new TeachMeFailClosed("MESSAGE_CEILING", "message ceiling reached for this session length");
    }

    const messages = await store.listMessages(sessionId);
    const now = clock.now();
    const nextSeq = (messages.at(-1)?.seq ?? 0) + 1;
    const turn = session.messageCount + 1;
    const studentTexts = messages.filter((m) => m.role === "student").map((m) => m.text);

    // D4 word floor — deterministic, pre-LLM; a nudge is not a judged turn.
    if (wordCount(req.text) < CFG.antiGaming.minWordsPerExplanation) {
      await store.appendMessage({
        id: idgen.uuid(),
        sessionId,
        seq: nextSeq,
        role: "student",
        kind: null,
        text: req.text,
        createdAt: iso(now),
      });
      const nudge: PupilMessage = {
        kind: "clarify_nudge",
        text: "Can you unpack that a bit more for me? I don't think I've got it yet.",
      };
      await store.appendMessage({
        id: idgen.uuid(),
        sessionId,
        seq: nextSeq + 1,
        role: "pupil",
        kind: "clarify_nudge",
        text: nudge.text,
        createdAt: iso(now),
      });
      await store.updateSession(sessionId, {
        flags: flagsWith(session.flags, {
          subFloorNudges: Number(session.flags.subFloorNudges ?? 0) + 1,
        }),
      });
      return { chip: null, pupilMessage: nudge, objectives: objectives.map(objectiveToDto), session: sessionToDto(session, objectives) };
    }

    // D4 overlap — deterministic shingles vs the spec-point note corpus
    const notes = await store.loadNoteCorpus(session.specPointIds);
    const overlap = overlapScore(req.text, notes.map((n) => n.bodyMd));
    const flaggedPastedNotes = overlap != null && overlap >= CFG.antiGaming.verbatimOverlapFlag;

    requireAvailable(chain);

    // LLM call 2..n — the combined judge+probe (pinned teachme.turn.v1)
    const canon = await store.loadSpecPointCanon(session.specPointIds);
    const judgeSystem = TEACHME_TURN_V1.replace("{{PUPIL_CHARTER}}", PUPIL_CHARTER_V1);
    const judgeUser = [
      "COURSE_CANON:",
      canonBlock(canon),
      "",
      "OBJECTIVES (with current status):",
      objectivesStatusBlock(objectives),
      "",
      `DIFFICULTY: ${session.difficulty}`,
      "",
      "TRANSCRIPT:",
      transcriptBlock(messages),
      "",
      "STUDENT_MESSAGE:",
      req.text,
    ].join("\n");
    const res = await chain.generate({
      system: judgeSystem,
      user: judgeUser,
      temperature: CFG.llm.judgeTemperature,
      maxTokens: CFG.llm.maxTokens,
    });

    let judge: z.infer<typeof turnOutputSchema>;
    try {
      judge = turnOutputSchema.parse(readChainText(res.text, res.finishReason));
    } catch (e) {
      if (e instanceof TeachMeFailClosed) throw e;
      throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "judge output was the wrong shape");
    }

    // coverage must list every objective exactly once
    const ordinals = objectives.map((o) => o.ordinal);
    const judgedOrdinals = judge.coverage.map((c) => c.objectiveOrdinal).sort((a, b) => a - b);
    if (
      judgedOrdinals.length !== ordinals.length ||
      judgedOrdinals.some((v, i) => v !== ordinals[i])
    ) {
      throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "coverage did not list every objective exactly once");
    }

    // extractive law: covered ⇒ quote is a verbatim substring of the student's own words
    for (const c of judge.coverage) {
      if (c.covered) {
        if (c.evidenceQuote == null || !isExtractive(c.evidenceQuote, [...studentTexts, req.text])) {
          throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "evidenceQuote was not extractive from the student's messages");
        }
      } else if (c.evidenceQuote != null) {
        throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "evidenceQuote must be null when covered is false");
      }
    }

    // D2 runtime guard: contradiction ⇒ confusion, NEVER an affirmation
    if (judge.contradictionDetected && containsAffirmation(judge.pupilMessage)) {
      throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "the Pupil affirmed a canon-contradicting statement (D2 violation)");
    }

    const chip: VerdictChip = {
      messageSeq: turn,
      verdict: judge.verdict.label,
      feedbackLine: judge.verdict.feedbackLine,
      coveredObjectiveIds: judge.coverage
        .filter((c) => c.covered)
        .map((c) => objectives.find((o) => o.ordinal === c.objectiveOrdinal)?.id)
        .filter((id): id is string => Boolean(id)),
      contradictionDetected: judge.contradictionDetected,
      wordFloorPassed: true,
      overlapScore: overlap,
      flaggedPastedNotes,
    };

    // persist the student turn + the Pupil's reply
    await store.appendMessage({
      id: idgen.uuid(),
      sessionId,
      seq: nextSeq,
      role: "student",
      kind: null,
      text: req.text,
      createdAt: iso(now),
    });
    const pupil: PupilMessage = {
      kind: judge.contradictionDetected ? "confusion" : "paraphrase_probe",
      text: judge.pupilMessage,
    };
    await store.appendMessage({
      id: idgen.uuid(),
      sessionId,
      seq: nextSeq + 1,
      role: "pupil",
      kind: pupil.kind,
      text: pupil.text,
      createdAt: iso(now),
    });

    // coverage ledger (append-only) + the D1 evidence-credit record (D4 dedupe)
    const updatedObjectives = objectives.map((o) => ({ ...o }));
    const credits: EvidenceCreditRecord[] = Array.isArray(session.flags.evidenceCredits)
      ? (session.flags.evidenceCredits as EvidenceCreditRecord[])
      : [];
    const creditWindowStart = new Date(now.getTime() - CFG.antiGaming.repeatCreditWindowDays * 86_400_000);
    const recentlyCredited = flaggedPastedNotes
      ? []
      : await store.recentCreditSpecPointIds(userId, session.specPointIds, creditWindowStart);
    const recentSet = new Set(recentlyCredited);

    const coverageRows: TeachMeCoverageRow[] = [];
    if (!flaggedPastedNotes) {
      for (const c of judge.coverage.filter((x) => x.covered)) {
        const objective = objectives.find((o) => o.ordinal === c.objectiveOrdinal);
        if (!objective || c.evidenceQuote == null) continue;
        coverageRows.push({
          id: idgen.uuid(),
          sessionId,
          objectiveId: objective.id,
          messageSeq: turn,
          covered: true,
          evidenceQuote: c.evidenceQuote,
          verdict: chip.verdict,
          contradictionDetected: chip.contradictionDetected,
          createdAt: iso(now),
        });
        const row = updatedObjectives.find((o) => o.id === objective.id);
        if (row) row.status = "covered";
        for (const sp of objective.specPointIds) {
          credits.push({
            specPointId: sp,
            objectiveId: objective.id,
            messageSeq: turn,
            credited: !recentSet.has(sp), // D4: 7-day repeat-credit dedupe
            kind: CFG.evidence.kind,
            tier: CFG.evidence.tier,
          });
        }
      }
    } else {
      for (const c of judge.coverage.filter((x) => x.covered)) {
        const objective = objectives.find((o) => o.ordinal === c.objectiveOrdinal);
        if (!objective) continue;
        const row = updatedObjectives.find((o) => o.id === objective.id);
        if (row) row.status = "flagged"; // D4: flagged ⇒ not covered, fail-closed
      }
    }
    if (coverageRows.length > 0) await store.appendCoverage(coverageRows);

    const tokensUsed = session.tokensUsed + estimateTokens(judgeSystem, judgeUser, res.text);
    const updatedSession: TeachMeSessionRow = {
      ...session,
      messageCount: session.messageCount + 1,
      llmCallCount: session.llmCallCount + 1,
      tokensUsed,
      flags: flagsWith(session.flags, {
        overlapFlags: Number(session.flags.overlapFlags ?? 0) + (flaggedPastedNotes ? 1 : 0),
        contradictions: Number(session.flags.contradictions ?? 0) + (judge.contradictionDetected ? 1 : 0),
        evidenceCredits: credits,
        overlapScore: overlap,
      }),
    };
    await store.updateSession(sessionId, {
      messageCount: updatedSession.messageCount,
      llmCallCount: updatedSession.llmCallCount,
      tokensUsed: updatedSession.tokensUsed,
      flags: updatedSession.flags,
    });
    for (const o of updatedObjectives) {
      if (o.status !== "not_started") {
        await store.updateObjectivesStatus([o.id], o.status);
      }
    }

    return {
      chip,
      pupilMessage: pupil,
      objectives: updatedObjectives.map(objectiveToDto),
      session: sessionToDto(updatedSession, updatedObjectives),
    };
  }

  /* -- endSession (plan §6 route 3) --------------------------------- */
  async function endSession(
    userId: string,
    sessionId: string,
  ): Promise<{ status: TeachSession["status"]; review: ReviewCard | null }> {
    const loaded = await store.findSession(sessionId);
    if (!loaded) throw new TeachMeNotFound();
    const { session, objectives } = loaded;
    if (session.userId !== userId) throw new TeachMeFailClosed("NOT_OWNER", "not your session");

    // idempotent end: completed / review_pending return the persisted state honestly
    if (session.status === "completed") {
      const card = await store.findReviewCard(sessionId);
      return { status: "completed", review: (card as ReviewCard) ?? null };
    }
    if (session.status === "review_pending") {
      return { status: "review_pending", review: null };
    }
    if (session.status !== "active") {
      throw new TeachMeFailClosed("SESSION_NOT_ACTIVE", "session is not active");
    }
    if (session.llmCallCount + 1 > CFG.cost.maxLlmCallsPerSession) {
      throw new TeachMeFailClosed("TOKEN_CEILING", "per-session LLM call ceiling reached");
    }
    requireAvailable(chain);

    const now = clock.now();
    await store.updateSession(sessionId, { status: "review_pending" });

    const [messages, coverageRows, canon] = await Promise.all([
      store.listMessages(sessionId),
      store.listCoverage(sessionId),
      store.loadSpecPointCanon(session.specPointIds),
    ]);
    const nodeIds = canon.map((c) => c.id);
    const inputs = await store.loadReviewInputs({
      specPointCodes: session.specPointIds,
      specPointNodeIds: nodeIds,
      courseHrefBase: `/courses/${session.courseId}`,
    });

    const flaggedObjectives = objectives.filter((o) => o.status === "flagged");
    const flaggedSpecPoints = new Set(flaggedObjectives.flatMap((o) => o.specPointIds));
    const studentTexts = messages.filter((m) => m.role === "student").map((m) => m.text);
    const studentSeqs = new Set(messages.filter((m) => m.role === "student").map((m) => m.seq));

    const reviewSystem = TEACHME_REVIEW_V1;
    const reviewUser = [
      "COURSE_CANON:",
      canonBlock(canon),
      "",
      "OBJECTIVES (final statuses):",
      objectivesStatusBlock(objectives),
      "",
      "TRANSCRIPT:",
      transcriptBlock(messages),
      "",
      "COVERAGE_ROWS:",
      coverageRows.length === 0
        ? "(none)"
        : coverageRows
            .map(
              (r) =>
                `- objective ${r.objectiveId} @ message_seq ${r.messageSeq}: covered=${r.covered}, verdict=${r.verdict}, quote=${JSON.stringify(r.evidenceQuote)}, contradiction=${r.contradictionDetected}`,
            )
            .join("\n"),
      "",
      "MISCONCEPTION_REGISTRY_EXCERPT:",
      inputs.registry.length === 0
        ? "(no registry entries for these spec points)"
        : inputs.registry.map((r) => `- [${r.code}] ${r.statement}`).join("\n"),
      "",
      "PAST_PAPER_ANCHORS:",
      inputs.anchors.length === 0
        ? "(none indexed for these spec points)"
        : inputs.anchors.map((a) => `- specPointId=${a.specPointId} paperRef=${JSON.stringify(a.paperRef)} questionRef=${JSON.stringify(a.questionRef)}`).join("\n"),
      "",
      "PRACTICE_RESOURCES:",
      inputs.practice.length === 0
        ? "(none indexed yet)"
        : inputs.practice.map((p) => `- [${p.resourceType}] ${p.label} -> ${p.href}`).join("\n"),
      "",
      "PREREQ_WARNINGS: (none computed in v1 — pass through empty)",
    ].join("\n");
    const res = await chain.generate({
      system: reviewSystem,
      user: reviewUser,
      temperature: CFG.llm.reviewTemperature,
      maxTokens: CFG.llm.maxTokens,
    });

    let parsed: z.infer<typeof reviewOutputSchema>;
    try {
      parsed = reviewOutputSchema.parse(readChainText(res.text, res.finishReason));
    } catch (e) {
      if (e instanceof TeachMeFailClosed) throw e;
      throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "review output was the wrong shape");
    }

    // grounding laws: verdicts/spec-point sets, extractive quotes, real ids/refs only
    const verdictIds = new Set(parsed.specPointVerdicts.map((v) => v.specPointId));
    const sessionIds = new Set(session.specPointIds);
    if (
      verdictIds.size !== parsed.specPointVerdicts.length ||
      !session.specPointIds.every((sp) => verdictIds.has(sp)) ||
      [...verdictIds].some((sp) => !sessionIds.has(sp))
    ) {
      throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "specPointVerdicts must cover exactly the session's spec points");
    }
    for (const v of parsed.specPointVerdicts) {
      if (v.verdict === "flagged" && !flaggedSpecPoints.has(v.specPointId)) {
        throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "flagged verdict without a flagged objective (overlap law)");
      }
      if (v.evidenceQuote != null && !isExtractive(v.evidenceQuote, studentTexts)) {
        throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "verdict evidenceQuote was not extractive from the student's messages");
      }
    }
    for (const s of parsed.strengths) {
      if (!studentSeqs.has(s.messageSeq) || !isExtractive(s.quote, studentTexts)) {
        throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "strength quote was not extractive from the student's messages");
      }
    }
    const registryCodes = new Set(inputs.registry.map((r) => r.code));
    for (const m of parsed.misconceptionNotes) {
      if (m.matchedMisconceptionId != null && !registryCodes.has(m.matchedMisconceptionId)) {
        throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "misconception id was invented (not in the registry excerpt)");
      }
    }
    const anchorKeys = new Set(inputs.anchors.map((a) => `${a.specPointId}|${a.paperRef}|${a.questionRef}`));
    for (const a of parsed.examAnchors) {
      if (!anchorKeys.has(`${a.specPointId}|${a.paperRef}|${a.questionRef}`)) {
        throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "exam anchor was invented (not in the serving corpus)");
      }
    }
    const practiceKeys = new Set(inputs.practice.map((p) => `${p.label}|${p.resourceType}|${p.href}`));
    for (const p of parsed.suggestedPractice) {
      if (!practiceKeys.has(`${p.label}|${p.resourceType}|${p.href}`)) {
        throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "suggested practice was invented (not a real course resource)");
      }
    }
    for (const imp of parsed.improvements) {
      if (!imp.specPointIds.every((sp) => sessionIds.has(sp))) {
        throw new TeachMeFailClosed("LLM_SHAPE_DRIFT", "improvement cites a spec point outside this session");
      }
    }

    const card: ReviewCard = {
      sessionId,
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      specPointVerdicts: parsed.specPointVerdicts,
      misconceptionNotes: parsed.misconceptionNotes,
      examAnchors: parsed.examAnchors,
      prereqWarnings: parsed.prereqWarnings,
      suggestedPractice: parsed.suggestedPractice,
      generatedAt: iso(now),
    };

    // BDT candidate queue — AI_SUGGESTED, never auto-promoted (plan §2.3)
    const candidates: TeachMeCandidateRow[] = parsed.misconceptionNotes.map((m) => ({
      id: idgen.uuid(),
      sessionId,
      specPointIds: [...session.specPointIds],
      statement: m.statement,
      matchedMisconceptionId: m.matchedMisconceptionId,
      confidence: m.confidence,
      status: "candidate",
      createdAt: iso(now),
    }));
    const inserted = candidates.length > 0 ? await store.insertMisconceptionCandidates(candidates) : 0;

    await store.insertReviewCard(sessionId, card, iso(now));
    const tokensUsed = session.tokensUsed + estimateTokens(reviewSystem, reviewUser, res.text);
    await store.updateSession(sessionId, {
      status: "completed",
      endedAt: iso(now),
      tokensUsed,
      flags: flagsWith(session.flags, {
        reviewPrompt: CFG.prompts.review,
        candidatesInserted: inserted,
      }),
    });

    return { status: "completed", review: card };
  }

  /* -- getSession (plan §6 route 5 — the permalink payload) ---------- */
  async function getSession(userId: string, sessionId: string) {
    const loaded = await store.findSession(sessionId);
    if (!loaded) throw new TeachMeNotFound();
    const { session, objectives } = loaded;
    if (session.userId !== userId) throw new TeachMeFailClosed("NOT_OWNER", "not your session");
    const [messages, reviewCard] = await Promise.all([
      store.listMessages(sessionId),
      store.findReviewCard(sessionId),
    ]);
    return {
      session: sessionToDto(session, objectives),
      transcript: messages,
      review: (reviewCard as ReviewCard | null) ?? null,
    };
  }

  /* -- listSessions (plan §6 route 4 — history) ---------------------- */
  async function listSessions(userId: string, courseId: string | null): Promise<{ items: SessionHistoryItem[] }> {
    const rows = await store.listSessions(userId, courseId);
    return {
      items: rows.map((r) => ({
        sessionId: r.id,
        courseId: r.courseId,
        specPointIds: r.specPointIds,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  }

  return { createSession, postMessage, endSession, getSession, listSessions };
}

export type TeachMeService = ReturnType<typeof createTeachMeService>;
