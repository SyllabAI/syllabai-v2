/**
 * Picker-tree + honest-failure pins (T-TEACHME-001 run-003).
 *
 * Run: bun test apps/hub/src/components/hub/teach-me/
 */
import { describe, expect, test } from "bun:test";

import {
  TEACH_ME_MAX_SPEC_POINTS,
  buildTeachMePickerTree,
  canPickMore,
} from "./picker-data";
import { classifyTeachMeFailure, wordsOf } from "./errors";
import type { Curriculum } from "@/lib/contracts";

/** A miniature official-tree curriculum (the 4CH1 shape: dotted points). */
const CURRICULUM = {
  board: "EDEXCEL",
  level: "IGCSE",
  subject: "Chemistry",
  code: "4CH1",
  syllabusVersion: null,
  nodes: [
    { code: "4CH1", family: "SUBJECT", title: "Chemistry", description: null, parents: [], provenanceTier: "OFFICIAL" },
    {
      code: "4CH1-S2", family: "TOPIC", title: "2. Principles of chemistry", description: null,
      parents: ["4CH1"], provenanceTier: "OFFICIAL",
    },
    {
      code: "4CH1-S2-c", family: "SUBTOPIC", title: "Electrolysis", description: null,
      parents: ["4CH1-S2"], provenanceTier: "OFFICIAL",
    },
    {
      code: "4CH1-2.3", family: "SPEC_POINT",
      title: "describe electrolysis of a molten ionic compound", description: null,
      parents: ["4CH1-S2", "4CH1-S2-c"], provenanceTier: "OFFICIAL",
    },
    {
      code: "4CH1-2.10", family: "SPEC_POINT",
      title: "explain the formation of the products", description: null,
      parents: ["4CH1-S2", "4CH1-S2-c"], provenanceTier: "OFFICIAL",
    },
    // an orphan spec point (no committed subtopic parent) must survive
    {
      code: "4CH1-2.99", family: "SPEC_POINT", title: "an orphan point", description: null,
      parents: ["4CH1-S2"], provenanceTier: "OFFICIAL",
    },
    // a second topic whose subtopic carries no spec points must not render
    {
      code: "4CH1-S3", family: "TOPIC", title: "3. empty topic", description: null,
      parents: ["4CH1"], provenanceTier: "OFFICIAL",
    },
    {
      code: "4CH1-S3-a", family: "SUBTOPIC", title: "hollow", description: null,
      parents: ["4CH1-S3"], provenanceTier: "OFFICIAL",
    },
  ],
  edges: [],
} as unknown as Curriculum;

describe("buildTeachMePickerTree", () => {
  const tree = buildTeachMePickerTree(CURRICULUM);

  test("walks TOPIC → SUBTOPIC → SPEC_POINT in corpus order with 1-based numbers", () => {
    expect(tree).toHaveLength(1); // the hollow topic renders nothing
    const t = tree[0];
    expect(t.number).toBe(1);
    expect(t.code).toBe("4CH1-S2");
    expect(t.subtopics).toHaveLength(2); // real subtopic + the orphan bucket
    expect(t.subtopics[0].label).toBe("c");
    expect(t.subtopics[0].points.map((p) => p.code)).toEqual(["4CH1-2.3", "4CH1-2.10"]);
  });

  test("dotted spec codes sort numerically-aware (2.3 before 2.10)", () => {
    const codes = tree[0].subtopics[0].points.map((p) => p.code);
    expect(codes.indexOf("4CH1-2.3")).toBeLessThan(codes.indexOf("4CH1-2.10"));
  });

  test("orphan spec points keep their place under the topic", () => {
    const orphanBucket = tree[0].subtopics[1];
    expect(orphanBucket.points.map((p) => p.code)).toEqual(["4CH1-2.99"]);
  });

  test("pick ceiling mirrors the contract (1–3 spec points)", () => {
    expect(TEACH_ME_MAX_SPEC_POINTS).toBe(3);
    expect(canPickMore([])).toBe(true);
    expect(canPickMore(["a", "b"])).toBe(true);
    expect(canPickMore(["a", "b", "c"])).toBe(false);
  });
});

describe("classifyTeachMeFailure — honest failure surfacing", () => {
  const apiErr = (status: number, message: string) =>
    Object.assign(new Error(message), { status }) as Error & { status: number };

  test("409 guardrail failures carry the server's honest copy verbatim", () => {
    const f = classifyTeachMeFailure(
      apiErr(409, "Daily Teach-Me session cap reached — back tomorrow."),
    );
    expect(f.cls).toBe("guardrail");
    expect(f.detail).toBe("Daily Teach-Me session cap reached — back tomorrow.");
  });

  test("5xx reads as the provider class, never a bare 500", () => {
    expect(classifyTeachMeFailure(apiErr(503, "provider unavailable")).cls).toBe("provider");
    expect(classifyTeachMeFailure(apiErr(500, "internal")).cls).toBe("provider");
  });

  test("network TypeErrors and unknowns degrade honestly", () => {
    const netErr = new TypeError("Failed to fetch");
    expect(classifyTeachMeFailure(netErr).cls).toBe("network");
    expect(classifyTeachMeFailure("boom").cls).toBe("unknown");
  });

  test("status classes stay honest (403 owner / 404 missing / 401 auth)", () => {
    expect(classifyTeachMeFailure(apiErr(403, "not your session")).cls).toBe("forbidden");
    expect(classifyTeachMeFailure(apiErr(404, "nope")).cls).toBe("missing");
    expect(classifyTeachMeFailure(apiErr(401, "Session expired")).cls).toBe("unauthenticated");
  });
});

describe("wordsOf — the display-only counter", () => {
  test("counts whitespace-delimited words; the floor lives server-side", () => {
    expect(wordsOf("")).toBe(0);
    expect(wordsOf("   \n  ")).toBe(0);
    expect(wordsOf("one two three")).toBe(3);
    expect(wordsOf("  hyphen-ated  counts-as-one  ")).toBe(2);
  });
});
