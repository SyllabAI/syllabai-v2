/**
 * T-FORESIGHT-V0-PLAN-1 Stage A — the Foresights-v0 laws, unit tests.
 * Stubbed sql via the shared fakeSql helper; pins docs/FORESIGHTS-V0-PLAN.md
 * §3–§9 as implemented in services/teacher/foresights.ts, under
 * ADR-CLASS-0002 (the comprehension-first law — this battery INCLUDES the
 * C7 comprehension fixtures: for each state, the "what does this tell me to
 * do?" answers are pinned). The plan's §9 battery, item by item:
 *
 *   1. determinism — same inputs, fixed clock → byte-identical view;
 *   2. honesty (class) — class-wide unmeasured direct prereq →
 *      NOT_ASSESSABLE + unlockPath, no band fabricated anywhere;
 *   3. honesty (learner) — class ASSESSABLE + learner NOT_ASSESSABLE rows
 *      coexist (two-level honesty);
 *   4. independent-student rule — a non-member's skill_states rows and a
 *      DISABLED member never move a single number (roster-law fixture);
 *   5. subject isolation — target outside the root subtree → 404;
 *   6. the T-C11 mirror — a CONCEPT depth-1 prereq projects onto its anchor
 *      SPs (derived=true + concept codes), self-projections collapse;
 *   7. the decay anchor — EFFECTIVE mastery at the single asOf drives bands;
 *      raw stored mastery never leaks into a band;
 *   8. staleness relaxation — a stale misconception below activeThreshold is
 *      not active, not counted;
 *   9. sort locks — the AT_RISK → READY → NOT_ASSESSABLE attention queue;
 *  10. no-engagement-contamination (law test) — tutor signals in fixtures
 *      never appear in the view (the evidence surface is 2 tables);
 *  11. targetMeasured routing flag;
 *  12. C7 comprehension fixtures — the headline sentences + disclosure + the
 *      per-state "what to do" answers (unlock path named; weak codes named);
 *  +  the batching law: ONE skill_states read, ≤1 misconception_states read,
 *     empty IN lists issue NO query; + wire conformance via the zod schema.
 */
import { describe, expect, test } from "bun:test";

import { classForesightsViewSchema } from "@syllabai/contracts";
import {
  FORESIGHTS_POLICY,
  classForesights,
} from "../../src/services/teacher";
import { KnowledgeNotFoundError } from "../../src/services/knowledge";
import {
  LEARNER_ENGINE_PAPER_DEFAULTS,
  bandOf,
  decayedMastery,
} from "../../src/services/learner";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const ROOT = "ea000000-0000-4000-8000-000000000001"; // 4CH1 subject root
const SEC = "ea000000-0000-4000-8000-000000000002"; // UNIT
const SUB = "ea000000-0000-4000-8000-000000000003"; // TOPIC
const SP1 = "ea000000-0000-4000-8000-000000000004"; // SUBTOPIC (spec point) — practiced
const SP2 = "ea000000-0000-4000-8000-000000000005"; // SUBTOPIC — never practiced
const CONCEPT = "ea000000-0000-4000-8000-000000000006"; // anchors to SP1
const MISCO = "ea000000-0000-4000-8000-000000000007"; // folds under SP1
const TGT = "ea000000-0000-4000-8000-000000000008"; // TOPIC b — the foresights target

const CLASS_ID = "ec000000-0000-4000-8000-000000000001";
const TEACHER = "ed000000-0000-4000-8000-000000000001";

const L1 = "eb000000-0000-4000-8000-000000000001"; // Ada
const L2 = "eb000000-0000-4000-8000-000000000002"; // Ben
const L3 = "eb000000-0000-4000-8000-000000000003"; // Cy (unmeasured in E)
const L4 = "eb000000-0000-4000-8000-000000000004"; // Dee — DISABLED member
const L9 = "eb000000-0000-4000-8000-000000000009"; // rogue NON-member

