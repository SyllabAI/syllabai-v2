/**
 * T-TEACHGENIE-002 — the note-driven picker projection pins.
 *
 * The picker of record selects a REVISION NOTE of the course under unit/topic
 * dropdowns; these pins hold the projection honest: canonical spec-tree
 * grouping (never a second taxonomy), corpus order preserved, codes passed
 * through verbatim (they ARE the create request's specPointIds), zero-code
 * notes omitted, unanchored notes in the honest loose group, empty units
 * pruned from the dropdowns.
 *
 * Run: bun test apps/hub/src/components/hub/teach-genie/
 */
import { describe, expect, test } from "bun:test";

import {
  TEACH_GENIE_LOOSE_TOPIC_CODE,
  buildTeachGenieNoteTree,
} from "@/components/hub/teach-me/picker-data";
import type { Curriculum, RevisionNote } from "@/lib/contracts";

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
      code: "4CH1-S2-d", family: "SUBTOPIC", title: "Energetics", description: null,
      parents: ["4CH1-S2"], provenanceTier: "OFFICIAL",
    },
    {
      code: "4CH1-2.3", family: "SPEC_POINT", title: "describe electrolysis of a molten ionic compound",
      description: null, parents: ["4CH1-S2", "4CH1-S2-c"], provenanceTier: "OFFICIAL",
    },
    {
      code: "4CH1-2.10", family: "SPEC_POINT", title: "explain the formation of the products",
      description: null, parents: ["4CH1-S2", "4CH1-S2-c"], provenanceTier: "OFFICIAL",
    },
    {
      code: "4CH1-2.20", family: "SPEC_POINT", title: "describe exothermic and endothermic changes",
      description: null, parents: ["4CH1-S2", "4CH1-S2-d"], provenanceTier: "OFFICIAL",
    },
    // a second topic whose subtopic carries no notes must not render
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

const note = (overrides: Partial<RevisionNote> & { noteId: string }): RevisionNote =>
  ({
    title: "A note",
    sourceUrl: null,
    specPointIds: [],
    specPointCodes: [],
    guidedStudy: false,
    path: null,
    updatedAt: "2026-11-01T00:00:00Z",
    bodyMd: "body",
    ...overrides,
  }) as RevisionNote;

describe("buildTeachGenieNoteTree (T-TEACHGENIE-002)", () => {
  const notes: RevisionNote[] = [
    note({ noteId: "rn_electrolysis", title: "Electrolysis of molten compounds", specPointCodes: ["4CH1-2.3", "4CH1-2.10"] }),
    note({ noteId: "rn_single", title: "The products of electrolysis", specPointCodes: ["4CH1-2.10"] }),
    // corpus order preserved; this note anchors to the OTHER subtopic (S2-d)
    note({ noteId: "rn_energetics", title: "Exothermic and endothermic reactions", specPointCodes: ["4CH1-2.20"] }),
  ];
  const tree = buildTeachGenieNoteTree(CURRICULUM, notes);

  test("notes ride the sub-topic their canon codes anchor to (unit → topic → notes)", () => {
    expect(tree).toHaveLength(1); // the hollow topic is pruned from the dropdowns
    const unit = tree[0];
    expect(unit.code).toBe("4CH1-S2");
    expect(unit.number).toBe(1);
    expect(unit.title).toBe("2. Principles of chemistry");
    expect(unit.subtopics).toHaveLength(2); // S2-d holds a note; hollow S3-a is pruned with its topic
    const topic = unit.subtopics[0];
    expect(topic.code).toBe("4CH1-S2-c");
    expect(topic.title).toBe("Electrolysis");
    expect(topic.notes.map((n) => n.noteId)).toEqual(["rn_electrolysis", "rn_single"]);
    expect(unit.subtopics[1].code).toBe("4CH1-S2-d");
    expect(unit.subtopics[1].notes.map((n) => n.noteId)).toEqual(["rn_energetics"]);
  });

  test("codes pass through verbatim — they are the session's ground truth", () => {
    expect(tree[0].subtopics[0].notes[0].specPointCodes).toEqual(["4CH1-2.3", "4CH1-2.10"]);
  });

  test("a note no code anchors lands in the honest loose group, not a fabricated home", () => {
    const withLoose = buildTeachGenieNoteTree(CURRICULUM, [
      ...notes,
      note({ noteId: "rn_loose", title: "A loose note", specPointCodes: ["9XYZ-9.9"] }),
    ]);
    const loose = withLoose.find((t) => t.code === TEACH_GENIE_LOOSE_TOPIC_CODE);
    expect(loose).toBeDefined();
    expect(loose?.title).toBe("Other notes");
    expect(loose?.subtopics[0].notes.map((n) => n.noteId)).toEqual(["rn_loose"]);
    // the anchored groups are untouched by the loose note
    expect(withLoose[0].subtopics[0].notes).toHaveLength(2);
  });

  test("a zero-code note cannot ground a session and is not offered", () => {
    const withZero = buildTeachGenieNoteTree(CURRICULUM, [
      ...notes,
      note({ noteId: "rn_zerocodes", title: "No canon anchor", specPointCodes: [] }),
    ]);
    const all = withZero.flatMap((t) => t.subtopics.flatMap((s) => s.notes));
    expect(all.some((n) => n.noteId === "rn_zerocodes")).toBe(false);
  });

  test("a note-free curriculum yields an empty tree (the page keeps its warm-up state)", () => {
    expect(buildTeachGenieNoteTree(CURRICULUM, [])).toEqual([]);
  });
});
