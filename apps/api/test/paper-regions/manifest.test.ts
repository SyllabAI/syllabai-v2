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

// ============================================================
// T-MG-MP-RECT-2 run-002 — the 20-paper validation slice.
// The same law as run-001, generalized per the instrument of
// record (extract_rects2.py): the schema + the sha256 instrument
// gates + the census pins. The 3 disclosed residues (one mark
// each) are pinned AS RESIDUES — the census sums the MS-faithful
// rows that actually ship; the receipt narrates the rest.

const RUN002_FIXTURES = [
  { file: "mark-point-rects-1ma1-1h-jun2025.json", sha256: "3a260dd96f0712b39aee40a7a40ed394c409a04670c8ea922df46515d710b6dc", paperCode: "1MA1/1H", sessionLabel: "June 2025", rows: 76, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-2f-jun2025.json", sha256: "7aedbe0a7483a2624de836f90bcc83ffb9b6cc09c9e7befa7887f0b76c7df98a", paperCode: "1MA1/2F", sessionLabel: "June 2025", rows: 76, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-2h-jun2025.json", sha256: "e71868d16d07c7c89da78a8721a4d707f84ff26d6c38bb571781a91d07d172bf", paperCode: "1MA1/2H", sessionLabel: "June 2025", rows: 71, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-3f-jun2025.json", sha256: "b7d5351e5ca467a2dd80308acee1cfe229d4b4bd498e5ce9967bf16c16713be8", paperCode: "1MA1/3F", sessionLabel: "June 2025", rows: 73, footerSum: 80, censusSum: 79 },
  { file: "mark-point-rects-1ma1-3h-jun2025.json", sha256: "787b82e2715fbe8d6377c25c835fc83e5cedb636cb493d30d73ee45d3bce3b04", paperCode: "1MA1/3H", sessionLabel: "June 2025", rows: 74, footerSum: 80, censusSum: 79 },
  { file: "mark-point-rects-1ma1-1f-nov2024.json", sha256: "509b240cafffa171d3a87aa3a0d69a6499d56b9b9a69e20134e51f063f0acffa", paperCode: "1MA1/1F", sessionLabel: "November 2024", rows: 78, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-1h-nov2024.json", sha256: "743761d39ecdf7bc408564f5ac7b418a4793f4c12871057553c4cf72ec976c9b", paperCode: "1MA1/1H", sessionLabel: "November 2024", rows: 78, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-2f-nov2024.json", sha256: "f93865ff34ff0dcab2b88a5692f73e04b76c43d3b8573677a6725ab3746fde5a", paperCode: "1MA1/2F", sessionLabel: "November 2024", rows: 75, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-2h-nov2024.json", sha256: "20a298b5832f8f9c4be63a56694e88b21b208767b60f43659c93bdf3ba02a0e3", paperCode: "1MA1/2H", sessionLabel: "November 2024", rows: 77, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-3f-nov2024.json", sha256: "9ab9036e1fb3e9c1d32885079fe7d30415711e1e7df91108eb26bcca46d63f80", paperCode: "1MA1/3F", sessionLabel: "November 2024", rows: 76, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-3h-nov2024.json", sha256: "b2ce655d788c12e9a6c03da074eb537fcc6796ed4cf4e21b4f513c66a91706da", paperCode: "1MA1/3H", sessionLabel: "November 2024", rows: 76, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-1f-jun2024.json", sha256: "0d645942d97823ecd5a67c044ebc6bdab76251ab6ff5355a63bf4aea15da2b8f", paperCode: "1MA1/1F", sessionLabel: "June 2024", rows: 79, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-1h-jun2024.json", sha256: "6df8393aefbf24ed5ce375a0535076f699dffc33c92bd175f027b8c20f1becf9", paperCode: "1MA1/1H", sessionLabel: "June 2024", rows: 75, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-2f-jun2024.json", sha256: "e40d9820904ae140e5859f5f190034fc0289692036c4c9eacaae8b2c97c7bec0", paperCode: "1MA1/2F", sessionLabel: "June 2024", rows: 78, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-2h-jun2024.json", sha256: "b167f65babb4cd5fc705fd85ba96b1f18ddbf1d4e167284b00baa74ffe3ac687", paperCode: "1MA1/2H", sessionLabel: "June 2024", rows: 77, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-3f-jun2024.json", sha256: "5792d0027c008f9727606751a98a8302affc972d5e26f0336524a1420f472483", paperCode: "1MA1/3F", sessionLabel: "June 2024", rows: 75, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-3h-jun2024.json", sha256: "3e10b9bc592b0937932e2076500e36800335656baa0b96e228a75d952c2ea1ec", paperCode: "1MA1/3H", sessionLabel: "June 2024", rows: 79, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-1f-nov2023.json", sha256: "1bbba19d5e9d215a86dba842b62b31f7705f4cb97d773745d0b97cf6041850ff", paperCode: "1MA1/1F", sessionLabel: "November 2023", rows: 75, footerSum: 80, censusSum: 79 },
  { file: "mark-point-rects-1ma1-1h-nov2023.json", sha256: "633653b255286558cba8a21d82f26dd7520360de6297738679161652b75bda68", paperCode: "1MA1/1H", sessionLabel: "November 2023", rows: 77, footerSum: 80, censusSum: 80 },
  { file: "mark-point-rects-1ma1-3f-nov2023.json", sha256: "669c8d817b1cbe39919dec0fe10046ea23bb541075a4958409edd9c5ea1571a5", paperCode: "1MA1/3F", sessionLabel: "November 2023", rows: 77, footerSum: 80, censusSum: 80 },
] as const;

describe("T-MG-MP-RECT-2 run-002 — the 20-paper validation slice", () => {
  const rowSchemaRun002 = manifestRowSchema.extend({
    markCode: z.string().min(1).max(4).optional(),
  });

  for (const fx of RUN002_FIXTURES) {
    test(`${fx.paperCode} ${fx.sessionLabel} — schema, sha256 gate, census pin`, () => {
      const raw = readFileSync(join(import.meta.dir, "../../scripts/fixtures", fx.file), "utf8");
      const sha = createHash("sha256").update(raw).digest("hex");
      expect(sha).toBe(fx.sha256); // the instrument gate — never a hand edit
      const m = manifestSchema.extend({ rects: z.array(rowSchemaRun002).min(1) }).parse(JSON.parse(raw));
      expect(m.paperCode).toBe(fx.paperCode);
      expect(m.sessionLabel).toBe(fx.sessionLabel);
      expect(m.rects.length).toBe(fx.rows);
      // every rect inside the page unit square
      for (const r of m.rects) {
        expect(paperRegionRectSchema.parse(r)).toBeTruthy();
        expect(r.x + r.width).toBeLessThanOrEqual(1.0001);
        expect(r.y + r.height).toBeLessThanOrEqual(1.0001);
      }
      // (markPointRef, ordinal) unique
      const seen = new Set(m.rects.map((r) => `${r.markPointRef}#${r.ordinal}`));
      expect(seen.size).toBe(m.rects.length);
      // the census pin: the shipped rows' mark values == the pinned sum
      // (== the QP footer sum for the 17 exact papers; the 3 disclosed
      // one-mark residues pin their shipped sum — the receipt narrates)
      const markSum = m.rects.reduce((s2, r) => s2 + parseInt((r.markCode ?? "B0")[1] ?? "0", 10), 0);
      expect(markSum).toBe(fx.censusSum);
    });
  }
});
