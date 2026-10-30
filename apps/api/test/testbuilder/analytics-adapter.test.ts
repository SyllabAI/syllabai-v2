/**
 * CD-A — the classOverview→testbuilder analytics adapter (operator word
 * "CD-A", trace 1a18c0171724f5ed). Pins the wake-up of the
 * ClassAnalyticsPort seam end-to-end over fakeSql (no Neon):
 *
 *   1. THE ADAPTER IS PURE DELEGATION: classAnalyticsAdapter(deps).overview
 *      returns EXACTLY what ClassAnalyticsService.classOverview returns
 *      (deep-equal over two identical seeds) — zero re-derivation.
 *   2. THE COMPOSED DERIVATION IS THE FROZEN ONE: the REAL classOverview
 *      output feeds the REAL TestBuilder.weaknessOptions — reasons
 *      vocabulary, honest UNMEASURED pass-through (null mean, "UNMEASURED"
 *      band, nulls-last ordering), blocked-by codes from the weak
 *      prerequisite dependents, coverage-gap law, policy + selectionHint
 *      literals, the frozen ceiling (0.45 — the DEFAULT engine path, no
 *      engine injected: the production KnowledgeDeps shape).
 *   3. THE FACTORY DEFAULTS AWAKE: buildTestBuilderRouters() wires the real
 *      adapter; explicit null keeps the constructible dormant posture (the
 *      route's honest-501 mapping for it is pinned in routes.test.ts
 *      "DORMANT analytics port"); an explicit port is honored verbatim.
 *
 * Seed shape credit: the route builders mirror apps/api/test/teacher/
 * analytics.test.ts (the classOverview fakeSql harness, compacted). The
 * builder's servable leg is DUCK-TYPED here (the routes.test.ts precedent
 * — servable serving is separately law-pinned); the classOverview rollup
 * leg runs with an EMPTY candidate set (its filterBlockedAndProject
 * short-circuit keeps the projection queries unexercised, exactly as the
 * analytics harness does).
 */
import { describe, expect, test } from "bun:test";
import {
  classAnalyticsAdapter,
  type ClassAnalyticsPort,
} from "../../src/services/testbuilder";
import { buildTestBuilderRouters } from "../../src/routes/testbuilder";
import { TestBuilder, WEAK_MASTERY_CEILING_DEFAULT } from "../../src/services/testbuilder/builder";
import { classOverview } from "../../src/services/teacher";
import type { KnowledgeDeps } from "../../src/services/knowledge";
import type { ServableQuestions } from "../../src/services/questions/servable";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const ROOT = "ea000000-0000-4000-8000-000000000001"; // 4CH1 subject root
const SEC = "ea000000-0000-4000-8000-000000000002"; // UNIT
const SUB = "ea000000-0000-4000-8000-000000000003"; // TOPIC
const SP1 = "ea000000-0000-4000-8000-000000000004"; // SUBTOPIC — measured, weak
const SP2 = "ea000000-0000-4000-8000-000000000005"; // SUBTOPIC — unmeasured, blocked by SP1
const MISCO = "ea000000-0000-4000-8000-000000000007"; // folds under SP1

const L1 = "eb000000-0000-4000-8000-000000000001"; // Ada — measured weak + active misconception
const L2 = "eb000000-0000-4000-8000-000000000002"; // Ben — measured secure
const Q1 = "ec000000-0000-4000-8000-000000000001";
const T0 = new Date("2026-10-01T12:00:00Z");

const node = (id: string, code: string, type: string, title: string) => ({
  id,
  code,
  node_type: type,
  title,
  description: null,
  validation_status: "VALIDATED",
  provenance: "spec:4CH1-2017|tier:RULE_DERIVED|gate:operator-git-PR|extract:c09_spec_graph_extract.py",
  applicability: type === "SUBTOPIC" ? { papers: ["1H"] } : null,
});

const treeNodes = [
  node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)"),
  node(SEC, "4CH1-S1", "UNIT", "Section 1"),
  node(SUB, "4CH1-S1-a", "TOPIC", "Topic a"),
  node(SP1, "4CH1-S1-a-1", "SUBTOPIC", "Spec point 1"),
  node(SP2, "4CH1-S1-a-2", "SUBTOPIC", "Spec point 2"),
];

const subtreeIds = [ROOT, SEC, SUB, SP1, SP2];

