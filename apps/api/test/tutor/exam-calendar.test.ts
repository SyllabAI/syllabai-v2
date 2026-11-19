/**
 * T-TUTOR-AIM-P3 run-003 — DC10 §7.9 the exam-calendar plane (the §13.3
 * gate released, operator trace 1a1f41f5679f5ec5 "proceed"):
 *
 *   THE BANDS: the deterministic urgency bands of record (fixed at build
 *   time — the §12 open-question-4 precedent) — IN_WINDOW while the sitting
 *   window is open, NEAR within 21 calendar days of the window start, FAR
 *   beyond; a window that has ENDED weighs NOTHING (null — a passed sitting
 *   is not calendar pressure).
 *
 *   THE MATCH: the ask's curriculum code → the SERVED registry's slug of
 *   record (apps/hub/content/courses.json — the hub's OWN mapping, read
 *   through the served content-plane seam, never a duplicate) → the
 *   learner's DECLARED target for THAT course. Every miss is the honest
 *   empty — no invented date ever renders.
 *
 *   THE SPACING ARM (§7.9 "pendingReview spacing weights the calendar"):
 *   the §7.8 directive's planned count doubles at NEAR/IN_WINDOW (the
 *   ×2 build-time constant); FAR and no-calendar asks keep the base law
 *   byte-identical (the run-001 pins stay green).
 *
 *   THE EMPHASIS ARM (§7.9 "answer emphasis weights the calendar"): the
 *   EXAM CONTEXT block renders (unfenced, metadata only — §13.2/§11) and
 *   the v20 EXAM CALENDAR law governs emphasis; an ask without a live
 *   declared target renders NOTHING — the composed prompt keeps the
 *   pre-run bytes (the empty-context byte-stability law, pinned here at
 *   the prompt level AND the pipeline level).
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  EXAM_NEAR_DAYS,
  EXAM_DRILL_SPACING_MULTIPLIER,
  examUrgencyOf,
  examContextBriefOf,
  matchExamTarget,
  buildCourseSlugMap,
  courseSlugMap,
  type ExamContextBrief,
} from "../../src/services/tutor/exam-calendar";
import { selectDrillDirectiveBasis } from "../../src/services/tutor/drill-directive";
import { assembleTutorContext } from "../../src/services/tutor/context";
import { userPrompt, systemPrompt, promptIdentity, PROMPT_VERSION } from "../../src/services/tutor/prompt";
import { buildTutorModule } from "../../src/services/tutor";
import { evidenceFromChunk } from "../../src/services/tutor/evidence";
import type { TutorContext } from "../../src/services/tutor/context";
import type { CourseExamTargetView } from "@syllabai/contracts";
import type { SqlFn } from "../../src/services/tutor/sql";

// ── fixtures ────────────────────────────────────────────────────────────────

const LEARNER = "bb000000-0000-4000-8000-000000000001";
const TOPIC_A = "aa000000-0000-4000-8000-00000000000a";
const P1 = "ac000000-0000-4000-8000-000000000001";
const MISCO_1 = "ab000000-0000-4000-8000-000000000001";
const ROW_A = "dd000000-0000-4000-8000-000000000001";
const CHUNK_A = "ee000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-17T08:00:00Z");
const clock = { now: () => NOW };

/** A declared target view as the ExamTargetReader seam derives it (the
 *  countdown derived on the read — the fakes carry the derived days). */
function target(over: Partial<CourseExamTargetView> = {}): CourseExamTargetView {
  return {
    courseSlug: "igcse-chemistry-19",
    seriesId: "f1000000-0000-4000-8000-000000000001",
    seriesCode: "June-2026",
    label: "Edexcel International GCSE Science June 2026 (est.)",
    windowStart: "2026-12-01",
    windowEnd: "2026-12-12",
    entryDeadline: null,
    resultsDate: null,
    estimated: true,
    daysToWindowStart: 14,
    daysToWindowEnd: 25,
    entryDeadlinePassed: false,
    ...over,
  };
}

