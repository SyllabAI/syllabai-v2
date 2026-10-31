/**
 * T-TEACHME-001 · run-002 · apps/api/test/teach-me/behavioural.test.ts
 *
 * T-MIG-039 behavioural gate: NO live LLM — every judge/review response is a
 * checked-in fixture (fixtures.ts); NO Neon — the store is in-memory. All
 * constants come from TEACH_ME_CONFIG — no literals in assertions.
 *
 * D4 physical mapping (disclosed in the run-002 receipt): the evidence row of
 * record IS the teach_objective_coverages append (ADR-040 D1's ledger), and
 * the 7-day repeat-credit dedupe materialises in teach_sessions.flags.
 * evidenceCredits[] as {specPointId, objectiveId, messageSeq, credited,
 * kind, tier} — the sentinel/workbench projection.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEACH_ME_CONFIG } from "../../src/teach-me/config";
import { COURSE, ELIGIBLE_MESSAGE, QUOTE_1, SPEC_POINTS, USER, makeHarness, pastedNotesExcerpt, NOTE_BODY } from "./fixtures";

const CFG = TEACH_ME_CONFIG;

const createBody = (length: "quick" | "in_depth" = "quick") => ({
  courseId: COURSE,
  specPointIds: [...SPEC_POINTS],
  difficulty: "medium" as const,
  length,
  mode: "chat" as const,
});

describe("teach-me behavioural gate (T-MIG-039, ADR-040)", () => {
  it("D3 quota: denies the (cap+1)-th session in a UTC day with a typed error and no session row", async () => {
    const h = makeHarness({ sessionsToday: CFG.quota.dailySessionCap });
    const res = await h.createSession();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("QUOTA_EXCEEDED");
    expect(await h.sessionRowCount()).toBe(0);
  });

  it("D3 message ceiling: Quick rejects message " + (CFG.sessionShape.maxMessagesByLength.quick + 1) + ", In-Depth rejects message " + (CFG.sessionShape.maxMessagesByLength.in_depth + 1), async () => {
    for (const length of ["quick", "in_depth"] as const) {
      const h = makeHarness({});
      const created = await h.createSession(createBody(length));
      expect(created.status).toBe(200);
      const sessionId = (created.body.session as { id: string }).id;
      const played = await h.playTurns(sessionId, CFG.sessionShape.maxMessagesByLength[length]);
      for (const turn of played) expect(turn.status).toBe(200);
      const over = await h.postMessage(sessionId, ELIGIBLE_MESSAGE);
      expect(over.status).toBe(409);
      expect(over.body.error).toBe("MESSAGE_CEILING");
    }
  });

  it("D3 ceilings: a full fixture session never exceeds the LLM-call or token ceiling", async () => {
    const h = makeHarness({});
    const created = await h.createSession(createBody("in_depth"));
    const sessionId = (created.body.session as { id: string }).id;
    await h.playTurns(sessionId, CFG.sessionShape.maxMessagesByLength.in_depth);
    const ended = await h.end(sessionId);
    expect(ended.status).toBe(200);
    const s = (await h.permalink(sessionId)).body.session as { llmCallCount: number; tokensUsed: number };
    expect(s.llmCallCount).toBeLessThanOrEqual(CFG.cost.maxLlmCallsPerSession);
    expect(s.tokensUsed).toBeLessThanOrEqual(CFG.cost.maxTokensPerSession);
  });

  it("D4 word floor: a sub-floor message gets NO chip, NO coverage credit, only a clarify nudge", async () => {
    const h = makeHarness({});
    const created = await h.createSession(createBody("quick"));
    const sessionId = (created.body.session as { id: string }).id;
    const thin = Array(CFG.antiGaming.minWordsPerExplanation - 1).fill("ion").join(" ");
    const res = await h.postMessage(sessionId, thin);
    expect(res.status).toBe(200);
    expect(res.body.chip).toBeNull();
    expect((res.body.pupilMessage as { kind: string }).kind).toBe("clarify_nudge");
    expect(
      (res.body.objectives as Array<{ status: string }>).every((o) => o.status === "not_started"),
    ).toBe(true);
    expect(await h.coverageRowCount(sessionId)).toBe(0);
    expect(await h.creditRecords(sessionId)).toHaveLength(0);
  });

  it("D4 overlap: a pasted-notes message (≥ flag threshold) marks the objective flagged and credits no evidence", async () => {
    const h = makeHarness({ reviewFixture: "flagged" });
    const created = await h.createSession(createBody("quick"));
    const sessionId = (created.body.session as { id: string }).id;
    const res = await h.postMessage(sessionId, pastedNotesExcerpt(NOTE_BODY));
    expect(res.status).toBe(200);
    const chip = res.body.chip as { flaggedPastedNotes: boolean; overlapScore: number | null };
    expect(chip.flaggedPastedNotes).toBe(true);
    expect(chip.overlapScore as number).toBeGreaterThanOrEqual(CFG.antiGaming.verbatimOverlapFlag);
    expect(await h.coverageRowCount(sessionId)).toBe(0);
    const credits = await h.creditRecords(sessionId);
    expect(credits).toHaveLength(0);
    const ended = await h.end(sessionId);
    expect(ended.status).toBe(200);
    const review = ended.body.review as { specPointVerdicts: Array<{ verdict: string }> };
    expect(review.specPointVerdicts.some((v) => v.verdict === "flagged")).toBe(true);
  });

  it("D4 dedupe: re-covering the same (student, spec point) within " + CFG.antiGaming.repeatCreditWindowDays + " days credits no second evidence row", async () => {
    const h = makeHarness({});
    const first = await h.createSession(createBody("quick"));
    const firstId = (first.body.session as { id: string }).id;
    await h.playTurns(firstId, 1);
    const firstCredits = (await h.creditRecords(firstId)).filter((c) => c.credited === true);
    expect(firstCredits.length).toBeGreaterThan(0);
    expect(firstCredits.every((c) => c.credited === true)).toBe(true);

    // a second session, same student, same spec points, same week
    const second = await h.createSession(createBody("quick"));
    const secondId = (second.body.session as { id: string }).id;
    await h.playTurns(secondId, 1);
    const secondCredits = (await h.creditRecords(secondId)).filter((c) => c.credited === true);
    expect(secondCredits).toHaveLength(0); // deduped: covered again, credited never
    // the coverage LEDGER still appends (session-local truth), the CREDIT does not
    expect(await h.coverageRowCount(secondId)).toBeGreaterThan(0);
  });

  it("D2 guardrail: a contradiction fixture produces a confusion message and NEVER an affirmation", async () => {
    const h = makeHarness({ judgeFixture: "contradiction" });
    const created = await h.createSession(createBody("quick"));
    const sessionId = (created.body.session as { id: string }).id;
    const res = await h.postMessage(sessionId, ELIGIBLE_MESSAGE);
    const chip = res.body.chip as { contradictionDetected: boolean };
    expect(chip.contradictionDetected).toBe(true);
    const pupil = res.body.pupilMessage as { kind: string; text: string };
    expect(pupil.kind).toBe("confusion");
    const text = pupil.text.toLowerCase();
    for (const banned of ["that clicks", "that makes sense", "got it", "exactly right", "perfect, thanks"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("D2 runtime guard: an affirmation marker on contradiction is a fail-closed LLM_SHAPE_DRIFT", async () => {
    const h = makeHarness({ judgeFixture: "affirmation" });
    const created = await h.createSession(createBody("quick"));
    const sessionId = (created.body.session as { id: string }).id;
    const res = await h.postMessage(sessionId, ELIGIBLE_MESSAGE);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("LLM_SHAPE_DRIFT");
    const s = (await h.permalink(sessionId)).body.session as { messageCount: number };
    expect(s.messageCount).toBe(0); // nothing persisted from the refused turn
  });

  it("T-MIG-039 shape drift: a malformed judge fixture is refused fail-closed and leaves the session consistent", async () => {
    const h = makeHarness({ judgeFixture: "shape_drift" });
    const created = await h.createSession(createBody("quick"));
    const sessionId = (created.body.session as { id: string }).id;
    const res = await h.postMessage(sessionId, ELIGIBLE_MESSAGE);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("LLM_SHAPE_DRIFT");
    const s = (await h.permalink(sessionId)).body.session as { messageCount: number };
    expect(s.messageCount).toBe(0); // nothing persisted from the refused turn
  });

  it("D1 evidence: every credit record is TEACH_SESSION / AI_SUGGESTED and references its session + objective", async () => {
    const h = makeHarness({});
    const created = await h.createSession(createBody("quick"));
    const sessionId = (created.body.session as { id: string }).id;
    await h.playTurns(sessionId, 1);
    const credits = await h.creditRecords(sessionId);
    expect(credits.length).toBeGreaterThan(0);
    for (const row of credits) {
      expect(row.kind).toBe(CFG.evidence.kind);
      expect(row.tier).toBe(CFG.evidence.tier);
      expect(typeof row.objectiveId).toBe("string");
      expect(typeof row.messageSeq).toBe("number");
      expect(SPEC_POINTS.includes(String(row.specPointId))).toBe(true);
    }
  });

  it("D1 mastery invariant: a full fixture session leaves of-record mastery bit-identical and writes only teach_* planes", async () => {
    const h = makeHarness({ judgeFixture: "contradiction" });
    const before = await h.masterySnapshot();
    const created = await h.createSession(createBody("in_depth"));
    const sessionId = (created.body.session as { id: string }).id;
    await h.playTurns(sessionId, 2);
    await h.end(sessionId);
    expect(await h.masterySnapshot()).toEqual(before);
    // the store port has NO mastery write method — audit it never even tried
    const storeWrites = h.store.audit.filter((a) => a.method.startsWith("insert") || a.method.startsWith("update"));
    const allowed = new Set([
      "insertSession", "insertReviewCard", "insertMisconceptionCandidates",
      "updateSession", "updateObjectivesStatus",
    ]);
    for (const w of storeWrites) expect(allowed.has(w.method)).toBe(true);
  });

  it("D1 append-only: the coverage ledger in sql.ts has no UPDATE/DELETE write path", () => {
    const src = readFileSync(join(import.meta.dir, "../../src/teach-me/sql.ts"), "utf-8");
    expect(src).toContain("INSERT INTO teach_objective_coverages");
    expect(src).not.toMatch(/(UPDATE|DELETE)\s+teach_objective_coverages/i);
    // and no of-record mastery table is touched anywhere in the module
    for (const banned of ["mastery", "misconception_states", "learner_kg"]) {
      expect(src.toLowerCase()).not.toContain(banned);
    }
  });

  it("prompt pinning: the TS module is byte-identical to the pinned .md sources (bump, never edit)", async () => {
    const { PUPIL_CHARTER_V1, TEACHME_TURN_V1, TEACHME_REVIEW_V1 } = await import("../../src/teach-me/prompts");
    const dir = join(import.meta.dir, "../../src/teach-me/prompts");
    expect(PUPIL_CHARTER_V1).toBe(readFileSync(join(dir, "pupil.md"), "utf-8"));
    expect(TEACHME_TURN_V1).toBe(readFileSync(join(dir, "teachme-turn-v1.md"), "utf-8"));
    expect(TEACHME_REVIEW_V1).toBe(readFileSync(join(dir, "teachme-review-v1.md"), "utf-8"));
    // the fused prompt must carry the charter verbatim (the {{PUPIL_CHARTER}} fill)
    expect(TEACHME_TURN_V1).toContain("{{PUPIL_CHARTER}}");
  });

  it("flags parity: the hub render gate and the serving scope of record agree (soft until run-003 adds the key)", async () => {
    const hubFlags = JSON.parse(
      readFileSync(join(import.meta.dir, "../../../hub/content/flags.json"), "utf-8"),
    ) as { flags?: Record<string, unknown> };
    const hubTeachMe = (hubFlags.flags ?? {})["teachMe"];
    if (hubTeachMe !== undefined) {
      expect(hubTeachMe).toEqual({ enabled: CFG.flags.teachMe.enabled, courses: [...CFG.flags.teachMe.courses] });
    }
  });

  it("authz + ownership: another user's session is NOT_OWNER (403), unknown session 404", async () => {
    const h = makeHarness({});
    const created = await h.createSession();
    const sessionId = (created.body.session as { id: string }).id;
    const resOther = await h.postMessageAs("someone-else", sessionId, ELIGIBLE_MESSAGE);
    expect(resOther.status).toBe(403);
    expect(resOther.body.error).toBe("NOT_OWNER");
    const resMissing = await h.end("00000000-0000-0000-0000-000000000000");
    expect(resMissing.status).toBe(404);
  });

  it("end idempotence: review_pending returns honestly pending; completed returns the persisted card", async () => {
    const h = makeHarness({});
    const created = await h.createSession(createBody("quick"));
    const sessionId = (created.body.session as { id: string }).id;
    await h.playTurns(sessionId, 1);
    // force review_pending without a card (simulate a mid-flight end)
    await h.store.updateSession(sessionId, { status: "review_pending" });
    const pending = await h.end(sessionId);
    expect(pending.status).toBe(200);
    expect(pending.body.status).toBe("review_pending");
    expect(pending.body.review).toBeNull();
    // now complete it
    await h.store.updateSession(sessionId, { status: "active" });
    const done = await h.end(sessionId);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("completed");
    const again = await h.end(sessionId);
    expect(again.status).toBe(200);
    expect((again.body.review as { sessionId?: string }).sessionId ?? true).toBeTruthy();
  });

  it("history + permalink: the session lists with its course and the permalink carries transcript + review", async () => {
    const h = makeHarness({});
    const created = await h.createSession(createBody("quick"));
    const sessionId = (created.body.session as { id: string }).id;
    await h.playTurns(sessionId, 1);
    await h.end(sessionId);
    const list = await h.history(COURSE);
    expect((list.body.items ?? []).some((i) => i.sessionId === sessionId)).toBe(true);
    const page = await h.permalink(sessionId);
    const transcript = page.body.transcript as Array<{ role: string }>;
    expect(transcript.some((m) => m.role === "pupil")).toBe(true);
    expect(page.body.review).not.toBeNull();
  });

  it("G-gates: a course outside the flag mirror is TEACH_ME_FLAG_DISABLED; canon/corpus gaps are COURSE_NOT_ELIGIBLE", async () => {
    const h = makeHarness({});
    const off = await h.createSession({ ...createBody("quick"), courseId: "igcse-physics-19" });
    expect(off.status).toBe(409);
    expect(off.body.error).toBe("TEACH_ME_FLAG_DISABLED");

    const noCanon = makeHarness({ canonRows: [] });
    const resNoCanon = await noCanon.createSession();
    expect(resNoCanon.status).toBe(409);
    expect(resNoCanon.body.error).toBe("COURSE_NOT_ELIGIBLE");

    const noNotes = makeHarness({ notes: [] });
    const resNoNotes = await noNotes.createSession();
    expect(resNoNotes.status).toBe(409);
    expect(resNoNotes.body.error).toBe("COURSE_NOT_ELIGIBLE");
  });

  it("chain-down posture: a dead chain refuses honestly (503 PROVIDER_UNAVAILABLE), consuming nothing", async () => {
    const h = makeHarness({});
    h.chain.availableFlag = false;
    const res = await h.createSession();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("PROVIDER_UNAVAILABLE");
    expect(await h.sessionRowCount()).toBe(0);
  });

  it("D1 extractive law: an invented (non-verbatim) evidence quote is LLM_SHAPE_DRIFT", async () => {
    const h = makeHarness({ judgeFixture: "invented_quote" });
    const created = await h.createSession(createBody("quick"));
    const sessionId = (created.body.session as { id: string }).id;
    const res = await h.postMessage(sessionId, ELIGIBLE_MESSAGE);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("LLM_SHAPE_DRIFT");
    const s = (await h.permalink(sessionId)).body.session as { messageCount: number };
    expect(s.messageCount).toBe(0); // nothing persisted from the refused turn
  });

  it("config sanity: the config object is the single source (route tests never hard-code Q4/Q5 constants)", () => {
    expect(CFG.quota.dailySessionCap).toBe(3);
    expect(CFG.sessionShape.objectivesByLength).toEqual({ quick: 3, in_depth: 4 });
    expect(CFG.sessionShape.maxMessagesByLength).toEqual({ quick: 5, in_depth: 6 });
    expect(CFG.cost.maxLlmCallsPerSession).toBe(10);
    expect(CFG.antiGaming.minWordsPerExplanation).toBe(40);
    expect(CFG.antiGaming.verbatimOverlapFlag).toBe(0.8);
    expect(CFG.antiGaming.repeatCreditWindowDays).toBe(7);
    expect(CFG.flags.teachMe.courses).toEqual([COURSE]);
    expect(CFG.evidence).toEqual({ kind: "TEACH_SESSION", tier: "AI_SUGGESTED", appendOnly: true });
    expect(typeof USER).toBe("string"); // fixtures keep identity constants here too
  });
});
