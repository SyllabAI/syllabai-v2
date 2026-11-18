/**
 * T-TUTOR-AIM-P3 (DC10 §7.7): the served-evidence LEDGER — the deterministic
 * projection laws + the append-guard write shape + the retention sweep.
 *
 * THE LAWS PINNED HERE:
 *   - the projection is a PURE function of (evidence, aim): no clock, no
 *     reads, no LLM; the same ask state yields the same rows
 *   - the row taxonomy of record: surface tutor_answer, kind in
 *     {citation, correction, example, prereq_recap}
 *   - citations key on the KG node id (KG-grounded items) or the item's
 *     associated KG topics (chunk-backed items, chunk_id riding chunk_id);
 *     node-less items are not ledger-addressable and are SKIPPED
 *   - corrections map to NO chunk (the plan's own comment — chunk_id null)
 *   - dedupe by (specNodeId, chunkId, kind) — the ledger records WHAT was
 *     served, not how often it appeared
 *   - a refusal serves nothing (empty projection); an aim-less ask serves
 *     citations only
 *   - the write is a pure append keyed on the §22 turn; empty rows write
 *     NOTHING (no zero-row insert is ever sent)
 *   - retention of record: 180 days (the §12 open question 4, fixed at
 *     build time)
 */
import { describe, expect, test } from "bun:test";
import {
  appendServedEvidence,
  projectServedEvidence,
  purgeExpiredServedEvidence,
  SERVED_EVIDENCE_RETENTION_DAYS,
  type ServedEvidenceRow,
} from "../../src/services/tutor/served-evidence";
import type { AimBrief } from "../../src/services/tutor/context";
import {
  evidenceFromChunk,
  evidenceFromNode,
  withTopicIds,
  type EvidenceItem,
} from "../../src/services/tutor/evidence";

const LEARNER = "bb000000-0000-4000-8000-000000000001";
const SESSION = "cc000000-0000-4000-8000-000000000001";
const NODE_A = "aa000000-0000-4000-8000-00000000000a";
const NODE_B = "aa000000-0000-4000-8000-00000000000b";
const NODE_C = "aa000000-0000-4000-8000-00000000000c";
const CHUNK_1 = "ee000000-0000-4000-8000-000000000001";
const DOC_ROW = "dd000000-0000-4000-8000-000000000001";

const aim = (over: Partial<AimBrief>): AimBrief => ({
  correction: null,
  provenPrerequisites: [],
  strongAreas: [],
  decayDue: false,
  ...over,
});

const chunkItem = (topicIds: string[], chunkId: string = CHUNK_1): EvidenceItem =>
  withTopicIds(
    evidenceFromChunk({
      documentRowId: DOC_ROW,
      documentId: "doc-1",
      documentVersion: 1,
      chunkId,
      chunkIndex: 0,
      kind: "MARK_SCHEME",
      content: "mark scheme content",
      pageStart: 6,
      pageEnd: null,
      elementIds: null,
      embeddingModel: null,
      cosine: 0.7,
    }),
    topicIds,
  );

const nodeItem = (nodeId: string): EvidenceItem =>
  evidenceFromNode({
    nodeId,
    code: "4CH1-U1-T2",
    title: "Projectile motion",
    description: "the node description",
    nodeType: "TOPIC",
    matchScore: 0.9,
  });

