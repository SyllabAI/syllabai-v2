import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import { searchServingEligible, diagnoseEmpty } from "../../src/services/content/retrieval";

/**
 * T-OPS-PLANE-001 run-004 — the kind-fold transport pin (latent-bug repair):
 * the kind filter MUST ride the SQL TEXT, never a bound param. A ${} slot
 * binds — the pre-repair code rendered $n between the scope EXISTS and the
 * ORDER BY on every kind-filtered search (GET /documents/search?kind=…),
 * a guaranteed Postgres syntax error → 500. The ported SQL text is
 * unchanged by the repair; these pins guard the transport forever.
 */

type Row = Record<string, unknown>;

function recordingSql(responses: Record<string, Row[]>) {
  const seen: Array<{ text: string; params: unknown[] }> = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join("?")
      .replace(/\s+/g, " ")
      .trim();
    seen.push({ text, params: [...params] });
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) return responses[key];
    }
    return [];
  }) as unknown as SqlFn & { seen: Array<{ text: string; params: unknown[] }> };
  fn.seen = seen;
  return fn;
}

const VECTOR = Array.from({ length: 768 }, (_, i) => (i % 3) / 30);

describe("content retrieval kind fold (run-004 latent-bug repair)", () => {
  test("kind-filtered search folds the kind as TEXT (never a param)", async () => {
    const sql = recordingSql({ "from document_chunks c": [] });
    await searchServingEligible(sql, VECTOR, "MARK_SCHEME", "cv-1", 10);
    const q = sql.seen[0]!;
    expect(q.text).toContain("and d.kind = 'MARK_SCHEME'"); // text, right position
    expect(q.text).toContain("order by c.embedding <=> ?"); // ORDER BY follows the fold
    // params: vector literal, embed_rev, cv ×2, vector literal, limit — the
    // kind is NOT among them (6 params, not 7)
    expect(q.params).toHaveLength(6);
    expect(q.params).not.toContain("MARK_SCHEME");
    expect(q.params.filter((p) => p === "cv-1")).toHaveLength(2);
  });

  test("kindless search is unchanged (no fold text, same param count)", async () => {
    const sql = recordingSql({ "from document_chunks c": [] });
    await searchServingEligible(sql, VECTOR, null, "cv-1", 10);
    const q = sql.seen[0]!;
    expect(q.text).not.toContain("and d.kind");
    expect(q.params).toHaveLength(6);
  });

  test("diagnoseEmpty folds the kind as TEXT in both funnel queries", async () => {
    const sql = recordingSql({
      "count(*) as chunks_in_scope": [{ chunks_in_scope: 1, embedded_in_scope: 1, in_scope_at_rev: 1 }],
      "count(*) as eligible": [{ eligible: 1 }],
    });
    await diagnoseEmpty(sql, "QUESTION_PAPER", "cv-1");
    expect(sql.seen).toHaveLength(2);
    for (const q of sql.seen) {
      expect(q.text).toContain("and d.kind = 'QUESTION_PAPER'");
      expect(q.params).not.toContain("QUESTION_PAPER"); // text, never a param
      expect(q.params.filter((p) => p === "cv-1")).toHaveLength(2);
    }
    expect(sql.seen[0]!.params[0]).toBe(2); // CURRENT_EMBED_REV stays bound
  });
});
