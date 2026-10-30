/**
 * Region-crop geometry tests — T-MG-CROPMARK-1 run-002. The run-001
 * test-shape law (pins named by the acceptance law they pin) over the PURE
 * module: the view-space mapping (the user-rot law), the union/clamp
 * discipline, the render-resolution plan, and the 4 MB wire law.
 */
import { describe, expect, test } from "bun:test";

import {
  PAPER_MARK_BYTE_CAP,
  chooseImageDataUrl,
  clampRect,
  estimateDataUrlBytes,
  planCrop,
  planRegionViewRect,
  readViewerRotation,
  rectToViewSpace,
  unionRects,
} from "./region-crop";

describe("T-MG-CROPMARK-1 run-002 — the view-space mapping (rectToViewSpace)", () => {
  const rect = { x: 0.2, y: 0.3, width: 0.1, height: 0.2 };

  test("rot 0 is the identity", () => {
    expect(rectToViewSpace(rect, 0)).toEqual(rect);
  });

  test("rot 90: (x,y) → (1−y−h, x), w/h swap (the clockwise point law)", () => {
    const v = rectToViewSpace(rect, 90);
    expect(v.x).toBeCloseTo(1 - 0.3 - 0.2);
    expect(v.y).toBeCloseTo(0.2);
    expect(v.width).toBeCloseTo(0.2);
    expect(v.height).toBeCloseTo(0.1);
  });

  test("rot 180: mirrored on both axes, w/h kept", () => {
    const v = rectToViewSpace(rect, 180);
    expect(v.x).toBeCloseTo(1 - 0.2 - 0.1);
    expect(v.y).toBeCloseTo(1 - 0.3 - 0.2);
    expect(v.width).toBeCloseTo(0.1);
    expect(v.height).toBeCloseTo(0.2);
  });

  test("rot 270: (x,y) → (y, 1−x−w), w/h swap", () => {
    const v = rectToViewSpace(rect, 270);
    expect(v.x).toBeCloseTo(0.3);
    expect(v.y).toBeCloseTo(1 - 0.2 - 0.1);
    expect(v.width).toBeCloseTo(0.2);
    expect(v.height).toBeCloseTo(0.1);
  });

  test("a corner maps onto itself at rot 0 and the square maps onto itself at 90 (area law)", () => {
    const unit = { x: 0, y: 0, width: 1, height: 1 };
    expect(rectToViewSpace(unit, 90)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(rectToViewSpace(unit, 180)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(rectToViewSpace(unit, 270)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  test("out-of-band rects clamp before mapping (never an off-page crop)", () => {
    const v = rectToViewSpace({ x: -0.5, y: 0.9, width: 0.4, height: 0.4 }, 0);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0.9);
    expect(v.height).toBeCloseTo(0.1); // clamped to the band
  });
});

describe("T-MG-CROPMARK-1 run-002 — the union + per-page plan (planRegionViewRect)", () => {
  test("unionRects: empty input → null (the honest nothing-to-crop)", () => {
    expect(unionRects([])).toBeNull();
  });

  test("unionRects covers the span of multi-rect regions", () => {
    const u = unionRects([
      { x: 0.1, y: 0.2, width: 0.1, height: 0.1 },
      { x: 0.5, y: 0.6, width: 0.2, height: 0.1 },
    ]);
    expect(u!.x).toBeCloseTo(0.1);
    expect(u!.y).toBeCloseTo(0.2);
    expect(u!.width).toBeCloseTo(0.6);
    expect(u!.height).toBeCloseTo(0.5);
  });

  test("planRegionViewRect filters to the page, maps, then unions (rotation-safe order)", () => {
    const rects = [
      { page: 1, x: 0.0, y: 0.0, width: 0.2, height: 0.2 },
      { page: 2, x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
      { page: 1, x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
    ];
    const r0 = planRegionViewRect(rects, 1, 0);
    expect(r0!.x).toBe(0);
    expect(r0!.y).toBe(0);
    expect(r0!.width).toBeCloseTo(0.7);
    expect(r0!.height).toBeCloseTo(0.7);
    // page 2's rect is invisible to page 1's crop
    const r2 = planRegionViewRect(rects, 2, 0);
    expect(r2!.x).toBeCloseTo(0.4);
    expect(r2!.y).toBeCloseTo(0.4);
    expect(r2!.width).toBeCloseTo(0.2);
    expect(r2!.height).toBeCloseTo(0.2);
    // a centered square is rotation-invariant — the rot-90 plan matches rot 0
    const r90 = planRegionViewRect(rects, 2, 90);
    expect(r90!.x).toBeCloseTo(0.4);
    expect(r90!.y).toBeCloseTo(0.4);
    expect(r90!.width).toBeCloseTo(0.2);
    expect(r90!.height).toBeCloseTo(0.2);
  });

  test("a non-centered rect's rot-90 plan moves (the mapping is not a no-op)", () => {
    const rects = [{ page: 1, x: 0.1, y: 0.2, width: 0.1, height: 0.1 }];
    const r0 = planRegionViewRect(rects, 1, 0);
    expect(r0!.x).toBeCloseTo(0.1);
    expect(r0!.y).toBeCloseTo(0.2);
    expect(r0!.width).toBeCloseTo(0.1);
    expect(r0!.height).toBeCloseTo(0.1);
    const r90 = planRegionViewRect(rects, 1, 90);
    expect(r90!.x).toBeCloseTo(1 - 0.2 - 0.1);
    expect(r90!.y).toBeCloseTo(0.1);
  });

  test("no rects on the requested page → null (never an empty crop POSTed)", () => {
    const rects = [{ page: 3, x: 0.1, y: 0.1, width: 0.1, height: 0.1 }];
    expect(planRegionViewRect(rects, 1, 0)).toBeNull();
  });
});

describe("T-MG-CROPMARK-1 run-002 — the render-resolution plan (planCrop)", () => {
  test("fractions × bitmap dims, rounded (the §3.4 render-resolution law)", () => {
    const plan = planCrop({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, { width: 1000, height: 1400 });
    expect(plan).toEqual({ sx: 250, sy: 700, sw: 500, sh: 350 });
  });

  test("sub-pixel slivers round to ≥1px or refuse", () => {
    expect(planCrop({ x: 0, y: 0, width: 0.0005, height: 0.5 }, { width: 1000, height: 1400 })).not.toBeNull();
    expect(planCrop({ x: 0, y: 0, width: 0.0001, height: 0.5 }, { width: 1000, height: 1400 })).toBeNull();
  });

  test("a zero bitmap refuses (no canvas truth, no crop)", () => {
    expect(planCrop({ x: 0, y: 0, width: 0.5, height: 0.5 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe("T-MG-CROPMARK-1 run-002 — the wire law (data-URL bytes + the 4 MB choice)", () => {
  test("estimateDataUrlBytes: ⌊chars·3/4⌋ payload only (header excluded)", () => {
    // 4 base64 chars → 3 bytes
    expect(estimateDataUrlBytes("data:image/png;base64,AAAA")).toBe(3);
    expect(estimateDataUrlBytes("data:image/png;base64,AAAAAA=")).toBe(5); // 7 chars → 5.25 → 5
    expect(estimateDataUrlBytes("data:image/png;base64,AAAAAAA=")).toBe(6); // 8 chars → 6
    expect(estimateDataUrlBytes("no-comma-here")).toBe(0);
  });

  test("chooseImageDataUrl: png under the cap wins and jpeg is NEVER invoked", () => {
    let jpegCalled = false;
    const choice = chooseImageDataUrl(
      () => `data:image/png;base64,${"A".repeat(4)}`,
      () => {
        jpegCalled = true;
        return `data:image/jpeg;base64,${"B".repeat(8)}`;
      },
    );
    expect(choice).toEqual({ dataUrl: "data:image/png;base64,AAAA", mime: "image/png", bytes: 3 });
    expect(jpegCalled).toBe(false);
  });

  test("png over cap → jpeg 0.92 fallback under the cap", () => {
    const choice = chooseImageDataUrl(
      () => `data:image/png;base64,${"A".repeat(8_000_000)}`,
      () => `data:image/jpeg;base64,${"B".repeat(4_000_000)}`,
    );
    expect(choice).not.toBe("too_large");
    if (choice !== "too_large") expect(choice.mime).toBe("image/jpeg");
  });

  test("both over the 4 MB cap → honest too_large (refused BEFORE the POST)", () => {
    const choice = chooseImageDataUrl(
      () => `data:image/png;base64,${"A".repeat(8_000_000)}`,
      () => `data:image/jpeg;base64,${"B".repeat(8_000_000)}`,
    );
    expect(choice).toBe("too_large");
  });

  test("the cap constant is the run-001 api cap (4 MB decoded)", () => {
    expect(PAPER_MARK_BYTE_CAP).toBe(4 * 1024 * 1024);
  });
});

describe("T-MG-CROPMARK-1 run-002 — the pane-rot read (readViewerRotation)", () => {
  const fakeStorage = (raw: string | null) => {
    const map = new Map<string, string>();
    if (raw !== null) map.set("pp-viewer-prefs-v1", raw);
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      get length() {
        return map.size;
      },
    } as Storage;
  };

  test("the pane's validated rot record reads through", () => {
    expect(readViewerRotation(fakeStorage(JSON.stringify({ rot: 90 })))).toBe(90);
    expect(readViewerRotation(fakeStorage(JSON.stringify({ rot: 180 })))).toBe(180);
  });

  test("anything else is the default view (the pane's own validation law)", () => {
    expect(readViewerRotation(fakeStorage(JSON.stringify({ rot: 45 })))).toBe(0);
    expect(readViewerRotation(fakeStorage("not json"))).toBe(0);
    expect(readViewerRotation(fakeStorage(null))).toBe(0);
  });
});

describe("T-MG-CROPMARK-1 run-002 — clampRect", () => {
  test("width/height never push past the band", () => {
    const c = clampRect({ x: 0.8, y: 0.9, width: 0.5, height: 0.5 });
    expect(c.x).toBe(0.8);
    expect(c.y).toBe(0.9);
    expect(c.width).toBeCloseTo(0.2);
    expect(c.height).toBeCloseTo(0.1);
  });
});
