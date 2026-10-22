/**
 * DC-5 extraction law tests — the acceptable-answer materialisation
 * extractor (spec §3.5; prereg docs/DC5-CONFORMANCE-LINT-PLAN.md §4.2).
 * Every rule traces to a mark-scheme text shape; the negative law (E2) is
 * pinned: rejection guidance never becomes an acceptable answer.
 */
import { describe, expect, test } from "bun:test";
import {
  buildAlternativeInserts,
  canonicalAnswer,
  extractAcceptableAnswers,
  insertMarkPointAlternatives,
} from "../../src/services/ingestion/acceptable-answers";

describe("DC-5 canonicalAnswer — the R-DC5-2 normalisation law of record", () => {
  test("case-fold + punctuation fold + all whitespace removed", () => {
    expect(canonicalAnswer("Chloroplasts are small organelles.")).toBe(
      "chloroplastsaresmallorganelles",
    );
    expect(canonicalAnswer("Accept: 0.5 nm")).toBe("accept0.5nm");
  });

  test("digits, internal dots, hyphens and the unit glyphs survive", () => {
    expect(canonicalAnswer("between 200-400 °C")).toBe("between200-400°c");
    expect(canonicalAnswer("×400 magnification")).toBe("×400magnification");
    expect(canonicalAnswer("1.5 g/mol")).toBe("1.5g/mol");
  });

  test("spacing-insensitive membership key", () => {
    expect(canonicalAnswer("0.5 nm")).toBe(canonicalAnswer("0.5nm"));
  });
});

describe("DC-5 E1 — acceptance cues yield ALTERNATIVE rows", () => {
  test("Accept clause: the cue verb is never part of the value", () => {
    const rows = extractAcceptableAnswers("Award for: chloroplasts are small organelles. Accept: small size of chloroplasts.");
    const alts = rows.filter((r) => r.kind === "ALTERNATIVE");
    expect(alts.length).toBe(2);
    expect(alts[0]!.value).toBe("chloroplasts are small organelles");
    expect(alts[1]!.value).toBe("small size of chloroplasts");
    expect(alts[1]!.normalised).toBe(canonicalAnswer("small size of chloroplasts"));
  });

  test("Allow + Any-n-from cues", () => {
    const rows = extractAcceptableAnswers("Allow: reversed argument. Any two from: mitochondria; ribosomes; nucleus.");
    const alts = rows.filter((r) => r.kind === "ALTERNATIVE").map((r) => r.value);
    expect(alts).toContain("reversed argument");
    expect(alts).toContain("mitochondria; ribosomes; nucleus");
  });

  test("Award...for pattern", () => {
    const rows = extractAcceptableAnswers("Award 1 mark for correctly naming the organelle.");
    const alts = rows.filter((r) => r.kind === "ALTERNATIVE");
    expect(alts.length).toBe(1);
    expect(alts[0]!.value).toBe("correctly naming the organelle");
  });
});

describe("DC-5 E2 — rejection/ignore guidance yields NOTHING", () => {
  test("Do not accept / Ignore / Reject never become rows", () => {
    expect(extractAcceptableAnswers("Do not accept: 'the chloroplast is green'." ).length).toBe(0);
    expect(extractAcceptableAnswers("Ignore references to light intensity.").length).toBe(0);
    expect(extractAcceptableAnswers("Reject answers in terms of energy.").length).toBe(0);
  });

  test("negative clauses inside an otherwise accepting point are skipped, the accept survives", () => {
    const rows = extractAcceptableAnswers(
      "Accept: small organelles. Ignore references to chlorophyll.",
    );
    const alts = rows.filter((r) => r.kind === "ALTERNATIVE");
    expect(alts.length).toBe(1);
    expect(alts[0]!.value).toBe("small organelles");
  });
});

describe("DC-5 E3 — ora rides the row as metadata", () => {
  test("ora flag lands in extraction_method via buildAlternativeInserts", () => {
    const rows = extractAcceptableAnswers("Accept: the argument in either direction ora.");
    expect(rows[0]!.ora).toBe(true);
    const inserts = buildAlternativeInserts("p1", "s1", rows, "dc5-r1-ingestion", "2026-10-23T00:00:00Z", () => "id-1");
    expect(inserts[0]!.extractionMethod).toBe("dc5-r1-ingestion+ora");
  });
});

describe("DC-5 E4 — numeric+unit surfaces", () => {
  test("single tokens become NUMERIC rows, value as written", () => {
    const rows = extractAcceptableAnswers("The resolution is 0.5 nm. Visible light has a wavelength of 400 nm.");
    const nums = rows.filter((r) => r.kind === "NUMERIC");
    expect(nums.map((r) => r.value)).toContain("0.5 nm");
    expect(nums.map((r) => r.value)).toContain("400 nm");
  });

  test("ranges collapse to one verbatim range row", () => {
    const rows = extractAcceptableAnswers("The temperature is between 20 and 30 °C.");
    const nums = rows.filter((r) => r.kind === "NUMERIC");
    expect(nums.length).toBe(1);
    expect(nums[0]!.value).toBe("between 20 and 30 °C");
  });

  test("degrees and percentages from the pinned vocabulary", () => {
    const rows = extractAcceptableAnswers("Heated to 45 °C until 30% of the mass remains.");
    const nums = rows.filter((r) => r.kind === "NUMERIC").map((r) => r.value);
    expect(nums).toContain("45 °C");
    expect(nums).toContain("30%");
  });
});

describe("DC-5 fail-open — an unparseable point yields []", () => {
  test("empty, null-ish and cue-less prose produce no rows", () => {
    expect(extractAcceptableAnswers("").length).toBe(0);
    expect(extractAcceptableAnswers("   ").length).toBe(0);
    expect(extractAcceptableAnswers("Describes the arrangement of particles correctly.").length).toBe(0);
  });
});

describe("DC-5 persistence helpers — the idempotent insert law", () => {
  test("buildAlternativeInserts carries the uq key fields", () => {
    const rows = extractAcceptableAnswers("Accept: small organelles. The value is 0.5 nm.");
    const inserts = buildAlternativeInserts("p1", "s1", rows, "dc5-r1-ingestion", "2026-10-23T00:00:00Z", (() => {
      let n = 0;
      return () => "gen-" + n++;
    })());
    expect(inserts.length).toBe(2);
    expect(inserts[0]!.markPointId).toBe("p1");
    expect(inserts[0]!.markSchemeId).toBe("s1");
    expect(inserts[0]!.kind).toBe("ALTERNATIVE");
    expect(inserts[1]!.kind).toBe("NUMERIC");
    expect(inserts.every((r) => r.normalised.length > 0)).toBe(true);
  });

  test("insertMarkPointAlternatives issues the ON CONFLICT DO NOTHING insert", async () => {
    const issued: string[] = [];
    const sql = (async (strings: TemplateStringsArray) => {
      issued.push(strings.join("?"));
      return [];
    }) as unknown as (s: TemplateStringsArray, ...p: unknown[]) => Promise<unknown[]>;
    const inserts = buildAlternativeInserts(
      "p1",
      "s1",
      extractAcceptableAnswers("Accept: small organelles."),
      "dc5-r1-backfill",
      "2026-10-23T00:00:00Z",
      () => "gen-1",
    );
    const n = await insertMarkPointAlternatives(sql, inserts);
    expect(n).toBe(1);
    expect(issued[0]).toContain("insert into mark_point_alternatives");
    expect(issued[0]).toContain("on conflict (mark_point_id, kind, normalised) do nothing");
  });
});
