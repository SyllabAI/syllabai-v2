/**
 * SME package contract pins (T-MIG-054, salvaged from T-MIG-033 tranche-3 PR #78) — the Jackson binding
 * semantics the schemas mirror (see the module header): passthrough
 * (ignoreUnknown), absent primitives left optional (the validate() port
 * turns Java's 0/false defaults into the verbatim 400s), additive not
 * stricter.
 */
import { describe, expect, test } from "bun:test";
import {
  smePackageSchema,
  smeIngestSummarySchema,
  smeBankStatusSchema,
} from "./sme-question-package";

describe("smePackageSchema — Jackson binding parity", () => {
  test("unknown properties pass through (ignoreUnknown = true)", () => {
    const parsed = smePackageSchema.parse({
      packageVersion: "1.0",
      questions: [],
      brandNewField: { deep: [1, 2] },
    });
    expect((parsed as Record<string, unknown>).brandNewField).toEqual({ deep: [1, 2] });
  });

  test("primitive components are optional — absence is Java's 0/false", () => {
    const parsed = smePackageSchema.parse({
      questions: [{ externalRef: "X" }],
    });
    expect(parsed.questions![0]!.marks).toBeUndefined(); // validate() reads ?? 0
    expect(parsed.questions![0]!.difficulty).toBeUndefined();
  });

  test("object components accept null (Jackson null binding)", () => {
    const parsed = smePackageSchema.parse({
      packageVersion: null,
      source: null,
      counts: null,
      questions: null,
    });
    expect(parsed.packageVersion).toBeNull();
    expect(parsed.questions).toBeNull();
  });

  test("a JSON type Jackson cannot bind fails the schema (the :620-624 class)", () => {
    expect(smePackageSchema.safeParse({ questions: 5 }).success).toBe(false);
    expect(smePackageSchema.safeParse(5).success).toBe(false);
    expect(smePackageSchema.safeParse("x").success).toBe(false);
  });

  test("counts binds a string→int map", () => {
    const parsed = smePackageSchema.parse({ counts: { questions: 3, assets: 1 } });
    expect(parsed.counts).toEqual({ questions: 3, assets: 1 });
  });
});

describe("response schemas — the controller records", () => {
  test("IngestSummary binds the full ADR-026 replace receipt", () => {
    expect(
      smeIngestSummarySchema.parse({
        questions: 1, mcq: 1, structured: 0, parts: 0, options: 2,
        markPoints: 1, specPointMappings: 0, topicMappings: 2, assets: 0,
        deactivated: 0, corpusVersion: null,
      }).corpusVersion,
    ).toBeNull();
  });

  test("BankStatusView binds the five live-bank counters", () => {
    expect(
      smeBankStatusSchema.parse({
        activeQuestions: 5, activeMcq: 3, activeStructured: 2,
        specPointMappings: 7, assets: 1,
      }).activeStructured,
    ).toBe(2);
  });
});
