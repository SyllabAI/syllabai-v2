"use client";

/**
 * CLA panel form preference — SME chat-widget parity (HUB-CLA-POPUP +
 * HUB-CLA-SIDEBAR).
 *
 * SME's assistant opens as a floating popup (fixed bottom-right, 410×640,
 * rounded, shadowed, no backdrop) and can be expanded into a docked
 * full-height right sidebar; the choice persists. This module is the hub's
 * shared preference for that choice across the CLA panels (the note island
 * and the question overlay ride ONE preference, like SME's single widget).
 *
 * The sidebar form is a PHYSICAL layout change, not an overlay (SME's own
 * CSS): their expanded wrapper goes `flex: 0 0 400px; position: static`
 * inside the page's flex row — the page content cedes exactly 400px and
 * keeps scrolling, and the offer only exists ≥1400px (their expand button
 * is display:none below, so the expanded state falls back to the popup).
 * The hub mirrors this: while the dock is open, useClaDock marks
 * <html data-cla-sidebar="open"> and globals.css gives .course-shell-row a
 * 400px right inset at ≥1400px; the docked panel (fixed right column under
 * the 56px navbar) occupies exactly that freed space.
 *
 * Hydration-safe by construction (the wave-3c lesson: a pref read during
 * first render SSRs a value the client may not agree with → React #418).
 * useSyncExternalStore's server snapshot is the default ("popup"); the
 * client snapshot is the ACCOUNT doc (T-ACCOUNT-ONLY run-001 — the
 * "cla-panel-mode" key of the workspace-document plane), applied when the
 * account-docs hydration lands. The retired localStorage record
 * ("syllabai.cla.panel") is adopted once, then removed.
 */

import { useEffect, useSyncExternalStore } from "react";
import { createAccountStore } from "@/lib/account-stores";

export type ClaPanelForm = "popup" | "sidebar";

/** SME's circle header-button anatomy (ButtonIcon_circle, extra-small) —
 *  shared by both CLA panels' shells. */
export const claHeaderCircleBtn =
  "flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** The RETIRED device key (the legacy adoption's target). */
export const RETIRED_CLA_PANEL_KEY = "syllabai.cla.panel";
export const DEFAULT_CLA_PANEL_FORM: ClaPanelForm = "popup";

const store = createAccountStore<ClaPanelForm>({
  docKey: "cla-panel-mode",
  initial: DEFAULT_CLA_PANEL_FORM,
  parse: (raw) => (raw === "sidebar" ? "sidebar" : DEFAULT_CLA_PANEL_FORM),
  legacyKeys: [RETIRED_CLA_PANEL_KEY],
  readLegacy: () => {
    try {
      return window.localStorage.getItem(RETIRED_CLA_PANEL_KEY);
    } catch {
      return null;
    }
  },
});

/** The stored form from the account; "popup" on the server. */
export function useClaPanelForm(): [ClaPanelForm, (next: ClaPanelForm) => void] {
  const form = useSyncExternalStore(
    store.subscribe,
    store.get,
    () => DEFAULT_CLA_PANEL_FORM,
  );
  const setForm = (next: ClaPanelForm) => {
    store.set(next);
  };
  return [form, setForm];
}

/**
 * Desktop gate for the popup form — below lg the panels always render the
 * Sheet's full-height overlay (SME's mobile behaviour: a page wash under a
 * fullscreen-ish chat, never a 410px floating window on a phone).
 */
const QUERY = "(min-width: 1024px)";

function subscribeMedia(cb: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeMedia,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/**
 * The sidebar dock's width gate — SME's expanded form is offered ≥1400px
 * only (their expand button is display:none below, and their expanded CSS
 * rule lives inside the same media query, so an expanded choice below the
 * breakpoint degrades to the floating popup). The hub mirrors both halves:
 * the toggle only renders ≥1400px, and a "sidebar" pref below it renders
 * the popup.
 */
const WIDE_QUERY = "(min-width: 1400px)";

function subscribeWide(cb: () => void) {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

export function useIsWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/**
 * Marks the page while the CLA dock is open — globals.css turns this into
 * the physical 400px right inset on .course-shell-row (≥1400px), so the
 * page content reflows and the docked panel occupies the freed space with
 * zero overlap. Attribute (not class) on <html> so it can't collide with
 * Tailwind utilities; cleaned up on close/unmount.
 */
export function useClaDock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.claSidebar = "open";
    return () => {
      delete document.documentElement.dataset.claSidebar;
    };
  }, [active]);
}
