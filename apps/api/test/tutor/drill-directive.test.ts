/**
 * T-TUTOR-AIM-P3 (DC10 §7.8 + §13.2): the tutor→drill loop — the
 * deterministic directive rule, the id mint, the §13.2 exactly-once claim
 * guards, and the wire metadata law.
 *
 * LAWS PINNED HERE:
 *   - the DECISION half is pure over the already-held reads (M3: no new
 *     read, no LLM): decay-due = the pendingReviews rows ∩ matched topics;
 *     no decay → null (most asks — the honest empty)
 *   - a refusal schedules nothing (the caller passes a null aim through
 *     selectDrillDirectiveBasis; the basis dies with a refused aim)
 *   - the correction arm rides INDEPENDENTLY of decay (the Teach SillyAI
 *     handoff is set whenever a misconception correction landed — §7.8)
 *     but only matters when the directive itself exists
 *   - the id is the deterministic (learner, session, turn) hash: stable
 *     under re-render, learner-bound, turn-scoped — and the PLANNED count
 *     is the draw-size-of-record arithmetic
 *   - guard 1 (row exists + learner-owned) and guard 2 (the claimed_at CAS)
 *     are INDEPENDENT: the CAS losing to a prior claim answers the prior
 *     claim's artefact; the CAS losing to a missing row answers not_found
 *   - a claim that scheduled nothing is not a claim (the release flips
 *     claimed_at back only while scheduled_count is still null)
 *   - the wire carries METADATA ONLY (node ids/codes/titles, counts, course
 *     scope) — never learner-derived free text (§13.2 / §11.1)
 */
import { describe, expect, test } from "bun:test";
import {
  claimDirectiveRow,
  directiveIdOf,
  DRILL_DRAW_SIZE,
  loadDirectiveTargets,
  mintDrillDirective,
  recordDirectiveOutcome,
  releaseDirectiveClaim,
  selectDrillDirectiveBasis,
  type DrillDirectiveClaimOutcome,
  type DrillDirectiveBasis,
} from "../../src/services/tutor/drill-directive";
import type { AimBrief, MatchedTopic } from "../../src/services/tutor/context";
import type { SqlFn } from "../../src/services/tutor/sql";

const LEARNER = "bb000000-0000-4000-8000-000000000001";
const SESSION = "cc000000-0000-4000-8000-000000000001";
const TOPIC_A = "aa000000-0000-4000-8000-00000000000a";
const TOPIC_B = "aa000000-0000-4000-8000-00000000000b";

const topics = (): MatchedTopic[] => [
  { nodeId: TOPIC_A, code: "4CH1-U1-T2", title: "Projectile motion", matchScore: 0.9 },
  { nodeId: TOPIC_B, code: "4CH1-U1-T3", title: "Forces", matchScore: 0.8 },
];

const aim = (over: Partial<AimBrief>): AimBrief => ({
  correction: null,
  provenPrerequisites: [],
  strongAreas: [],
  decayDue: false,
  ...over,
});

const clock = () => ({ now: () => new Date("2026-11-18T00:00:00Z") });

interface CapturedQuery {
  text: string;
  params: unknown[];
  result: Array<Record<string, unknown>>;
}

/** The scripted sql: queries answer in order; each capture records itself. */
function scriptedSql(script: Array<Array<Record<string, unknown>>>) {
  const captured: CapturedQuery[] = [];
  const sql = ((strings: TemplateStringsArray, ...params: unknown[]) => {
    const result = script.shift() ?? [];
    captured.push({ text: strings.join(" "), params, result });
    return Promise.resolve(result);
  }) as unknown as SqlFn;
  return { sql, captured };
}

