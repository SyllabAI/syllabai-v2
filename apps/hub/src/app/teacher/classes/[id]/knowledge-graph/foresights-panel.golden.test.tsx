/**
 * T-FORESIGHT-V0-PLAN-1 Stage B — the GOLDEN CAPTURES of the three state
 * renders (plan §10 Stage B, third deliverable): the ForesightsPanel is
 * rendered server-side (react-dom/server, no browser, no DB — the zero-DB-
 * contact discipline holds) against schema-valid foresights/v1 fixtures,
 * one per classState, and the ADR-CLASS-0002 render laws are pinned:
 *
 *   C1 COMPREHENSION-FIRST ORDER: the headline sentence indexes BEFORE the
 *      disclosure, BEFORE the prerequisite chips, BEFORE the attention
 *      list — in every state, byte-pinned by testid ordering.
 *   C3 DISCLOSURE ALWAYS RENDERED: all three captures carry the disclosure
 *      verbatim; the string comes from the wire, not the component.
 *   C4 HONEST CANNOT-PREDICT: the NOT_ASSESSABLE capture carries the unlock
 *      CTA naming the unlock assignment; the unmeasured chip renders the
 *      UNMEASURED band vocabulary and NEVER a fabricated band/number.
 *   C7 COMPREHENSION FIXTURES (the gate CK-12 never ran, run pre-ship):
 *      for each state the capture pins the "what does this tell me to do?"
 *      answer — READY → assign T (no unlock CTA, ready group present);
 *      AT_RISK → prereq remediation first, codes named, weakest rows
 *      queued first; NOT_ASSESSABLE → the unlock path named.
 *   §8 ATTENTION-QUEUE LAW: the panel never re-sorts — the capture pins
 *      the wire order verbatim (AT_RISK rows in server order, then READY),
 *      and the targetMeasured variant replaces the attention list with the
 *      measured drill-down route chip.
 *   DETERMINISM: two renders of the same view are byte-identical.
 *
 * Every fixture is validated against the CANONICAL classForesightsViewSchema
 * before rendering — the goldens capture the real wire, never a loose shape.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { classForesightsViewSchema, type ClassForesightsView } from "@syllabai/contracts";
import { ForesightsPanel } from "./foresights-panel";

// ── shared fixture vocabulary (fixed-constant uuids, the fleet's style) ─────

const ROOT = "ea000000-0000-4000-8000-000000000001";
const TGT = "ea000000-0000-4000-8000-000000000008";
const SP1 = "ea000000-0000-4000-8000-000000000004";
const SP2 = "ea000000-0000-4000-8000-000000000005";
const CHAIN_DEEP = "ea000000-0000-4000-8000-000000000003";
const L1 = "eb000000-0000-4000-8000-000000000001";
const L2 = "eb000000-0000-4000-8000-000000000002";
const L3 = "eb000000-0000-4000-8000-000000000003";
const CLASS_ID = "ec000000-0000-4000-8000-000000000001";

const AS_OF = "2026-10-01T12:00:00.000Z";
const disclosureFor = (title: string) =>
  `Derived read-only from this class's own practice evidence on ${title}'s prerequisite topics at ${AS_OF}; banded by the same thresholds learners see. A readiness prior — not a measurement of ${title}.`;

const baseView = (over: Partial<ClassForesightsView>): ClassForesightsView =>
  classForesightsViewSchema.parse({
    policy: "foresights/v1",
    classId: CLASS_ID,
    rootId: ROOT,
    asOf: AS_OF,
    targetTopic: { nodeId: TGT, code: "4CH1-S1-b", title: "Topic b" },
    targetMeasured: false,
    classState: "ASSESSABLE_READY",
    classReason: null,
    headline: "This class looks ready for Topic b: every prerequisite it has practiced sits at DEVELOPING or above.",
    disclosure: disclosureFor("Topic b"),
    unlockPath: null,
    prerequisites: [],
    contextChain: [],
    distribution: { ready: 0, atRisk: 0, notAssessable: 0, prereqBandCounts: { LOW: 0, DEVELOPING: 0, SECURE: 0 }, atRiskByReason: { LOW_MASTERY_PREREQ: 0, ACTIVE_MISCONCEPTION_PREREQ: 0, LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ: 0 } },
    learners: [],
    ...over,
  });

// ── state fixture 1 — ASSESSABLE_READY (plan §5 row 4) ──────────────────────

const READY: ClassForesightsView = baseView({
  classState: "ASSESSABLE_READY",
  headline:
    "This class looks ready for Topic b: every prerequisite it has practiced sits at DEVELOPING or above.",
  prerequisites: [
    {
      nodeId: SP1,
      code: "4CH1-S1-a-1",
      title: "Spec point 1",
      depth: 1,
      derived: false,
      derivedViaConceptCodes: [],
      learnersMeasured: 2,
      meanEffectiveMastery: 0.7269,
      masteryBand: "DEVELOPING",
      weak: false,
      learnersWithActiveMisconception: 0,
      lastPracticedAt: "2026-09-30T12:00:00.000Z", // v1.1: the recency the panel renders
    },
  ],
  contextChain: [
    { nodeId: CHAIN_DEEP, code: "4CH1-S1-a", title: "Topic a", depth: 2, learnersMeasured: 2, meanEffectiveMastery: 0.81, masteryBand: "SECURE", lastPracticedAt: "2026-09-25T12:00:00.000Z" },
  ],
  distribution: { ready: 2, atRisk: 0, notAssessable: 1, prereqBandCounts: { LOW: 0, DEVELOPING: 1, SECURE: 0 }, atRiskByReason: { LOW_MASTERY_PREREQ: 0, ACTIVE_MISCONCEPTION_PREREQ: 0, LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ: 0 } },
  // the SERVER-frozen sort, verbatim: READY (Ada, Ben) → NOT_ASSESSABLE (Cy)
  learners: [
    { learnerId: L1, displayName: "Ada", state: "READY", reason: null, weakPrereqCodes: [], miscoPrereqCodes: [], unmeasuredPrereqCodes: [], meanEffectiveMastery: 0.85 },
    { learnerId: L2, displayName: "Ben", state: "READY", reason: null, weakPrereqCodes: [], miscoPrereqCodes: [], unmeasuredPrereqCodes: [], meanEffectiveMastery: 0.6 },
    { learnerId: L3, displayName: "Cy", state: "NOT_ASSESSABLE", reason: "UNMEASURED_PREREQ", weakPrereqCodes: [], miscoPrereqCodes: [], unmeasuredPrereqCodes: ["4CH1-S1-a-1"], meanEffectiveMastery: null },
  ],
});

// ── state fixture 2 — ASSESSABLE_AT_RISK (plan §5 row 3) ────────────────────

const AT_RISK: ClassForesightsView = baseView({
  classState: "ASSESSABLE_AT_RISK",
  classReason: "WEAK_PREREQUISITES",
  headline:
    "Expect Topic b to land hard: 1 of 1 prerequisites sit below the class's ready line (4CH1-S1-a-1).",
  prerequisites: [
    {
      nodeId: SP1,
      code: "4CH1-S1-a-1",
      title: "Spec point 1",
      depth: 1,
      derived: true,
      derivedViaConceptCodes: ["C-Alpha"],
      learnersMeasured: 3,
      meanEffectiveMastery: 0.3102,
      masteryBand: "LOW",
      weak: true,
      learnersWithActiveMisconception: 2,
      lastPracticedAt: "2026-09-29T12:00:00.000Z",
    },
  ],
  distribution: { ready: 1, atRisk: 2, notAssessable: 0, prereqBandCounts: { LOW: 1, DEVELOPING: 0, SECURE: 0 }, atRiskByReason: { LOW_MASTERY_PREREQ: 0, ACTIVE_MISCONCEPTION_PREREQ: 1, LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ: 1 } },
  // the SERVER-frozen sort: AT_RISK reason-lexical (Cy "ACTIVE…" < Ada "LOW…")
  // → READY (Ben) — the capture pins the panel does NOT re-sort
  learners: [
    { learnerId: L3, displayName: "Cy", state: "AT_RISK", reason: "ACTIVE_MISCONCEPTION_PREREQ", weakPrereqCodes: [], miscoPrereqCodes: ["4CH1-S1-a-1"], unmeasuredPrereqCodes: [], meanEffectiveMastery: 0.62 },
    { learnerId: L1, displayName: "Ada", state: "AT_RISK", reason: "LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ", weakPrereqCodes: ["4CH1-S1-a-1"], miscoPrereqCodes: ["4CH1-S1-a-1"], unmeasuredPrereqCodes: [], meanEffectiveMastery: 0.31 },
    { learnerId: L2, displayName: "Ben", state: "READY", reason: null, weakPrereqCodes: [], miscoPrereqCodes: [], unmeasuredPrereqCodes: [], meanEffectiveMastery: 0.88 },
  ],
});

// ── state fixture 3 — NOT_ASSESSABLE (plan §5 row 2, the C4 state) ──────────

const NOT_ASSESSABLE: ClassForesightsView = baseView({
  classState: "NOT_ASSESSABLE",
  classReason: "UNMEASURED_PREREQUISITES",
  headline:
    "This cannot be honestly predicted yet: 4CH1-S1-a-2 has no class evidence. Assign 4CH1-S1-a-2 practice to unlock a prediction.",
  unlockPath: { nodeId: SP2, code: "4CH1-S1-a-2", title: "Spec point 2" },
  prerequisites: [
    {
      nodeId: SP2,
      code: "4CH1-S1-a-2",
      title: "Spec point 2",
      depth: 1,
      derived: false,
      derivedViaConceptCodes: [],
      learnersMeasured: 0,
      meanEffectiveMastery: null,
      masteryBand: "UNMEASURED",
      weak: false,
      learnersWithActiveMisconception: 0,
      lastPracticedAt: null, // v1.1: the honest null — no recency rendered for unmeasured
    },
  ],
  distribution: { ready: 0, atRisk: 0, notAssessable: 3, prereqBandCounts: { LOW: 0, DEVELOPING: 0, SECURE: 0 }, atRiskByReason: { LOW_MASTERY_PREREQ: 0, ACTIVE_MISCONCEPTION_PREREQ: 0, LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ: 0 } },
  learners: [
    { learnerId: L1, displayName: "Ada", state: "NOT_ASSESSABLE", reason: "UNMEASURED_PREREQ", weakPrereqCodes: [], miscoPrereqCodes: [], unmeasuredPrereqCodes: ["4CH1-S1-a-2"], meanEffectiveMastery: null },
    { learnerId: L2, displayName: "Ben", state: "NOT_ASSESSABLE", reason: "UNMEASURED_PREREQ", weakPrereqCodes: [], miscoPrereqCodes: [], unmeasuredPrereqCodes: ["4CH1-S1-a-2"], meanEffectiveMastery: null },
    { learnerId: L3, displayName: "Cy", state: "NOT_ASSESSABLE", reason: "UNMEASURED_PREREQ", weakPrereqCodes: [], miscoPrereqCodes: [], unmeasuredPrereqCodes: ["4CH1-S1-a-2"], meanEffectiveMastery: null },
  ],
});

// ── the §8 targetMeasured variant — the measured-routing law ────────────────

const TARGET_MEASURED: ClassForesightsView = baseView({
  targetMeasured: true,
  classState: "ASSESSABLE_READY",
  distribution: { ready: 2, atRisk: 0, notAssessable: 0, prereqBandCounts: { LOW: 0, DEVELOPING: 1, SECURE: 0 }, atRiskByReason: { LOW_MASTERY_PREREQ: 0, ACTIVE_MISCONCEPTION_PREREQ: 0, LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ: 0 } },
  learners: [
    { learnerId: L1, displayName: "Ada", state: "READY", reason: null, weakPrereqCodes: [], miscoPrereqCodes: [], unmeasuredPrereqCodes: [], meanEffectiveMastery: 0.85 },
    { learnerId: L2, displayName: "Ben", state: "READY", reason: null, weakPrereqCodes: [], miscoPrereqCodes: [], unmeasuredPrereqCodes: [], meanEffectiveMastery: 0.6 },
  ],
});

const render = (view: ClassForesightsView): string =>
  // renderToStaticMarkup escapes apostrophes (&#x27;) and friends inside the
  // byte stream — the goldens pin the RENDERED TEXT the teacher reads, so the
  // capture decodes the five HTML text entities back before matching. The
  // attribute probes used below (data-testid / data-state / href) contain no
  // escapable characters, so decoding is match-safe for every pin.
  renderToStaticMarkup(<ForesightsPanel view={view} />)
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const idx = (html: string, probe: string) => {
  const at = html.indexOf(probe);
  expect(at, `expected to find ${probe}`).toBeGreaterThan(-1);
  return at;
};

// ── the goldens ──────────────────────────────────────────────────────────────

describe("foresights panel golden — the C1/C3 order law (every state)", () => {
  for (const [name, view] of [
    ["ASSESSABLE_READY", READY],
    ["ASSESSABLE_AT_RISK", AT_RISK],
    ["NOT_ASSESSABLE", NOT_ASSESSABLE],
  ] as const) {
    test(`${name}: headline → disclosure → chips → attention list, in that order`, () => {
      const html = render(view);
      const headline = idx(html, 'data-testid="foresights-headline"');
      const disclosure = idx(html, 'data-testid="foresights-disclosure"');
      const chips = idx(html, 'data-testid="foresights-prerequisites"');
      const learners = idx(html, 'data-testid="foresights-learners"');
      expect(headline).toBeLessThan(disclosure);
      expect(disclosure).toBeLessThan(chips);
      expect(chips).toBeLessThan(learners);
    });

    test(`${name}: the C3 disclosure renders verbatim (provenance always on)`, () => {
      const html = render(view);
      expect(html).toContain(view.disclosure);
    });

    test(`${name}: determinism — two renders, byte-identical`, () => {
      expect(render(view)).toBe(render(view));
    });
  }
});

describe("foresights panel golden — C7 comprehension fixtures (the gate CK-12 never ran)", () => {
  test("READY: the state style, the ready group, and NO unlock CTA (the answer is: assign T)", () => {
    const html = render(READY);
    expect(html).toContain('data-state="ASSESSABLE_READY"');
    expect(html).toContain("bg-emerald-50");
    expect(html).toContain("Looks ready");
    expect(html).toContain("Readiness prior: ready");
    // the C1 headline byte-exact, as the FIRST content the panel renders
    expect(html).toContain(
      "This class looks ready for Topic b: every prerequisite it has practiced sits at DEVELOPING or above.",
    );
    // nothing to unlock — the prediction is already honest
    expect(html).not.toContain("Unlock the prediction");
    // the two-level honesty survives rendering: Cy's NOT_ASSESSABLE group is present
    expect(html).toContain("Cannot be assessed yet");
    expect(html).toContain("has no evidence yet on");
    expect(html).toContain("4CH1-S1-a-1");
  });

  test("AT_RISK: weak codes named, misco flagged, the weakest rows queued FIRST (no re-sort)", () => {
    const html = render(AT_RISK);
    expect(html).toContain('data-state="ASSESSABLE_AT_RISK"');
    expect(html).toContain("bg-amber-50");
    // C1: the headline names k-of-n AND the codes — the explanation IS the codes
    expect(html).toContain(
      "Expect Topic b to land hard: 1 of 1 prerequisites sit below the class's ready line (4CH1-S1-a-1).",
    );
    // the C7 answer: remediation first, on the named prerequisite
    expect(html).toContain("Needs attention first");
    expect(html).toContain("sits below the ready line AND carries an active misconception on");
    // the wire order is rendered VERBATIM: Cy (ACTIVE_MISCONCEPTION_PREREQ —
    // reason-lexically first) before Ada (LOW_MASTERY_AND_…), Ben last
    const cy = idx(html, "Cy");
    const ada = idx(html, "Ada");
    const ben = idx(html, "Ben");
    expect(cy).toBeLessThan(ada);
    expect(ada).toBeLessThan(ben);
    // the derived chip carries its concept code (the §8 derived-flagging law)
    expect(html).toContain("via C-Alpha");
    // the §13.3 distribution folded into the section headers (never a bare chart)
    expect(html).toContain("2 at risk");
    expect(html).toContain("1 LOW");
  });

  test("NOT_ASSESSABLE: the C4 unlock CTA names the assignment; no band fabricated anywhere", () => {
    const html = render(NOT_ASSESSABLE);
    expect(html).toContain('data-state="NOT_ASSESSABLE"');
    // C7 answer: the unlock path named, as a CTA
    expect(html).toContain("Unlock the prediction");
    expect(html).toContain("Assign 4CH1-S1-a-2 practice");
    expect(html).toContain(
      "This cannot be honestly predicted yet: 4CH1-S1-a-2 has no class evidence. Assign 4CH1-S1-a-2 practice to unlock a prediction.",
    );
    // the unmeasured chip speaks the band vocabulary, never a number
    expect(html).toContain("UNMEASURED");
    expect(html).toContain("0 measured");
    // no fabricated mastery percentage anywhere (the only % values allowed:
    // none — v0 renders no percentages at all)
    expect(html).not.toMatch(/\\d+%/);
    // the CTA routes to the test builder with the unlock code preloaded
    expect(html).toContain(
      `/teacher/test-builder?subtopics=${encodeURIComponent("4CH1-S1-a-2")}`,
    );
  });

  test("the empty-chain honest empty state renders (NO_PREREQUISITE_CHAIN shape)", () => {
    const view = baseView({
      classState: "NOT_ASSESSABLE",
      classReason: "NO_PREREQUISITE_CHAIN",
      headline:
        "The concept graph records no prerequisites for Topic b, so there is nothing to project from.",
      unlockPath: null,
    });
    const html = render(view);
    expect(html).toContain(
      "The concept graph records no prerequisites for Topic b — nothing to project from",
    );
    // nothing to unlock when there is no chain at all
    expect(html).not.toContain("Unlock the prediction");
  });
});

describe("foresights panel golden — the v1.1 amendment (ADR-CLASS-0003)", () => {
  test("READY: the recency line renders on the measured chip with the exact date slice", () => {
    const html = render(READY);
    expect(html).toContain('data-testid="foresights-prereq-recency"');
    expect(html).toContain("last practiced 2026-09-30"); // a pure slice of the wire ISO
    // no at-risk breakdown when nobody is at risk
    expect(html).not.toContain("At-risk detail");
  });

  test("AT_RISK: the breakdown line renders in plain language, zeros included", () => {
    const html = render(AT_RISK);
    expect(html).toContain('data-testid="foresights-atrisk-reasons"');
    expect(html).toContain(
      "At-risk detail: 0 below the ready line only · 1 active misconception only · 1 both",
    );
    // the recency line rides on the measured weak chip too
    expect(html).toContain("last practiced 2026-09-29");
  });

  test("NOT_ASSESSABLE: NO recency text anywhere — the honest null renders nothing", () => {
    const html = render(NOT_ASSESSABLE);
    expect(html).not.toContain("last practiced");
    expect(html).not.toContain('data-testid="foresights-prereq-recency"');
    // and no at-risk breakdown either (atRisk = 0)
    expect(html).not.toContain("At-risk detail");
  });
});

describe("foresights panel golden — the §8 targetMeasured routing law", () => {
  test("a measured target replaces the attention list with the measured drill-down chip", () => {
    const html = render(TARGET_MEASURED);
    expect(html).toContain("target already measured");
    expect(html).toContain("retrospective lens, not a forecast");
    expect(html).toContain('href="/teacher/class"');
    // the attention list is REPLACED — no queue, no distribution line
    expect(html).not.toContain('data-testid="foresights-learners"');
    expect(html).not.toContain("Your attention queue");
    expect(html).toContain('data-testid="foresights-measured-routing"');
  });
});