const SCOPE = {
  curriculumVersionId: "cv-00000000-0000-0000-0000-000000000001",
  code: "4CH1-2017",
  surface: new Set([TOPIC_A]),
};
const scopes = {
  resolveActive: async () => SCOPE,
  resolveForCourse: async () => SCOPE,
};
const noActiveScopes = {
  resolveActive: async () => null,
  resolveForCourse: async () => SCOPE,
};

const kgGraph = {
  structureNodes: async () => [
    { id: TOPIC_A, code: "4CH1-U1-T3", title: "Projectile motion", validation_status: "VALIDATED" },
  ],
  prerequisiteChains: async () =>
    new Map([[TOPIC_A, [{ id: P1, title: "Vector components", depth: 1 }]]]),
  misconceptionsForTopics: async () =>
    new Map([[TOPIC_A, [{ id: MISCO_1, title: "gravity pulls sideways in flight" }]]]),
};

const evidenceRow = evidenceFromChunk({
  documentRowId: ROW_A,
  documentId: "doc-1",
  documentVersion: 1,
  chunkId: CHUNK_A,
  chunkIndex: 0,
  kind: "TEXTBOOK",
  content: "A projectile's horizontal and vertical components are independent.",
  pageStart: 3,
  pageEnd: 3,
  elementIds: [],
  embeddingModel: "text-embedding-004",
  cosine: 0.9,
});

const notPaper = async () => ({ items: [], identityParsed: false, identityLabel: null });

/** The states the AIM law needs so the aim is live in the pipeline pins. */
const AIM_STATE = {
  nodeId: P1,
  mastery: 0.9,
  lastPracticedAt: new Date("2026-11-10T08:00:00Z"),
  proceduralFluencyGap: null,
} as never;

const QUESTION = "Explain why projectile motion range depends on launch angle.";

interface Captured {
  events: unknown[];
  contexts: TutorContext[];
  examReads: number;
}

/** The pipeline harness — the aim-pipeline pattern with the §7.9 plane:
 *  the fake port carries examTargets (a spy counting the reads) and the
 *  deps carry the registry bridge (synthetic map — the REAL registry pin
 *  lives in the loader tests below). */
function makeHarness(over: {
  examTargets?: CourseExamTargetView[] | null;
  pending?: unknown[];
  withPortExamTargets?: boolean; // default true; false = the pre-§7.9 port
  courseSlugOf?: (code: string) => string | null;
  noActiveScope?: boolean; // resolveActive → null (the true no-scope ask)
} = {}) {
  const captured: Captured = { events: [], contexts: [], examReads: 0 };
  const port = {
    skillStates: async () => [AIM_STATE],
    misconceptionReadings: async () => [],
    activeStruggleInferences: async () => [],
    topicEngagements: async () => [],
    pendingReviews: async () => over.pending ?? [],
    ...(over.withPortExamTargets === false
      ? {}
      : {
          examTargets: async () => {
            captured.examReads += 1;
            return over.examTargets ?? [];
          },
        }),
  };
  const deps = {
    sql: (async () => []) as unknown as SqlFn,
    clock,
    kgGraph,
    scopes: over.noActiveScope === true ? noActiveScopes : scopes,
    vectorRetriever: async () => [evidenceRow],
    paperQuestionResolver: notPaper,
    generator: {
      async generate(_q: string, _h: unknown, context: TutorContext) {
        captured.contexts.push(context);
        return { answer: "The components are independent [1].", model: "fake-model", provider: "fake-provider", finishReason: "stop" };
      },
      async *streamGenerate(_q: string, _h: unknown, context: TutorContext) {
        captured.contexts.push(context);
        yield { answer: "The components ", model: "fake-model", providerName: "fake-provider", finishReason: null };
        yield { answer: "are independent [1].", model: "fake-model", providerName: "fake-provider", finishReason: "stop" };
      },
    },
    telemetry: (e: unknown) => captured.events.push(e),
    learnerModel: port as never,
    ...(over.courseSlugOf !== undefined
      ? { courseSlugOf: over.courseSlugOf }
      : { courseSlugOf: (code: string) => (code === "4CH1-2017" ? "igcse-chemistry-19" : null) }),
  };
  const mod = buildTutorModule(deps.sql, clock, deps as never);
  return { mod, captured };
}