describe("selectDrillDirectiveBasis (the DC10 §7.8 deterministic rule)", () => {
  test("nothing decay-due → null (most asks — the honest empty)", () => {
    expect(selectDrillDirectiveBasis(aim({}), topics(), [], "4ch1")).toBeNull();
    // a pending review on a NON-matched node is not a target (the foreign id)
    const foreign = "aa000000-0000-4000-8000-0000000000ff";
    expect(selectDrillDirectiveBasis(aim({}), topics(), [foreign], "4ch1")).toBeNull();
  });

  test("a pending review on a DIFFERENT matched topic targets THAT topic", () => {
    const basis = selectDrillDirectiveBasis(aim({}), topics(), [TOPIC_B], "4ch1");
    expect(basis!.nodes).toEqual([{ nodeId: TOPIC_B, code: "4CH1-U1-T3", title: "Forces" }]);
  });

  test("a decay-due MATCHED topic carries the directive (target list, code, title)", () => {
    const basis = selectDrillDirectiveBasis(aim({}), topics(), [TOPIC_A], "4ch1");
    expect(basis).not.toBeNull();
    expect(basis!.nodes).toEqual([{ nodeId: TOPIC_A, code: "4CH1-U1-T2", title: "Projectile motion" }]);
    expect(basis!.courseRef).toBe("4ch1");
    expect(basis!.plannedCount).toBe(DRILL_DRAW_SIZE);
  });

  test("deterministic order: the matched topics' own order (A before B)", () => {
    const basis = selectDrillDirectiveBasis(aim({}), topics(), [TOPIC_B, TOPIC_A], "4ch1");
    expect(basis!.nodes.map((n) => n.nodeId)).toEqual([TOPIC_A, TOPIC_B]);
    expect(basis!.plannedCount).toBe(2 * DRILL_DRAW_SIZE);
  });

  test("the Teach SillyAI handoff rides the CORRECTION arm (independent of decay)", () => {
    const noCorrection = selectDrillDirectiveBasis(aim({}), topics(), [TOPIC_A], "4ch1");
    expect(noCorrection!.teachHandoff).toBeNull();
    const corrected = selectDrillDirectiveBasis(
      aim({ correction: { nodeId: TOPIC_A, title: "particles get bigger" } }),
      topics(),
      [TOPIC_A],
      "4ch1",
    );
    expect(corrected!.teachHandoff).toEqual({ nodeId: TOPIC_A, title: "particles get bigger" });
  });

  test("the decision is pure: the same state, the same basis (no clock, no reads)", () => {
    const state = () => selectDrillDirectiveBasis(aim({ decayDue: true }), topics(), [TOPIC_A], "4ch1");
    expect(state()).toEqual(state());
  });
});

describe("directiveIdOf + mintDrillDirective (the deterministic id)", () => {
  test("the id is stable under re-render (same ids → same id)", () => {
    expect(directiveIdOf(LEARNER, SESSION, 2)).toBe(directiveIdOf(LEARNER, SESSION, 2));
  });

  test("the id is learner-bound and turn-scoped (a foreign id set mints a different id)", () => {
    const otherLearner = "bb000000-0000-4000-8000-000000000002";
    const otherSession = "cc000000-0000-4000-8000-000000000002";
    const base = directiveIdOf(LEARNER, SESSION, 2);
    expect(directiveIdOf(otherLearner, SESSION, 2)).not.toBe(base);
    expect(directiveIdOf(LEARNER, otherSession, 2)).not.toBe(base);
    expect(directiveIdOf(LEARNER, SESSION, 4)).not.toBe(base);
  });

  test("the id carries the domain prefix + 192 bits of hash", () => {
    const id = directiveIdOf(LEARNER, SESSION, 2);
    expect(id.startsWith("tdd1-")).toBe(true);
    expect(id.length).toBe("tdd1-".length + 48);
  });

  test("mintDrillDirective attaches the minted id to the basis", () => {
    const basis: DrillDirectiveBasis = {
      nodes: [{ nodeId: TOPIC_A, code: "4CH1-U1-T2", title: "Projectile motion" }],
      courseRef: "4ch1",
      plannedCount: DRILL_DRAW_SIZE,
      teachHandoff: null,
    };
    const minted = mintDrillDirective(basis, LEARNER, SESSION, 2);
    expect(minted.directiveId).toBe(directiveIdOf(LEARNER, SESSION, 2));
    expect(minted.nodes).toEqual(basis.nodes);
  });
});