const T0 = new Date("2026-10-01T12:00:00Z");
const FRESH = "2026-09-30T12:00:00Z"; // 1d before the anchor
const ELEVEN_D = "2026-09-20T12:00:00Z"; // 11d before the anchor
const STALE_400D = "2025-08-27T12:00:00Z"; // ~400d before the anchor
const DECAY_200D = "2026-03-15T12:00:00Z"; // 200d before the anchor

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
  node(CONCEPT, "C-Alpha", "CONCEPT", "Alpha concept"),
  node(TGT, "4CH1-S1-b", "TOPIC", "Topic b"),
];

const subtreeIds = [ROOT, SEC, SUB, SP1, SP2, CONCEPT, TGT];

function treeRoutes(): Route[] {
  return [
    {
      // graphOwnedClass — the F-072 gate verbatim
      match: /select id, name, status, teacher_id from classes where id = \? ::uuid/,
      rows: [{ id: CLASS_ID, name: "10A Chemistry", status: "ACTIVE", teacher_id: TEACHER }],
    },
    {
      // node404 (knowledge/index.ts) — the 404-first root read (8-col single)
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid/,
      rows: [node(ROOT, "4CH1", "SUBJECT", "Chemistry (4CH1)")],
    },
    {
      // kgNode404 (teacher/kg.ts) — the 4-col single read
      match: /select id, code, node_type, title from knowledge_nodes where id = \? ::uuid/,
      rows: [{ id: ROOT, code: "4CH1", node_type: "SUBJECT", title: "Chemistry (4CH1)" }],
    },
    {
      // the 4-col bulk node fetch (prerequisiteChain + any other)
      match: /select id, code, node_type, title from knowledge_nodes where id = any\( \? ::uuid\[\]\)/,
      rows: treeNodes.map((n) => ({ id: n.id, code: n.code, node_type: n.node_type, title: n.title })),
    },
    {
      // the recursive PART_OF subtree CTE (tree read AND subtreeIds reuse)
      match: /with recursive subtree as/,
      rows: subtreeIds.map((id) => ({ id })),
    },
    {
      // the subtree node rows (8-col any)
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
        { source_node_id: CONCEPT, target_node_id: SP1, source_code: "C-Alpha" },
        { source_node_id: TGT, target_node_id: SEC, source_code: "4CH1-S1-b" },
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
          provenance: CONCEPT,
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
  members?: string[];
  users?: Array<Record<string, unknown>>;
  skills?: Array<Record<string, unknown>>;
  misconceptions?: Array<Record<string, unknown>>;
  closureRows?: Array<{ node_id: string; depth: number }>;
  anchorEdges?: Array<Record<string, unknown>>;
  /** when set, skill rows are filtered by the BOUND roster (the §9.4 pin) */
  rosterFilteredSkills?: boolean;
}

function evidenceRoutes(e: Evidence): Route[] {
  const skillRows = e.skills ?? [];
  return [
    {
      // memberStudentIds — the class scope source
      match: /select student_id from class_members where class_id = \? ::uuid order by enrolled_at asc/,
      rows: (e.members ?? [L1, L2, L3, L4]).map((id) => ({ student_id: id })),
    },
    {
      // enabledRoster — member ids resolved against accounts, ENABLED only
      match: /select id, display_name, enabled from users where id = any/,
      rows:
        e.users ??
        [
          { id: L1, display_name: "Ada", enabled: true },
          { id: L2, display_name: "Ben", enabled: true },
          { id: L3, display_name: "Cy", enabled: true },
          { id: L4, display_name: "Dee", enabled: false },
        ],
    },
    {
      // Query A — skill_states over roster × (target ∪ chain ∪ anchors)
      match: /from skill_states/,
      rows: skillRows,
      rowsFor: e.rosterFilteredSkills
        ? (params: unknown[]) => {
            const roster = params[0] as string[];
            return skillRows.filter((r) => roster.includes(r.learner_id as string));
          }
        : undefined,
    },
    {
      // Query B — misconception_states over roster × misco-under-direct
      match: /from misconception_states/,
      rows: e.misconceptions ?? [],
    },
    {
      // prerequisiteChain closure override (per-scenario)
      match: /select node_id, max\(depth\) as depth from prereq group by node_id order by depth desc, node_id/,
      rows: e.closureRows ?? [],
    },
    {
      // conceptAnchorsWithin override (per-scenario)
      match: /and s\.node_type = 'CONCEPT'/,
      rows: e.anchorEdges ?? [],
    },
  ];
}

const ENGINE = {
  decay: LEARNER_ENGINE_PAPER_DEFAULTS.decay,
  bdt: LEARNER_ENGINE_PAPER_DEFAULTS.bdt,
  weakMasteryCeiling: 0.45,
  minAttemptsForWeakness: 2,
};

function makeDeps(
  e: Evidence,
  classRow: Record<string, unknown> | null | undefined = undefined,
) {
  // classRow undefined → the owned-class default; explicit null → the 404 miss
  const classRows: Array<Record<string, unknown>> =
    classRow === undefined
      ? [{ id: CLASS_ID, name: "10A Chemistry", status: "ACTIVE", teacher_id: TEACHER }]
      : classRow == null
        ? []
        : [classRow];
  const classRoute: Route = {
    match: /select id, name, status, teacher_id from classes where id = \? ::uuid/,
    rows: classRows,
  };
  return {
    sql: fakeSql([classRoute, ...treeRoutes().slice(1), ...evidenceRoutes(e)]),
    clock: { now: () => T0 },
    engine: ENGINE,
  };
}

const skill = (
  learnerId: string,
  nodeId: string,
  mastery: number,
  attempts = 5,
  lastPracticedAt = ELEVEN_D,
) => ({
  learner_id: learnerId,
  node_id: nodeId,
  mastery,
  attempts,
  correct_count: Math.floor(attempts / 2),
  last_practiced_at: lastPracticedAt,
});

const misco = (learnerId: string, probability: number, evidenceAt = FRESH) => ({
  learner_id: learnerId,
  misconception_node_id: MISCO,
  probability,
  evidence_count: 4,
  last_evidence_at: evidenceAt,
});

const CHAIN_SP1 = [{ node_id: SP1, depth: 1 }];
const ANCHOR_C_ALPHA = [
  {
    source_node_id: CONCEPT,
    target_node_id: SP1,
    relation_type: "PART_OF",
    validation_status: "VALIDATED",
    provenance: "seed",
    rationale: "anchor",
    source_code: "C-Alpha",
    source_title: "Alpha concept",
    source_node_type: "CONCEPT",
    source_validation_status: "VALIDATED",
    target_code: "4CH1-S1-a-1",
    target_title: "Spec point 1",
    target_node_type: "SUBTOPIC",
    target_validation_status: "VALIDATED",
  },
];

// the effective-mastery expectations are computed from the SAME pure math the
// service uses (bandOf/decayedMastery — unit-pinned in the learner-model
// battery); the pins below bind the AGGREGATION + decision tables, not e^x.
const eff = (mastery: number, lastPracticedAt: string) =>
  decayedMastery(mastery, new Date(lastPracticedAt), T0, ENGINE.decay);
const round4 = (v: number) => Math.round(v * 10000.0) / 10000.0;

// ── the laws ─────────────────────────────────────────────────────────────────

describe("foresights gates (plan §3 — the F-072 gate order verbatim)", () => {
  test("an unknown class is a 404 — the gate fires BEFORE any knowledge read", async () => {
    const d = makeDeps({}, null); // graphOwnedClass miss → empty rows
    await expect(
      classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT),
    ).rejects.toThrow(KnowledgeNotFoundError);
  });

  test("subject isolation: a target outside the root subtree is a 404, never a cross-subject hop", async () => {
    const d = makeDeps({});
    const OUTSIDE = "ef000000-0000-4000-8000-000000000001";
    await expect(classForesights(d as never, TEACHER, CLASS_ID, ROOT, OUTSIDE)).rejects.toThrow(
      new KnowledgeNotFoundError("curriculum topic in this subject not found: " + OUTSIDE),
    );
  });
});

describe("foresights classification — ASSESSABLE_READY (plan §5 row 4)", () => {
  test("ready: every direct prereq measured, none weak → READY headline + READY learners", async () => {
    const d = makeDeps({ closureRows: CHAIN_SP1, skills: [skill(L1, SP1, 0.9), skill(L2, SP1, 0.6)] });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.policy).toBe(FORESIGHTS_POLICY);
    expect(v.classState).toBe("ASSESSABLE_READY");
    expect(v.classReason).toBeNull();
    expect(v.unlockPath).toBeNull();
    expect(v.targetMeasured).toBe(false);
    // C1 headline + C3 disclosure (comprehension-first, wire-level)
    expect(v.headline).toBe(
      "This class looks ready for Topic b: every prerequisite it has practiced sits at DEVELOPING or above.",
    );
    expect(v.disclosure).toContain("A readiness prior — not a measurement of Topic b.");
    expect(v.disclosure).toContain("at " + v.asOf);
    // the cell: EFFECTIVE mean, 4-dp (0.9@11d + 0.6@11d)
    const cell = v.prerequisites[0]!;
    expect(cell.nodeId).toBe(SP1);
    expect(cell.learnersMeasured).toBe(2);
    expect(cell.meanEffectiveMastery).toBe(round4((eff(0.9, ELEVEN_D) + eff(0.6, ELEVEN_D)) / 2));
    expect(cell.masteryBand).toBe(bandOf(cell.meanEffectiveMastery!, ENGINE.decay));
    expect(cell.weak).toBe(false);
    expect(cell.derived).toBe(false);
    // learners: Ada/Ben READY, Cy honestly NOT_ASSESSABLE (no evidence on SP1)
    expect(v.learners.map((l) => l.state)).toEqual(["READY", "READY", "NOT_ASSESSABLE"]);
    expect(v.distribution.ready).toBe(2);
    expect(v.distribution.atRisk).toBe(0);
    expect(v.distribution.notAssessable).toBe(1);
  });
});