// ── the urgency bands of record ─────────────────────────────────────────────

describe("T-TUTOR-AIM-P3 run-003 — the exam urgency bands (DC10 §7.9)", () => {
  test("the build-time constants of record", () => {
    // fixed at build time (the §12 open-question-4 precedent — retention's
    // 180 days fixed the same way); a change is a deliberate, recorded one
    expect(EXAM_NEAR_DAYS).toBe(21);
    expect(EXAM_DRILL_SPACING_MULTIPLIER).toBe(2);
  });

  test("FAR — beyond the NEAR bound", () => {
    expect(examUrgencyOf(22, 33)).toBe("FAR");
    expect(examUrgencyOf(200, 211)).toBe("FAR");
  });

  test("NEAR — within 21 calendar days of the window start (bounds pinned)", () => {
    expect(examUrgencyOf(21, 32)).toBe("NEAR");
    expect(examUrgencyOf(1, 12)).toBe("NEAR");
    expect(examUrgencyOf(EXAM_NEAR_DAYS, EXAM_NEAR_DAYS + 11)).toBe("NEAR");
  });

  test("IN_WINDOW — the window is open now (both edges)", () => {
    expect(examUrgencyOf(0, 12)).toBe("IN_WINDOW");
    expect(examUrgencyOf(-6, 12)).toBe("IN_WINDOW");
    expect(examUrgencyOf(-6, 0)).toBe("IN_WINDOW");
  });

  test("a window that has ENDED weighs NOTHING (null — never rendered)", () => {
    expect(examUrgencyOf(-30, -1)).toBeNull();
    expect(examUrgencyOf(-30, -19)).toBeNull();
  });
});

// ── the brief computation ───────────────────────────────────────────────────

describe("the exam context brief (metadata only, §13.2/§11)", () => {
  test("null target → null (nothing renders)", () => {
    expect(examContextBriefOf(null)).toBeNull();
    expect(examContextBriefOf(undefined)).toBeNull();
  });

  test("a live target derives the brief verbatim from the read's fields", () => {
    const b = examContextBriefOf(target());
    expect(b).not.toBeNull();
    expect(b!.courseSlug).toBe("igcse-chemistry-19");
    expect(b!.seriesCode).toBe("June-2026");
    expect(b!.seriesLabel).toBe("Edexcel International GCSE Science June 2026 (est.)");
    expect(b!.windowStart).toBe("2026-12-01");
    expect(b!.windowEnd).toBe("2026-12-12");
    expect(b!.daysToWindowStart).toBe(14);
    expect(b!.daysToWindowEnd).toBe(25);
    expect(b!.urgency).toBe("NEAR");
  });

  test("a PASSED window's target derives the honest null (never calendar pressure)", () => {
    const passed = target({
      windowStart: "2026-05-04",
      windowEnd: "2026-05-15",
      daysToWindowStart: -197,
      daysToWindowEnd: -186,
    });
    expect(examContextBriefOf(passed)).toBeNull();
  });
});

// ── the served-registry bridge ──────────────────────────────────────────────

