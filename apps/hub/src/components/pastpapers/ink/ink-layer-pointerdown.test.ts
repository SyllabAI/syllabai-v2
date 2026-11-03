/**
 * ink-layer-pointerdown.test.ts — T-MG-INK-6 run-002, the pointerdown
 * law's regression seam (plan of record docs/MG-MARK-PARITY-PLAN.md §3.9;
 * spec of record .syllabai/tasks/T-MG-INK-6.yaml).
 *
 * The defect of record (proven live on production, 2026-11-01): with the
 * Text (T) or Math (Σ) tool active, a REAL pointer tap opened the draft
 * textarea and the SAME gesture closed it — the browser's compat
 * mousedown moved press-focus off the autoFocus'd editor, whose onBlur
 * committed the empty draft. The fix is the pointerdown law: the
 * mode==="text" and mode==="math" branches of the InkCanvas
 * onPointerDown call e.preventDefault() on the opening press (after the
 * right-button guard, before any setDraft/setMathDraft), which per the
 * Pointer Events spec's compatibility mapping suppresses the compat
 * mousedown.
 *
 * What THIS seam pins (jsdom; the browser-side focus-steal itself cannot
 * be reproduced here — jsdom has no default mousedown-focus action — so
 * the law's observable is the preventDefault call, and the editor
 * surviving the full trusted-gesture tail):
 *   (a) text/math pointerdown calls preventDefault EXACTLY once — create
 *       and re-edit taps, mouse and touch/pen alike;
 *   (b) pen/line/erase/select pointerdown NEVER calls it (the working
 *       tools gain nothing), and the right-button guard still precedes
 *       the law (context menus survive);
 *   (c) the draft editor MOUNTS with the correct aria-label (create) /
 *       prefilled value (re-edit) and stays mounted through the gesture
 *       tail (mousedown → pointerup → click), focused;
 *   (d) the commit laws of record: TEXT (T-MG-INK-9, MG's posture) —
 *       Enter is a NEWLINE, the edit commits on click-away (blur) or
 *       Escape (stop-editing: non-empty commits, empty cancels); MATH —
 *       Enter commits, Escape discards, blur commits/cancels (with the
 *       editor-chrome guard), empty commits cancel, the re-edit path
 *       lands onCommitTextEdit/onCommitMathEdit with the SAME id, and
 *       both commit at MG's 16 css px default (INK_TEXT_BASE_PX);
 *   (e) the T-MG-INK-9 surface: the cursor map (MG's extracted postures),
 *       the ⌨ toggle (MG's verbatim "Toggle Virtual Keyboard" label)
 *       and the census keyboard portal (closed on create, MG's posture).
 *   (f) T-MG-INK-10: MG's armed-tool hover chips — "Add text"/"Add maths"
 *       follow the cursor in the handwriting stack at MG's exact posture
 *       (rgb(159,168,178) @ 0.6, vertically centred; maths +14px/18px,
 *       text 24px/500); the working tools show none; the editor-open
 *       gate and the per-arm spend law (a placement spends the chip
 *       until the tool is re-armed) pin MG's behavior.
 *
 * IMPORT-ORDER LAW: the harness MUST be the first import — it installs
 * the jsdom globals (incl. the oninput gate) BEFORE react-dom evaluates
 * its module-init DOM detection. See the harness header for the full
 * mechanism.
 */
import "./ink-layer-pointerdown.harness";

import { afterEach, describe, expect, mock, test } from "bun:test";

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { InkCanvas, type InkCanvasProps } from "./InkLayer";
import type { InkColor, InkMathShape, InkShape, InkTextShape } from "./ink";
import {
  PAGE_H,
  PAGE_W,
  blurEditor,
  doc,
  jsdomMouseEvent,
  pressKey,
  pressPointerDown,
  typeIn,
} from "./ink-layer-pointerdown.harness";

// ── fixtures ──

const TEXT_SHAPE: InkTextShape = {
  id: "t1",
  kind: "text",
  page: 1,
  color: "red" as InkColor,
  sizeFrac: 0.035,
  x: 0.25,
  y: 0.25,
  text: "hi",
};

const MTEXT_SHAPE: InkMathShape = {
  id: "m1",
  kind: "mtext",
  page: 1,
  color: "red" as InkColor,
  sizeFrac: 0.035,
  x: 0.25,
  y: 0.25,
  tex: "x^2",
};

// ── mount harness ──

