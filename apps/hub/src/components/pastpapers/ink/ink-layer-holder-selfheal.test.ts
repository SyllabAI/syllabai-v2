/**
 * ink-layer-holder-selfheal.test.ts — T-MG-INK-7 run-001, the holder
 * self-heal law's regression seam (plan of record
 * docs/MG-MARK-PARITY-PLAN.md §3.10; spec of record
 * .syllabai/tasks/T-MG-INK-7.yaml).
 *
 * The defect of record (proven live on production 2026-11-01 by a
 * removal tracer AND by the code path): the pane's page lifecycle
 * repaints a holder by EMPTYING it — renderPage's double-buffer swap
 * ends in `holder.replaceChildren(canvas)` and the off-radius sweep in a
 * bare `replaceChildren()` — which evicts the React-portal ink canvas
 * from the DOM; React never re-inserts a portal child that non-React
 * code removed, and the structure-only holder observer read the batch as
 * "same holders, no change". Net: after one zoom refreeze the
 * re-painted pages lose their ink layer entirely (live tracer: pages
 * 1/3/4/2 removed, ZERO re-added), every annotation tool is dead there,
 * and committed ink/mtext visually vanishes — until reload.
 *
 * What THIS seam pins (jsdom, FULL-InkLayer mount on a React-managed
 * two-holder host — the law lives in InkLayer's holder observer, not the
 * canvas handler):
 *   (a) the renderPage-shaped swap (`replaceChildren(pdfCanvas)`) and
 *       the sweep-shaped wipe (`replaceChildren()`) each heal: the SAME
 *       canvas node re-attaches into the SAME holder by the eviction law
 *       (registered portal-root re-attach — same bitmap, same listeners,
 *       no remount, zero React involvement);
 *   (b) the surgical law: the OTHER holder's canvas keeps NODE IDENTITY
 *       across the heal — an in-flight gesture on an untouched page
 *       must never be disturbed;
 *   (c) the idempotence law: healed holders are stable under continued
 *       observation — benign addition-only batches (the pane's
 *       text-layer rebuilds) never touch anything, the healed holder
 *       carries exactly one canvas, and a same-batch remove+re-add
 *       passes the final-state check without a heal;
 *   (d) determinism: the heal rides the SAME MutationObserver batch as
 *       holder tracking — no timers, no polling.
 *
 * IMPORT-ORDER LAW: the harness chain MUST be the first import — it
 * installs the jsdom globals (now incl. MutationObserver) BEFORE
 * react-dom evaluates its module-init DOM detection. See the base
 * harness header for the full mechanism.
 */
import "./ink-layer-holder-selfheal.harness";

import { afterEach, describe, expect, test } from "bun:test";

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { InkLayer } from "./InkLayer";
import { doc, jsdomMouseEvent, pressPointerDown } from "./ink-layer-pointerdown.harness";

// ── mount harness ──

let lastUnmount: (() => Promise<void>) | null = null;

/** One deterministic flush: the MutationObserver microtask fires inside
 * the act scope, its setState re-renders, React commits — no timers. */
async function flushObservation() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountInkLayer() {
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  // T-ACCOUNT-ONLY run-001: the persistence plane is the SERVER controller
  // only — a mounted InkLayer rides a signed-in session (the /past-papers
  // gate). The harness seeds the session the same way the gate delivers it.
  (globalThis as { window?: { localStorage?: Storage } }).window?.localStorage?.setItem?.(
    "syllabai.token",
    "test-token",
  );
  // The pane-shaped mount: the host (the pane wrapper) is a REACT-MANAGED
  // node carrying the [data-page] holders as its children — exactly the
  // production topology (the pane renders the wrapper; InkLayer portals
  // into its holders). A foreign (manually appended) host is NOT a valid
  // stand-in: React 19 clears non-React children of the root container on
  // update, which would test our law against a topology that cannot
  // occur in the app.
  const hostRef: { current: HTMLElement | null } = { current: null };
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        () =>
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "div",
              {
                ref: (el: HTMLElement | null) => {
                  hostRef.current = el;
                },
              },
              React.createElement("div", { "data-page": "1" }),
              React.createElement("div", { "data-page": "2" }),
            ),
            React.createElement(InkLayer, { hostRef, sourceUrl: "https://papers.example/4ch1-1c/qp.pdf" }),
          ),
        null,
      ),
    );
  });
  const holder1 = container.querySelector('div[data-page="1"]')! as HTMLElement;
  const holder2 = container.querySelector('div[data-page="2"]')! as HTMLElement;
  expect(holder1, "holder 1 must render (React-managed pane topology)").not.toBeNull();
  expect(holder2, "holder 2 must render (React-managed pane topology)").not.toBeNull();
  // T-MG-INK-11: the gate is GONE (MG's law — the annotator toolbar is
  // always visible). The canvases must be mounted the moment the layer
  // renders: no launcher, no enabling click.
  const toggle = container.querySelector('button[aria-label="Draw on this paper (ink layer)"]');
  expect(toggle, "no launcher may exist (the gate is dead)").toBeNull();
  expect(container.querySelector('[role="toolbar"]'), "the toolbar renders ungated").not.toBeNull();
  const c1 = holder1.querySelector("canvas[data-ink-page]");
  const c2 = holder2.querySelector("canvas[data-ink-page]");
  expect(c1, "holder 1 must carry its portal canvas immediately").not.toBeNull();
  expect(c2, "holder 2 must carry its portal canvas immediately").not.toBeNull();
  lastUnmount = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    lastUnmount = null;
  };
  return { container, holder1, holder2, c1: c1!, c2: c2! };
}

