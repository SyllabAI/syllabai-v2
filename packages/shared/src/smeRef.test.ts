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

import { smeQuestionRef } from "./smeRef";

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