let lastUnmount: (() => Promise<void>) | null = null;

async function mountInkCanvas(overrides: Partial<InkCanvasProps> = {}) {
  const commits = {
    stroke: mock((_page: number, _points: Array<[number, number]>) => {}),
    text: mock((_shape: Omit<InkTextShape, "id" | "kind">) => {}),
    math: mock((_shape: Omit<InkMathShape, "id" | "kind">) => {}),
    textEdit: mock((_id: string, _text: string) => {}),
    mathEdit: mock((_id: string, _tex: string) => {}),
    erase: mock((_ids: string[]) => {}),
    move: mock((_shape: InkShape) => {}),
  };
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container);
  const props: InkCanvasProps = {
    page: 1,
    shapes: [],
    mode: "pen",
    color: "red" as InkColor,
    widthFrac: 0.0038,
    onCommitStroke: commits.stroke,
    onCommitText: commits.text,
    onCommitMath: commits.math,
    onCommitTextEdit: commits.textEdit,
    onCommitMathEdit: commits.mathEdit,
    onCommitErase: commits.erase,
    onCommitMove: commits.move,
    ...overrides,
  };
  await act(async () => {
    root.render(React.createElement(InkCanvas, props));
  });
  const canvas = container.querySelector("canvas")!;
  lastUnmount = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    lastUnmount = null;
  };
  return { commits, canvas, container };
}

function queryDraft(container: Element, label: string): HTMLTextAreaElement | null {
  return container.querySelector(`textarea[aria-label="${label}"]`);
}

async function dispatchOn(canvas: Element, ev: Event) {
  await act(async () => {
    canvas.dispatchEvent(ev);
  });
}

// ── the seam ──

afterEach(async () => {
  if (lastUnmount) await lastUnmount();
});