describe("the slug↔code bridge (the served registry of record)", () => {
  test("buildCourseSlugMap: rows without BOTH fields contribute nothing", () => {
    const m = buildCourseSlugMap([
      { slug: "a-course", curriculumCode: "X-1" },
      { slug: "no-code" } as never,
      { curriculumCode: "Y-2" } as never,
      {} as never,
    ]);
    expect(m.get("X-1")).toBe("a-course");
    expect(m.has("Y-2")).toBeFalse();
    expect(m.size).toBe(1);
    // a code claimed by TWO different courses is AMBIGUOUS (the V53 posture)
    const amb = buildCourseSlugMap([
      { slug: "course-a", curriculumCode: "Z-3" },
      { slug: "course-b", curriculumCode: "Z-3" },
    ]);
    expect(amb.get("Z-3")).toBeNull();
    // the same course twice (a duplicate row) is NOT a collision
    const dup = buildCourseSlugMap([
      { slug: "course-a", curriculumCode: "D-4" },
      { slug: "course-a", curriculumCode: "D-4" },
    ]);
    expect(dup.get("D-4")).toBe("course-a");
  });

  test("the REAL served registry resolves the pilot row (the drift-loud content pin)", () => {
    // apps/hub/content/courses.json — the same bytes the hub's own picker
    // renders from; if the registry moves the mapping, THIS pin moves
    // deliberately with the registry's own change
    const m = courseSlugMap();
    // the pilot row is UNIQUELY owned — the exam match may bind it
    expect(m.get("4CH1-2017")).toBe("igcse-chemistry-19");
    // a second unique row (the CIE 0620 chemistry lane)
    expect(m.get("0620-2023-2025")).toBe("cie-igcse-chemistry-23");
    // THE AMBIGUITY LAW on the REAL registry: 9701-2025-2027 is claimed by
    // BOTH cie-a-level-chemistry-25 and cie-as-chemistry-25 — the map
    // refuses it (null) and the exam match renders nothing for such a code
    // (a sibling course's sitting is a guessed exam date — never lawful)
    expect(m.get("9701-2025-2027")).toBeNull();
  });

  test("matchExamTarget: the pure match law — hit, miss, and the honest empty", () => {
    const map = buildCourseSlugMap([{ slug: "igcse-chemistry-19", curriculumCode: "4CH1-2017" }]);
    const codeToSlug = (c: string) => map.get(c) ?? null;
    const t = target();
    expect(matchExamTarget([t], codeToSlug, "4CH1-2017")).toBe(t);
    // an unscoped ask carries no exam context
    expect(matchExamTarget([t], codeToSlug, null)).toBeNull();
    // an unmapped code (no registry row) carries none — degrade-never-block
    expect(matchExamTarget([t], codeToSlug, "9999-9999")).toBeNull();
    // no declared target carries none
    expect(matchExamTarget([], codeToSlug, "4CH1-2017")).toBeNull();
    // a target for ANOTHER course carries none (the scoped-course law)
    expect(
      matchExamTarget([target({ courseSlug: "some-other-course" })], codeToSlug, "4CH1-2017"),
    ).toBeNull();
  });
});

// ── the spacing arm (§7.9 pendingReview spacing weights the calendar) ───────

describe("the drill directive's spacing arm (DC10 §7.9)", () => {
  const topics = [{ nodeId: TOPIC_A, code: "4CH1-U1-T3", title: "Projectile motion", matchScore: 0.9 }];
  const due = [TOPIC_A];

  test("NEAR tightens: the planned count doubles", () => {
    const b = selectDrillDirectiveBasis(null, topics, due, "4CH1-2017", "NEAR");
    expect(b).not.toBeNull();
    expect(b!.plannedCount).toBe(5 * EXAM_DRILL_SPACING_MULTIPLIER);
    expect(b!.plannedCount).toBe(10);
  });

  test("IN_WINDOW tightens: the planned count doubles", () => {
    const b = selectDrillDirectiveBasis(null, topics, due, "4CH1-2017", "IN_WINDOW");
    expect(b!.plannedCount).toBe(5 * EXAM_DRILL_SPACING_MULTIPLIER);
  });

  test("FAR and null keep the BASE law byte-identical (the run-001 pins stand)", () => {
    expect(selectDrillDirectiveBasis(null, topics, due, "4CH1-2017", "FAR")!.plannedCount).toBe(5);
    expect(selectDrillDirectiveBasis(null, topics, due, "4CH1-2017", null)!.plannedCount).toBe(5);
    // the optional param's absence — the pre-run call shape — stays ×1
    expect(selectDrillDirectiveBasis(null, topics, due, "4CH1-2017")!.plannedCount).toBe(5);
  });
});

// ── the assembly (pure) ─────────────────────────────────────────────────────

