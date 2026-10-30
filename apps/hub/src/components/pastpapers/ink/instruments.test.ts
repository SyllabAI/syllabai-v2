/**
 * Maths instrument tests — T-MG-INK-2 run-001. The run-003 test-shape law
 * (pins named by the law they pin) over the PURE module: the angle
 * convention, the aspect-correct projection law (the anisotropic-page
 * trap), the ruler/protractor snap laws (clean-commit vs live path vs
 * honest raw fallback), the zero-schema-impact circle/arc emission, and
 * the guide drag/rotate math.
 */
import { describe, expect, test } from "bun:test";

import {
  ARC_STEP_DEG,
  MIN_COMMIT_RADIUS_PX,
  PROTRACTOR_BAND_PX,
  RULER_BAND_PX,
  angleDegFrom,
  applyProtractorSnap,
  applyRulerSnap,
  compassesCommitable,
  compassesRadiusFrac,
  degNormalize,
  grabOffset,
  inRimSpan,
  moveGuide,
  newProtractorGuide,
  newRulerGuide,
  protractorBase,
  protractorRimStart,
  protractorRotateTo,
  projectOntoRuler,
  protractorLivePoint,
  rulerEdgeEndpoints,
  rulerLivePoint,
  rulerRotateTo,
  sampleArc,
  sampleCircleCompasses,
  shortestSignedDelta,
  type Box,
} from "./instruments";

// A4 portrait-ish page box (anisotropic — the aspect trap lives here).
const BOX: Box = { cssW: 800, cssH: 1100 };
const SQUARE: Box = { cssW: 800, cssH: 800 };

describe("T-MG-INK-2 run-001 — the angle convention (screen: y down, 0°=east, clockwise)", () => {
  test("angleDegFrom: east 0°, south 90°, west 180°, north 270°", () => {
    const c = { x: 400, y: 550 };
    expect(angleDegFrom(c, { x: 500, y: 550 })).toBe(0);
    expect(angleDegFrom(c, { x: 400, y: 650 })).toBe(90);
    expect(angleDegFrom(c, { x: 300, y: 550 })).toBe(180);
    expect(angleDegFrom(c, { x: 400, y: 450 })).toBe(270);
  });

  test("degNormalize folds into [0,360); shortestSignedDelta stays in (−180,180]", () => {
    expect(degNormalize(-90)).toBe(270);
    expect(degNormalize(450)).toBe(90);
    expect(shortestSignedDelta(350, 10)).toBe(20);
    expect(shortestSignedDelta(10, 350)).toBe(-20);
    expect(shortestSignedDelta(0, 180)).toBe(180);
  });

  test("inRimSpan covers exactly the semicircle from rimStart", () => {
    expect(inRimSpan(180, 180)).toBe(true);
    expect(inRimSpan(270, 180)).toBe(true);
    expect(inRimSpan(360, 180)).toBe(true);
    expect(inRimSpan(179, 180)).toBe(false);
    // 0° ≡ 360° = the rim's INCLUSIVE far end (a real protractor draws at both ends)
    expect(inRimSpan(0, 180)).toBe(true);
    expect(inRimSpan(1, 180)).toBe(false);
  });
});