describe("T-MG-INK-6 run-002 — the pointerdown law (the InkCanvas handler seam)", () => {
  test("(a) mode=text opening press calls preventDefault EXACTLY once and the create editor mounts", async () => {
    const { canvas, container } = await mountInkCanvas({ mode: "text" });
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
    await dispatchOn(canvas, press.ev);
    expect(press.calls()).toBe(1);
    expect(press.ev.defaultPrevented).toBe(true);
    expect(queryDraft(container, "New text annotation")).not.toBeNull();
  });

  test("(a) mode=math opening press calls preventDefault EXACTLY once and the create editor mounts", async () => {
    const { canvas, container } = await mountInkCanvas({ mode: "math" });
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
    await dispatchOn(canvas, press.ev);
    expect(press.calls()).toBe(1);
    expect(press.ev.defaultPrevented).toBe(true);
    expect(queryDraft(container, "New math annotation")).not.toBeNull();
  });

  test("(a) the law covers touch/pen uniformly (pointerType=touch, mouse guard not applicable)", async () => {
    const { canvas, container } = await mountInkCanvas({ mode: "text" });
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82, pointerType: "touch" });
    await dispatchOn(canvas, press.ev);
    expect(press.calls()).toBe(1);
    expect(queryDraft(container, "New text annotation")).not.toBeNull();
  });

  test("(a) the re-edit tap (existing text box) calls preventDefault and opens PREFILLED", async () => {
    const { canvas, container } = await mountInkCanvas({ mode: "text", shapes: [TEXT_SHAPE] });
    // text bounds law: anchor (100,75), 2 chars × 0.6 × 16px = 19.2 wide —
    // (106,82) lands inside; topmost-of-family wins over the empty canvas.
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
    await dispatchOn(canvas, press.ev);
    expect(press.calls()).toBe(1);
    const ta = queryDraft(container, "Edit text annotation");
    expect(ta).not.toBeNull();
    expect(ta!.value).toBe("hi");
  });

  test("(a) the re-edit tap (existing mtext) calls preventDefault and opens PREFILLED tex", async () => {
    const { canvas, container } = await mountInkCanvas({ mode: "math", shapes: [MTEXT_SHAPE] });
    // the measured-truth hit law — jsdom rects are zero-sized, so the
    // measured box collapses to the anchor; the 4px inflate admits the
    // exact-anchor tap.
    const press = pressPointerDown(canvas, { clientX: 100, clientY: 75 });
    await dispatchOn(canvas, press.ev);
    expect(press.calls()).toBe(1);
    const ta = queryDraft(container, "Edit math annotation");
    expect(ta).not.toBeNull();
    expect(ta!.value).toBe("x^2");
  });

  test("(b) the working tools never preventDefault: pen / line / erase / select", async () => {
    for (const mode of ["pen", "line", "erase", "select"] as const) {
      const { canvas, container } = await mountInkCanvas({ mode });
      const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
      await dispatchOn(canvas, press.ev);
      expect(press.calls()).toBe(0);
      expect(press.ev.defaultPrevented).toBe(false);
      expect(
        container.querySelector("textarea"),
        `${mode} must not mount any draft editor`,
      ).toBeNull();
    }
  });

  test("(b) the right-button guard precedes the law — context menus survive (text + math)", async () => {
    for (const mode of ["text", "math"] as const) {
      const { canvas, container } = await mountInkCanvas({ mode });
      const press = pressPointerDown(canvas, { clientX: 106, clientY: 82, button: 2 });
      await dispatchOn(canvas, press.ev);
      expect(press.calls()).toBe(0);
      expect(press.ev.defaultPrevented).toBe(false);
      expect(container.querySelector("textarea")).toBeNull();
    }
  });

  test("(c) the editor survives the trusted-gesture tail (mousedown → pointerup → click) and holds focus", async () => {
    const { canvas, container } = await mountInkCanvas({ mode: "text" });
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
    await dispatchOn(canvas, press.ev);
    const label = "New text annotation";
    expect(queryDraft(container, label)).not.toBeNull();
    // the gesture tail the browser follows with (the compat sequence that
    // used to kill the editor): dispatch it forward and prove survival.
    await dispatchOn(canvas, jsdomMouseEvent("mousedown", { bubbles: true, clientX: 106, clientY: 82 }));
    await dispatchOn(canvas, jsdomMouseEvent("pointerup", { bubbles: true, clientX: 106, clientY: 82 }));
    await dispatchOn(canvas, jsdomMouseEvent("click", { bubbles: true, clientX: 106, clientY: 82 }));
    const ta = queryDraft(container, label);
    expect(ta, "the draft editor must remain mounted after the gesture settles").not.toBeNull();
    expect(doc.activeElement, "autoFocus must survive the opening gesture").toBe(ta);
  });

  test("(d) Enter is a NEWLINE in the text draft (MG's law) — commit stays blur/click-away", async () => {
    const { canvas, container, commits } = await mountInkCanvas({ mode: "text" });
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
    await dispatchOn(canvas, press.ev);
    const ta = queryDraft(container, "New text annotation")!;
    await act(async () => {
      typeIn(ta, "hello");
    });
    await act(async () => {
      pressKey(ta, "Enter");
    });
    // Enter commits NOTHING under the MG posture (tldraw text: Enter
    // inserts the line break; the edit commits on click-away/Escape).
    expect(commits.text.mock.calls.length).toBe(0);
    expect(queryDraft(container, "New text annotation")).not.toBeNull();
    await act(async () => {
      blurEditor(ta);
    });
    expect(commits.text.mock.calls.length).toBe(1);
    expect(commits.text.mock.calls[0][0]).toEqual({
      page: 1,
      color: "red",
      sizeFrac: 16 / PAGE_W,
      x: 106 / PAGE_W,
      y: 82 / PAGE_H,
      text: "hello",
    });
    expect(commits.textEdit.mock.calls.length).toBe(0);
    expect(queryDraft(container, "New text annotation")).toBeNull();
  });

  test("(d) Enter on a filled math draft commits the mtext shape (shipped semantics)", async () => {
    const { canvas, container, commits } = await mountInkCanvas({ mode: "math" });
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
    await dispatchOn(canvas, press.ev);
    const ta = queryDraft(container, "New math annotation")!;
    await act(async () => {
      typeIn(ta, "v^2");
    });
    await act(async () => {
      pressKey(ta, "Enter");
    });
    expect(commits.math.mock.calls.length).toBe(1);
    expect(commits.math.mock.calls[0][0]).toEqual({
      page: 1,
      color: "red",
      sizeFrac: 16 / PAGE_W,
      x: 106 / PAGE_W,
      y: 82 / PAGE_H,
      tex: "v^2",
    });
    expect(queryDraft(container, "New math annotation")).toBeNull();
  });

  test("(d) Escape on a FILLED text draft commits it (MG's stop-editing); empty Escape cancels", async () => {
    {
      const { canvas, container, commits } = await mountInkCanvas({ mode: "text" });
      const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
      await dispatchOn(canvas, press.ev);
      const ta = queryDraft(container, "New text annotation")!;
      await act(async () => {
        typeIn(ta, "hello");
      });
      await act(async () => {
        pressKey(ta, "Escape");
      });
      expect(commits.text.mock.calls.length).toBe(1);
      expect(commits.text.mock.calls[0][0].text).toBe("hello");
      expect(queryDraft(container, "New text annotation")).toBeNull();
    }
    {
      const { canvas, container, commits } = await mountInkCanvas({ mode: "text" });
      const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
      await dispatchOn(canvas, press.ev);
      const ta = queryDraft(container, "New text annotation")!;
      await act(async () => {
        pressKey(ta, "Escape");
      });
      expect(commits.text.mock.calls.length).toBe(0);
      expect(queryDraft(container, "New text annotation")).toBeNull();
    }
  });

  test("(d) the re-edit commit law: same-id in-place replacement via onCommitTextEdit", async () => {
    const { canvas, container, commits } = await mountInkCanvas({ mode: "text", shapes: [TEXT_SHAPE] });
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
    await dispatchOn(canvas, press.ev);
    const ta = queryDraft(container, "Edit text annotation")!;
    await act(async () => {
      typeIn(ta, "changed");
    });
    await act(async () => {
      blurEditor(ta);
    });
    expect(commits.textEdit.mock.calls.length).toBe(1);
    expect(commits.textEdit.mock.calls[0][0]).toBe("t1");
    expect(commits.textEdit.mock.calls[0][1]).toBe("changed");
    expect(commits.text.mock.calls.length, "the create path must not fire on a re-edit").toBe(0);
    expect(queryDraft(container, "Edit text annotation")).toBeNull();
  });

  test("(d) an EMPTY edit commit is a cancel — the shape is untouched", async () => {
    const { canvas, container, commits } = await mountInkCanvas({ mode: "text", shapes: [TEXT_SHAPE] });
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
    await dispatchOn(canvas, press.ev);
    const ta = queryDraft(container, "Edit text annotation")!;
    await act(async () => {
      typeIn(ta, "");
    });
    await act(async () => {
      blurEditor(ta);
    });
    expect(commits.textEdit.mock.calls.length).toBe(0);
    expect(commits.text.mock.calls.length).toBe(0);
    expect(queryDraft(container, "Edit text annotation")).toBeNull();
  });

  test("(d) blur from a REAL outside interaction still commits — and an empty blur cancels", async () => {
    // filled create draft → blur commits the shape (the shipped law)
    {
      const { canvas, container, commits } = await mountInkCanvas({ mode: "text" });
      const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
      await dispatchOn(canvas, press.ev);
      const ta = queryDraft(container, "New text annotation")!;
      await act(async () => {
        typeIn(ta, "kept");
      });
      await act(async () => {
        blurEditor(ta);
      });
      expect(commits.text.mock.calls.length).toBe(1);
      expect(commits.text.mock.calls[0][0].text).toBe("kept");
      expect(queryDraft(container, "New text annotation")).toBeNull();
    }
    // empty create draft → blur is a cancel (the empty-commit law)
    {
      const { canvas, container, commits } = await mountInkCanvas({ mode: "text" });
      const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
      await dispatchOn(canvas, press.ev);
      const ta = queryDraft(container, "New text annotation")!;
      await act(async () => {
        blurEditor(ta);
      });
      expect(commits.text.mock.calls.length).toBe(0);
      expect(queryDraft(container, "New text annotation")).toBeNull();
    }
  });

  test("(e) the cursor map — MG's extracted postures per tool", async () => {
    const cases: Array<[InkCanvasProps["mode"], string]> = [
      ["pen", "crosshair"],
      ["text", "text"],
      ["math", "default"],
      ["select", "default"],
      ["erase", "crosshair"],
      ["line", "crosshair"],
      ["ruler", "move"],
      ["protractor", "move"],
    ];
    for (const [mode, cursor] of cases) {
      const { canvas } = await mountInkCanvas({ mode });
      expect(canvas.style.cursor, `mode=${mode}`).toBe(cursor);
    }
  });

  test("(e) the ⌨ toggle (MG's verbatim label) portals the census keyboard — closed on create", async () => {
    const host = doc.createElement("div");
    doc.body.appendChild(host);
    const { canvas, container } = await mountInkCanvas({ mode: "math", keyboardHost: host });
    const press = pressPointerDown(canvas, { clientX: 106, clientY: 82 });
    await dispatchOn(canvas, press.ev);
    // MG's posture: the math box carries the toggle; the keyboard never
    // auto-opens on create.
    expect(host.querySelector('[aria-label="Math keyboard"]')).toBeNull();
    const toggle = container.querySelector('[aria-label="Toggle Virtual Keyboard"]');
    expect(toggle).not.toBeNull();
    await act(async () => {
      toggle!.dispatchEvent(jsdomMouseEvent("click", { bubbles: true }));
    });
    const kb = host.querySelector('[aria-label="Math keyboard"]');
    expect(kb).not.toBeNull();
    // MG's four layers, MG's tab names
    const tabs = [...host.querySelectorAll("button[aria-pressed]")]
      .map((b) => b.getAttribute("aria-label"))
      .filter((n) => ["Numeric", "Symbols", "Roman Letters", "Greek Letters"].includes(n ?? ""));
    expect(tabs).toEqual(["Numeric", "Symbols", "Roman Letters", "Greek Letters"]);
    // tapping the ÷ key inserts the fraction at the caret (numerator slot)
    const ta = queryDraft(container, "New math annotation")!;
    const divide = host.querySelector('button[aria-label="÷"]')!;
    expect(divide).not.toBeNull();
    await act(async () => {
      divide.dispatchEvent(jsdomMouseEvent("click", { bubbles: true }));
    });
    expect(ta.value).toBe("\\frac{}{}");
    expect(ta.selectionStart).toBe(6);
    host.remove();
  });
});