describe("assembleTutorContext — the exam brief rides the ONE assembly", () => {
  const base = {
    knowledge: {
      topics: [{ nodeId: TOPIC_A, code: "4CH1-U1-T3", title: "Projectile motion", matchScore: 0.9 }],
      prerequisites: [],
      misconceptions: [],
    },
    evidence: [],
    learnerId: LEARNER as string | null,
    states: [],
    readings: [],
    engagements: [],
    pendingReviews: [],
    now: NOW,
  };

  test("a matched target derives the brief; the exam field carries it", () => {
    const ctx = assembleTutorContext({ ...base, examTarget: target() });
    expect(ctx.exam).not.toBeNull();
    expect(ctx.exam!.urgency).toBe("NEAR");
    expect(ctx.exam!.seriesCode).toBe("June-2026");
  });

  test("no target / anonymous / unscoped → the honest null", () => {
    expect(assembleTutorContext({ ...base }).exam).toBeNull();
    expect(assembleTutorContext({ ...base, examTarget: null }).exam).toBeNull();
  });
});

// ── the prompt (emphasis arm) ───────────────────────────────────────────────

describe("the v20 prompt — the EXAM CONTEXT block + the byte-stability law", () => {
  const brief: ExamContextBrief = {
    courseSlug: "igcse-chemistry-19",
    seriesCode: "June-2026",
    seriesLabel: "Edexcel International GCSE Science June 2026 (est.)",
    windowStart: "2026-12-01",
    windowEnd: "2026-12-12",
    daysToWindowStart: 14,
    daysToWindowEnd: 25,
    urgency: "NEAR",
  };

  const ctx = (exam: ExamContextBrief | null | undefined): Parameters<typeof userPrompt>[2] => ({
    learnerBrief: "Learner state: no prior evidence on the topics in this question.",
    memoryBrief: null,
    knowledgeBrief: "Curriculum context: no topics matched this question.",
    evidence: [],
    interventionPlan: { type: "EXPLANATION", rationale: "r", actions: [] },
    // a live aim so the ordering law pins for real: AIM plane first, the
    // EXAM CONTEXT block after it, SOURCES last
    aim: { correction: null, provenPrerequisites: [{ nodeId: "n1", title: "Vector components" }], strongAreas: [], decayDue: false },
    ...(exam === undefined ? {} : { exam }),
  });

  test("the version bump of record: tutor-grounded/v20", () => {
    expect(PROMPT_VERSION).toBe("20");
    expect(promptIdentity()).toBe("tutor-grounded/v20");
  });

  test("the EXAM CALENDAR law is in the system prompt (both variants)", () => {
    for (const variant of ["chemistry", "general"] as const) {
      const p = systemPrompt(variant);
      expect(p).toContain("- Exam calendar. When the user message carries an EXAM CONTEXT");
      expect(p).toContain("The calendar shapes\n  emphasis and ordering only");
    }
  });

  test("a live declared target renders the block verbatim (unfenced, metadata only)", () => {
    const prompt = userPrompt("why?", [], ctx(brief), "NONCE1234");
    const expected =
      "EXAM CONTEXT (the learner's declared exam target for this course):\n" +
      "- SITTING: June-2026 — Edexcel International GCSE Science June 2026 (est.); window 2026-12-01 to 2026-12-12\n" +
      "- CALENDAR: the window opens in 14 day(s) and closes in 25\n" +
      "- URGENCY: NEAR\n\n";
    expect(prompt).toContain(expected);
    // the block rides AFTER the AIM plane and BEFORE the SOURCES
    const aimIdx = prompt.indexOf("AIM (computed from this learner's own record");
    const examIdx = prompt.indexOf("EXAM CONTEXT (the learner's declared exam target");
    const srcIdx = prompt.indexOf("SOURCES (cite these as [n]):");
    expect(aimIdx).toBeGreaterThanOrEqual(0);
    expect(examIdx).toBeGreaterThan(aimIdx);
    expect(srcIdx).toBeGreaterThan(examIdx);
  });

  test("IN_WINDOW renders the open-window calendar line (never a negative countdown)", () => {
    const prompt = userPrompt("why?", [], ctx({ ...brief, urgency: "IN_WINDOW", daysToWindowStart: -6 }), "NONCE1234");
    expect(prompt).toContain("- CALENDAR: the sitting window is open now — it closes in 25 day(s)\n");
    expect(prompt).toContain("- URGENCY: IN_WINDOW\n");
  });

  test("BYTE-STABILITY: an ask without a declared target keeps the pre-run bytes", () => {
    // the composed prompt with the exam field ABSENT (the pre-run call
    // shape) and with it NULL (the honest empty) are byte-identical
    const absent = userPrompt("why?", [], ctx(undefined), "NONCE1234");
    const nullCtx = userPrompt("why?", [], ctx(null), "NONCE1234");
    expect(absent).toBe(nullCtx);
    // and NEITHER carries any exam block
    expect(absent).not.toContain("EXAM CONTEXT");
  });

});