describe("T-MG-INK-2 run-001 — the aspect-correct projection law (the anisotropic trap)", () => {
  test("rulerEdgeEndpoints on a square box: 0° edge is horizontal, lengthFrac exact", () => {
    const r = newRulerGuide(1, { x: 0.5, y: 0.5 });
    r.lengthFrac = 0.5;
    const { a, b } = rulerEdgeEndpoints(r, SQUARE);
    expect(a.x).toBeCloseTo(0.25, 10);
    expect(b.x).toBeCloseTo(0.75, 10);
    expect(a.y).toBeCloseTo(0.5, 10);
    expect(b.y).toBeCloseTo(0.5, 10);
  });

  test("45° edge on an ANISOTROPIC box: endpoints equidistant in PX space (not fractions)", () => {
    const r = newRulerGuide(1, { x: 0.5, y: 0.5 });
    r.lengthFrac = 0.5;
    r.angleDeg = 45;
    const { a, b } = rulerEdgeEndpoints(r, BOX);
    // px length along the edge = lengthFrac * cssW = 400 → half = 200px each way
    const halfPx = 200;
    const cPx = { x: 400, y: 550 };
    const expectPx = (deg: number) => ({
      x: cPx.x + Math.cos((deg * Math.PI) / 180) * halfPx,
      y: cPx.y + Math.sin((deg * Math.PI) / 180) * halfPx,
    });
    const ea = expectPx(180 + 45);
    const eb = expectPx(45);
    expect(a.x * BOX.cssW).toBeCloseTo(ea.x, 6);
    expect(a.y * BOX.cssH).toBeCloseTo(ea.y, 6);
    expect(b.x * BOX.cssW).toBeCloseTo(eb.x, 6);
    expect(b.y * BOX.cssH).toBeCloseTo(eb.y, 6);
  });

  test("projectOntoRuler: the foot is the PX-space perpendicular (a fraction-space naive projection would land elsewhere)", () => {
    const r = newRulerGuide(1, { x: 0.5, y: 0.5 });
    r.lengthFrac = 0.5;
    r.angleDeg = 45;
    // a point whose perpendicular foot lands INSIDE the segment
    const p = { x: 0.5, y: 0.35 };
    const pr = projectOntoRuler(p, r, BOX);
    // distance measured in px equals the true point-line px distance
    const { a, b } = rulerEdgeEndpoints(r, BOX);
    const ax = a.x * BOX.cssW;
    const ay = a.y * BOX.cssH;
    const bx = b.x * BOX.cssW;
    const by = b.y * BOX.cssH;
    const px = p.x * BOX.cssW;
    const py = p.y * BOX.cssH;
    const num = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax);
    const den = Math.hypot(by - ay, bx - ax);
    expect(pr.distPx).toBeCloseTo(num / den, 6);
  });
});

describe("T-MG-INK-2 run-001 — the ruler snap law", () => {
  const r = newRulerGuide(1, { x: 0.5, y: 0.5 });
  r.lengthFrac = 0.5;

  test("applyRulerSnap: both endpoints in the band → clean straight 2-point stroke on the edge", () => {
    // 0° ruler centered mid-page: edge y = 0.5·1100 = 550px; band 6px
    const yFrac = 550 / BOX.cssH + 3 / BOX.cssH; // 3px below the edge
    const snap = applyRulerSnap(
      { x: 0.35, y: yFrac },
      { x: 0.65, y: yFrac },
      r,
      BOX,
    );
    expect(snap).not.toBeNull();
    expect(snap!.length).toBe(2);
    expect(snap![0][1]).toBeCloseTo(0.5, 10);
    expect(snap![1][1]).toBeCloseTo(0.5, 10);
    expect(snap![0][0]).toBeCloseTo(0.35, 10);
    expect(snap![1][0]).toBeCloseTo(0.65, 10);
  });

  test("applyRulerSnap: an endpoint beyond the band → null (honest raw fallback)", () => {
    const near = 550 / BOX.cssH + 3 / BOX.cssH;
    const far = 550 / BOX.cssH + 40 / BOX.cssH;
    expect(applyRulerSnap({ x: 0.35, y: near }, { x: 0.65, y: far }, r, BOX)).toBeNull();
  });

  test("applyRulerSnap: an endpoint beyond the ruler's ENDS → null (no folding to the tip)", () => {
    const yFrac = 550 / BOX.cssH + 2 / BOX.cssH;
    // x=0.1 is left of the edge span [0.25, 0.75]
    expect(applyRulerSnap({ x: 0.1, y: yFrac }, { x: 0.5, y: yFrac }, r, BOX)).toBeNull();
  });

  test("rulerLivePoint: near the edge projects, off the edge stays raw (null)", () => {
    const near = { x: 0.5, y: 550 / BOX.cssH + 4 / BOX.cssH };
    const live = rulerLivePoint(near, r, BOX);
    expect(live).not.toBeNull();
    expect(live!.y).toBeCloseTo(0.5, 10);
    expect(rulerLivePoint({ x: 0.5, y: 0.2 }, r, BOX)).toBeNull();
  });

  test("rulerRotateTo quantizes to 1° and keeps the center", () => {
    const pointer = { x: 0.6, y: 0.3 };
    const rotated = rulerRotateTo(r, pointer, BOX);
    expect(rotated.angleDeg).toBe(Math.round(rotated.angleDeg));
    expect(rotated.x).toBe(r.x);
    expect(rotated.y).toBe(r.y);
  });

  test("RULER_BAND_PX is the documented 6px", () => {
    expect(RULER_BAND_PX).toBe(6);
  });
});

