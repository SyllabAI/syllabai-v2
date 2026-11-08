import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import {
  GradeBoundariesSchema,
  type GradeBoundariesBundle,
} from "./grade-boundaries-schema";

/**
 * T-GRADE-2 run-002 regression guard (bun:test twin of
 * scripts/validate_gradeb_bundle.ts, which enforces the same law in the
 * prebuild chain so a drift fails the deploy lane too).
 *
 * The incident: the wave-2 bundle legitimately carries series WITHOUT a
 * series-level boundaries row (CIE route/component shapes, modular
 * unit/cash-in shapes); the then-strict loader zod rejected the WHOLE
 * bundle at safeParse → loader null → every course card on production fell
 * back to the roadmap state. These tests load the REAL committed bundle —
 * not fixtures — so loader/contract drift can never ship again.
 */
const BUNDLE_REL = "content/grade-boundaries/bundle.v1.json";

const bundle: GradeBoundariesBundle = (() => {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(process.cwd(), BUNDLE_REL), "utf8"),
  );
  const parsed = GradeBoundariesSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "bundle failed schema — first 10 issues:",
      parsed.error.issues.slice(0, 10),
    );
  }
  expect(parsed.success).toBe(true);
  return parsed.data!;
})();

describe("committed grade-boundaries bundle", () => {
  it("matches the loader schema (all 106 courses, all shapes)", () => {
    expect(Object.keys(bundle.courses).length).toBe(
      bundle.counts.courses_total,
    );
  });

  it("counts law: served + roadmap == total", () => {
    const served = Object.values(bundle.courses).filter(
      (c) => c.series.length > 0,
    ).length;
    expect(served).toBe(bundle.counts.courses_served);
    expect(served + bundle.counts.courses_roadmap).toBe(
      bundle.counts.courses_total,
    );
  });

  it("linear-total courses grade every series row (no mixed shapes)", () => {
    for (const [slug, c] of Object.entries(bundle.courses)) {
      if (c.calculator?.mode !== "linear-total") continue;
      for (const s of c.series) {
        const numeric = Object.values(s.boundaries ?? {}).some(
          (v) => typeof v === "number",
        );
        expect(numeric).toBe(true);
      }
      expect(c.calculator.maxMark).not.toBe(null);
    }
  });

  it("non-linear courses never carry a series-level boundaries row", () => {
    for (const [slug, c] of Object.entries(bundle.courses)) {
      if (c.calculator?.mode === "linear-total" || !c.series.length) continue;
      for (const s of c.series) {
        expect(s.boundaries).toBeUndefined();
      }
    }
  });

  it("the three qualification shapes are all present", () => {
    const modes = new Map<string, number>();
    for (const c of Object.values(bundle.courses)) {
      const mode = c.calculator?.mode ?? "none";
      modes.set(mode, (modes.get(mode) ?? 0) + 1);
    }
    expect(modes.get("linear-total")).toBeGreaterThan(0);
    expect(modes.get("aggregate-ums")).toBeGreaterThan(0);
    expect(modes.get("display-only")).toBeGreaterThan(0);
  });

  it("regression anchor: igcse-physics-19 (4PH1) stays served with overall rows", () => {
    const c = bundle.courses["igcse-physics-19"];
    expect(c).toBeDefined();
    expect(c.code).toBe("4PH1");
    expect(c.series.length).toBeGreaterThan(0);
    for (const s of c.series) {
      expect(s.boundaries).toBeDefined();
    }
  });

  it("regression anchor: a CIE route-shape course parses with components+routes", () => {
    const c = Object.values(bundle.courses).find(
      (x) => x.board === "Cambridge International" && x.series.some((s) => s.routes?.length),
    );
    expect(c).toBeDefined();
    const s = c!.series.find((x) => x.routes?.length)!;
    expect(s.routes![0].boundaries).toBeDefined();
    expect(s.components?.length ?? 0).toBeGreaterThan(0);
  });

  it("regression anchor: a modular unit course parses with units+cashIns+UMS", () => {
    const c = Object.values(bundle.courses).find((x) =>
      x.series.some((s) => s.units?.length && s.cashIns?.length),
    );
    expect(c).toBeDefined();
    const s = c!.series.find((x) => x.units?.length && x.cashIns?.length)!;
    expect(s.units![0].ums?.boundaries).toBeDefined();
    expect(s.cashIns![0].boundaries).toBeDefined();
  });

  // T-GB-STRUCT-1: the structure law — Σ(rawMax × weightFactor) equals the
  // graded total, which equals the calculator's and every served series
  // row's maxMark, and every block carries full-sha-pinned official sources.
  it("structure blocks are arithmetically sound and provenance-complete", () => {
    const withStructure = Object.entries(bundle.courses).filter(
      ([, c]) => c.structure,
    );
    expect(withStructure.length).toBeGreaterThan(0);
    for (const [, c] of withStructure) {
      const st = c.structure!;
      let weighted = 0;
      let weights = 0;
      for (const p of st.papers) {
        expect(p.rawMax).toBeGreaterThan(0);
        expect(p.weightFactor).toBeGreaterThanOrEqual(1);
        weighted += p.rawMax * p.weightFactor;
        weights += p.weight.num / p.weight.den;
      }
      expect(weighted).toBe(st.total.maxMark);
      expect(Math.abs(weights - 1)).toBeLessThan(1e-9);
      expect(st.sources.length).toBeGreaterThan(0);
      for (const s of st.sources) {
        expect(s.sha256_16).toMatch(/^[0-9a-f]{16}$/);
        expect(s.url).toMatch(/^https?:\/\//);
      }
      if (c.calculator?.mode === "linear-total") {
        expect(c.calculator.maxMark ?? null).toBe(st.total.maxMark);
      }
      for (const s of c.series) {
        if (s.maxMark != null) expect(s.maxMark).toBe(st.total.maxMark);
      }
    }
  });

  it("regression anchor: igcse-maths-b-16 (4MB1) carries the weighted-total structure", () => {
    const st = bundle.courses["igcse-maths-b-16"]?.structure;
    expect(st).toBeDefined();
    expect(st!.papers.map((p) => p.code)).toEqual(["4MB1/01", "4MB1/02"]);
    expect(st!.papers.map((p) => p.rawMax)).toEqual([100, 100]);
    expect(st!.papers.map((p) => p.weightFactor)).toEqual([1, 2]);
    expect(st!.total.maxMark).toBe(300);
    expect(st!.total.derivation).toContain("100");
    expect(st!.awardRules?.note).toBeTruthy();
  });
});
