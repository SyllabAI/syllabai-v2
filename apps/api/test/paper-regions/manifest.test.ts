/**
 * Manifest of-record tests (T-MG-MP-RECT-2 run-001) — the REAL page-anchored
 * extraction manifest for the seed family (plan docs/MG-MARK-PARITY-PLAN.md
 * §3.1 Backfill: extraction truth is the content lane's deliverable).
 *
 * Pins:
 *  - schema: every manifest row validates against the seed's manifest zod
 *    (paperCode/sessionLabel/note + rects) AND the canonical
 *    paperRegionRectSchema geometry from contracts;
 *  - census: 76 rows / 26 questions / per-question counts pinned (the
 *    MS-derived point census of record; value sum 80 == QP footer sum 80);
 *  - invariants: (markPointRef, ordinal) unique, pages within the 20-page
 *    document, regionKey log-labels follow the RECT-1 derive-law shape and
 *    agree with the ref prefix;
 *  - determinism: the file's sha256 is pinned — any geometry change must go
 *    through the instrument of record
 *    (.syllabai/lane-artifacts/T-MG-MP-RECT-2/run-001/extract_rects.py) and
 *    re-pin, never a hand edit.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { paperRegionRectSchema } from "@syllabai/contracts";
import { z } from "zod";

const manifestPath = join(
  import.meta.dir,
  "../../scripts/fixtures/mark-point-rects-1ma1-1f-jun2025.json",
);
const raw = readFileSync(manifestPath, "utf8");

const manifestRowSchema = z.object({
  markPointRef: z.string().min(1).max(20),
  regionKey: z.string().min(1),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  ordinal: z.number().int().min(0),
  extractionConfidence: z.number().min(0).max(1).nullable(),
});
const manifestSchema = z.object({
  paperCode: z.string().min(1),
  sessionLabel: z.string().min(1),
  note: z.string().min(1),
  rects: z.array(manifestRowSchema).min(1),
});

const manifest = manifestSchema.parse(JSON.parse(raw));

describe("T-MG-MP-RECT-2 run-001 — the real extraction manifest of record", () => {
  test("paper identity is the seed family (uq_exam_paper_identity key)", () => {
    expect(manifest.paperCode).toBe("1MA1/1F");
    expect(manifest.sessionLabel).toBe("June 2025");
  });

  test("sha256 of-record — the manifest is instrument-gated, never hand-edited", () => {
    const sha = createHash("sha256").update(raw).digest("hex");
    expect(sha).toBe(
      "601ccece3f1ecf6899146af14923bed173b940efbc50cfa6f9287ef0e2acf2e9",
    );
  });

  test("census of record — 76 rows over 26 questions, per-question counts pinned", () => {
    expect(manifest.rects).toHaveLength(76);
    const perQ = new Map<number, number>();
    for (const r of manifest.rects) {
      const m = r.markPointRef.match(/^q(\d+)/);
      expect(m).not.toBeNull();
      const qn = Number(m![1]);
      perQ.set(qn, (perQ.get(qn) ?? 0) + 1);
    }
    expect(perQ.size).toBe(26);
    const expected: Record<number, number> = {
      1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 4, 7: 4, 8: 2, 9: 3, 10: 3, 11: 4,
      12: 5, 13: 3, 14: 3, 15: 3, 16: 4, 17: 3, 18: 2, 19: 2, 20: 5, 21: 3,
      22: 6, 23: 3, 24: 4, 25: 3, 26: 2,
    };
    for (const [qn, n] of perQ) expect(n).toBe(expected[qn]!);
    expect([...perQ.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 26 }, (_, i) => i + 1),
    );
  });

  test("invariants — unique (ref, ordinal), pages within the 20-page document", () => {
    const seen = new Set<string>();
    for (const r of manifest.rects) {
      const k = `${r.markPointRef}#${r.ordinal}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      expect(r.page).toBeGreaterThanOrEqual(1);
      expect(r.page).toBeLessThanOrEqual(20);
      // geometry also validates against the canonical contracts schema
      expect(() =>
        paperRegionRectSchema.parse({
          page: r.page,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          ordinal: r.ordinal,
        }),
      ).not.toThrow();
      // rects stay inside the page they name (the crop-then-mark law)
      expect(r.x + r.width).toBeLessThanOrEqual(1.0000001);
      expect(r.y + r.height).toBeLessThanOrEqual(1.0000001);
    }
  });

  test("regionKey log-labels follow the RECT-1 derive-law shape and agree with refs", () => {
    for (const r of manifest.rects) {
      const m = r.markPointRef.match(/^q(\d+)([a-z]?)-(\d+)$/);
      expect(m).not.toBeNull();
      const [, qn, part] = m!;
      const expected = part
        ? `1MA1/1F-q${qn}.${part}`
        : `1MA1/1F-q${qn}`;
      expect(r.regionKey).toBe(expected);
    }
  });

  test("extraction posture — every row carries honest confidence from the instrument", () => {
    for (const r of manifest.rects) {
      expect(r.extractionConfidence).toBe(0.93);
      expect(r.ordinal).toBe(0); // single-rect paper (no page-break spans)
    }
  });
});
