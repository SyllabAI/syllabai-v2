import { describe, expect, test } from "bun:test";

import { radioNav, rovingTabIndex } from "./radio-nav";

describe("rovingTabIndex — the one-tab-stop radiogroup law", () => {
  test("checked option is the tab stop", () => {
    expect(rovingTabIndex(true, false, true)).toBe(0);
    expect(rovingTabIndex(true, true, true)).toBe(0);
  });

  test("nothing checked yet — the FIRST option carries the stop", () => {
    expect(rovingTabIndex(false, true, false)).toBe(0);
    expect(rovingTabIndex(false, false, false)).toBe(-1);
  });

  test("something checked — every unchecked option is arrow-reached, never Tab-reached", () => {
    expect(rovingTabIndex(false, true, true)).toBe(-1);
    expect(rovingTabIndex(false, false, true)).toBe(-1);
  });
});

describe("radioNav — arrow movement with wrap-around", () => {
  const N = 4;

  test("forward arrows advance and wrap", () => {
    for (const key of ["ArrowDown", "ArrowRight"]) {
      expect(radioNav(key, 0, N).nextIndex).toBe(1);
      expect(radioNav(key, 3, N).nextIndex).toBe(0);
    }
  });

  test("backward arrows retreat and wrap", () => {
    for (const key of ["ArrowUp", "ArrowLeft"]) {
      expect(radioNav(key, 2, N).nextIndex).toBe(1);
      expect(radioNav(key, 0, N).nextIndex).toBe(3);
    }
  });

  test("Home / End jump to the ends", () => {
    expect(radioNav("Home", 2, N).nextIndex).toBe(0);
    expect(radioNav("End", 2, N).nextIndex).toBe(3);
  });

  test("keys outside the group's business are not handled", () => {
    for (const key of [" ", "Enter", "Escape", "Tab", "a"]) {
      expect(radioNav(key, 1, N)).toEqual({ handled: false, nextIndex: null });
    }
  });

  test("degenerate groups are never navigated into", () => {
    expect(radioNav("ArrowDown", 0, 0)).toEqual({ handled: false, nextIndex: null });
    expect(radioNav("ArrowDown", 5, 4)).toEqual({ handled: false, nextIndex: null });
    expect(radioNav("ArrowDown", -1, 4)).toEqual({ handled: false, nextIndex: null });
  });
});
