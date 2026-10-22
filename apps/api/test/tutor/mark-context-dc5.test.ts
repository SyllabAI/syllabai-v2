/**
 * DC-5 consume-seam tests — the materialised surface rides the DC-1
 * mark-context payload (prereg docs/DC5-CONFORMANCE-LINT-PLAN.md §4.3):
 *   (c) Drift pin — the loader reads the LATEST scheme's materialised rows
 *       (the resolveScheme law), so a scheme bump flips the set atomically;
 *   the fail-open law — an alternatives read error leaves the payload
 *   without surfaces (the lint's Rule B passes through, R-DC5-4).
 * Harness: the tutor-core fakeSql pattern (substring-keyed responses).
 */
import { describe, expect, test } from "bun:test";
import { loadMarkContext } from "../../src/services/tutor/mark-context";

type Row = Record<string, unknown>;

interface Call {
  text: string;
  params: unknown[];
}

/** Substring-keyed fake sql with call recording + a throw-key for the
 *  fail-open pins (the DC-1 test harness pattern, extended). */
function fakeSql(
  responses: Record<string, Row[]>,
  opts?: { throwKeys?: string[] },
): { sql: ReturnType<typeof build>; calls: Call[] } {
  const calls: Call[] = [];
  function build(): never;
  function build(): unknown {
    const fn = async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const text = strings.join("?");
      calls.push({ text, params });
      if (opts?.throwKeys?.some((k) => text.includes(k))) {
        throw new Error("synthetic read failure (the fail-open pin)");
      }
      for (const key of Object.keys(responses)) {
        if (text.includes(key)) return responses[key]!;
      }
      return [];
    };
    return fn as unknown as never;
  }
  return { sql: build() as ReturnType<typeof build>, calls };
}

const SCHEME_V1 = "11111111-1111-1111-1111-111111111111";
const SCHEME_V2 = "22222222-2222-2222-2222-222222222222";
const QUESTION = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VERSION = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PART = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ATTEMPT = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const ANSWER = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const POINT_I = "p1111111-1111-1111-1111-111111111111";
const POINT_II = "p2222222-2222-2222-2222-222222222222";

/** The DC-1 fixtures of record: paper 1, question 1 (bare row), parts
 *  a/b/c in the current version, latest validated result, per-point
 *  Allocation join complete (the every-point-decided law). */
function baseResponses(schemeId: string) {
  return {
    "from questions q": [{ id: QUESTION, external_ref: "1" }],
    "from question_parts p": [
      { version_id: VERSION, version: 1, id: PART, label: "c", marks: 2 },
    ],
    "from attempts a": [{ id: ATTEMPT }],
    "from answers ans": [{ id: ANSWER, answer_text: "The cell is bigger." }],
    "from smart_mark_results": [
      {
        id: "r1",
        answer_id: ANSWER,
        marks_awarded: 1,
        validation_passed: true,
        breakdown: [
          { markPointId: POINT_I, ref: "1-c-i", marks: 1, marksAwarded: 1, awarded: true, evidence: "e", rationale: "r" },
          { markPointId: POINT_II, ref: "1-c-ii", marks: 1, marksAwarded: 0, awarded: false, evidence: "e", rationale: "r" },
        ],
      },
    ],
    "from mark_schemes": [{ id: schemeId }],
    "from mark_points": [
      { id: POINT_I, ref: "1-c-i", ordering: 0, text: "correctly states the effect on rate", marks: 1, question_part_id: PART },
      { id: POINT_II, ref: "1-c-ii", ordering: 1, text: "explains in terms of collision frequency", marks: 1, question_part_id: PART },
    ],
  };
}

const ASK = "why did I lose a mark on question 1c?";