describe("foresights classification — ASSESSABLE_AT_RISK (plan §5 row 3)", () => {
  test("at-risk: a weak class mean → WEAK_PREREQUISITES + named codes + reason-coded learners", async () => {
    const d = makeDeps({
      closureRows: CHAIN_SP1,
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.6)],
      misconceptions: [misco(L1, 0.9)], // fresh → active on SP1 (under SP1)
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.classState).toBe("ASSESSABLE_AT_RISK");
    expect(v.classReason).toBe("WEAK_PREREQUISITES");
    // C1 headline names k of n AND the weak codes (the explanation IS the codes)
    expect(v.headline).toBe(
      "Expect Topic b to land hard: 1 of 1 prerequisites sit below the class's ready line (4CH1-S1-a-1).",
    );
    const cell = v.prerequisites[0]!;
    expect(cell.weak).toBe(true);
    expect(cell.learnersWithActiveMisconception).toBe(1);
    // learners: Ada weak+active → LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ, first (attention queue)
    const ada = v.learners.find((l) => l.displayName === "Ada")!;
    const ben = v.learners.find((l) => l.displayName === "Ben")!;
    expect(ada.state).toBe("AT_RISK");
    expect(ada.reason).toBe("LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ");
    expect(ada.weakPrereqCodes).toEqual(["4CH1-S1-a-1"]);
    expect(ada.miscoPrereqCodes).toEqual(["4CH1-S1-a-1"]);
    expect(ben.state).toBe("READY");
    expect(ben.reason).toBeNull();
    // sort lock: AT_RISK before READY
    expect(v.learners[0]!.displayName).toBe("Ada");
    expect(v.distribution.atRisk).toBe(1);
    expect(v.distribution.ready).toBe(1);
  });
});

