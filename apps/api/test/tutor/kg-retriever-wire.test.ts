import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import { buildSqlKgGraph } from "../../src/services/tutor/kg-retriever";

/**
 * T-MIG-094 — construction pins at the fakeSql adapter boundary for the
 * kg-retriever IN lists (the T-MIG-093 class, R13 pin pattern verbatim).
 *
 * The law: a bound JS array is a SINGLE wire value on both driver adapters —
 * `where x in ${ids}` renders as `x in $1` and the Neon WebSocket wire
 * answers with a syntax/type error (the 500 class the T-MIG-092 run-002 L06
 * golden-verify caught live). Every id must ride its own scalar $n; the
 * commas are template text. fakeSql joins the template strings with "?", so
 * the per-element construction shows up as "(?)" / "(?, ?)" / "(?, ?, ?)" —
 * and the responder receives ids.length scalar params, never an array.
 *
 * SCOPE HONESTY (the card's gate): these pins prove the CONSTRUCTION law
 * only — fakeSql cannot expose driver binding semantics. The card's
 * real-wire gate (the family golden-verify that first exercises these legs
 * must run on REAL Neon wire) remains owed by the flip band that mounts
 * Knowledge/ClassKG/TeacherConceptGraph (T-MIG-094 run-001-claim
 * disclosure; T-MIG-093 deploy-run-001 precedent).
 */

// ── recording fakeSql (canned rows + param capture) ─────────────────────────

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

const TOPICS = ["t-aaaa", "t-bbbb", "t-cccc"];

const structureRow: Row = { id: "n1", code: "1.1", title: "Integers", validation_status: "VALIDATED" };
const edgeRow = (origin: string, node: string, depth: number): Row => ({
  origin_id: origin,
  node_id: node,
  depth: String(depth),
});
const nodeRow = (id: string, title: string): Row => ({ id, title });

describe("T-MIG-094 construction pins — kg-retriever IN lists ride scalar params (the 093 law)", () => {
  test("prerequisiteChains: the recursive-CTE IN list binds every topic id as its own scalar", async () => {
    const sql = recordingSql({
      "from prereq group by origin_id": [edgeRow("t-aaaa", "t-bbbb", 1)],
      "select id, title from knowledge_nodes where id in (?)": [nodeRow("t-bbbb", "Fractions")],
    });
    const port = buildSqlKgGraph(sql);
    const chains = await port.prerequisiteChains(TOPICS);
    expect(chains.size).toBe(1);

    // leg 1: the recursive CTE — per-element construction, no array crossed
    const cte = sql.seen.find((q) => q.text.includes("with recursive prereq as"))!;
    expect(cte).toBeDefined();
    expect(cte.text).toContain("where e.source_node_id in (?, ?, ?)");
    expect(cte.params).toHaveLength(3);
    expect(cte.params.every((p) => !Array.isArray(p))).toBe(true);
    expect(cte.params).toEqual(TOPICS);

    // leg 2: the title back-fill — same law at dynamic length
    const titles = sql.seen.find((q) => q.text.includes("select id, title from knowledge_nodes"))!;
    expect(titles).toBeDefined();
    expect(titles.text).toContain("where id in (?)");
    expect(titles.params).toHaveLength(1);
    expect(Array.isArray(titles.params[0])).toBe(false);
    expect(titles.params[0]).toBe("t-bbbb");
  });

  test("prerequisiteChains: two-element list renders (?, ?) — construction grows per element, not per query", async () => {
    const sql = recordingSql({
      "from prereq group by origin_id": [
        edgeRow("t-aaaa", "t-bbbb", 1),
        edgeRow("t-aaaa", "t-cccc", 2),
      ],
      "select id, title from knowledge_nodes where id in (?)": [
        nodeRow("t-bbbb", "Fractions"),
        nodeRow("t-cccc", "Decimals"),
      ],
    });
    const port = buildSqlKgGraph(sql);
    const chains = await port.prerequisiteChains(["t-aaaa", "t-bbbb"]);
    expect(chains.size).toBe(1);
    const cte = sql.seen.find((q) => q.text.includes("with recursive prereq as"))!;
    expect(cte.text).toContain("where e.source_node_id in (?, ?)");
    expect(cte.params).toEqual(["t-aaaa", "t-bbbb"]);
    const titles = sql.seen.find((q) => q.text.includes("select id, title from knowledge_nodes"))!;
    expect(titles.text).toContain("where id in (?, ?)");
    expect(titles.params).toHaveLength(2);
  });

  test("misconceptionsForTopics: the MISCONCEPTION_OF IN list binds per element", async () => {
    const sql = recordingSql({
      "where e.relation_type = 'MISCONCEPTION_OF'": [
        { topic_id: "t-aaaa", id: "m1", title: "sign flip" },
      ],
    });
    const port = buildSqlKgGraph(sql);
    const m = await port.misconceptionsForTopics(TOPICS);
    expect(m.size).toBe(1);
    const leg = sql.seen.find((q) => q.text.includes("MISCONCEPTION_OF"))!;
    expect(leg).toBeDefined();
    expect(leg.text).toContain("and e.target_node_id in (?, ?, ?)");
    expect(leg.params).toHaveLength(3);
    expect(leg.params.every((p) => !Array.isArray(p))).toBe(true);
    expect(leg.params).toEqual(TOPICS);
  });

  test("empty-list guards never reach the wire (the 093 flip-law corollary)", async () => {
    const sql = recordingSql({});
    const port = buildSqlKgGraph(sql);
    expect((await port.prerequisiteChains([])).size).toBe(0);
    expect((await port.misconceptionsForTopics([])).size).toBe(0);
    expect(sql.seen).toHaveLength(0);
  });

  test("structureNodes: no IN list — the unflagged leg stays a plain template (zero drift)", async () => {
    const sql = recordingSql({ "from knowledge_nodes": [structureRow] });
    const port = buildSqlKgGraph(sql);
    const rows = await port.structureNodes();
    expect(rows).toHaveLength(1);
    const leg = sql.seen[0]!;
    expect(leg.text).toContain("node_type in ('SUBJECT', 'UNIT', 'TOPIC', 'SUBTOPIC')");
    expect(leg.params).toHaveLength(0);
  });
});
