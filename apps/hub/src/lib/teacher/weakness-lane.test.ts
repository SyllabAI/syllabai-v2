/**
 * CD-A-hub (trace 1a18c3130e0a29f5) — the weak-area lane's pure-layer pins:
 * the explicit slug→rootId bridge (fail-closed, never guessed), the live
 * mapping (server order preserved, honest nulls, blocked-by pass-through,
 * coverage gaps separated) and the SAMPLE fallback moved verbatim from the
 * client (thresholds + ordering pinned so the move cannot drift).
 *
 * The wire fixtures are typed as the hub mirror (lib/types WeaknessOptionsView,
 * masteryBand corrected to `string | null`); the GOLDEN layer additionally
 * parses fixtures through the real @syllabai/contracts schema.
 * Run: bun test apps/hub/src/lib/teacher/weakness-lane.test.ts
 */
import { describe, expect, test } from "bun:test";
import {
  WEAKNESS_REASON_LABELS,
  liveWeakLane,
  resolveRootIdForCourse,
  sampleWeakTargets,
} from "./weakness-lane";
import type { ClassOverview } from "./class-sim";
import type { SubjectView, WeaknessOptionsView } from "@/lib/types";

const ROOT_A = "00000000-0000-4000-8000-00000000000a";
const ROOT_B = "00000000-0000-4000-8000-00000000000b";
const TOPIC_1 = "00000000-0000-4000-8000-000000000001";
const TOPIC_2 = "00000000-0000-4000-8000-000000000002";
const TOPIC_3 = "00000000-0000-4000-8000-000000000003";

function subject(
  id: string,
  curriculumCode: string,
  knowledgeNodeId: string | null,
): SubjectView {
  return {
    id,
    code: id,
    name: `Subject ${id}`,
    knowledgeNodeId,
    curriculumVersion: {
      id: `cv-${id}`,
      board: "Cambridge International",
      qualification: "IGCSE",
      code: curriculumCode,
      title: `Version ${curriculumCode}`,
      status: "ACTIVE",
    },
  };
}

function weakTopic(overrides: Partial<WeaknessOptionsView["weakTopics"][number]>) {
  return {
    topicNodeId: TOPIC_1,
    code: "T1",
    title: "Topic one",
    reasons: ["LOW_MEAN_MASTERY"] as WeaknessOptionsView["weakTopics"][number]["reasons"],
    learnersMeasured: 12,
    meanMastery: 0.4,
    masteryBand: "DEVELOPING",
    learnersWithActiveMisconception: 3,
    activeMisconceptionSignals: 5,
    evidenceBackedAttempts: 40,
    tutorEngagements: 2,
    dueReviews: 1,
    servableQuestions: 9,
    blockedByPrerequisiteCodes: [],
    ...overrides,
  };
}

function view(overrides: Partial<WeaknessOptionsView> = {}): WeaknessOptionsView {
  return {
    rootId: ROOT_A,
    policy: "test-builder-weakness/v1",
    enrolledLearners: 14,
    learnersWithEvidence: 12,
    weakTopics: [],
    coverageGaps: [],
    selectionHint: "(integration hint — never rendered)",
    ...overrides,
  };
}

// ── resolveRootIdForCourse — the explicit bridge, fail-closed ───────────────

