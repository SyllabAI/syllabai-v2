/**
 * The shared synthetic-title contract (tier-3 follow-up 4, dashboard UX
 * review 2026-11-04). Both consumers are pinned from here:
 *   - apps/api learner-me `fetchAssignmentLists` — the source filter that
 *     stops probe rows being ISSUED to every student (V49 NULL-class
 *     visibility);
 *   - apps/hub set-work-card — the defense-in-depth presentation filter.
 * Both apps import THIS implementation; these tests are the contract both
 * sides inherit. The api's surface-level tests
 * (apps/api …/learner-me.synthetic-filter.test.ts) continue to pin the
 * ordering and endpoint behaviour on top of it.
 */
import { describe, expect, it } from "bun:test";
import { SYNTHETIC_TITLE_SLUG, isSyntheticTitle } from "./synthetic-assignment";

describe("synthetic assignment titles — the shared api/hub contract", () => {
  it("the live probe fixtures from the production agenda are dropped", () => {
    // The exact rows the logged-in production check captured (2026-11-04),
    // verbatim — one dated epoch-0 (~57 years overdue).
    expect(isSyntheticTitle("probe late asprobe_1790628651")).toBe(true);
    expect(isSyntheticTitle("probe assignment asprobe_1790628651")).toBe(true);
    expect(isSyntheticTitle("probe late asprobe_999")).toBe(true);
  });

  it("the slug pattern matches anywhere in the title, case-insensitively", () => {
    expect(isSyntheticTitle("Homework — ASPROBE_42 leftovers")).toBe(true);
    expect(isSyntheticTitle("asprobe_1")).toBe(true);
    expect(isSyntheticTitle("asprobe_")).toBe(false); // needs digits
    expect(isSyntheticTitle("asprobe_12abc")).toBe(true); // \d+ anchors the run, not the end
    expect(SYNTHETIC_TITLE_SLUG.source).toBe("asprobe_\\d+");
  });

  it("the ^probe prefix law, case-insensitive", () => {
    expect(isSyntheticTitle("probe tomorrow's starter")).toBe(true);
    expect(isSyntheticTitle("PROBE WEEK — retrieval set")).toBe(true);
    expect(isSyntheticTitle("  probe leading space")).toBe(false); // anchored, not trimmed
    expect(isSyntheticTitle("preprobe")).toBe(false); // word boundary required
  });

  it("real work survives — the documented false-positive boundary", () => {
    expect(isSyntheticTitle("Temperature probes")).toBe(false);
    expect(isSyntheticTitle("Investigation: measuring temperature")).toBe(false);
    expect(isSyntheticTitle("Chemistry - Targeted Practice")).toBe(false);
    // The accepted false positive, pinned so it can only change on purpose:
    expect(isSyntheticTitle("Probe design lab")).toBe(true);
  });
});