describe("claimDirectiveRow (the §13.2 exactly-once guards)", () => {
  test("the CAS win answers claimed (guard 2 consumed once)", async () => {
    const { sql, captured } = scriptedSql([[{ scheduled_count: null }]]);
    const outcome: DrillDirectiveClaimOutcome = await claimDirectiveRow(sql, clock(), "tdd1-x", LEARNER);
    expect(outcome.status).toBe("claimed");
    expect(captured[0]!.text).toContain("claimed_at is null");
    expect(captured[0]!.text).toContain("learner_id");
  });

  test("the CAS losing to a PRIOR claim answers the prior artefact (already_claimed)", async () => {
    const { sql } = scriptedSql([
      [], // the CAS lost (no row updated)
      [{ scheduled_count: 5 }], // the prior claim's outcome
    ]);
    const outcome = await claimDirectiveRow(sql, clock(), "tdd1-x", LEARNER);
    expect(outcome.status).toBe("already_claimed");
    expect(outcome.scheduledCount).toBe(5);
  });

  test("the CAS losing to a MISSING row answers not_found (guard 1 failed)", async () => {
    const { sql } = scriptedSql([[], []]);
    const outcome = await claimDirectiveRow(sql, clock(), "tdd1-x", LEARNER);
    expect(outcome.status).toBe("not_found");
  });

  test("the claim is learner-owned: a foreign learner's CAS resolves against THEIR rows", async () => {
    const { sql, captured } = scriptedSql([[], []]);
    await claimDirectiveRow(sql, clock(), "tdd1-x", LEARNER);
    expect(captured[0]!.params).toContain(LEARNER);
    expect(captured[1]!.params).toContain(LEARNER);
  });
});

describe("loadDirectiveTargets (the row-owned draw targets)", () => {
  test("no row → null (guard 1)", async () => {
    const { sql } = scriptedSql([[]]);
    expect(await loadDirectiveTargets(sql, "tdd1-x", LEARNER)).toBeNull();
  });

  test("the row's OWN node ids resolve to the KG catalog's codes; decayed catalog entries skip", async () => {
    const { sql } = scriptedSql([
      [{ node_ids: [TOPIC_A, TOPIC_B], course_ref: "4ch1" }],
      [
        { id: TOPIC_A, code: "4CH1-U1-T2" },
        // TOPIC_B's catalog row has vanished — the honest skip
      ],
    ]);
    const resolved = await loadDirectiveTargets(sql, "tdd1-x", LEARNER);
    expect(resolved!.courseRef).toBe("4ch1");
    expect(resolved!.targets).toEqual([{ nodeId: TOPIC_A, code: "4CH1-U1-T2" }]);
  });

  test("the targets resolve against the learner's OWN row (never the caller's wire)", async () => {
    const { sql, captured } = scriptedSql([
      [{ node_ids: [TOPIC_A], course_ref: "4ch1" }],
      [{ id: TOPIC_A, code: "4CH1-U1-T2" }],
    ]);
    await loadDirectiveTargets(sql, "tdd1-x", LEARNER);
    expect(captured[0]!.params).toContain(LEARNER);
    expect(captured[0]!.params).toContain("tdd1-x");
  });
});

describe("releaseDirectiveClaim + recordDirectiveOutcome (the claim lifecycle)", () => {
  test("the release flips claimed_at back ONLY while nothing was scheduled", async () => {
    const { sql, captured } = scriptedSql([[]]);
    await releaseDirectiveClaim(sql, "tdd1-x", LEARNER);
    expect(captured[0]!.text).toContain("claimed_at = null");
    expect(captured[0]!.text).toContain("scheduled_count is null");
  });

  test("the outcome persists the ACTUAL scheduled count (the re-render's artefact)", async () => {
    const { sql, captured } = scriptedSql([[]]);
    await recordDirectiveOutcome(sql, "tdd1-x", LEARNER, 5);
    expect(captured[0]!.text).toContain("scheduled_count");
    expect(captured[0]!.params).toContain(5);
  });
});

describe("the §13.2 metadata law (the wire carries no learner free text)", () => {
  test("the basis shape admits ONLY catalog fields (nodeId, code, title) + counts", () => {
    const basis = selectDrillDirectiveBasis(
      aim({ correction: { nodeId: TOPIC_A, title: "misconception title" } }),
      topics(),
      [TOPIC_A],
      "4ch1",
    )!;
    const json = JSON.stringify(basis);
    // the corpus/KG titles are catalog data (the same class as topics[] on
    // the wire) — the FORBIDDEN class is learner-derived free text (question
    // text, readings, struggle strings); none of those fields exist here
    expect(basis.nodes.every((n) => "nodeId" in n && "code" in n && "title" in n)).toBe(true);
    expect(json).not.toContain("mastery");
    expect(json).not.toContain("effective");
    expect(json).not.toContain("struggle");
  });
});