// ── the pipeline (the REAL karag module — the aim-pipeline pattern) ─────────

describe("T-TUTOR-AIM-P3 run-003 — the exam-calendar plane in composition", () => {
  test("a scoped account ask with a declared target carries the exam context AND the block renders", async () => {
    const { mod, captured } = makeHarness({ examTargets: [target()], pending: [{ nodeId: TOPIC_A }] });
    await mod.ask(LEARNER, QUESTION, [], null, "4CH1-2017", null, null);
    const ctx = captured.contexts[0]!;
    expect(ctx.exam).not.toBeNull();
    expect(ctx.exam!.urgency).toBe("NEAR");
    // the exam read rode the M3 extension (ONE read per ask)
    expect(captured.examReads).toBe(1);
    // the drill directive's SPACING arm: the decay-due topic's planned
    // count doubles while the sitting is NEAR
    const tel = captured.events[0] as Record<string, unknown>;
    expect(tel.promptIdentity).toBe("tutor-grounded/v20");
  });

  test("the spacing arm rides the pipeline: NEAR doubles the planned count", async () => {
    const { mod, captured } = makeHarness({ examTargets: [target()], pending: [{ nodeId: TOPIC_A }] });
    const result = await mod.ask(LEARNER, QUESTION, [], "00000000-0000-4000-8000-000000000001", "4CH1-2017", null, null);
    expect(result.drillBasis).not.toBeNull();
    expect(result.drillBasis!.plannedCount).toBe(10);
    void captured;
  });

  test("no declared target → the honest empty (byte-stability at the pipeline level)", async () => {
    const { mod: bare, captured: bareCap } = makeHarness({ examTargets: [], pending: [{ nodeId: TOPIC_A }] });
    await bare.ask(LEARNER, QUESTION, [], null, "4CH1-2017", null, null);
    expect(bareCap.contexts[0]!.exam).toBeNull();
    // the pre-§7.9 port (no examTargets method at all) degrades identically
    const { mod: oldPort, captured: oldCap } = makeHarness({ withPortExamTargets: false, pending: [{ nodeId: TOPIC_A }] });
    await oldPort.ask(LEARNER, QUESTION, [], null, "4CH1-2017", null, null);
    expect(oldCap.contexts[0]!.exam).toBeNull();
    // and the base spacing law stands (×1)
    const r2 = await bare.ask(LEARNER, QUESTION, [], "00000000-0000-4000-8000-000000000001", "4CH1-2017", null, null);
    expect(r2.drillBasis!.plannedCount).toBe(5);
  });

  test("ANONYMOUS ask: the exam-target read NEVER fires (the account-only law)", async () => {
    const { mod, captured } = makeHarness({ examTargets: [target()] });
    await mod.ask(null, QUESTION, [], null, "4CH1-2017", null, null);
    expect(captured.examReads).toBe(0);
    expect(captured.contexts[0]!.exam).toBeNull();
  });

  test("a resolveActive-SCOPED ask (no explicit courseRef) binds the target of the RESOLVED course", async () => {
    // the exam context keys on the RESOLVED scope's curriculum code —
    // wherever the scope came from (V53's two paths are both lawful scopes)
    const { mod, captured } = makeHarness({ examTargets: [target()] });
    await mod.ask(LEARNER, QUESTION, [], null, null, null, null);
    expect(captured.contexts[0]!.exam).not.toBeNull();
    expect(captured.contexts[0]!.exam!.urgency).toBe("NEAR");
  });

  test("a NO-scope ask (resolveActive → null) refuses fail-closed — no context, no exam plane", async () => {
    // the V53 law: zero-scope asks refuse deterministically (the generator
    // is never reached, no context is ever built) — the exam plane is inert
    const { mod, captured } = makeHarness({ examTargets: [target()], noActiveScope: true });
    await mod.ask(LEARNER, QUESTION, [], null, null, null, null);
    expect(captured.contexts).toHaveLength(0);
    const tel = captured.events[0] as Record<string, unknown>;
    expect(tel.refused).toBe(true);
    expect(tel.confidence).toBeNull();
  });

  test("an unresolvable registry bridge degrades honestly (no exam context, the ask is never blocked)", async () => {
    const { mod, captured } = makeHarness({
      examTargets: [target()],
      courseSlugOf: () => null,
    });
    await mod.ask(LEARNER, QUESTION, [], null, "4CH1-2017", null, null);
    expect(captured.contexts[0]!.exam).toBeNull();
    // the ask itself still answered (degrade-never-block)
    const tel = captured.events[0] as Record<string, unknown>;
    expect(tel.refused).toBe(false);
  });
});