describe("T-MG-INK-2 run-001 — the protractor snap law", () => {
  // 0° base → rim spans [180, 360] (the visual upper half, y-down).
  const pro = newProtractorGuide(1, { x: 0.5, y: 0.5 });

  test("protractorRimStart = base+180; base endpoints aspect-correct", () => {
    expect(protractorRimStart(pro)).toBe(180);
    const { a, b } = protractorBase(pro, BOX);
    // radius 0.22·800 = 176px along x at 0°
    expect(a.x * BOX.cssW).toBeCloseTo(400 + 176, 6);
    expect(b.x * BOX.cssW).toBeCloseTo(400 - 176, 6);
    expect(a.y * BOX.cssH).toBeCloseTo(550, 6);
  });

  test("applyProtractorSnap: both endpoints on the rim → sampled arc with the swept readout", () => {
    const rPx = 0.22 * BOX.cssW;
    const c = { x: 400, y: 550 };
    const at = (deg: number) => ({
      x: (c.x + Math.cos((deg * Math.PI) / 180) * rPx) / BOX.cssW,
      y: (c.y + Math.sin((deg * Math.PI) / 180) * rPx) / BOX.cssH,
    });
    const res = applyProtractorSnap(at(200), at(250), pro, BOX);
    expect(res).not.toBeNull();
    expect(res!.sweptDeg).toBeCloseTo(50, 6);
    // every emitted point sits on the rim (px distance = r within step error)
    for (const [fx, fy] of res!.points) {
      const d = Math.hypot(fx * BOX.cssW - c.x, fy * BOX.cssH - c.y);
      expect(d).toBeGreaterThan(rPx - 1);
      expect(d).toBeLessThan(rPx + 1);
    }
    // the arc stays inside the rim span [180, 360]
    const first = res!.points[0];
    const last = res!.points[res!.points.length - 1];
    expect(angleDegFrom(c, { x: first[0] * BOX.cssW, y: first[1] * BOX.cssH })).toBeCloseTo(200, 0);
    expect(angleDegFrom(c, { x: last[0] * BOX.cssW, y: last[1] * BOX.cssH })).toBeCloseTo(250, 0);
  });

  test("applyProtractorSnap: an angle outside the semicircle → null (the base side never snaps)", () => {
    const rPx = 0.22 * BOX.cssW;
    const c = { x: 400, y: 550 };
    const at = (deg: number) => ({
      x: (c.x + Math.cos((deg * Math.PI) / 180) * rPx) / BOX.cssW,
      y: (c.y + Math.sin((deg * Math.PI) / 180) * rPx) / BOX.cssH,
    });
    // 90° is inside the rim? rim = [180,360]; 90 is the BASE side → null
    expect(applyProtractorSnap(at(90), at(100), pro, BOX)).toBeNull();
  });

  test("applyProtractorSnap: an endpoint off the radius band → null", () => {
    const c = { x: 400, y: 550 };
    const rPx = 0.22 * BOX.cssW;
    const onRim = {
      x: (c.x + rPx) / BOX.cssW,
      y: c.y / BOX.cssH,
    };
    const offRim = { x: (c.x + rPx + 30) / BOX.cssW, y: c.y / BOX.cssH };
    expect(applyProtractorSnap(onRim, offRim, pro, BOX)).toBeNull();
  });

  test("protractorLivePoint forces the radius to the rim inside the span, null outside", () => {
    const c = { x: 400, y: 550 };
    const rPx = 0.22 * BOX.cssW;
    // slightly inside the rim at 270° (straight up)
    const p = {
      x: (c.x + Math.cos((270 * Math.PI) / 180) * (rPx - 3)) / BOX.cssW,
      y: (c.y + Math.sin((270 * Math.PI) / 180) * (rPx - 3)) / BOX.cssH,
    };
    const live = protractorLivePoint(p, pro, BOX);
    expect(live).not.toBeNull();
    const d = Math.hypot(live!.x * BOX.cssW - c.x, live!.y * BOX.cssH - c.y);
    expect(d).toBeCloseTo(rPx, 6);
    // base side (90°) never snaps
    const baseSide = {
      x: (c.x + Math.cos((90 * Math.PI) / 180) * (rPx - 3)) / BOX.cssW,
      y: (c.y + Math.sin((90 * Math.PI) / 180) * (rPx - 3)) / BOX.cssH,
    };
    expect(protractorLivePoint(baseSide, pro, BOX)).toBeNull();
  });

  test("protractorRotateTo turns the base toward the pointer", () => {
    const rotated = protractorRotateTo(pro, { x: 0.7, y: 0.3 }, BOX);
    expect(rotated.angleDeg).toBe(Math.round(rotated.angleDeg));
    expect(rotated.x).toBe(pro.x);
  });

  test("PROTRACTOR_BAND_PX is the documented 8px", () => {
    expect(PROTRACTOR_BAND_PX).toBe(8);
  });
});

