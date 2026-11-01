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
import { doc, jsdomMouseEvent } from "./ink-layer-pointerdown.harness";

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
  // enable the ink layer through the toolbar's own toggle (the shipped
  // entry path — no prop cheating past the enabled gate)
  const toggle = container.querySelector('button[aria-label="Draw on this paper (ink layer)"]');
  expect(toggle, "the ink toggle must render (LOCAL posture: no token required to draw)").not.toBeNull();
  await act(async () => {
    toggle!.dispatchEvent(jsdomMouseEvent("click", { bubbles: true }));
  });
  const c1 = holder1.querySelector("canvas[data-ink-page]");
  const c2 = holder2.querySelector("canvas[data-ink-page]");
  expect(c1, "holder 1 must carry its portal canvas after enabling").not.toBeNull();
  expect(c2, "holder 2 must carry its portal canvas after enabling").not.toBeNull();
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
