/**
 * TUTOR-REPAIR (trace 1a15a472c9c07531) — the per-learner scope selector
 * pins. The live outage of 10-20/21: the 4MA1/4MB1 paper-bank wave
 * (T-MIG-136/138) made ≥2 ACTIVE curricula own serving surface, the global
 * single-owner test started returning null for EVERY courseRef-less ask,
 * and the legacy /tutor entry refused deterministically. The repair lands
 * the stage-2 selector the frozen header reserved learnerId for: the
 * learner's own subject footprint (explicit FK tables only) nominates the
 * candidate curricula, then the SAME singleOwnerScope ownership test
 * decides — fail-closed preserved on every ambiguous outcome.
 *
 * The fake routes on the resolver's own query-text fragments (the
 * stubbed-sql doctrine — query-text pinning, params asserted where they
 * carry law): global ACTIVE list, per-version subject lists, the validated-
 * structure / paper-surface existence probes, the DOWN subtree CTE, the
 * three footprint anchor reads, and the new UP ancestry CTE.
 */
import { describe, expect, test } from "bun:test";
import { CurriculumScopeResolver } from "../../src/services/content/scope";
import type { SqlFn } from "../../src/services/identity/users";

type Row = Record<string, unknown>;

const CV_A = { id: "11111111-1111-1111-1111-111111111111", code: "4CH1-2017" };
const CV_B = { id: "22222222-2222-2222-2222-222222222222", code: "4MA1-2016" };
const ROOT_A = "aaaaaaaa-0000-0000-0000-000000000000";
const ROOT_B = "bbbbbbbb-0000-0000-0000-000000000000";
const LEARNER = "99999999-9999-9999-9999-999999999999";

interface SqlOptions {
  activeVersions: Row[];
  subjectsByVersion: Record<string, Row[]>;
  /** the subject roots whose subtree carries a VALIDATED structure — the
   *  exists probe intersects its subtree param with this set. */
  validatedRoots: string[];
  paperSurface: boolean;
  anchorsByTable: Record<string, Row[]>;
  ancestry: Row[];
  calls: string[];
}

function resolverSql(opts: SqlOptions): SqlFn {
  return (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?");
    opts.calls.push(text);
    if (text.includes("WITH RECURSIVE ancestry")) return opts.ancestry;
    if (text.includes("from tutor_topic_engagements")) return opts.anchorsByTable["engagements"] ?? [];
    if (text.includes("from skill_states")) return opts.anchorsByTable["skill_states"] ?? [];
    if (text.includes("from struggle_inferences")) return opts.anchorsByTable["struggle"] ?? [];
    if (text.includes("WITH RECURSIVE subtree")) {
      const rootId = params[0] as string;
      return [{ id: rootId }, { id: `${rootId}-child` }];
    }
    if (text.includes("select exists") && text.includes("from knowledge_nodes")) {
      const subtree = params[0] as string[];
      return [{ present: subtree.some((id) => opts.validatedRoots.includes(id)) }];
    }
    if (text.includes("from exam_papers")) return [{ present: opts.paperSurface }];
    if (text.includes("from subjects")) {
      return opts.subjectsByVersion[params[0] as string] ?? [];
    }
    if (text.includes("from curriculum_versions")) return opts.activeVersions;
    return [];
  }) as unknown as SqlFn;
}

/** The default two-curriculum world where BOTH versions own surface —
 *  the post-T-MIG-136/138 live shape that broke the global path. */
function bothOwn(opts?: Partial<SqlOptions>): SqlOptions {
  return {
    activeVersions: [CV_A, CV_B],
    subjectsByVersion: {
      [CV_A.id]: [{ id: "sub-a", knowledge_node_id: ROOT_A }],
      [CV_B.id]: [{ id: "sub-b", knowledge_node_id: ROOT_B }],
    },
    validatedRoots: [ROOT_A, ROOT_B],
    paperSurface: false,
    anchorsByTable: {},
    ancestry: [],
    calls: [],
    ...opts,
  };
}

function fragmentCount(calls: string[], fragment: string): number {
  return calls.filter((c) => c.includes(fragment)).length;
}