describe("foresights honesty — the class level (plan §5 rows 1–2, C4)", () => {
  test("NO_PREREQUISITE_CHAIN: an empty closure → honest cannot-predict, unlock null", async () => {
    const d = makeDeps({ closureRows: [] });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.classState).toBe("NOT_ASSESSABLE");
    expect(v.classReason).toBe("NO_PREREQUISITE_CHAIN");
    expect(v.unlockPath).toBeNull();
    expect(v.prerequisites).toEqual([]);
    expect(v.headline).toBe(
      "The concept graph records no prerequisites for Topic b, so there is nothing to project from.",
    );
  });

  test("UNMEASURED_PREREQUISITES: class-wide unmeasured direct prereq → NOT_ASSESSABLE + unlockPath", async () => {
    const d = makeDeps({ closureRows: [{ node_id: SP2, depth: 1 }] });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.classState).toBe("NOT_ASSESSABLE");
    expect(v.classReason).toBe("UNMEASURED_PREREQUISITES");
    // the C4 unlock path: the first unmeasured direct prereq in code order
    expect(v.unlockPath).toEqual({
      nodeId: SP2,
      code: "4CH1-S1-a-2",
      title: "Spec point 2",
    });
    // no band fabricated anywhere
    expect(v.prerequisites[0]!.masteryBand).toBe("UNMEASURED");
    expect(v.prerequisites[0]!.meanEffectiveMastery).toBeNull();
    expect(v.prerequisites[0]!.weak).toBe(false);
    // the headline NAMES the unlock assignment (the "what to do" answer)
    expect(v.headline).toBe(
      "This cannot be honestly predicted yet: 4CH1-S1-a-2 has no class evidence. Assign 4CH1-S1-a-2 practice to unlock a prediction.",
    );
    // every learner is honestly NOT_ASSESSABLE with the named code
    expect(v.learners.length).toBe(3);
    expect(v.learners.every((l) => l.state === "NOT_ASSESSABLE")).toBe(true);
    expect(v.learners.every((l) => l.reason === "UNMEASURED_PREREQ")).toBe(true);
    expect(v.learners.every((l) => l.unmeasuredPrereqCodes.length > 0)).toBe(true);
  });

  test("empty roster: queries skipped (empty-IN law), zeros + NOT_ASSESSABLE, nothing fabricated", async () => {
    const d = makeDeps({ members: [], closureRows: CHAIN_SP1 });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.learners).toEqual([]);
    expect(v.classState).toBe("NOT_ASSESSABLE");
    expect(v.unlockPath).toEqual({ nodeId: SP1, code: "4CH1-S1-a-1", title: "Spec point 1" });
    expect(v.distribution).toEqual({
      ready: 0,
      atRisk: 0,
      notAssessable: 0,
      prereqBandCounts: { LOW: 0, DEVELOPING: 0, SECURE: 0 },
      atRiskByReason: {
        LOW_MASTERY_PREREQ: 0,
        ACTIVE_MISCONCEPTION_PREREQ: 0,
        LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ: 0,
      },
    });
    const issued = (d.sql as ReturnType<typeof fakeSql>).queries;
    expect(issued.filter((q) => q.includes("from skill_states")).length).toBe(0);
    expect(issued.filter((q) => q.includes("from misconception_states")).length).toBe(0);
  });
});

