/**
 * T-TUTOR-EXP-1 (004) — the CLA spec-statement evidence law, pinned against
 * the REAL sha256-pinned snapshot (not a fixture).
 *
 * The measured false-refusal class (2026-11-03 live 4CH1 battery): "what
 * does 4CH1-1.59C say" was refused INSIDE the topic that contains 1.59C —
 * the CLA evidence window carried KG node titles/descriptions but never the
 * spec statements' official wording, so the grounding gate honestly refused
 * what it could not see. This pin asserts the window now CARRIES the
 * wording, bounded, on topic contexts — and stays honestly null where the
 * snapshot has nothing to say (every non-pilot subject), never fabricated.
 */
import { describe, expect, test } from "bun:test";

import { loadConceptGraphSnapshot } from "../../src/services/teacher";
import {
  SPEC_STATEMENT_BOUND,
  SPEC_STATEMENT_LIMIT,
  claSpecStatementItem,
} from "../../src/services/cla/service";

const snapshot = loadConceptGraphSnapshot();

describe("claSpecStatementItem — the 004 spec-statement evidence law", () => {
  test("a subsection-coded topic carries its own official statements (the 4CH1-1.59C class)", () => {
    // the snapshot's own subsection space, first spec point of a subsection
    const sp = snapshot.specPoints[0]!;
    const item = claSpecStatementItem(sp.subsectionCode, "topic-node-1", snapshot);
    expect(item).not.toBeNull();
    expect(item!.source).toBe("SYLLABUS");
    expect(item!.content).toContain("Official specification statements for this topic:");
    // the ask that exposed the gap names the official code — the wording
    // must now be IN the window
    expect(item!.content).toContain(`${sp.officialCode}: `);
    expect(item!.content).toContain(sp.wording.slice(0, 40));
    // attribution stays on the RESOLVED topic
    expect(item!.topicIds).toEqual(["topic-node-1"]);
    // the statements' own codes ride the item
    expect(item!.specCodes.length).toBeGreaterThan(0);
    expect(item!.specCodes).toContain(sp.officialCode);
    // honest provenance: synthesized item, no fabricated document link
    expect(item!.documentId).toBeNull();
    expect(item!.documentRowId).toBeNull();
  });

  test("a section-coded topic carries the section's statements, capped at SPEC_STATEMENT_LIMIT", () => {
    const sectionCode = snapshot.specPoints[0]!.sectionCode;
    const sectionCount = snapshot.specPoints.filter(
      (s) => s.sectionCode === sectionCode,
    ).length;
    const item = claSpecStatementItem(sectionCode, "topic-node-2", snapshot);
    expect(item).not.toBeNull();
    expect(item!.specCodes.length).toBe(Math.min(sectionCount, SPEC_STATEMENT_LIMIT));
    // the prompt's 600-char non-paper evidence bound is never exceeded
    expect(item!.content.length).toBeLessThanOrEqual(600);
  });

  test("per-statement wording bounds never exceed SPEC_STATEMENT_BOUND", () => {
    for (const sp of snapshot.specPoints.slice(0, 40)) {
      const item = claSpecStatementItem(sp.subsectionCode, "n", snapshot);
      if (item == null) continue;
      for (const line of item.content.split("\n")) {
        if (!line.startsWith("- ")) continue;
        // "- {code}: " prefix (~12 chars) + the bounded wording
        const wording = line.slice(line.indexOf(": ") + 2);
        expect(wording.length).toBeLessThanOrEqual(SPEC_STATEMENT_BOUND + 1);
      }
    }
  });

  test("a non-pilot subject code is the honest null (never a fabricated statement)", () => {
    expect(claSpecStatementItem("IALCHEM2018-U1-T3", "n", snapshot)).toBeNull();
    expect(claSpecStatementItem("9702-AS-1", "n", snapshot)).toBeNull();
    expect(claSpecStatementItem("", "n", snapshot)).toBeNull();
  });
});