// ── the learner-model port (the M3 extension's seam composition) ────────────

describe("buildSqlLearnerModel.examTargets — the canonical seam composition", () => {
  test("composes examTargetsFor: the enrolments read then the batched series read", async () => {
    const { buildSqlLearnerModel } = await import("../../src/services/tutor/learner-model");
    const reads: string[] = [];
    const ENROL = {
      id: "e1000000-0000-4000-8000-000000000001",
      learner_id: LEARNER,
      course_slug: "igcse-chemistry-19",
      target_series_id: "f1000000-0000-4000-8000-000000000001",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };
    const SERIES = {
      id: "f1000000-0000-4000-8000-000000000001",
      board: "PEARSON_EDEXCEL",
      qualification: "IGCSE_SCIENCE",
      series_code: "June-2026",
      label: "Edexcel International GCSE Science June 2026 (est.)",
      window_start: "2026-12-01",
      window_end: "2026-12-12",
      entry_deadline: null,
      results_date: null,
      estimated: true,
      source_url: "https://example.invalid",
      retrieved_at: "2026-10-01T00:00:00Z",
    };
    const sql = (async (strings: TemplateStringsArray) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      if (text.startsWith("select id, learner_id, course_slug, target_series_id")) {
        reads.push("enrolments");
        return [ENROL];
      }
      if (text.startsWith("select id, board, qualification, series_code")) {
        reads.push("series");
        return [SERIES];
      }
      reads.push("other:" + text.slice(0, 40));
      return [];
    }) as unknown as SqlFn;
    const port = buildSqlLearnerModel(sql, clock);
    const targets = await port.examTargets!(LEARNER);
    expect(reads).toEqual(["enrolments", "series"]);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.courseSlug).toBe("igcse-chemistry-19");
    // the countdown derives on the read against THIS port's clock (ADR-031)
    expect(targets[0]!.daysToWindowStart).toBe(14);
    expect(targets[0]!.daysToWindowEnd).toBe(25);
  });

  test("no declared enrolments: the ONE honest read short-circuits (never a second read)", async () => {
    const { buildSqlLearnerModel } = await import("../../src/services/tutor/learner-model");
    const reads: string[] = [];
    const sql = (async (strings: TemplateStringsArray) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      if (text.startsWith("select id, learner_id, course_slug, target_series_id")) {
        reads.push("enrolments");
        return [];
      }
      reads.push("other");
      return [];
    }) as unknown as SqlFn;
    const port = buildSqlLearnerModel(sql, clock);
    expect(await port.examTargets!(LEARNER)).toEqual([]);
    expect(reads).toEqual(["enrolments"]);
  });
});

// the loader's dir law is exercised above through the REAL registry pin; a
// direct existence probe keeps the served-plane seam honest in this battery
test("the served registry file is reachable through the content-plane seam", () => {
  expect(existsSync(join(import.meta.dir, "../../../hub/content/courses.json"))).toBeTrue();
});

import { existsSync } from "node:fs";