describe("foresights honesty — the learner level (plan §5, two-level honesty)", () => {
  test("class ASSESSABLE while a learner is NOT_ASSESSABLE — each level states only its own evidence", async () => {
    const d = makeDeps({ closureRows: CHAIN_SP1, skills: [skill(L2, SP1, 0.9)] });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.classState).toBe("ASSESSABLE_READY");
    const ada = v.learners.find((l) => l.displayName === "Ada")!;
    const ben = v.learners.find((l) => l.displayName === "Ben")!;
    const cy = v.learners.find((l) => l.displayName === "Cy")!;
    expect(ada.state).toBe("NOT_ASSESSABLE");
    expect(ada.reason).toBe("UNMEASURED_PREREQ");
    expect(ada.unmeasuredPrereqCodes).toEqual(["4CH1-S1-a-1"]);
    expect(ada.meanEffectiveMastery).toBeNull();
    expect(ben.state).toBe("READY");
    expect(cy.state).toBe("NOT_ASSESSABLE");
    // sort lock: READY (Ben) before NOT_ASSESSABLE (Ada, Cy) — names case-folded
    expect(v.learners[0]!.displayName).toBe("Ben");
    expect(v.learners.slice(1).map((l) => l.displayName)).toEqual(["Ada", "Cy"]);
    expect(v.distribution).toMatchObject({ ready: 1, notAssessable: 2 });
  });
});

