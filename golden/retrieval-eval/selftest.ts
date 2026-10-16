// Selftest entrypoint — the anti-tautology device (GOLDEN_MASTER §5: a parity
// gate with a broken comparator is worse than no gate). Fixed vectors only:
// no corpus file, no network, no model, no database. Deterministic.
// Usage: bun run selftest.ts --selftest
//
// The fusion pins below run the REAL serving RRF (rrf.ts) against hand-derived
// decimals — 1/61 = 0.016393442622950821, 1/62 = 0.016129032258064516,
// 0.6/61 = 0.009836065573770492 — so a drifted fuse or a drifted metric
// cannot pass by re-deriving itself.
import { fuse, fuseWithPlanWeights } from "../../apps/api/src/services/tutor/rrf.ts";
import type { EvidenceItem, EvidenceSource } from "../../apps/api/src/services/tutor/evidence.ts";
import { cosine, evaluateRanking, aggregate, type RankingVerdict } from "./lib/metrics.ts";

const results: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean) => results.push([name, ok]);
const close = (a: number, b: number, eps = 1e-15) => Math.abs(a - b) <= eps;

/** A minimal grounded EvidenceItem (the fusion reads source + key only). */
function item(
  source: EvidenceSource,
  kind: "node" | "chunk",
  id: string,
): EvidenceItem {
  return {
    source,
    content: id,
    documentRowId: kind === "chunk" ? `row-${id}` : null,
    documentId: kind === "chunk" ? `doc-${id}` : null,
    documentVersion: kind === "chunk" ? 1 : null,
    chunkId: kind === "chunk" ? id : null,
    chunkIndex: kind === "chunk" ? 0 : null,
    nodeId: kind === "node" ? id : null,
    nodeCode: kind === "node" ? id : null,
    nodeType: kind === "node" ? "TOPIC" : null,
    nodeTitle: kind === "node" ? id : null,
    pageStart: null,
    pageEnd: null,
    elementIds: [],
    topicIds: [],
    retrievalScore: 1,
    fusedScore: 0,
    rerankScore: null,
  };
}

// --- fixed vectors: the metrics law ------------------------------------------

const rank1 = evaluateRanking(
  [
    { key: "x", grounds: ["b"] },
    { key: "y", grounds: [] },
    { key: "z", grounds: ["a"] },
  ],
  ["a", "b"],
  3,
);
check("metrics: full-list recall 2/2, mrr 1, hit1 1", rank1.recall === 1 && rank1.mrr === 1 && rank1.hit1 === 1);

const rank2 = evaluateRanking(
  [
    { key: "x", grounds: ["b"] },
    { key: "y", grounds: [] },
    { key: "z", grounds: ["a"] },
  ],
  ["a", "b"],
  2,
);
check("metrics: budget-2 recall 1/2, mrr 1", rank2.recall === 0.5 && rank2.mrr === 1);

const rank3 = evaluateRanking([{ key: "y", grounds: [] }], ["a", "b"], 1);
check("metrics: all-miss -> recall 0, mrr 0, hit1 0", rank3.recall === 0 && rank3.mrr === 0 && rank3.hit1 === 0);

const rank4 = evaluateRanking([{ key: "z", grounds: ["a"] }], ["a", "b", "c"], 1);
check("metrics: partial recall 1/3 (hand-computed)", close(rank4.recall, 1 / 3));

const rank5 = evaluateRanking([{ key: "x", grounds: ["a"] }], [], 3);
check("metrics: zero anchors -> the unmeasurable zeros", JSON.stringify(rank5) === JSON.stringify({ recall: 0, mrr: 0, hit1: 0, groundedAnchors: [] }));

const agg = aggregate("plan-v2", [rank1, rank3] as RankingVerdict[]);
check("metrics: aggregate means over 2 verdicts", agg.questionsEvaluated === 2 && close(agg.meanMrr, 0.5) && close(agg.meanHit1, 0.5));

// --- fixed vectors: cosine -----------------------------------------------------

check("cosine: orthogonal axes -> 0", cosine([1, 0], [0, 1]) === 0);
check("cosine: same direction -> 1", cosine([3, 0], [1, 0]) === 1);
check("cosine: 45 degrees -> 1/sqrt(2) (hand decimal)", close(cosine([1, 1], [1, 0]), 0.7071067811865476));
check("cosine: zero vector -> 0 (never NaN)", cosine([0, 0], [1, 0]) === 0);
check("cosine: length mismatch -> 0 (defensive)", cosine([1], [1, 0]) === 0);

// --- fixed vectors: the REAL fuse arithmetic -----------------------------------

// A: one KG list with the anchor at rank0; B: one vector list with the
// mark-scheme distractor leading and the anchor-chunk at rank1.
const kg = [item("KNOWLEDGE_NODE", "node", "anchor-node")];
const vec = [item("MARK_SCHEME", "chunk", "ms-chunk"), item("NOTE", "chunk", "note-chunk")];

const plan = fuseWithPlanWeights([kg, vec]);
check(
  "rrf(plan): anchor-node leads with 1.0/61 (hand decimal)",
  plan[0]!.nodeId === "anchor-node" && close(plan[0]!.fusedScore, 0.016393442622950821),
);
check(
  "rrf(plan): note-chunk second at 1.0/62 (hand decimal)",
  plan[1]!.chunkId === "note-chunk" && close(plan[1]!.fusedScore, 0.016129032258064516),
);
check(
  "rrf(plan): ms-chunk third at 0.6/61 (hand decimal)",
  plan[2]!.chunkId === "ms-chunk" && close(plan[2]!.fusedScore, 0.009836065573770492),
);

const uniform = fuse([kg, vec], { weightOf: () => 1.0 });
check(
  "rrf(uniform): ms-chunk leads with 1.0/61 — the q5 flip shape",
  uniform[0]!.chunkId === "ms-chunk" && close(uniform[0]!.fusedScore, 0.016393442622950821),
);
check(
  "rrf(uniform): note-chunk trails at 1.0/62 (behind the ordinal tiebreak pair)",
  uniform[2]!.chunkId === "note-chunk" && close(uniform[2]!.fusedScore, 0.016129032258064516),
);
check(
  "rrf(uniform): the exact 1/61 tie breaks on the source ordinal (MARK_SCHEME 0 < KNOWLEDGE_NODE 4)",
  uniform[0]!.chunkId === "ms-chunk" && uniform[1]!.nodeId === "anchor-node",
);

// The aggregated flip, fixed-vector form: uniform puts the distractor first
// (MRR 1/2 in this 2-candidate shape), plan-v2 repairs it (MRR 1).
const groundsOf = (key: string): string[] => (key === "anchor-node" || key === "note-chunk" ? ["anchor-topic"] : []);
const evalOf = (fused: EvidenceItem[]) =>
  evaluateRanking(
    fused.map((f) => ({ key: (f.nodeId ?? f.chunkId)!, grounds: groundsOf((f.nodeId ?? f.chunkId)!) })),
    ["anchor-topic"],
    3,
  );
check("ablation: plan repairs the flip (mrr 1)", evalOf(plan).mrr === 1);
check(
  "ablation: uniform carries the flip (mrr 1/2 in this 2-candidate shape; the corpus q5 carries 1/3 with its third candidate)",
  close(evalOf(uniform).mrr, 0.5),
);

// --- report --------------------------------------------------------------------

let failed = 0;
for (const [name, ok] of results) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} selftest vectors pass`);
process.exit(failed === 0 ? 0 : 1);