// ── T-MG-INK-10: the armed-tool hover chips (MG's cursor affordance) ──

describe("T-MG-INK-10 run-001 — the armed-tool hover chips (MG's hover text)", () => {
  /** A mount that can RE-RENDER in place — the per-arm law needs a mode
   * change on the SAME instance (a remount resets state trivially). */
  async function mountChips(overrides: Partial<InkCanvasProps> = {}) {
    const commits = {
      stroke: mock((_page: number, _points: Array<[number, number]>) => {}),
      text: mock((_shape: Omit<InkTextShape, "id" | "kind">) => {}),
      math: mock((_shape: Omit<InkMathShape, "id" | "kind">) => {}),
      textEdit: mock((_id: string, _text: string) => {}),
      mathEdit: mock((_id: string, _tex: string) => {}),
      erase: mock((_ids: string[]) => {}),
      move: mock((_shape: InkShape) => {}),
    };
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const root = createRoot(container);
    const base: InkCanvasProps = {
      page: 1,
      shapes: [],
      mode: "pen",
      color: "red" as InkColor,
      widthFrac: 0.0038,
      onCommitStroke: commits.stroke,
      onCommitText: commits.text,
      onCommitMath: commits.math,
      onCommitTextEdit: commits.textEdit,
      onCommitMathEdit: commits.mathEdit,
      onCommitErase: commits.erase,
      onCommitMove: commits.move,
      ...overrides,
    };
    const render = async (over: Partial<InkCanvasProps> = {}) => {
      await act(async () => {
        root.render(React.createElement(InkCanvas, { ...base, ...over }));
      });
    };
    await render();
    const canvas = container.querySelector("canvas")!;
    lastUnmount = async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      lastUnmount = null;
    };
    return { commits, canvas, container, render };
  }

  const move = (canvas: Element, x: number, y: number) =>
    dispatchOn(canvas, jsdomMouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));

  test("(f) text posture: 'Add text' follows the cursor at MG's exact style", async () => {
    const { canvas, container } = await mountChips({ mode: "text" });
    expect(container.querySelector("[data-ink-add-chip]"), "no chip before any pointer move").toBeNull();
    await move(canvas, 200, 150);
    const chip = container.querySelector<HTMLElement>('[data-ink-add-chip="text"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe("Add text");
    expect(chip!.getAttribute("aria-hidden")).toBe("true");
    const s = chip!.style;
    expect(s.left).toBe("200px");
    expect(s.top).toBe("150px");
    expect(s.transform).toBe("translateY(-50%)");
    expect(s.fontSize).toBe("24px");
    expect(s.fontWeight).toBe("500");
    expect(s.color).toBe("rgb(159, 168, 178)");
    expect(s.opacity).toBe("0.6");
    // pointer-events and whitespace ride the tailwind classes (jsdom
    // computes no class styles):
    expect(chip!.className).toContain("pointer-events-none");
    expect(chip!.className).toContain("whitespace-nowrap");
    expect(chip!.className).toContain("z-40");
    expect(s.fontFamily).toContain("Shantell Sans");
  });

  test("(f) math posture: 'Add maths', 18px weight 400 leading-none, +14px offset", async () => {
    const { canvas, container } = await mountChips({ mode: "math" });
    await move(canvas, 200, 150);
    const chip = container.querySelector<HTMLElement>('[data-ink-add-chip="math"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe("Add maths");
    const s = chip!.style;
    expect(s.left).toBe("214px");
    expect(s.top).toBe("150px");
    expect(s.transform).toBe("translateY(-50%)");
    expect(s.fontSize).toBe("18px");
    expect(s.fontWeight).toBe("400");
    expect(s.lineHeight).toBe("1");
    expect(s.color).toBe("rgb(159, 168, 178)");
    expect(s.opacity).toBe("0.6");
  });

  test("(f) the working tools never show a chip", async () => {
    for (const mode of ["pen", "erase", "select", "line", "ruler", "protractor", "compasses"] as const) {
      const { canvas, container } = await mountChips({ mode });
      await move(canvas, 200, 150);
      expect(container.querySelector("[data-ink-add-chip]"), `mode=${mode}`).toBeNull();
    }
  });

  test("(f) the editor-open gate: the chip unmounts while the draft editor is up", async () => {
    const { canvas, container } = await mountChips({ mode: "text" });
    await move(canvas, 200, 150);
    expect(container.querySelector('[data-ink-add-chip="text"]')).not.toBeNull();
    const press = pressPointerDown(canvas, { clientX: 200, clientY: 150 });
    await dispatchOn(canvas, press.ev);
    expect(queryDraft(container, "New text annotation")).not.toBeNull();
    expect(container.querySelector("[data-ink-add-chip]"), "editor open → no chip").toBeNull();
    // the pointer moves under the open editor (click-away gestures) — no chip
    await move(canvas, 260, 180);
    expect(container.querySelector("[data-ink-add-chip]")).toBeNull();
  });

  test("(f) the per-arm spend law: a placement spends the chip until the tool is re-armed", async () => {
    const { canvas, container, commits, render } = await mountChips({ mode: "text" });
    await move(canvas, 200, 150);
    expect(container.querySelector('[data-ink-add-chip="text"]')).not.toBeNull();
    // place + commit (Escape on a filled draft commits — MG's stop-editing)
    const press = pressPointerDown(canvas, { clientX: 200, clientY: 150 });
    await dispatchOn(canvas, press.ev);
    const ta = queryDraft(container, "New text annotation")!;
    await act(async () => {
      typeIn(ta, "kept");
    });
    await act(async () => {
      pressKey(ta, "Escape");
    });
    expect(commits.text.mock.calls.length).toBe(1);
    await move(canvas, 260, 180);
    expect(container.querySelector("[data-ink-add-chip]"), "spent for this arming").toBeNull();
    // a mere mode change with the SAME epoch is NOT a re-arm — the chip
    // stays spent (the spend is keyed by the arm epoch, not the tool):
    await render({ mode: "math" });
    await move(canvas, 260, 180);
    expect(container.querySelector("[data-ink-add-chip]"), "same epoch → still spent").toBeNull();
    // re-arm as math on the SAME instance (epoch bump) → the chip returns
    await render({ mode: "math", armSeq: 2 });
    await move(canvas, 260, 180);
    const chip = container.querySelector<HTMLElement>('[data-ink-add-chip="math"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe("Add maths");
  });

  test("(f) leaving the page hides the chip; re-entering shows it again (unspent arming)", async () => {
    const { canvas, container } = await mountChips({ mode: "text" });
    await move(canvas, 200, 150);
    expect(container.querySelector('[data-ink-add-chip="text"]')).not.toBeNull();
    // React synthesizes onPointerLeave from a bubbling pointerout with a
    // null relatedTarget (jsdom has no native leave synthesis).
    await dispatchOn(canvas, jsdomMouseEvent("pointerout", { bubbles: true }));
    expect(container.querySelector("[data-ink-add-chip]"), "pointer left the page").toBeNull();
    await move(canvas, 210, 160);
    expect(container.querySelector('[data-ink-add-chip="text"]')).not.toBeNull();
  });
});