describe("foresights evidence laws", () => {
  test("the T-C11 mirror: a CONCEPT depth-1 prereq projects onto its anchor SP (derived=true + concept codes)", async () => {
    const d = makeDeps({
      closureRows: [{ node_id: CONCEPT, depth: 1 }],
      anchorEdges: ANCHOR_C_ALPHA,
      skills: [skill(L1, SP1, 0.9)],
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.prerequisites.length).toBe(1);
    const cell = v.prerequisites[0]!;
    expect(cell.nodeId).toBe(SP1); // the CONCEPT consumed; the anchor SP classified
    expect(cell.derived).toBe(true);
    expect(cell.derivedViaConceptCodes).toEqual(["C-Alpha"]);
    expect(v.classState).toBe("ASSESSABLE_READY");
  });

  test("the decay anchor: EFFECTIVE mastery drives the band — raw 0.9 never leaks as SECURE", async () => {
    const d = makeDeps({
      closureRows: CHAIN_SP1,
      skills: [skill(L1, SP1, 0.9, 5, DECAY_200D)],
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    const cell = v.prerequisites[0]!;
    const expected = round4(eff(0.9, DECAY_200D));
    expect(expected).toBeLessThan(0.8); // the decay moved it out of SECURE
    expect(cell.meanEffectiveMastery).toBe(expected);
    expect(cell.masteryBand).toBe("DEVELOPING");
    expect(bandOf(0.9, ENGINE.decay)).toBe("SECURE"); // the RAW number WOULD have been SECURE
  });

  test("staleness relaxation: a 400d-old misconception below activeThreshold is NOT active, NOT counted", async () => {
    const d = makeDeps({
      closureRows: CHAIN_SP1,
      skills: [skill(L1, SP1, 0.9)],
      misconceptions: [misco(L1, 0.9, STALE_400D)],
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.prerequisites[0]!.learnersWithActiveMisconception).toBe(0);
    const ada = v.learners.find((l) => l.displayName === "Ada")!;
    expect(ada.state).toBe("READY"); // no weak, no ACTIVE misco
    expect(ada.miscoPrereqCodes).toEqual([]);
  });

  test("targetMeasured: evidence on the target flips the routing flag, the view still renders", async () => {
    const d = makeDeps({
      closureRows: CHAIN_SP1,
      skills: [skill(L1, SP1, 0.9), skill(L1, TGT, 0.7)],
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.targetMeasured).toBe(true);
    expect(v.classState).toBe("ASSESSABLE_READY");
  });

  test("the context chain: depth ≥ 2 rows ride as context with zero classification influence", async () => {
    const d = makeDeps({
      closureRows: [
        { node_id: SP1, depth: 1 },
        { node_id: SUB, depth: 2 },
      ],
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.3)], // SP1 weak → AT_RISK
      // SUB carries NO evidence: an UNMEASURED context row must NOT flip the state
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.classState).toBe("ASSESSABLE_AT_RISK"); // context unmeasured is irrelevant
    expect(v.contextChain.length).toBe(1);
    expect(v.contextChain[0]).toEqual({
      nodeId: SUB,
      code: "4CH1-S1-a",
      title: "Topic a",
      depth: 2,
      learnersMeasured: 0,
      meanEffectiveMastery: null,
      masteryBand: "UNMEASURED",
      lastPracticedAt: null, // v1.1: honest null — context rows disclose recency too
    });
  });
});

describe("foresights roster law (the independent-student rule, §9.4)", () => {
  test("a non-member's rows and a DISABLED member never move a single number", async () => {
    const rogue = [
      skill(L1, SP1, 0.9),
      skill(L2, SP1, 0.6),
      skill(L9, SP1, 0.0), // NON-member: must be invisible to every number
    ];
    const d1 = makeDeps({ closureRows: CHAIN_SP1, skills: rogue, rosterFilteredSkills: true });
    const v1 = await classForesights(d1 as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v1.learners.map((l) => l.displayName)).toEqual(["Ada", "Ben", "Cy"]); // Dee disabled, L9 absent
    const cell = v1.prerequisites[0]!;
    expect(cell.learnersMeasured).toBe(2);
    expect(cell.meanEffectiveMastery).toBe(round4((eff(0.9, ELEVEN_D) + eff(0.6, ELEVEN_D)) / 2));
    expect(cell.meanEffectiveMastery).not.toBe(round4((eff(0.9, ELEVEN_D) + eff(0.6, ELEVEN_D) + eff(0.0, ELEVEN_D)) / 3));
  });
});

describe("foresights batching + determinism (§9.1 + §11 posture)", () => {
  test("the batching law: ONE skill_states read, ≤1 misconception_states read, one per roster read", async () => {
    const d = makeDeps({
      closureRows: CHAIN_SP1,
      skills: [skill(L1, SP1, 0.9)],
      misconceptions: [misco(L1, 0.9)],
    });
    await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    const issued = (d.sql as ReturnType<typeof fakeSql>).queries;
    expect(issued.filter((q) => q.includes("from skill_states")).length).toBe(1);
    expect(issued.filter((q) => q.includes("from misconception_states")).length).toBe(1);
    expect(issued.filter((q) => q.includes("from class_members")).length).toBe(1);
    expect(issued.filter((q) => q.includes("from users")).length).toBe(1);
    expect(issued.filter((q) => q.includes("from tutor_topic_engagements")).length).toBe(0);
    expect(issued.filter((q) => q.includes("from review_schedules")).length).toBe(0);
    expect(issued.filter((q) => q.includes("from attempts")).length).toBe(0);
  });

  test("determinism: same inputs → byte-identical view (fixed clock)", async () => {
    const e: Evidence = {
      closureRows: CHAIN_SP1,
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.6)],
      misconceptions: [misco(L1, 0.9)],
    };
    const v1 = await classForesights(makeDeps(e) as never, TEACHER, CLASS_ID, ROOT, TGT);
    const v2 = await classForesights(makeDeps(e) as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(JSON.stringify(v1)).toBe(JSON.stringify(v2));
  });

  test("wire conformance: the view parses against the foresights/v1 zod contract", async () => {
    const d = makeDeps({
      closureRows: CHAIN_SP1,
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.6)],
      misconceptions: [misco(L1, 0.9)],
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(() => classForesightsViewSchema.parse(v)).not.toThrow();
  });
});

describe("foresights — the v1.1 amendment (ADR-CLASS-0003: context recency + reason breakdown)", () => {
  test("D1 recency: the cell carries the MOST RECENT roster last_practiced_at (max, not first-seen)", async () => {
    const d = makeDeps({
      closureRows: CHAIN_SP1,
      skills: [skill(L1, SP1, 0.9, 5, ELEVEN_D), skill(L2, SP1, 0.6, 5, FRESH)],
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    const cell = v.prerequisites[0]!;
    expect(cell.learnersMeasured).toBe(2);
    // FRESH (Sep 30) beats ELEVEN_D (Sep 20) — the max over the roster rows
    expect(cell.lastPracticedAt).toBe(new Date(FRESH).toISOString());
  });

  test("D1 honesty: an unmeasured cell carries lastPracticedAt null — no date fabricated", async () => {
    const d = makeDeps({ closureRows: [{ node_id: SP2, depth: 1 }] });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.prerequisites[0]!.learnersMeasured).toBe(0);
    expect(v.prerequisites[0]!.lastPracticedAt).toBeNull();
    expect(v.prerequisites[0]!.meanEffectiveMastery).toBeNull();
  });

  test("D1 context-only law: evidence on a depth-2 row discloses recency AND never moves the state", async () => {
    const d = makeDeps({
      closureRows: [
        { node_id: SP1, depth: 1 },
        { node_id: SUB, depth: 2 },
      ],
      skills: [
        skill(L1, SP1, 0.2),
        skill(L2, SP1, 0.3), // SP1 weak → the class is ASSESSABLE_AT_RISK
        skill(L1, SUB, 0.9, 5, STALE_400D), // context-row evidence — must NOT re-classify
      ],
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.classState).toBe("ASSESSABLE_AT_RISK"); // context evidence never classifies
    expect(v.contextChain[0]!.learnersMeasured).toBe(1);
    expect(v.contextChain[0]!.lastPracticedAt).toBe(new Date(STALE_400D).toISOString());
  });

  test("D2 breakdown: atRiskByReason folds the learner rows exactly, sum === distribution.atRisk", async () => {
    const d = makeDeps({
      closureRows: CHAIN_SP1,
      skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.3)],
      misconceptions: [misco(L1, 0.9)], // Ada: weak AND active → BOTH; Ben: weak only
    });
    const v = await classForesights(d as never, TEACHER, CLASS_ID, ROOT, TGT);
    expect(v.classState).toBe("ASSESSABLE_AT_RISK");
    const ada = v.learners.find((l) => l.displayName === "Ada")!;
    const ben = v.learners.find((l) => l.displayName === "Ben")!;
    expect(ada.reason).toBe("LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ");
    expect(ben.reason).toBe("LOW_MASTERY_PREREQ");
    expect(v.distribution.atRisk).toBe(2);
    expect(v.distribution.atRiskByReason).toEqual({
      LOW_MASTERY_PREREQ: 1,
      ACTIVE_MISCONCEPTION_PREREQ: 0,
      LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ: 1,
    });
    // the invariant, computed from the wire rows (never hand-counted)
    const sum = Object.values(v.distribution.atRiskByReason).reduce((a, n) => a + n, 0);
    expect(sum).toBe(v.distribution.atRisk);
  });
});

describe("foresights — ADR-CLASS-0002 C7 comprehension fixtures (the gate CK-12 never ran)", () => {
  test("each state renders its 'what to do' answer from the surface alone", async () => {
    // READY → assign T
    const ready = await classForesights(
      makeDeps({ closureRows: CHAIN_SP1, skills: [skill(L1, SP1, 0.9)] }) as never,
      TEACHER, CLASS_ID, ROOT, TGT,
    );
    expect(ready.headline).toContain("ready for Topic b");
    // AT_RISK → prereq remediation first, codes named
    const risk = await classForesights(
      makeDeps({ closureRows: CHAIN_SP1, skills: [skill(L1, SP1, 0.2), skill(L2, SP1, 0.6)] }) as never,
      TEACHER, CLASS_ID, ROOT, TGT,
    );
    expect(risk.headline).toContain("land hard");
    expect(risk.headline).toContain("4CH1-S1-a-1");
    // NOT_ASSESSABLE → the unlock path named
    const locked = await classForesights(
      makeDeps({ closureRows: [{ node_id: SP2, depth: 1 }] }) as never,
      TEACHER, CLASS_ID, ROOT, TGT,
    );
    expect(locked.headline).toContain("Assign 4CH1-S1-a-2 practice to unlock a prediction.");
    expect(locked.unlockPath!.code).toBe("4CH1-S1-a-2");
    // every state carries the C3 disclosure on the wire
    for (const v of [ready, risk, locked]) {
      expect(v.disclosure).toContain("readiness prior");
      expect(v.disclosure).toContain("not a measurement");
    }
  });
});
