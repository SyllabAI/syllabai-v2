import { describe, expect, test } from "bun:test";

import {
  buildSpecBoostIndex,
  specBoostSet,
  specBoostWeight,
} from "../../src/services/tutor/spec-boost";
import { evidenceFromChunk, evidenceFromNode, type EvidenceItem } from "../../src/services/tutor/evidence";
import { fuseWithPlanWeights } from "../../src/services/tutor/rrf";

/**
 * T-MIG-133 band 133d (r0) — the spec-scoped fusion boost gates.
 *
 * THE BOOST LAW of record: a TEXTBOOK evidence item whose chunk spec_codes
 * intersect the ask's intent spec-point set fuses at the anchor tier (1.0);
 * every other weight is byte-identical to the frozen plan map (TEXTBOOK
 * otherwise 0.7). No intent topics or no index ⇒ exact passthrough.
 */

const SP = [
  { officialCode: "1.1", sectionCode: "4CH1-S1", subsectionCode: "4CH1-S1-a" },
  { officialCode: "1.2", sectionCode: "4CH1-S1", subsectionCode: "4CH1-S1-a" },
  { officialCode: "2.34", sectionCode: "4CH1-S3", subsectionCode: "4CH1-S3-b" },
  { officialCode: "2.40C", sectionCode: "4CH1-S3", subsectionCode: "4CH1-S3-b" },
];

const bookItem = (specCodes: string[]): EvidenceItem =>
  evidenceFromChunk({
    documentRowId: "row-1",
    documentId: "doc-1",
    documentVersion: 1,
    chunkId: "chunk-1",
    chunkIndex: 0,
    kind: "TEXTBOOK",
    content: "states of matter",
    pageStart: 3,
    pageEnd: 4,
    elementIds: [],
    embeddingModel: "gemini-embedding-001",
    cosine: 0.81,
    specCodes,
  });

describe("133d spec-boost index (the concept-graph bridge of record)", () => {
  test("both parent spaces key each official code", () => {
    const index = buildSpecBoostIndex(SP);
    // the subsection space (the KG topic nodes' code space — the bank
    // discriminator's '4CH1-S3-b')
    expect([...(index.get("4CH1-S3-b") ?? [])].sort()).toEqual(["2.34", "2.40C"]);
    // the section space (unit-level matches)
    expect([...(index.get("4CH1-S3") ?? [])].sort()).toEqual(["2.34", "2.40C"]);
    // an unmatched parent resolves to nothing (never throws)
    expect(index.get("WCH11-T9")).toBeUndefined();
  });

  test("specBoostSet unions the matched topics' official codes; empty inputs stay empty", () => {
    const index = buildSpecBoostIndex(SP);
    const set = specBoostSet(index, ["4CH1-S1-a", "4CH1-S3-b"]);
    expect(set.has("1.1")).toBe(true);
    expect(set.has("2.40C")).toBe(true);
    expect(set.size).toBe(4);
    // no index (null — the explicit-disable posture) ⇒ empty
    expect(specBoostSet(null, ["4CH1-S1-a"]).size).toBe(0);
    // no intent topics ⇒ empty (the passthrough law)
    expect(specBoostSet(index, []).size).toBe(0);
    // matched topics with no snapshot presence ⇒ empty
    expect(specBoostSet(index, ["WCH11-T1"]).size).toBe(0);
  });
});

describe("133d spec-boost weight law (the anchor-tier lift)", () => {
  test("a TEXTBOOK item with an intersecting spec code fuses at 1.0", () => {
    const set = specBoostSet(buildSpecBoostIndex(SP), ["4CH1-S3-b"]);
    expect(specBoostWeight(set, bookItem(["2.40C"]), 0.7)).toBe(1.0);
  });

  test("a TEXTBOOK item without an intersecting code stays at the plan weight (0.7)", () => {
    const set = specBoostSet(buildSpecBoostIndex(SP), ["4CH1-S3-b"]);
    expect(specBoostWeight(set, bookItem(["5.2"]), 0.7)).toBe(0.7);
    expect(specBoostWeight(set, bookItem([]), 0.7)).toBe(0.7);
  });

  test("non-TEXTBOOK sources pass through byte-identically (the paper family untouched)", () => {
    const set = specBoostSet(buildSpecBoostIndex(SP), ["4CH1-S3-b"]);
    const qp = evidenceFromChunk({
      documentRowId: "row-2",
      documentId: "doc-2",
      documentVersion: 1,
      chunkId: "chunk-2",
      chunkIndex: 0,
      kind: "QUESTION_PAPER",
      content: "qp chunk",
      pageStart: 6,
      pageEnd: null,
      elementIds: [],
      embeddingModel: "gemini-embedding-001",
      cosine: 0.7,
      specCodes: ["2.40C"], // a spec-bearing paper chunk — still 0.8, never lifted
    });
    expect(specBoostWeight(set, qp, 0.8)).toBe(0.8);
    const kg = evidenceFromNode({
      nodeId: "n1",
      code: "4CH1-S3-b",
      nodeType: "TOPIC",
      title: "Rates of reaction",
      description: null,
      matchScore: 0.9,
    });
    expect(specBoostWeight(set, kg, 1.0)).toBe(1.0);
  });

  test("an empty boost set is an exact passthrough (the no-intent law)", () => {
    expect(specBoostWeight(new Set(), bookItem(["2.40C"]), 0.7)).toBe(0.7);
  });

  test("fusion-level effect: the boosted item outranks its unboosted twin at equal ranks", () => {
    const set = specBoostSet(buildSpecBoostIndex(SP), ["4CH1-S3-b"]);
    const a = bookItem(["2.40C"]); // boosted (1.0)
    const b = bookItem(["9.9"]); // unboosted (0.7)
    const a2 = { ...a, chunkId: "chunk-a" };
    const b2 = { ...b, chunkId: "chunk-b" };
    // reverse order: the unboosted item rides rank 0, the boosted rank 1
    const fused = fuseWithPlanWeights([[b2, a2]], {
      weightDecorator: (item, w) => specBoostWeight(set, item, w),
    });
    // 1/(60+1)*0.7 vs 1/(60+2)*1.0 → the boosted contribution wins
    expect(fused[0]?.chunkId).toBe("chunk-a");
    // and with the decorator ABSENT the frozen order stands (rank 0 wins)
    const plain = fuseWithPlanWeights([[b2, a2]]);
    expect(plain[0]?.chunkId).toBe("chunk-b");
  });
});