describe("resolveRootIdForCourse", () => {
  const subjects = [
    subject("s-chem", "0620-2023-2025", ROOT_A),
    subject("s-maths", "0580-2025-2027", ROOT_B),
  ];

  test("happy path: the registry curriculumCode matches one subject version → its knowledgeNodeId", () => {
    expect(resolveRootIdForCourse("0620-2023-2025", subjects)).toBe(ROOT_A);
  });

  test("fail-closed: no registry curriculumCode (unregistered course) → null", () => {
    expect(resolveRootIdForCourse(undefined, subjects)).toBeNull();
    expect(resolveRootIdForCourse("", subjects)).toBeNull();
  });

  test("fail-closed: no subject version matches the code → null", () => {
    expect(resolveRootIdForCourse("4CH1-2017", subjects)).toBeNull();
  });

  test("fail-closed: match exists but knowledgeNodeId unmeasured (capture-unproven null) → null", () => {
    expect(resolveRootIdForCourse("0620-2023-2025", [subject("s-chem", "0620-2023-2025", null)])).toBeNull();
  });

  test("fail-closed: two matches with DIFFERENT node ids (ambiguity) → null, never first-match-wins", () => {
    expect(
      resolveRootIdForCourse("0620-2023-2025", [
        subject("s-a", "0620-2023-2025", ROOT_A),
        subject("s-b", "0620-2023-2025", ROOT_B),
      ]),
    ).toBeNull();
  });

  test("dedupe: two matches agreeing on the SAME node id (per-pathway subject rows) → that id", () => {
    expect(
      resolveRootIdForCourse("0620-2023-2025", [
        subject("s-a", "0620-2023-2025", ROOT_A),
        subject("s-b", "0620-2023-2025", ROOT_A),
      ]),
    ).toBe(ROOT_A);
  });
});

// ── liveWeakLane — the wire → lane mapping ──────────────────────────────────

describe("liveWeakLane", () => {
  test("server ORDER preserved verbatim (no client re-sort — the frozen comparator is law)", () => {
    const lane = liveWeakLane(
      view({
        // deliberately NOT sorted by anything client-derivable:
        // the frozen order is meanMastery asc nulls-last → active desc → code
        weakTopics: [
          weakTopic({ topicNodeId: TOPIC_3, code: "T9", meanMastery: null }),
          weakTopic({ topicNodeId: TOPIC_1, code: "T2", meanMastery: 0.2 }),
          weakTopic({ topicNodeId: TOPIC_2, code: "T1", meanMastery: 0.7 }),
        ],
      }),
    );
    expect(lane.targets.map((t) => t.code)).toEqual(["T9", "T2", "T1"]);
  });

  test("honest nulls pass through: meanMastery null stays null, masteryBand null stays null", () => {
    const lane = liveWeakLane(view({ weakTopics: [weakTopic({ meanMastery: null, masteryBand: null })] }));
    const row = lane.targets[0];
    expect(row.meanMastery).toBeNull();
    expect(row.masteryBand).toBeNull();
    expect(row.key).toBe(TOPIC_1);
    expect(row.misconceptionUnit).toBe("learners");
  });

  test("evidence vocabulary: learnersWithActiveMisconception → misconceptionCount; blocked-by codes pass through; selection token is topicNodeId", () => {
    const lane = liveWeakLane(
      view({
        weakTopics: [
          weakTopic({
            reasons: ["BLOCKED_BY_WEAK_PREREQUISITE"],
            learnersWithActiveMisconception: 7,
            blockedByPrerequisiteCodes: ["1.1.1", "1.1.2"],
          }),
        ],
      }),
    );
    const row = lane.targets[0];
    expect(row.reasons).toEqual(["BLOCKED_BY_WEAK_PREREQUISITE"]);
    expect(row.misconceptionCount).toBe(7);
    expect(row.blockedBy).toEqual(["1.1.1", "1.1.2"]);
    expect(row.key).toBe(TOPIC_1);
  });

  test("coverage gaps are separated (never in targets), context carried, rootId echoed", () => {
    const lane = liveWeakLane(
      view({
        weakTopics: [weakTopic({})],
        coverageGaps: [
          {
            topicNodeId: TOPIC_2,
            code: "G1",
            title: "Unmeasured topic",
            servableQuestions: 4,
            evidenceBackedAttempts: 0,
            tutorEngagements: 0,
          },
        ],
      }),
    );
    expect(lane.targets).toHaveLength(1);
    expect(lane.gaps).toEqual([{ key: TOPIC_2, code: "G1", title: "Unmeasured topic", questionCount: 4 }]);
    expect(lane.enrolledLearners).toBe(14);
    expect(lane.learnersWithEvidence).toBe(12);
    expect(lane.rootId).toBe(ROOT_A);
    expect(lane.source).toBe("live");
  });

  test("the three frozen reason literals all carry teacher-facing labels", () => {
    expect(Object.keys(WEAKNESS_REASON_LABELS).sort()).toEqual([
      "ACTIVE_MISCONCEPTION_PRESENT",
      "BLOCKED_BY_WEAK_PREREQUISITE",
      "LOW_MEAN_MASTERY",
    ]);
  });
});