describe("projectServedEvidence (DC10 §7.7 projection laws)", () => {
  test("a refusal serves nothing (the empty projection)", () => {
    expect(projectServedEvidence([], null)).toEqual([]);
    expect(projectServedEvidence([nodeItem(NODE_A)], null).length).toBe(1);
  });

  test("KG-grounded evidence cites its node (chunk_id null)", () => {
    const rows = projectServedEvidence([nodeItem(NODE_A)], null);
    expect(rows).toEqual([{ specNodeId: NODE_A, chunkId: null, kind: "citation" }]);
  });

  test("chunk-backed evidence keys on its associated KG topics (chunk_id rides)", () => {
    const rows = projectServedEvidence([chunkItem([NODE_A, NODE_B])], null);
    expect(rows).toEqual([
      { specNodeId: NODE_A, chunkId: CHUNK_1, kind: "citation" },
      { specNodeId: NODE_B, chunkId: CHUNK_1, kind: "citation" },
    ]);
  });

  test("a node-less chunk item is not ledger-addressable — skipped (the honest residual)", () => {
    const item = chunkItem([]);
    const rows = projectServedEvidence([item], null);
    expect(rows).toEqual([]);
  });

  test("duplicate citations of the same node dedupe to ONE observation", () => {
    const rows = projectServedEvidence([nodeItem(NODE_A), nodeItem(NODE_A)], null);
    expect(rows).toEqual([{ specNodeId: NODE_A, chunkId: null, kind: "citation" }]);
  });

  test("the same node from a chunk AND a KG item are two observations (different chunk_id)", () => {
    const rows = projectServedEvidence([nodeItem(NODE_A), chunkItem([NODE_A])], null);
    expect(rows).toEqual([
      { specNodeId: NODE_A, chunkId: null, kind: "citation" },
      { specNodeId: NODE_A, chunkId: CHUNK_1, kind: "citation" },
    ]);
  });

  test("the correction maps to NO chunk (the plan's own comment) and rides its node", () => {
    const rows = projectServedEvidence(
      [],
      aim({ correction: { nodeId: NODE_A, title: "particles get bigger" } }),
    );
    expect(rows).toEqual([{ specNodeId: NODE_A, chunkId: null, kind: "correction" }]);
  });

  test("prereq recaps and example targets ride their kinds", () => {
    const rows = projectServedEvidence(
      [],
      aim({
        provenPrerequisites: [{ nodeId: NODE_B, title: "vectors" }],
        strongAreas: [{ nodeId: NODE_C, title: "kinematics" }],
      }),
    );
    expect(rows).toEqual([
      { specNodeId: NODE_B, chunkId: null, kind: "prereq_recap" },
      { specNodeId: NODE_C, chunkId: null, kind: "example" },
    ]);
  });

  test("the order of record: citations (evidence order), then correction, recaps, examples", () => {
    const rows = projectServedEvidence(
      [chunkItem([NODE_A])],
      aim({
        correction: { nodeId: NODE_B, title: "misconception" },
        provenPrerequisites: [{ nodeId: NODE_C, title: "prereq" }],
        strongAreas: [{ nodeId: NODE_A, title: "strong" }],
      }),
    );
    expect(rows.map((r) => r.kind)).toEqual(["citation", "correction", "prereq_recap", "example"]);
  });

  test("the projection is deterministic: the same state, the same rows", () => {
    const input = { evidence: [chunkItem([NODE_A]), nodeItem(NODE_B)], aim: aim({ decayDue: true }) };
    expect(projectServedEvidence(input.evidence, input.aim)).toEqual(
      projectServedEvidence(input.evidence, input.aim),
    );
  });
});

// ── the append-guard write shape ────────────────────────────────────────────

interface CapturedQuery {
  strings: TemplateStringsArray;
  params: unknown[];
}

function captureSql(): { sql: import("../../src/services/tutor/sql").SqlFn; queries: CapturedQuery[] } {
  const queries: CapturedQuery[] = [];
  const sql = ((strings: TemplateStringsArray, ...params: unknown[]) => {
    queries.push({ strings, params });
    return Promise.resolve([]);
  }) as unknown as import("../../src/services/tutor/sql").SqlFn;
  return { sql, queries };
}

const clock = () => ({
  now: () => new Date("2026-11-18T00:00:00Z"),
});

describe("appendServedEvidence (the append-guard write)", () => {
  test("empty rows write NOTHING (no zero-row insert is ever sent)", async () => {
    const { sql, queries } = captureSql();
    await appendServedEvidence(sql, clock(), {
      learnerId: LEARNER,
      sessionId: SESSION,
      turnId: 2,
      rows: [],
    });
    expect(queries.length).toBe(0);
  });

  test("one pure-append insert per row, keyed on the §22 turn, surface tutor_answer", async () => {
    const { sql, queries } = captureSql();
    const rows: ServedEvidenceRow[] = [
      { specNodeId: NODE_A, chunkId: null, kind: "citation" },
      { specNodeId: NODE_B, chunkId: CHUNK_1, kind: "citation" },
      { specNodeId: NODE_C, chunkId: null, kind: "correction" },
    ];
    await appendServedEvidence(sql, clock(), {
      learnerId: LEARNER,
      sessionId: SESSION,
      turnId: 2,
      rows,
    });
    expect(queries.length).toBe(3);
    for (const q of queries) {
      const text = q.strings.join(" ");
      expect(text).toContain("tutor_served_evidence");
      // the identity rides the bound params (the tagged template's holes —
      // the literal text carries the column names only)
      expect(q.params).toContain(LEARNER);
      expect(q.params).toContain(SESSION);
      expect(q.params).toContain(2);
      expect(q.params).toContain("tutor_answer");
    }
    // the kind rides per-row: citations first, then the correction
    expect(queries[0]!.params).toContain("citation");
    expect(queries[1]!.params).toContain("citation");
    expect(queries[2]!.params).toContain("correction");
  });
});

describe("purgeExpiredServedEvidence (the retention sweep of record)", () => {
  test("the retention window of record is 180 days (the §12 open question 4, fixed)", () => {
    expect(SERVED_EVIDENCE_RETENTION_DAYS).toBe(180);
  });

  test("the sweep deletes strictly older than the cutoff (now − 180 days)", async () => {
    let captured: unknown[] = [];
    const sql = ((_strings: TemplateStringsArray, ...params: unknown[]) => {
      captured = params;
      return Promise.resolve({ rowCount: 4 });
    }) as unknown as import("../../src/services/tutor/sql").SqlFn;
    const deleted = await purgeExpiredServedEvidence(sql, clock());
    expect(deleted).toBe(4);
    const cutoff = captured.find((p) => p instanceof Date) as Date;
    // 2026-11-18 minus 180 days (the retention window of record)
    expect(cutoff.toISOString()).toBe("2026-05-22T00:00:00.000Z");
  });
});