function treeRoutes(): Route[] {
  return [
    {
      // node404 (knowledge/index.ts) — the 404-first root read
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid/,
      rows: [node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)")],
    },
    {
      // kgNode404 (teacher/kg.ts) — the band's own 404-first
      match: /select id, code, node_type, title from knowledge_nodes where id = \? ::uuid/,
      rows: [{ id: ROOT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry (4CH1)" }],
    },
    {
      // kg.ts prerequisiteChain node fetch (4-col bulk)
      match: /select id, code, node_type, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)/,
      rows: treeNodes.map((n) => ({ id: n.id, code: n.code, node_type: n.node_type, title: n.title })),
    },
    {
      // the recursive PART_OF subtree CTE
      match: /with recursive subtree as/,
      rows: subtreeIds.map((id) => ({ id })),
    },
    {
      // the subtree node rows
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any/,
      rows: treeNodes,
    },
    {
      // PART_OF children edges (structure)
      match: /select e\.source_node_id, e\.target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any/,
      rows: [
        { source_node_id: SEC, target_node_id: ROOT, source_code: "4CH1-S1" },
        { source_node_id: SUB, target_node_id: SEC, source_code: "4CH1-S1-a" },
        { source_node_id: SP1, target_node_id: SUB, source_code: "4CH1-S1-a-1" },
        { source_node_id: SP2, target_node_id: SUB, source_code: "4CH1-S1-a-2" },
      ],
    },
    {
      // the V15 misconception-family fold — MISCO attaches under SP1
      match: /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability, e\.source_node_id as edge_source_node_id, e\.target_node_id as edge_target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id/,
      rows: [
        {
          id: MISCO,
          code: "M-Confused-Units",
          node_type: "MISCONCEPTION",
          title: "Units confusion",
          description: null,
          validation_status: "SUGGESTED",
          provenance: SP1,
          applicability: null,
          edge_source_node_id: MISCO,
          edge_target_node_id: SP1,
          source_code: "M-Confused-Units",
        },
      ],
    },
  ];
}

interface Evidence {
  skills?: Array<Record<string, unknown>>;
  misconceptions?: Array<Record<string, unknown>>;
  engagements?: Array<Record<string, unknown>>;
  dueReviews?: Array<Record<string, unknown>>;
  recentAttempts?: Array<Record<string, unknown>>;
  servableCandidates?: Array<Record<string, unknown>>;
  prereqEdges?: Array<Record<string, unknown>>;
  closureRows?: Array<Record<string, unknown>>;
  anchorEdges?: Array<Record<string, unknown>>;
  users?: Array<Record<string, unknown>>;
  pendingAnswers?: number;
}

function evidenceRoutes(e: Evidence): Route[] {
  return [
    { match: /from skill_states/, rows: e.skills ?? [] },
    { match: /from misconception_states/, rows: e.misconceptions ?? [] },
    { match: /from tutor_topic_engagements/, rows: e.engagements ?? [] },
    { match: /from review_schedules/, rows: e.dueReviews ?? [] },
    {
      match: /select a\.learner_id as learner_id, count\(\*\) as total/,
      rows: e.recentAttempts ?? [],
    },
    { match: /from exam_papers p/, rows: [] },
    {
      // activeWithin candidates (the classOverview servable rollup) — EMPTY
      // set: the projection queries stay unexercised (short-circuit), the
      // builder's targeting leg rides the duck-typed servable instead.
      match: /from questions q\s*where q\.active = true and \(q\.primary_topic_node_id = any/,
      rows: e.servableCandidates ?? [],
    },
    {
      // prerequisiteChain closure CTE — present-but-empty (harness parity)
      match: /select node_id, max\(depth\) as depth from prereq group by node_id order by depth desc, node_id/,
      rows: e.closureRows ?? [],
    },
    {
      // prerequisiteRelations (the t1 exported derivation, re-run CTE)
      match: /where e\.relation_type = 'REQUIRES_PREREQUISITE'/,
      rows: e.prereqEdges ?? [],
    },
    {
      // conceptAnchorsWithin (kg.ts — PART_OF sourced at CONCEPT)
      match: /and s\.node_type = 'CONCEPT'/,
      rows: e.anchorEdges ?? [],
    },
    {
      match: /select count\(\*\) as n from answers a/,
      rows: [{ n: e.pendingAnswers ?? 0 }],
    },
    {
      // testbuilder findQuestionTopicsIn (the targeting secondary mappings)
      match: /select node_id, question_id from question_topics where question_id = any\( \? ::uuid\[\]\)/,
      rows: [],
    },
    {
      // namesFor / findAllById
      match: /select id, display_name from users where id = any/,
      rows: e.users ?? [],
    },
    { match: /from question_spec_points qsp/, rows: [] },
    { match: /from question_options o/, rows: [] },
    {
      // the enabled STUDENT cohort (findEnabledByRole)
      match: /from users u\s*join user_roles r on r\.user_id = u\.id\s*where r\.role = 'STUDENT' and u\.enabled = true/,
      rows: e.users ?? [],
    },
  ];
}

function seed(e: Evidence) {
  return fakeSql([...treeRoutes(), ...evidenceRoutes(e)]);
}

const CLOCK = { newId: () => "ff000000-0000-4000-8000-0000000000ff", now: () => T0 };

/** Production deps shape — NO engine injected: engineOf applies the frozen
 *  defaults (paper defaults + CONFIG 0.45/2). This is exactly what
 *  classAnalyticsAdapter receives from buildTestBuilderRouters. */
function makeDeps(e: Evidence): KnowledgeDeps {
  return { sql: seed(e), clock: CLOCK };
}

const skill = (learnerId: string, nodeId: string, mastery: number, attempts = 4) => ({
  learner_id: learnerId,
  node_id: nodeId,
  mastery,
  attempts,
  correct_count: Math.floor(attempts / 2),
});

const users = [
  { id: L1, display_name: "Ada", created_at: "2026-01-01T00:00:00Z" },
  { id: L2, display_name: "Ben", created_at: "2026-01-02T00:00:00Z" },
];

const WEAK_SEED: Evidence = {
  users,
  skills: [skill(L1, SP1, 0.3), skill(L2, SP1, 0.4)], // SP1 mean 0.35 < 0.45
  misconceptions: [
    {
      learner_id: L1,
      misconception_node_id: MISCO,
      probability: 0.9,
      evidence_count: 4,
      last_evidence_at: "2026-10-01T00:00:00Z",
    },
  ],
  prereqEdges: [
    // SP2 depends on SP1 (direct, structure-level): SP2 REQUIRES_PREREQUISITE SP1
    { source_node_id: SP2, target_node_id: SP1 },
  ],
};

/** The duck-typed servable leg (routes.test.ts precedent): one servable
 *  question on SP1 — the builder's targetingServableCounts consumes id +
 *  primaryTopicNodeId only. */
const servableStub = {
  activeWithin: async (ids: string[]) =>
    ids.includes(SP1) ? [{ id: Q1, primaryTopicNodeId: SP1 }] : [],
  activeByTopic: async () => [],
};

function makeBuilder(deps: KnowledgeDeps, servable: unknown = servableStub) {
  return new TestBuilder({
    servable: servable as ServableQuestions,
    sql: deps.sql,
    analytics: classAnalyticsAdapter(deps),
    weakMasteryCeiling: WEAK_MASTERY_CEILING_DEFAULT,
  });
}

// ── 1. the adapter is pure delegation ───────────────────────────────────────

describe("CD-A classAnalyticsAdapter — pure delegation over the real analytics", () => {
  test("adapter.overview(rootId) deep-equals classOverview(rootId) over identical seeds", async () => {
    const direct = await classOverview(makeDeps(WEAK_SEED), ROOT);
    const viaAdapter = await classAnalyticsAdapter(makeDeps(WEAK_SEED)).overview(ROOT);
    expect(viaAdapter).toEqual(direct);
  });

  test("the real overview satisfies the port slice: the weak prerequisite carries dependents with nodeId", async () => {
    const overview = await classOverview(makeDeps(WEAK_SEED), ROOT);
    expect(overview.policy).toBe("class-analytics/v1");
    expect(overview.rootId).toBe(ROOT);
    const sp1 = overview.topics.find((t) => t.code === "4CH1-S1-a-1")!;
    expect(sp1.learnersMeasured).toBe(2);
    expect(sp1.meanMastery).toBe(0.35); // round4((0.30 + 0.40) / 2)
    expect(sp1.masteryBand).toBe("LOW");
    expect(overview.weakPrerequisites.length).toBe(1);
    const wp = overview.weakPrerequisites[0]!;
    expect(wp.prerequisiteNodeId).toBe(SP1);
    expect(wp.derived).toBe(false); // direct structure edge — no concept projection
    expect(wp.dependents.map((d) => d.nodeId)).toEqual([SP2]);

    // the ADAPTER's static type is the port slice (the narrowing is the
    // point — the builder must only see the slice it consumes); the runtime
    // fields ride the deep-equal above. Slice-typed accessors pinned:
    const viaAdapter = await classAnalyticsAdapter(makeDeps(WEAK_SEED)).overview(ROOT);
    expect(viaAdapter.enrolledLearners).toBe(overview.enrolledLearners);
    expect(viaAdapter.weakPrerequisites[0]!.dependents.map((d) => d.nodeId)).toEqual([SP2]);
  });
});

// ── 2. the composed derivation (real overview → real builder) ──────────────

describe("CD-A composed: real classOverview feeds real TestBuilder.weaknessOptions", () => {
  test("reasons vocabulary, honest UNMEASURED pass-through, blocked-by codes, ordering, literals", async () => {
    const builder = makeBuilder(makeDeps(WEAK_SEED));
    const view = await builder.weaknessOptions(ROOT);

    expect(view.rootId).toBe(ROOT);
    expect(view.policy).toBe("test-builder-weakness/v1");
    expect(view.enrolledLearners).toBe(2);
    expect(view.selectionHint).toBe(
      "Pass weakTopics[].topicNodeId values as topicNodeIds to GET /api/v1/teacher/tests/preview" +
        " — assembly stays VALIDATED-only, marks-targeted and deterministic.",
    );

    // weakTopics: SP1 (measured weak + active misconception) then SP2
    // (unmeasured but BLOCKED — meanMastery null sorts LAST)
    expect(view.weakTopics.length).toBe(2);

    const sp1 = view.weakTopics[0]!;
    expect(sp1.topicNodeId).toBe(SP1);
    expect(sp1.code).toBe("4CH1-S1-a-1");
    expect(sp1.reasons).toEqual(["LOW_MEAN_MASTERY", "ACTIVE_MISCONCEPTION_PRESENT"]);
    expect(sp1.meanMastery).toBe(0.35);
    expect(sp1.masteryBand).toBe("LOW");
    expect(sp1.learnersMeasured).toBe(2);
    expect(sp1.learnersWithActiveMisconception).toBe(1);
    expect(sp1.blockedByPrerequisiteCodes).toEqual([]);
    expect(sp1.servableQuestions).toBe(1); // the duck-typed servable leg (Q1 on SP1)

    const sp2 = view.weakTopics[1]!; // nulls last — the frozen comparator law
    expect(sp2.topicNodeId).toBe(SP2);
    expect(sp2.reasons).toEqual(["BLOCKED_BY_WEAK_PREREQUISITE"]);
    expect(sp2.meanMastery).toBeNull(); // honest absence — never fabricated
    expect(sp2.masteryBand).toBe("UNMEASURED"); // the analytics band passes through
    expect(sp2.blockedByPrerequisiteCodes).toEqual(["4CH1-S1-a-1"]);
    expect(sp2.servableQuestions).toBe(0);
  });

  test("coverage gaps: an unmeasured topic with NO class activity is neither weak nor a gap", async () => {
    const builder = makeBuilder(makeDeps(WEAK_SEED));
    const view = await builder.weaknessOptions(ROOT);
    // SP2 has no attempts and no tutor engagements — the gap law requires
    // activity; it is claimed ONLY via the blocked-by reason above.
    expect(view.coverageGaps).toEqual([]);
  });

  test("the zero-evidence cohort: no weak topics, no gaps, honest empty derivation", async () => {
    const builder = makeBuilder(makeDeps({ users: [] }));
    const view = await builder.weaknessOptions(ROOT);
    expect(view.weakTopics).toEqual([]);
    expect(view.coverageGaps).toEqual([]);
    expect(view.enrolledLearners).toBe(0);
    expect(view.learnersWithEvidence).toBe(0);
  });
});

// ── 3. the factory wake-up law ──────────────────────────────────────────────

const PLACEHOLDER_ENV = { DATABASE_URL: "postgres://cd-a-placeholder.invalid:5432/db" };

function portOf(builder: TestBuilder): ClassAnalyticsPort | null {
  // TestBuilder.deps is private readonly — the wake-up law is pinned
  // structurally (no query is issued: createSql is lazy, nothing connects).
  return (builder as unknown as { deps: { analytics: ClassAnalyticsPort | null } }).deps.analytics;
}

describe("CD-A buildTestBuilderRouters — the port defaults AWAKE", () => {
  test("default construction wires the REAL adapter (non-null port, no DB contact)", () => {
    const routers = buildTestBuilderRouters(PLACEHOLDER_ENV);
    expect(portOf(routers.components.builder)).not.toBeNull();
  });

  test("explicit analytics: null keeps the constructible DORMANT posture", () => {
    const routers = buildTestBuilderRouters(PLACEHOLDER_ENV, { analytics: null });
    expect(portOf(routers.components.builder)).toBeNull();
  });

  test("an explicit port is honored verbatim (the synthetic-port test path)", () => {
    const synthetic: ClassAnalyticsPort = {
      overview: async () => {
        throw new Error("not reached in this pin");
      },
    };
    const routers = buildTestBuilderRouters(PLACEHOLDER_ENV, { analytics: synthetic });
    expect(portOf(routers.components.builder)).toBe(synthetic);
  });
});
