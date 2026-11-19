#!/usr/bin/env python3
"""Append the phase-C component pins (U14/U15) to scientific-calculator.test.ts."""
P = "apps/hub/src/components/pastpapers/calc/scientific-calculator.test.ts"
s = open(P, encoding="utf-8").read()

pins = '''

// ── T-MG-CALC-2 phase C: the Statistics and Table apps (the spec pin 5 —
// the ONLY new app surfaces; the fence holds on everything else). ──

function screenOf(el: HTMLElement): string | null {
  return el.querySelector("[data-calc-screen]")?.getAttribute("data-calc-screen") ?? null;
}

function cellText(el: HTMLElement, sel: string): string {
  return el.querySelector(sel)?.textContent ?? "";
}

describe("(U14) the Statistics app — the manual's flow, end to end", () => {
  test("(U14a) the launch law: Statistics opens the type menu; Ratio still the notice", () => {
    const { root, el } = mountCW();
    clickKey(el, "Home");
    clickCtl(el, "data-calc-app", "statistics");
    expect(screenOf(el)).toBe("stat-type");
    expect(el.querySelector('[data-calc-screen-btn="1-Variable"]')).not.toBeNull();
    expect(el.querySelector('[data-calc-screen-btn="2-Variable"]')).not.toBeNull();
    clickCtl(el, "data-calc-screen-btn", "Stat back");
    clickKey(el, "Home");
    clickCtl(el, "data-calc-app", "ratio");
    expect(screenOf(el)).toBe("notice"); // the exam-honest fence holds
    act(() => {
      root.unmount();
    });
  });

  test("(U14b) 1-variable end-to-end: the editor, EXE-commit, the results menu, the value list", () => {
    const { root, el } = mountCW();
    clickKey(el, "Home");
    clickCtl(el, "data-calc-app", "statistics");
    clickCtl(el, "data-calc-screen-btn", "1-Variable");
    expect(screenOf(el)).toBe("stat-edit");
    // the entry law: the keypad's digit column feeds the editor line
    for (const v of ["1", "2", "3"]) {
      clickKey(el, v);
      clickKey(el, "Execute");
    }
    expect(el.querySelectorAll("[data-calc-stat-cell]").length).toBe(3);
    expect(cellText(el, '[data-calc-stat-cell="x-0"]')).toBe("1");
    expect(cellText(el, '[data-calc-stat-cell="x-2"]')).toBe("3");
    // EXE on an empty line opens the results menu (the device's law)
    clickKey(el, "Execute");
    expect(screenOf(el)).toBe("stat-menu");
    clickCtl(el, "data-calc-screen-btn", "1-Var Results");
    expect(screenOf(el)).toBe("stat-res");
    // the manual's value set: n, x̄, the quartiles — {1,2,3}: n=3, x̄=2,
    // Q1 1.5 / Med 2 / Q3 2.5 (the include-median halves law)
    expect(cellText(el, '[data-calc-stat-value="n"]')).toBe("3");
    expect(cellText(el, '[data-calc-stat-value="x mean"]')).toBe("2");
    expect(cellText(el, '[data-calc-stat-value="Q1"]')).toBe("1.5");
    expect(cellText(el, '[data-calc-stat-value="median"]')).toBe("2");
    expect(cellText(el, '[data-calc-stat-value="Q3"]')).toBe("2.5");
    expect(cellText(el, '[data-calc-stat-value="sum x"]')).toBe("6");
    act(() => {
      root.unmount();
    });
  });

  test("(U14c) 2-variable + the linear regression: a 0, b 2, r 1 on x={1,2,3}, y={2,4,6}", () => {
    const { root, el } = mountCW();
    clickKey(el, "Home");
    clickCtl(el, "data-calc-app", "statistics");
    clickCtl(el, "data-calc-screen-btn", "2-Variable");
    for (const v of ["1", "2", "3"]) {
      clickKey(el, v);
      clickKey(el, "Execute");
    }
    clickKey(el, "Cursor right"); // the y column (2-var only)
    for (const v of ["2", "4", "6"]) {
      clickKey(el, v);
      clickKey(el, "Execute");
    }
    clickKey(el, "Execute"); // empty line → the menu
    clickCtl(el, "data-calc-screen-btn", "Reg Results");
    expect(screenOf(el)).toBe("stat-res");
    expect(cellText(el, '[data-calc-stat-value="a"]')).toBe("0");
    expect(cellText(el, '[data-calc-stat-value="b"]')).toBe("2");
    expect(cellText(el, '[data-calc-stat-value="r"]')).toBe("1");
    act(() => {
      root.unmount();
    });
  });

  test("(U14d) the editor's row law: DEL deletes the cursor row; the empty-editor menu refuses", () => {
    const { root, el } = mountCW();
    clickKey(el, "Home");
    clickCtl(el, "data-calc-app", "statistics");
    clickCtl(el, "data-calc-screen-btn", "1-Variable");
    for (const v of ["1", "2", "3"]) {
      clickKey(el, v);
      clickKey(el, "Execute");
    }
    clickKey(el, "Cursor up"); // the cursor sits on row 2 (value 3)
    clickKey(el, "Del"); // the manual's DEL law: the row goes
    expect(cellText(el, '[data-calc-stat-cell="x-1"]')).toBe(" ");
    expect(cellText(el, '[data-calc-stat-cell="x-0"]')).toBe("1");
    // the empty-data results screen refuses with Math ERROR (no fake stats)
    clickKey(el, "Execute");
    clickCtl(el, "data-calc-screen-btn", "1-Var Results");
    expect(screenOf(el)).toBe("stat-res");
    expect(cellText(el, "[data-calc-app-error]")).toContain("Math ERROR");
    act(() => {
      root.unmount();
    });
  });
});

describe("(U15) the Table app — the manual's flow, end to end", () => {
  test("(U15a) the setup screen: Table Type chips, the missing-definition refusal", () => {
    const { root, el } = mountCW();
    clickKey(el, "Home");
    clickCtl(el, "data-calc-app", "table");
    expect(screenOf(el)).toBe("table-setup");
    expect(cellText(el, "[data-calc-screen=\\"table-setup\\"]")).toContain("not set");
    clickCtl(el, "data-calc-screen-btn", "Table type f(x)");
    // Start 0, End 2, Step 1 via the field buttons + the keypad column
    for (const [field, digits] of [["Table start", "0"], ["Table end", "2"], ["Table step", "1"]] as const) {
      clickCtl(el, "data-calc-screen-btn", field);
      for (const d of digits) clickKey(el, d);
    }
    clickCtl(el, "data-calc-screen-btn", "Execute table");
    // f(x) is not defined → the honest Math ERROR, no fake table
    expect(screenOf(el)).toBe("table-setup");
    expect(cellText(el, "[data-calc-app-error]")).toContain("Math ERROR");
    act(() => {
      root.unmount();
    });
  });

  test("(U15b) the full flow: define f(x)=x×x+1 on the FUNCTION sheet, generate, read the table + the x side effect", () => {
    const { root, el } = mountCW();
    // f(x) = x×x+1 from the calc entry (the FUNCTION sheet's Store law)
    clickKey(el, "variable x");
    clickKey(el, "Multiply");
    clickKey(el, "variable x");
    clickKey(el, "Add");
    clickKey(el, "1");
    clickKey(el, "Function");
    clickCtl(el, "data-calc-screen-btn", "Define function f from entry");
    // the Table app: the range 0..2 step 1
    clickKey(el, "Home");
    clickCtl(el, "data-calc-app", "table");
    for (const [field, digits] of [["Table start", "0"], ["Table end", "2"], ["Table step", "1"]] as const) {
      clickCtl(el, "data-calc-screen-btn", field);
      for (const d of digits) clickKey(el, d);
    }
    clickCtl(el, "data-calc-screen-btn", "Execute table");
    expect(screenOf(el)).toBe("table-res");
    // the manual's own example law: exact values, no drift
    expect(cellText(el, '[data-calc-table-cell="x-0"]')).toBe("0");
    expect(cellText(el, '[data-calc-table-cell="f-0"]')).toBe("1");
    expect(cellText(el, '[data-calc-table-cell="f-1"]')).toBe("2");
    expect(cellText(el, '[data-calc-table-cell="f-2"]')).toBe("5");
    // the manual's side-effect law: generation changes variable x
    clickCtl(el, "data-calc-screen-btn", "Table back");
    clickKey(el, "Home");
    clickCtl(el, "data-calc-app", "table"); // relaunch — the range resets (the retention law)
    expect(cellText(el, "[data-calc-table-field=\\"start\\"]")).toBe("—");
    act(() => {
      root.unmount();
    });
    // the variable store: the vars sheet shows x = 2 (read from the same mount's DOM is gone;
    // the side-effect law is engine-pinned in calc-apps.test.ts T3a via lastX; here we assert
    // the relaunch-reset retention law, which is the component's half of the manual's table).
  });

  test("(U15c) the range laws on the screen: step 0 and the 45-row cap are Range ERROR with the hint", () => {
    const { root, el } = mountCW();
    clickKey(el, "variable x");
    clickKey(el, "Multiply");
    clickKey(el, "variable x");
    clickKey(el, "Add");
    clickKey(el, "1");
    clickKey(el, "Function");
    clickCtl(el, "data-calc-screen-btn", "Define function f from entry");
    clickKey(el, "Home");
    clickCtl(el, "data-calc-app", "table");
    // step 0 → Range ERROR
    for (const [field, digits] of [["Table start", "0"], ["Table end", "2"], ["Table step", "0"]] as const) {
      clickCtl(el, "data-calc-screen-btn", field);
      for (const d of digits) clickKey(el, d);
    }
    clickCtl(el, "data-calc-screen-btn", "Execute table");
    expect(screenOf(el)).toBe("table-setup");
    expect(cellText(el, "[data-calc-app-error]")).toContain("Range ERROR");
    // 0..1 step 0.01 → 101 rows > the 45-row cap → Range ERROR
    clickCtl(el, "data-calc-screen-btn", "Table step");
    for (const d of ["0"]) clickKey(el, d);
    clickKey(el, "Decimal point");
    clickKey(el, "0");
    clickKey(el, "1");
    clickCtl(el, "data-calc-screen-btn", "Execute table");
    expect(screenOf(el)).toBe("table-setup");
    expect(cellText(el, "[data-calc-app-error]")).toContain("Range ERROR");
    expect(cellText(el, "[data-calc-app-error]")).toContain("45");
    act(() => {
      root.unmount();
    });
  });
});
'''

s = s.rstrip() + "\n" + pins
open(P, "w", encoding="utf-8").write(s)
print("U14/U15 appended")