afterEach(async () => {
  if (lastUnmount) await lastUnmount();
});

// ── the seam ──

describe("T-MG-INK-7 run-001 — the holder self-heal law (the full-InkLayer observer seam)", () => {
  test("(a) the renderPage-shaped swap heals: the SAME canvas node re-attaches into the SAME holder", async () => {
    const { holder1, c1 } = await mountInkLayer();
    // the pane's exact eviction shape: renderPage's double-buffer swap
    const pdfCanvas = doc.createElement("canvas");
    pdfCanvas.className = "block";
    holder1.replaceChildren(pdfCanvas);
    await flushObservation();
    const healed = holder1.querySelector("canvas[data-ink-page]");
    expect(healed, "the ink canvas must be re-attached after the swap").not.toBeNull();
    expect(
      healed,
      "the heal must resurrect the SAME node (same bitmap, same listeners — no remount)",
    ).toBe(c1);
    expect(holder1.contains(healed!), "the healed canvas must live inside the holder").toBe(true);
    expect(holder1.querySelectorAll("canvas[data-ink-page]").length).toBe(1);
  });

  test("(a) the sweep-shaped wipe heals too — same node back", async () => {
    const { holder2, c2 } = await mountInkLayer();
    holder2.replaceChildren();
    await flushObservation();
    const healed = holder2.querySelector("canvas[data-ink-page]");
    expect(healed, "the swept holder must regain its ink canvas").not.toBeNull();
    expect(healed).toBe(c2);
    expect(holder2.contains(healed!)).toBe(true);
  });

  test("(b) the surgical law: the OTHER holder's canvas keeps node identity across the heal", async () => {
    const { holder1, holder2, c2 } = await mountInkLayer();
    const pdfCanvas = doc.createElement("canvas");
    pdfCanvas.className = "block";
    holder1.replaceChildren(pdfCanvas);
    await flushObservation();
    expect(holder1.querySelector("canvas[data-ink-page]")).not.toBeNull();
    expect(
      holder2.querySelector("canvas[data-ink-page]"),
      "an untouched holder's canvas must keep node identity (in-flight gestures survive)",
    ).toBe(c2);
  });

  test("(c) the idempotence law: healed holders are stable under continued observation", async () => {
    const { holder1, holder2 } = await mountInkLayer();
    // heal both holders once
    holder1.replaceChildren();
    holder2.replaceChildren();
    await flushObservation();
    const healed1 = holder1.querySelector("canvas[data-ink-page]");
    const healed2 = holder2.querySelector("canvas[data-ink-page]");
    expect(healed1).not.toBeNull();
    expect(healed2).not.toBeNull();
    // benign addition-only batches (the text-layer rebuild shape) plus
    // empty observation windows must NOT remount anything further
    for (let i = 0; i < 3; i++) {
      const benign = doc.createElement("span");
      benign.className = "textLayer-piece";
      holder1.appendChild(benign);
      await flushObservation();
    }
    expect(holder1.querySelector("canvas[data-ink-page]")).toBe(healed1);
    expect(holder2.querySelector("canvas[data-ink-page]")).toBe(healed2);
    expect(holder1.querySelectorAll("canvas[data-ink-page]").length).toBe(1);
    expect(holder2.querySelectorAll("canvas[data-ink-page]").length).toBe(1);
  });

  test("(c) a same-batch remove+re-add passes the final-state check — no heal, no move", async () => {
    const { holder1, c1 } = await mountInkLayer();
    // React's own reconciliation shape: the portal root leaves and lands
    // back within ONE batch — the final state carries the canvas, so the
    // eviction law must stay silent and the node must survive untouched.
    const wrapper = holder1.querySelector("[data-ink-root]")!;
    holder1.replaceChildren(wrapper); // remove-then-re-add the SAME wrapper, one batch
    await flushObservation();
    expect(holder1.querySelector("canvas[data-ink-page]")).toBe(c1);
  });
});

// ── T-MG-INK-11: MG's palette anatomy — ONE trigger per row, menus inside ──