describe("CurriculumScopeResolver stage 2 — the per-learner subject selector", () => {
  test("stage 1 wins: a single global owner resolves learner-independent, zero footprint reads", async () => {
    // CV_B owns nothing (no validated structure, no papers) → the global
    // single-owner test succeeds on CV_A
    const opts = bothOwn({ validatedRoots: [ROOT_A] });
    const resolver = new CurriculumScopeResolver(resolverSql(opts));
    const scope = await resolver.resolveActive(LEARNER);
    expect(scope).not.toBeNull();
    expect(scope!.code).toBe("4CH1-2017");
    expect(scope!.curriculumVersionId).toBe(CV_A.id);
    expect(scope!.surface.size).toBeGreaterThan(0);
    // the footprint tables were never consulted
    expect(fragmentCount(opts.calls, "from tutor_topic_engagements")).toBe(0);
    expect(fragmentCount(opts.calls, "from skill_states")).toBe(0);
    expect(fragmentCount(opts.calls, "from struggle_inferences")).toBe(0);
  });

  test("the repair: ≥2 global owners + a learner anchored to one subject → that subject's scope", async () => {
    const opts = bothOwn({
      anchorsByTable: { engagements: [{ node_id: "eeeeeeee-0000-0000-0000-000000000000" }] },
      ancestry: [{ id: CV_A.id, code: CV_A.code, created_at: "2026-01-01T00:00:00Z" }],
    });
    const resolver = new CurriculumScopeResolver(resolverSql(opts));
    const scope = await resolver.resolveActive(LEARNER);
    expect(scope).not.toBeNull();
    expect(scope!.code).toBe("4CH1-2017");
    // the anchors reached the ancestry CTE, and the learner's single
    // candidate ran the SAME ownership test (its subject list re-read)
    expect(fragmentCount(opts.calls, "WITH RECURSIVE ancestry")).toBe(1);
    expect(fragmentCount(opts.calls, "WITH RECURSIVE subtree")).toBeGreaterThan(0);
  });

  test("any one footprint table suffices: skill_states alone nominates the candidate", async () => {
    const opts = bothOwn({
      anchorsByTable: { skill_states: [{ node_id: "ssssssss-0000-0000-0000-000000000000" }] },
      ancestry: [{ id: CV_A.id, code: CV_A.code, created_at: "2026-01-01T00:00:00Z" }],
    });
    const resolver = new CurriculumScopeResolver(resolverSql(opts));
    const scope = await resolver.resolveActive(LEARNER);
    expect(scope).not.toBeNull();
    expect(scope!.code).toBe("4CH1-2017");
  });

  test("a split footprint (two subjects) still fails closed — null, never cross-corpus", async () => {
    const opts = bothOwn({
      anchorsByTable: {
        engagements: [{ node_id: "eeeeeeee-0000-0000-0000-000000000000" }],
        struggle: [{ node_id: "dddddddd-0000-0000-0000-000000000000" }],
      },
      ancestry: [
        { id: CV_A.id, code: CV_A.code, created_at: "2026-01-02T00:00:00Z" },
        { id: CV_B.id, code: CV_B.code, created_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const resolver = new CurriculumScopeResolver(resolverSql(opts));
    const scope = await resolver.resolveActive(LEARNER);
    expect(scope).toBeNull();
  });

  test("no footprint → no nomination → null (the cold-start refusal), ancestry never queried", async () => {
    const opts = bothOwn();
    const resolver = new CurriculumScopeResolver(resolverSql(opts));
    const scope = await resolver.resolveActive(LEARNER);
    expect(scope).toBeNull();
    expect(fragmentCount(opts.calls, "WITH RECURSIVE ancestry")).toBe(0);
  });

  test("a null learnerId keeps the pre-selector behavior exactly (anonymous, bank-bands surface)", async () => {
    const opts = bothOwn();
    const resolver = new CurriculumScopeResolver(resolverSql(opts));
    const scope = await resolver.resolveActive(null);
    expect(scope).toBeNull();
    expect(fragmentCount(opts.calls, "from tutor_topic_engagements")).toBe(0);
    expect(fragmentCount(opts.calls, "from skill_states")).toBe(0);
    expect(fragmentCount(opts.calls, "from struggle_inferences")).toBe(0);
  });

  test("anchors with no subject-root ancestry nominate nothing → null", async () => {
    const opts = bothOwn({
      anchorsByTable: { engagements: [{ node_id: "eeeeeeee-0000-0000-0000-000000000000" }] },
      ancestry: [],
    });
    const resolver = new CurriculumScopeResolver(resolverSql(opts));
    const scope = await resolver.resolveActive(LEARNER);
    expect(scope).toBeNull();
  });

  test("a learner candidate that lost its surface is filtered by the SAME ownership test", async () => {
    // the learner is anchored to BOTH versions' trees, but CV_B's subject
    // list carries a null KG root and no papers → only CV_A owns → serves
    const opts = bothOwn({
      anchorsByTable: { engagements: [{ node_id: "eeeeeeee-0000-0000-0000-000000000000" }] },
      ancestry: [
        { id: CV_A.id, code: CV_A.code, created_at: "2026-01-02T00:00:00Z" },
        { id: CV_B.id, code: CV_B.code, created_at: "2026-01-01T00:00:00Z" },
      ],
    });
    // re-route CV_B's ownsSurface probes to empty AFTER construction is
    // impossible with the shared fake — so express it directly: the fake
    // honours validatedStructure per test, and the ownership distinction
    // is CV_B's subject list going root-less HERE
    opts.subjectsByVersion[CV_B.id] = [{ id: "sub-b", knowledge_node_id: null }];
    const resolver = new CurriculumScopeResolver(resolverSql(opts));
    const scope = await resolver.resolveActive(LEARNER);
    expect(scope).not.toBeNull();
    expect(scope!.code).toBe("4CH1-2017");
  });
});
