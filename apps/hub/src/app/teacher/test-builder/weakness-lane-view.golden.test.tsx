/**
 * CD-A-hub (trace 1a18c3130e0a29f5) — GOLDEN CAPTURES of the weak-area lane
 * rows (the foresights-panel pattern): rendered server-side
 * (react-dom/server, no browser, no DB — the zero-DB-contact discipline
 * holds) against a fixture parsed through the CANONICAL
 * weaknessOptionsViewSchema, so the goldens capture the real wire, never a
 * loose shape. The sample-lane capture renders the lib's verbatim demo
 * mapping (no wire schema exists for the demo lane — it is labeled demo
 * data precisely because it never went through a schema).
 *
 * Pinned render laws (see weakness-lane-view.tsx header): source disclosure
 * always rendered; honest unmeasured mastery; evidence vocabulary (learners
 * vs tracked misconceptions); blocked-by evidence; coverage gaps never
 * selectable; server order preserved; cap slicing; determinism.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { weaknessOptionsViewSchema } from "@syllabai/contracts";
import { liveWeakLane, sampleWeakTargets } from "@/lib/teacher/weakness-lane";
import { WeaknessLaneRows } from "./weakness-lane-view";

const ROOT = "ea000000-0000-4000-8000-000000000001";
const T1 = "ea000000-0000-4000-8000-000000000002";
const T2 = "ea000000-0000-4000-8000-000000000003";
const T3 = "ea000000-0000-4000-8000-000000000004";
const GAP = "ea000000-0000-4000-8000-000000000005";

const liveFixture = weaknessOptionsViewSchema.parse({
  rootId: ROOT,
  policy: "test-builder-weakness/v1",
  enrolledLearners: 14,
  learnersWithEvidence: 12,
  weakTopics: [
    {
      topicNodeId: T1,
      code: "4CH1-S1-a",
      title: "Atomic structure",
      reasons: ["LOW_MEAN_MASTERY", "BLOCKED_BY_WEAK_PREREQUISITE"],
      learnersMeasured: 12,
      meanMastery: null,
      masteryBand: null,
      learnersWithActiveMisconception: 3,
      activeMisconceptionSignals: 5,
      evidenceBackedAttempts: 40,
      tutorEngagements: 2,
      dueReviews: 1,
      servableQuestions: 9,
      blockedByPrerequisiteCodes: ["4CH1-S0-b", "4CH1-S0-c"],
    },
    {
      topicNodeId: T2,
      code: "4CH1-S1-b",
      title: "States of matter",
      reasons: ["ACTIVE_MISCONCEPTION_PRESENT"],
      learnersMeasured: 12,
      meanMastery: 0.4,
      masteryBand: "DEVELOPING",
      learnersWithActiveMisconception: 2,
      activeMisconceptionSignals: 2,
      evidenceBackedAttempts: 18,
      tutorEngagements: 0,
      dueReviews: 3,
      servableQuestions: 5,
      blockedByPrerequisiteCodes: [],
    },
  ],
  coverageGaps: [
    {
      topicNodeId: GAP,
      code: "4CH1-S9-z",
      title: "Unmeasured topic",
      servableQuestions: 4,
      evidenceBackedAttempts: 0,
      tutorEngagements: 0,
    },
  ],
  selectionHint: "Pass weakTopics[].topicNodeId values as topicNodeIds to GET /api/v1/teacher/tests/preview — assembly stays VALIDATED-only, marks-targeted and deterministic.",
});

function renderLive(showAll = false, cap = 6) {
  const lane = liveWeakLane(liveFixture);
  return renderToStaticMarkup(
    <WeaknessLaneRows
      source="live"
      targets={lane.targets}
      gaps={lane.gaps}
      enrolledLearners={lane.enrolledLearners}
      learnersWithEvidence={lane.learnersWithEvidence}
      selected={new Set()}
      onToggle={() => {}}
      cap={cap}
      showAll={showAll}
    />,
  );
}

describe("WeaknessLaneRows — live (schema-parsed wire fixture)", () => {
  const html = renderLive();

  test("source disclosure always rendered, exact copy, evidence counts from the wire", () => {
    expect(html).toContain('data-testid="weak-lane-source"');
    expect(html).toContain("Class evidence · 12 of 14 learners with evidence");
  });

  test("honest null: the unmeasured row renders NO percentage and the exact 'mastery unmeasured' line", () => {
    expect(html).toContain("mastery unmeasured");
    // the null-mastery row is FIRST (server order); the measured row's 40%
    // must exist exactly once — the unmeasured row never grows a number
    expect(html.match(/mean mastery 40%/g)).toHaveLength(1);
  });

  test("evidence vocabulary: live counts are LEARNERS, never the tracked-inventory wording", () => {
    expect(html).toContain("3 learners with active misconceptions");
    expect(html).toContain("2 learners with active misconceptions");
    expect(html).not.toContain("misconceptions tracked");
  });

  test("all three frozen reason literals render their teacher-facing labels", () => {
    expect(html).toContain("low class mastery");
    expect(html).toContain("active misconceptions");
    expect(html).toContain("blocked by weak prerequisite");
  });

  test("blocked-by evidence names the prerequisite codes", () => {
    expect(html).toContain('data-testid="weak-lane-blocked"');
    expect(html).toContain("blocked by prerequisites: 4CH1-S0-b, 4CH1-S0-c");
  });

  test("coverage gaps render without a checkbox (never selectable, never weak)", () => {
    expect(html).toContain('data-testid="weak-lane-gap"');
    expect(html).toContain("no class evidence yet · 4 validated questions available");
    // exactly one checkbox per TARGET row (2), none for the gap row
    expect(html.match(/<input /g) ?? []).toHaveLength(2);
  });

  test("server order preserved: the null-mastery topic renders first (frozen comparator order, no client re-sort)", () => {
    const first = html.indexOf("4CH1-S1-a");
    const second = html.indexOf("4CH1-S1-b");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  test("cap slicing: cap 1 → one row; showAll → both", () => {
    expect((renderLive(false, 1).match(/weak-lane-row-evidence/g) ?? []).length).toBe(1);
    expect((renderLive(true, 1).match(/weak-lane-row-evidence/g) ?? []).length).toBe(2);
  });

  test("determinism: two renders are byte-identical", () => {
    expect(renderLive()).toBe(renderLive());
  });

  test("zero-evidence honesty: an empty live view names the evidence gap, never 'no weak areas'", () => {
    const empty = weaknessOptionsViewSchema.parse({
      ...liveFixture,
      weakTopics: [],
      coverageGaps: [],
      enrolledLearners: 14,
      learnersWithEvidence: 0,
    });
    const lane = liveWeakLane(empty);
    const html = renderToStaticMarkup(
      <WeaknessLaneRows
        source="live"
        targets={lane.targets}
        gaps={lane.gaps}
        enrolledLearners={lane.enrolledLearners}
        learnersWithEvidence={lane.learnersWithEvidence}
        selected={new Set()}
        onToggle={() => {}}
        cap={6}
        showAll={false}
      />,
    );
    expect(html).toContain("No measured evidence yet — class practice builds it");
    expect(html).not.toContain("No topics currently below the weak line");
  });
});

describe("WeaknessLaneRows — sample (the labeled demo fallback)", () => {
  const cls = {
    sections: [
      {
        code: "S1",
        title: "Section one",
        subtopics: [
          {
            code: "1.1.1",
            label: "1.1.1",
            title: "Solids, liquids and gases",
            sectionCode: "S1",
            sectionTitle: "Section one",
            setSlugs: [],
            meanMastery: 0.35,
            proficientPct: 0,
            developingPct: 0,
            strugglingPct: 0,
            band: "weak" as const,
            misconceptions: [{ code: "M1", title: "m", probability: 0.4, evidenceCount: 3 }],
            hasSimEvidence: false,
            anchorMean: null,
            questionCount: 7,
            totalMarks: 28,
          },
        ],
      },
    ],
  };
  const targets = sampleWeakTargets(cls as never);

  test("the demo lane is LABELED as demo data (the disclosure the demo-era UI never rendered)", () => {
    const html = renderToStaticMarkup(
      <WeaknessLaneRows
        source="sample"
        targets={targets}
        gaps={[]}
        selected={new Set()}
        onToggle={() => {}}
        cap={6}
        showAll={false}
      />,
    );
    expect(html).toContain("Sample cohort (demo data — not this class&#x27;s evidence)");
    expect(html).not.toContain("Class evidence");
  });

  test("sample rows keep the demo vocabulary: mean mastery percentage + tracked misconceptions", () => {
    const html = renderToStaticMarkup(
      <WeaknessLaneRows
        source="sample"
        targets={targets}
        gaps={[]}
        selected={new Set()}
        onToggle={() => {}}
        cap={6}
        showAll={false}
      />,
    );
    expect(html).toContain("mean mastery 35%");
    expect(html).toContain("1 misconception tracked");
    expect(html).not.toContain("learners with active misconceptions");
  });
});