describe("T-MG-INK-2 run-001 — the zero-schema-impact circle law (compasses)", () => {
  test("sampleCircleCompasses emits a CLOSED polyline: first point repeated at the end", () => {
    const pts = sampleCircleCompasses({ x: 0.5, y: 0.5 }, 0.1, SQUARE);
    expect(pts.length).toBeGreaterThan(90);
    expect(pts[0][0]).toBeCloseTo(pts[pts.length - 1][0], 12);
    expect(pts[0][1]).toBeCloseTo(pts[pts.length - 1][1], 12);
  });

  test("the sampled circle is a TRUE circle in px space on an anisotropic box (radius uniform within the step error)", () => {
    const pivot = { x: 0.5, y: 0.5 };
    const radiusFrac = 0.1;
    const rPx = radiusFrac * BOX.cssW;
    const pts = sampleCircleCompasses(pivot, radiusFrac, BOX);
    const c = { x: 400, y: 550 };
    for (const [fx, fy] of pts) {
      const d = Math.hypot(fx * BOX.cssW - c.x, fy * BOX.cssH - c.y);
      expect(d).toBeLessThan(rPx + 1);
      expect(d).toBeGreaterThan(rPx - 1);
    }
  });

  test("ARC_STEP_DEG bounds the point count (2° → 181 open points + the closure repeat)", () => {
    expect(ARC_STEP_DEG).toBe(2);
    const pts = sampleCircleCompasses({ x: 0.5, y: 0.5 }, 0.1, SQUARE);
    expect(pts.length).toBe(182);
  });

  test("compassesRadiusFrac measures in px over the page width; sub-min taps are not committable", () => {
    const box = { cssW: 800, cssH: 1000 };
    const r = compassesRadiusFrac({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, box);
    expect(r).toBeCloseTo(0.1, 10);
    expect(compassesCommitable(r, box)).toBe(true);
    const tiny = compassesRadiusFrac({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 + 1 / box.cssH }, box);
    expect(tiny * box.cssW).toBeLessThan(MIN_COMMIT_RADIUS_PX);
    expect(compassesCommitable(tiny, box)).toBe(false);
  });
});

describe("T-MG-INK-2 run-001 — the guide drag/rotate math", () => {
  test("grabOffset + moveGuide preserve the grab point under the pointer", () => {
    const g = newRulerGuide(1, { x: 0.5, y: 0.4 });
    const pointer = { x: 0.42, y: 0.33 };
    const off = grabOffset(g, pointer);
    const moved = moveGuide(g, pointer, off);
    expect(moved.x).toBeCloseTo(pointer.x - off.x, 12);
    expect(moved.x).toBeCloseTo(0.5, 12);
    expect(moved.y).toBeCloseTo(0.4, 12);
  });

  test("moveGuide clamps the center into the page (the guide never leaves the paper)", () => {
    const g = newRulerGuide(1, { x: 0.5, y: 0.5 });
    const moved = moveGuide(g, { x: 1.2, y: -0.3 }, { x: 0, y: 0 });
    expect(moved.x).toBe(1);
    expect(moved.y).toBe(0);
  });

  test("sampleArc walks a0→a1 preserving signed direction (negative sweep included)", () => {
    const pts = sampleArc({ x: 0.5, y: 0.5 }, 100, 300, 260, SQUARE, 10);
    // 300 → 260 is a −40° sweep: first at 300°, last at 260°
    const c = { x: 400, y: 400 };
    const a0 = angleDegFrom(c, { x: pts[0][0] * 800, y: pts[0][1] * 800 });
    const a1 = angleDegFrom(c, {
      x: pts[pts.length - 1][0] * 800,
      y: pts[pts.length - 1][1] * 800,
    });
    expect(degNormalize(a0)).toBeCloseTo(300, 0);
    expect(degNormalize(a1)).toBeCloseTo(260, 0);
  });
});
