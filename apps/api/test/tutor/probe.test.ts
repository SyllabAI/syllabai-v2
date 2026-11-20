/**
 * T-TUTOR-AIM-P2 (DC10 §7.6): the single optional probe — the deterministic
 * gap laws + the one-per-ask ceiling + the total order, pinned.
 *
 * THE GAP LAW: a DIRECT (depth-1) prerequisite node of the answered topics
 * carries an active gap signal when (a) its skill state shows practice with
 * weak mastery (attempts >= 1 AND mastery < PROBE_WEAK_MASTERY) or (b) an
 * active misconception reading (effective >= 0.5) attaches to it. At most
 * ONE probe per ask: misconception-gap first, then lowest mastery
 * (never-practised LAST), then node id asc — a deterministic total order.
 * §13.2 offer-not-claim: the offer carries metadata only (node id + corpus
 * title), never learner-derived free text.
 */
import { describe, expect, test } from "bun:test";
import { PROBE_WEAK_MASTERY, selectProbe, type ProbeOffer } from "../../src/services/tutor/probe";
import type { KnowledgeContext, MisconceptionReading, SkillState } from "../../src/services/tutor/context";

const TOPIC_A = "aa000000-0000-4000-8000-00000000000a";
const P1 = "ac000000-0000-4000-8000-000000000001";
const P2 = "ac000000-0000-4000-8000-000000000002";
const P3 = "ac000000-0000-4000-8000-000000000003";
const MISCO_1 = "ab000000-0000-4000-8000-000000000001";

const knowledge = (): KnowledgeContext => ({
  topics: [{ nodeId: TOPIC_A, code: "4CH1-U1-T2", title: "Projectile motion", matchScore: 0.9 }],
  prerequisites: [
    { forTopicId: TOPIC_A, nodeId: P1, title: "Vector components", depth: 1 },
    { forTopicId: TOPIC_A, nodeId: P2, title: "Kinematics equations", depth: 1 },
    // depth-2 prerequisites NEVER probe (adjacent = direct only)
    { forTopicId: TOPIC_A, nodeId: P3, title: "Trigonometry basics", depth: 2 },
  ],
  misconceptions: [
    { forTopicId: TOPIC_A, nodeId: MISCO_1, title: "gravity pulls sideways in flight" },
  ],
});

const state = (over: Partial<SkillState> & { nodeId: string }): SkillState => ({
  mastery: 0.9,
  attempts: 4,
  correctCount: 4,
  lastPracticedAt: new Date("2026-11-01T00:00:00Z"),
  proceduralFluencyGap: null,
  ...over,
});

const reading = (misconceptionNodeId: string, effective: number): MisconceptionReading => ({
  misconceptionNodeId,
  effective,
});

describe("selectProbe (DC10 §7.6 gap laws)", () => {
  test("no gap signal anywhere → null (most asks offer nothing; the wire is unchanged)", () => {
    expect(selectProbe(knowledge(), [state({ nodeId: P1, mastery: 0.9 })], [])).toBeNull();
    expect(selectProbe(knowledge(), [], [])).toBeNull();
  });

  test("weak practiced prerequisite (attempts >= 1, mastery < 0.5) probes", () => {
    const offer = selectProbe(knowledge(), [state({ nodeId: P1, mastery: 0.35, attempts: 2 })], []);
    expect(offer).toEqual({ nodeId: P1, title: "Vector components" });
  });

  test("an ACTIVE misconception attached to the prerequisite node probes (the P1 tag law's read)", () => {
    // rebuild cleanly: the misconception attaches to the PREREQUISITE node
    const k2: KnowledgeContext = {
      topics: knowledge().topics,
      prerequisites: knowledge().prerequisites,
      misconceptions: [{ forTopicId: P1, nodeId: MISCO_1, title: "gravity pulls sideways" }],
    };
    const offer = selectProbe(k2, [], [reading(MISCO_1, 0.66)]);
    expect(offer).toEqual({ nodeId: P1, title: "Vector components" });
  });

  test("a SUB-threshold reading never probes; a never-practised node (attempts 0) never probes", () => {
    const k2: KnowledgeContext = {
      topics: knowledge().topics,
      prerequisites: knowledge().prerequisites,
      misconceptions: [{ forTopicId: P1, nodeId: MISCO_1, title: "gravity pulls sideways" }],
    };
    expect(selectProbe(k2, [], [reading(MISCO_1, 0.49)])).toBeNull();
    expect(selectProbe(knowledge(), [state({ nodeId: P1, mastery: 0.1, attempts: 0 })], [])).toBeNull();
  });

  test("depth-2 prerequisites never probe (adjacent = direct only)", () => {
    expect(selectProbe(knowledge(), [state({ nodeId: P3, mastery: 0.1, attempts: 5 })], [])).toBeNull();
  });

  test("the ceiling: at most ONE probe; misconception-gap outranks weak-skill, then lowest mastery", () => {
    const k2: KnowledgeContext = {
      topics: knowledge().topics,
      prerequisites: [
        { forTopicId: TOPIC_A, nodeId: P1, title: "Vector components", depth: 1 },
        { forTopicId: TOPIC_A, nodeId: P2, title: "Kinematics equations", depth: 1 },
      ],
      misconceptions: [{ forTopicId: P2, nodeId: MISCO_1, title: "gravity pulls sideways" }],
    };
    // P1 weak-skill 0.4, P2 misconception-gap: the misconception wins
    const offer = selectProbe(
      k2,
      [state({ nodeId: P1, mastery: 0.4, attempts: 2 })],
      [reading(MISCO_1, 0.6)],
    );
    expect((offer as ProbeOffer).nodeId).toBe(P2);

    // both weak-skill: the LOWER mastery wins
    const offer2 = selectProbe(
      knowledge(),
      [
        state({ nodeId: P1, mastery: 0.45, attempts: 2 }),
        state({ nodeId: P2, mastery: 0.2, attempts: 3 }),
      ],
      [],
    );
    expect(offer2!.nodeId).toBe(P2);

    // identical mastery: the node-id order breaks the tie (deterministic)
    const offer3 = selectProbe(
      knowledge(),
      [
        state({ nodeId: P2, mastery: 0.4, attempts: 2 }),
        state({ nodeId: P1, mastery: 0.4, attempts: 2 }),
      ],
      [],
    );
    expect(offer3!.nodeId).toBe(P1);
  });

  test("PROBE_WEAK_MASTERY is the pinned selection constant", () => {
    expect(PROBE_WEAK_MASTERY).toBe(0.5);
  });
});