// ── sampleWeakTargets — the demo derivation, VERBATIM ──────────────────────

function sampleSub(overrides: Partial<ClassOverview["sections"][number]["subtopics"][number]>) {
  return {
    code: "SUB",
    label: "Sub",
    title: "A subtopic",
    sectionCode: "S1",
    sectionTitle: "Section one",
    setSlugs: [],
    meanMastery: 0.5,
    proficientPct: 0,
    developingPct: 0,
    strugglingPct: 0,
    band: "developing" as const,
    misconceptions: [],
    hasSimEvidence: false,
    anchorMean: null,
    questionCount: 3,
    totalMarks: 12,
    ...overrides,
  };
}

describe("sampleWeakTargets (the labeled demo fallback)", () => {
  const cls = {
    sections: [
      {
        code: "S1",
        title: "Section one",
        subtopics: [
          // weak band + 1 misconception over threshold → both reasons
          sampleSub({
            code: "A",
            title: "Weak + misconceptions",
            band: "weak",
            meanMastery: 0.35,
            misconceptions: [{ code: "M1", title: "m", probability: 0.4, evidenceCount: 3 }],
          }),
          // critical band, no misconceptions → LOW_MEAN_MASTERY only
          sampleSub({ code: "B", title: "Critical", band: "critical", meanMastery: 0.2 }),
          // developing band but a >= 0.3 probability misconception → ACTIVE only
          sampleSub({
            code: "C",
            title: "Misconception only",
            band: "developing",
            meanMastery: 0.6,
            misconceptions: [{ code: "M2", title: "m", probability: 0.3, evidenceCount: 1 }],
          }),
          // healthy → absent
          sampleSub({ code: "D", title: "Fine", band: "good", meanMastery: 0.8 }),
          // sub-threshold misconception (demo threshold is >= 0.3, 0.29 stays out)
          sampleSub({
            code: "E",
            title: "Below threshold",
            band: "developing",
            meanMastery: 0.55,
            misconceptions: [{ code: "M3", title: "m", probability: 0.29, evidenceCount: 1 }],
          }),
        ],
      },
    ],
  } as unknown as ClassOverview;

  test("thresholds verbatim: weak/critical band → LOW_MEAN_MASTERY; misconception probability >= 0.3 → ACTIVE_MISCONCEPTION_PRESENT; healthy + sub-threshold absent", () => {
    const targets = sampleWeakTargets(cls);
    expect(targets.map((t) => t.code)).toEqual(["B", "A", "C"]);
    const byCode = new Map(targets.map((t) => [t.code, t]));
    expect(byCode.get("A")!.reasons).toEqual(["LOW_MEAN_MASTERY", "ACTIVE_MISCONCEPTION_PRESENT"]);
    expect(byCode.get("B")!.reasons).toEqual(["LOW_MEAN_MASTERY"]);
    expect(byCode.get("C")!.reasons).toEqual(["ACTIVE_MISCONCEPTION_PRESENT"]);
  });

  test("ordering verbatim: meanMastery ascending; selection token = bundle subtopic code; sample semantics tagged (masteryBand null, unit tracked, blockedBy empty)", () => {
    const targets = sampleWeakTargets(cls);
    expect(targets.map((t) => t.meanMastery)).toEqual([0.2, 0.35, 0.6]);
    const a = targets.find((t) => t.code === "A")!;
    expect(a.key).toBe("A");
    expect(a.masteryBand).toBeNull();
    expect(a.misconceptionUnit).toBe("tracked");
    expect(a.misconceptionCount).toBe(1);
    expect(a.blockedBy).toEqual([]);
    expect(a.questionCount).toBe(3);
  });
});