describe("DC-5 consume seam — the materialised surface rides the payload", () => {
  test("the resolved part's points carry their scheme's alternatives + numeric values", async () => {
    const { sql } = fakeSql({
      ...baseResponses(SCHEME_V1),
      "from mark_point_alternatives": [
        { mark_point_id: POINT_II, kind: "ALTERNATIVE", value: "greater surface area increases collisions" },
        { mark_point_id: POINT_II, kind: "NUMERIC", value: "0.5 nm" },
      ],
    });
    const ctx = await loadMarkContext(sql, "paper-1", "4CH1/1C June 2022", "learner-1", ASK);
    expect(ctx).not.toBeNull();
    const missed = ctx!.points.find((p) => p.ref === "1-c-ii")!;
    expect(missed.alternatives).toEqual(["greater surface area increases collisions"]);
    expect(missed.numericValues).toEqual(["0.5 nm"]);
    // the awarded point has no materialised rows — fields stay ABSENT
    const awarded = ctx!.points.find((p) => p.ref === "1-c-i")!;
    expect(awarded.alternatives).toBeUndefined();
    expect(awarded.numericValues).toBeUndefined();
  });

  test("the alternatives query is keyed to the RESOLVED scheme id (drift mechanism)", async () => {
    const { sql, calls } = fakeSql({
      ...baseResponses(SCHEME_V2),
      "from mark_point_alternatives": [],
    });
    await loadMarkContext(sql, "paper-1", "4CH1/1C June 2022", "learner-1", ASK);
    const altCall = calls.find((c) => c.text.includes("from mark_point_alternatives"));
    expect(altCall).toBeDefined();
    expect(String(altCall!.params[0])).toBe(SCHEME_V2);
  });
});

describe("DC-5 acceptance (c) — the drift pin: a scheme bump flips the set atomically", () => {
  test("scheme v1 surfaces S1; after the bump the LATEST scheme v2 surfaces S2 — one query, no dual-read window", async () => {
    // BEFORE the bump: the resolveScheme law reads v1 → its rows surface
    const before = fakeSql({
      ...baseResponses(SCHEME_V1),
      "from mark_point_alternatives": [
        { mark_point_id: POINT_II, kind: "ALTERNATIVE", value: "v1 set: smaller surface slows collisions" },
      ],
    });
    const ctxBefore = await loadMarkContext(before.sql, "paper-1", "4CH1/1C June 2022", "learner-1", ASK);
    expect(ctxBefore!.points.find((p) => p.ref === "1-c-ii")!.alternatives).toEqual([
      "v1 set: smaller surface slows collisions",
    ]);
    expect(String(before.calls.find((c) => c.text.includes("mark_point_alternatives"))!.params[0])).toBe(SCHEME_V1);

    // AFTER the bump: the new scheme row is the latest → v2's rows surface
    // in the SAME single keyed query (the atomics are the FK + the law)
    const after = fakeSql({
      ...baseResponses(SCHEME_V2),
      "from mark_point_alternatives": [
        { mark_point_id: POINT_II, kind: "ALTERNATIVE", value: "v2 set: greater surface area increases collisions" },
      ],
    });
    const ctxAfter = await loadMarkContext(after.sql, "paper-1", "4CH1/1C June 2022", "learner-1", ASK);
    expect(ctxAfter!.points.find((p) => p.ref === "1-c-ii")!.alternatives).toEqual([
      "v2 set: greater surface area increases collisions",
    ]);
    expect(String(after.calls.find((c) => c.text.includes("mark_point_alternatives"))!.params[0])).toBe(SCHEME_V2);
  });
});

describe("DC-5 fail-open — the progressive-materialisation law (R-DC5-4)", () => {
  test("an alternatives read failure leaves the payload intact WITHOUT surfaces", async () => {
    const { sql } = fakeSql(
      { ...baseResponses(SCHEME_V1) },
      { throwKeys: ["from mark_point_alternatives"] },
    );
    const ctx = await loadMarkContext(sql, "paper-1", "4CH1/1C June 2022", "learner-1", ASK);
    expect(ctx).not.toBeNull(); // the DC-1 payload still serves
    for (const p of ctx!.points) {
      expect(p.alternatives).toBeUndefined();
      expect(p.numericValues).toBeUndefined();
    }
  });

  test("an empty materialisation (nothing extracted at ingestion) = absent fields", async () => {
    const { sql } = fakeSql({
      ...baseResponses(SCHEME_V1),
      "from mark_point_alternatives": [],
    });
    const ctx = await loadMarkContext(sql, "paper-1", "4CH1/1C June 2022", "learner-1", ASK);
    expect(ctx).not.toBeNull();
    expect(ctx!.points.every((p) => p.alternatives === undefined)).toBe(true);
  });
});
