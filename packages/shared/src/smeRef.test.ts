/**
 * T-MIG-135 — the shared SME ref law (packages/shared/src/smeRef.ts).
 *
 * One law, both sides of the identity bridge: the API ingest shim EMITS
 * these refs; the hub join LOOKS THEM UP. Pins:
 *   - the tier-scoped shape `sme-eq-<courseSlug>-<topicSlug>-q<order>`;
 *   - the ≤80 bound holds on the REAL worst-case slugs (the chemistry-era
 *     law collided 156× across the two Maths A tiers);
 *   - the truncation law: deterministic, hash-suffixed, injective;
 *   - the fail-closed course-slug bound.
 */
import { describe, expect, test } from "bun:test";

import { smeMemberSuffixReserve, smeQuestionRef } from "./smeRef";

describe("smeQuestionRef — the shared bridge identity law (T-MIG-135)", () => {
  test("the tier-scoped shape", () => {
    expect(smeQuestionRef("igcse-maths-a-18-higher", "percentages", 34)).toBe(
      "sme-eq-igcse-maths-a-18-higher-percentages-q34",
    );
    expect(smeQuestionRef("igcse-maths-a-18-foundation", "fractions", 0)).toBe(
      "sme-eq-igcse-maths-a-18-foundation-fractions-q0",
    );
  });

  test("F and H never collide where the chemistry-era law did (31 shared topicSlugs)", () => {
    const shared = [
      "algebraic-roots-and-indices",
      "angles-in-polygons-and-parallel-lines",
      "area-and-perimeter",
      "bearings-scale-drawing-and-constructions",
      "compound-interest-and-depreciation",
    ];
    for (const slug of shared) {
      for (const order of [0, 7, 34]) {
        const f = smeQuestionRef("igcse-maths-a-18-foundation", slug, order);
        const h = smeQuestionRef("igcse-maths-a-18-higher", slug, order);
        expect(f).not.toBe(h);
        expect(f.startsWith("sme-eq-igcse-maths-a-18-foundation-")).toBe(true);
        expect(h.startsWith("sme-eq-igcse-maths-a-18-higher-")).toBe(true);
      }
    }
  });

  test("the ≤80 bound holds on the real worst-case slugs", () => {
    // the two real overflows the first draft hit (86 and 81 chars)
    const worst = [
      ["igcse-maths-a-18-higher", "right-angled-triangles---pythagoras-and-trigonometry"],
      ["igcse-maths-a-18-foundation", "congruence-similarity-and-geometrical-proof"],
    ] as const;
    for (const [course, topic] of worst) {
      const ref = smeQuestionRef(course, topic, 71);
      expect(ref.length).toBeLessThanOrEqual(80);
      expect(ref).toContain("-q71");
    }
  });

  test("truncation is deterministic, hash-suffixed and injective", () => {
    const a = smeQuestionRef("igcse-maths-a-18-higher", "right-angled-triangles---pythagoras-and-trigonometry", 0);
    const b = smeQuestionRef("igcse-maths-a-18-higher", "right-angled-triangles---pythagoras-and-trigonometry", 0);
    expect(a).toBe(b); // deterministic
    expect(a).toMatch(/-[0-9a-f]{8}-q0$/); // the FNV suffix
    // a SHORT slug never truncates (no hash suffix)
    expect(smeQuestionRef("igcse-maths-a-18-higher", "percentages", 0)).not.toMatch(/-[0-9a-f]{8}-q0$/);
    // injectivity across the truncation boundary: distinct long slugs that
    // share a truncation prefix still derive distinct refs
    const x = smeQuestionRef("c1", "alpha-beta-gamma-delta-epsilon-zeta", 0);
    const y = smeQuestionRef("c1", "alpha-beta-gamma-delta-epsilon-zeta-2", 0);
    expect(x).not.toBe(y);
  });

  test("an absurd course slug fails closed", () => {
    expect(() => smeQuestionRef("c".repeat(90), "topic", 0)).toThrow(/leaves no ref room/);
  });
});

// ── the member-suffix reserve (the phase-4 run-003 varchar(80) law) ─────────

describe("smeMemberSuffixReserve — the mixed-emission mirror of emittedRowRefs", () => {
  test("pure structured (no choices) reserves 0 — byte-identical legacy", () => {
    expect(smeMemberSuffixReserve([{ choices: null }, { choices: null }])).toBe(0);
    expect(smeMemberSuffixReserve([])).toBe(0);
    expect(smeMemberSuffixReserve(null)).toBe(0);
  });

  test("option parts reserve the longest '-p<idx>' (idx counts option parts only)", () => {
    expect(smeMemberSuffixReserve([{ choices: [{}] }, { choices: [{}] }])).toBe(3); // "-p2"
    expect(smeMemberSuffixReserve([{ choices: null }, { choices: [{}] }])).toBe(3); // "-p1"
  });

  test("mixed (options + plain) reserves max('-pN', '-s')", () => {
    expect(smeMemberSuffixReserve([{ choices: [{}] }, { choices: null }])).toBe(3); // max("-p1","-s")
  });

  test("END-TO-END overflow regression (run-003 biology-23 shape): base+reserve leaves room for every member ref", () => {
    const topic = "1-1-characteristics-classification-and-features-of-living-organisms";
    const base = smeQuestionRef("cie-igcse-biology-23", topic, 0, smeMemberSuffixReserve([{ choices: [{}] }, { choices: [{}] }, { choices: null }]));
    // the pre-fix law produced base 80 exactly; the members then hit 83.
    // The reserve is the MAX member suffix (3: '-p2') — the base fills the
    // rest exactly, every member lands within the frozen bound.
    expect(base.length).toBeLessThanOrEqual(80 - 3);
    expect((base + "-p2").length).toBeLessThanOrEqual(80);
    expect((base + "-s").length).toBeLessThanOrEqual(80);
  });

  test("the reserve keeps the mapping injective on the hash path (distinct long slugs stay distinct)", () => {
    const a = smeQuestionRef("cie-igcse-biology-23", "alpha-topic-with-a-very-long-name-that-triggers-the-hash-path-x", 1, 4);
    const b = smeQuestionRef("cie-igcse-biology-23", "alpha-topic-with-a-very-long-name-that-triggers-the-hash-path-y", 1, 4);
    expect(a).not.toBe(b);
  });
});
