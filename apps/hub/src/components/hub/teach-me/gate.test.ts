/**
 * Teach-Me render gate pins (T-TEACHME-001 run-003).
 *
 * The absent=OFF law is what makes the flag a one-flip kill: every
 * malformed / partial shape must degrade to the honest roadmap state, and
 * the committed flags.json flip must parse to exactly the serving scope the
 * API mirror carries (the API-side behavioural suite asserts the same
 * equality from its side — these two tests are the two halves of the
 * parity law).
 *
 * Run: bun test apps/hub/src/components/hub/teach-me/gate.test.ts
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TEACH_ME_FLAG_KEY,
  TEACH_ME_GATE_OFF,
  parseTeachMeGate,
  teachMeEnabledForCourse,
} from "./gate";

describe("parseTeachMeGate — the absent=OFF law", () => {
  test("absent file / key / malformed shapes are OFF", () => {
    expect(parseTeachMeGate(undefined)).toEqual(TEACH_ME_GATE_OFF);
    expect(parseTeachMeGate(null)).toEqual(TEACH_ME_GATE_OFF);
    expect(parseTeachMeGate("yes")).toEqual(TEACH_ME_GATE_OFF);
    expect(parseTeachMeGate(42)).toEqual(TEACH_ME_GATE_OFF);
    expect(parseTeachMeGate([])).toEqual(TEACH_ME_GATE_OFF);
    expect(parseTeachMeGate({})).toEqual(TEACH_ME_GATE_OFF);
  });

  test("enabled !== true is a hard OFF (no truthy coercion)", () => {
    expect(parseTeachMeGate({ enabled: "true", courses: ["x"] })).toEqual(TEACH_ME_GATE_OFF);
    expect(parseTeachMeGate({ enabled: 1, courses: ["x"] })).toEqual(TEACH_ME_GATE_OFF);
    expect(parseTeachMeGate({ courses: ["x"] })).toEqual(TEACH_ME_GATE_OFF);
  });

  test("malformed course list degrades to enabled-with-no-courses (roadmap only)", () => {
    expect(parseTeachMeGate({ enabled: true })).toEqual(TEACH_ME_GATE_OFF);
    expect(parseTeachMeGate({ enabled: true, courses: "igcse-chemistry-19" })).toEqual(
      TEACH_ME_GATE_OFF,
    );
    const partial = parseTeachMeGate({ enabled: true, courses: ["ok", 7, "", null] });
    expect(partial.enabled).toBe(true);
    expect(partial.courses).toEqual(["ok"]);
  });

  test("the honest ON shape passes through verbatim", () => {
    const gate = parseTeachMeGate({ enabled: true, courses: ["igcse-chemistry-19"] });
    expect(gate).toEqual({ enabled: true, courses: ["igcse-chemistry-19"] });
  });
});

describe("the committed flip of record (flags.json)", () => {
  test("the teachMe key parses to the serving scope of record", () => {
    // Same file-relative walk the API-side parity test uses, so both halves
    // of the parity law read the SAME committed bytes.
    const raw = JSON.parse(
      readFileSync(join(import.meta.dir, "../../../../content/flags.json"), "utf-8"),
    ) as { flags?: Record<string, unknown> };
    const entry = (raw.flags ?? {})[TEACH_ME_FLAG_KEY];
    const gate = parseTeachMeGate(entry);
    expect(gate.enabled).toBe(true);
    // Wave 0 pilot of record — docs/TEACH_ME_PLAN.md §1 (4CH1 Chemistry).
    expect(gate.courses).toEqual(["igcse-chemistry-19"]);
  });
});

describe("membership law", () => {
  test("enabled AND slug — exercised through the parse law", () => {
    // The cached IO wrapper lazy-imports the server-only corpus seam, which
    // bun tests must not load; the membership law is a pure function of the
    // gate, so it is pinned here through the same expression the wrapper
    // uses — enabled && courses.includes(slug).
    const gate = parseTeachMeGate({ enabled: true, courses: ["igcse-chemistry-19"] });
    const enabledFor = (slug: string) => gate.enabled && gate.courses.includes(slug);
    expect(enabledFor("igcse-chemistry-19")).toBe(true);
    expect(enabledFor("igcse-physics-19")).toBe(false);
    expect(teachMeEnabledForCourse).toBeTypeOf("function");
  });
});
