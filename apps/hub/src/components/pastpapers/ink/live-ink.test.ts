/**
 * Live-ink registry tests — T-MG-CROPMARK-1 run-002. The read-seam law:
 * keyed by sourceUrl, honest-empty when absent or disposed, never a stale
 * set after unregister, read-only (the single-writer law untouched).
 */
import { describe, expect, test } from "bun:test";

import type { InkShape } from "../ink/ink";
import { readLiveInk, registerLiveInk, unregisterLiveInk } from "./live-ink";

const stroke = (id: string): InkShape => ({
  id,
  kind: "stroke",
  page: 1,
  color: "black",
  widthFrac: 0.003,
  points: [
    [0.1, 0.1],
    [0.2, 0.2],
  ],
});

describe("T-MG-CROPMARK-1 run-002 — the live-ink read seam", () => {
  test("an unregistered document reads the honest empty set", () => {
    expect(readLiveInk("https://papers.example/qp.pdf")).toEqual([]);
  });

  test("register → read returns the CURRENT set (fresh array each call)", () => {
    const url = "https://papers.example/qp-a.pdf";
    let working: InkShape[] = [stroke("s1")];
    registerLiveInk(url, () => working);
    expect(readLiveInk(url)).toEqual([stroke("s1")]);
    // the debounce-window edit is visible immediately (the draw-then-mark race law)
    working = [...working, stroke("s2")];
    expect(readLiveInk(url).length).toBe(2);
    unregisterLiveInk(url);
  });

  test("unregister → honest empty (never a stale set)", () => {
    const url = "https://papers.example/qp-b.pdf";
    registerLiveInk(url, () => [stroke("s1")]);
    unregisterLiveInk(url);
    expect(readLiveInk(url)).toEqual([]);
  });

  test("re-registration overwrites (a remount never doubles the reader)", () => {
    const url = "https://papers.example/qp-c.pdf";
    registerLiveInk(url, () => [stroke("a")]);
    registerLiveInk(url, () => [stroke("b")]);
    expect(readLiveInk(url)).toEqual([stroke("b")]);
    unregisterLiveInk(url);
  });

  test("keys are independent (two documents never cross-read)", () => {
    const a = "https://papers.example/qp-d.pdf";
    const b = "https://papers.example/qp-e.pdf";
    registerLiveInk(a, () => [stroke("only-a")]);
    expect(readLiveInk(b)).toEqual([]);
    expect(readLiveInk(a).length).toBe(1);
    unregisterLiveInk(a);
  });
});