/** Radix menus open on the OPENING PRESS (pointerdown), not click —
 * the same trusted-sequence law the placement editors ride. */
async function openMenu(tb: HTMLElement, prefix: string) {
  const trigger = [...tb.querySelectorAll("button")].find((b) =>
    b.getAttribute("aria-label")?.startsWith(prefix),
  )!;
  expect(trigger, `a ${prefix} trigger must exist`).not.toBeNull();
  await act(async () => {
    const press = pressPointerDown(trigger);
    trigger.dispatchEvent(press.ev);
  });
  return trigger;
}

describe("T-MG-INK-11 run-001 — the ungated toolbar + the palette menus (MG's shape)", () => {
  test("(a) the toolbar renders ungated: 9 tool buttons, no launcher, no close", async () => {
    const { container } = await mountInkLayer();
    const tb = container.querySelector('[role="toolbar"]')!;
    const labels = [...tb.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toContain("Draw");
    expect(labels).toContain("Text");
    expect(labels).toContain("Math text box");
    expect(labels).toContain("Select");
    expect(labels).toContain("Erase");
    expect(labels).toContain("Line");
    expect(labels).toContain("Ruler");
    expect(labels).toContain("Protractor");
    expect(labels).toContain("Compasses");
    expect(labels, "no Close chrome (MG has none)").not.toContain("Close ink layer");
    expect(container.querySelector('button[aria-label="Draw on this paper (ink layer)"]')).toBeNull();
  });

  test("(b) the colour row is ONE dynamic trigger + a 6-item menu (MG's anatomy)", async () => {
    const { container } = await mountInkLayer();
    const tb = container.querySelector('[role="toolbar"]')! as HTMLElement;
    // exactly ONE trigger, labelled with the CURRENT colour
    const triggers = [...tb.querySelectorAll("button")].filter((b) =>
      b.getAttribute("aria-label")?.startsWith("Pen colour: "),
    );
    expect(triggers).toHaveLength(1);
    expect(triggers[0].getAttribute("aria-label")).toBe("Pen colour: Black");
    // the trigger dot carries the current colour (MG's swatch anatomy)
    const dot = triggers[0].querySelector("span[aria-hidden]");
    expect(dot).not.toBeNull();
    expect(dot!.getAttribute("style")).toContain("rgb(29, 29, 29)");
    // open it on the press (Radix's open gesture) → the six named colours
    await openMenu(tb, "Pen colour: ");
    const items = [...document.querySelectorAll("[role=menuitem]")].filter((el) =>
      ["Black", "Red", "Blue", "Green", "Violet", "Orange"].includes(el.getAttribute("aria-label") ?? ""),
    );
    expect(items.map((el) => el.getAttribute("aria-label"))).toEqual([
      "Black", "Red", "Blue", "Green", "Violet", "Orange",
    ]);
    // pick Red → the trigger label re-skins (MG's dynamic-label law)
    await act(async () => {
      items[1].dispatchEvent(jsdomMouseEvent("click", { bubbles: true }));
    });
    const tb2 = container.querySelector('[role="toolbar"]')! as HTMLElement;
    const after = [...tb2.querySelectorAll("button")].find((b) =>
      b.getAttribute("aria-label")?.startsWith("Pen colour: "),
    );
    expect(after!.getAttribute("aria-label")).toBe("Pen colour: Red");
    expect(after!.querySelector("span[aria-hidden]")!.getAttribute("style")).toContain("rgb(224, 49, 49)");
  });

  test("(c) the thickness row is ONE dynamic trigger + a 4-item menu (MG's anatomy)", async () => {
    const { container } = await mountInkLayer();
    const tb = container.querySelector('[role="toolbar"]')! as HTMLElement;
    const triggers = [...tb.querySelectorAll("button")].filter((b) =>
      b.getAttribute("aria-label")?.startsWith("Pen thickness: "),
    );
    expect(triggers).toHaveLength(1);
    expect(triggers[0].getAttribute("aria-label")).toBe("Pen thickness: Medium");
    await openMenu(tb, "Pen thickness: ");
    const items = [...document.querySelectorAll("[role=menuitem]")].filter((el) =>
      ["Fine", "Medium", "Thick", "Extra thick"].includes(el.getAttribute("aria-label") ?? ""),
    );
    expect(items.map((el) => el.getAttribute("aria-label"))).toEqual([
      "Fine", "Medium", "Thick", "Extra thick",
    ]);
    await act(async () => {
      items[3].dispatchEvent(jsdomMouseEvent("click", { bubbles: true }));
    });
    const tb2 = container.querySelector('[role="toolbar"]')! as HTMLElement;
    const after = [...tb2.querySelectorAll("button")].find((b) =>
      b.getAttribute("aria-label")?.startsWith("Pen thickness: "),
    );
    expect(after!.getAttribute("aria-label")).toBe("Pen thickness: Extra thick");
  });
});