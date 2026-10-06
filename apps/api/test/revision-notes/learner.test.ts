/**
 * T-MIG-053 tranche-3 fakeSql pins (r3a) — the learner-facing read model,
 * frozen laws @ 6cad6ef (RevisionNoteService.java :21-148):
 *
 *   - the canonical-order query text is load-bearing (the index tree AND
 *     the body prev/next hang off topic→subtopic→note order) — pinned by
 *     capture;
 *   - the empty-corpus early return queries NOTHING about viewed (:37-39);
 *   - the tree groups by (topic, subtopic) in canonical order; noteCount =
 *     notes in the subtopic; specPointCodes split from the CSV (blank → []);
 *   - prev/next are the canonical neighbours, null at the ends (:90-91);
 *   - the asset list comes from the bodyMd ASSET_REF_FINDER regex, distinct
 *     in first-seen order (:139-147);
 *   - markViewed is 404-first, then IDEMPOTENT first-view-wins — an
 *     existing marker is returned and NO insert is issued (:104-115);
 *   - the asset leg resolves by exact filename; 404 message verbatim.
 */
import { describe, expect, test } from "bun:test";
import {
  assetFilenames,
  revisionNoteAsset,
  revisionNoteBody,
  revisionNoteMarkViewed,
  revisionNoteProgress,
  revisionNotesIndex,
  specCodes,
} from "../../src/services/revision-notes/learner";
import { NotFoundError } from "../../src/services/selfmark";
import { clock, CORPUS_ROWS, fakeSql, learnerRoutes, note, USER } from "./helpers";

describe("revision-notes learner — the canonical corpus reads", () => {
  test("index: the canonical ORDER BY is load-bearing and captured", async () => {
    const sql = fakeSql(learnerRoutes());
    await revisionNotesIndex(sql, USER);
    expect(sql.queries[0]).toContain(
      "order by topic_order asc, subtopic_order asc, note_order asc",
    );
  });

  test("index: the tree groups canonically; viewed desc; corpus meta from any row", async () => {
    const sql = fakeSql(learnerRoutes({
      viewed: [
        { note_id: "2.31-ph", viewed_at: "2026-10-05T10:00:00Z" },
        { note_id: "2.31-strong-acids", viewed_at: "2026-10-04T10:00:00Z" },
      ],
    }));
    const v = await revisionNotesIndex(sql, USER);
    expect(v.corpusVersion).toBe("4CH1-notes-2026-09");
    expect(v.ingestedAt).toBe("2026-10-05T09:00:00.000Z");
    expect(v.topics.length).toBe(1);
    expect(v.topics[0]!.title).toBe("Inorganic chemistry");
    expect(v.topics[0]!.subtopics.length).toBe(2);
    const sub1 = v.topics[0]!.subtopics[0]!;
    expect(sub1.noteCount).toBe(2);
    expect(sub1.notes.map((n) => n.noteId)).toEqual(["2.31-ph", "2.31-strong-acids"]);
    expect(sub1.notes[0]!.specPointCodes).toEqual(["4CH1-2.31", "4CH1-2.32"]);
    expect(v.viewed.map((x) => x.noteId)).toEqual(["2.31-ph", "2.31-strong-acids"]); // desc
  });

  test("index: the un-ingested corpus returns honest nulls and NEVER queries viewed", async () => {
    const sql = fakeSql(learnerRoutes({ notes: [] }));
    const v = await revisionNotesIndex(sql, USER);
    expect(v).toEqual({ corpusVersion: null, ingestedAt: null, topics: [], viewed: [] });
    expect(sql.queries.length).toBe(1); // the early return (:37-39)
    expect(sql.queries[0]).not.toContain("revision_note_viewed");
  });

  test("body: prev/next are the canonical neighbours, null at the ends", async () => {
    const sql = fakeSql(learnerRoutes());
    const first = await revisionNoteBody(sql, "2.31-ph");
    expect(first.prevNoteId).toBeNull();
    expect(first.nextNoteId).toBe("2.31-strong-acids");
    const middle = await revisionNoteBody(sql, "2.31-strong-acids");
    expect(middle.prevNoteId).toBe("2.31-ph");
    expect(middle.nextNoteId).toBe("2.32-salts");
    const last = await revisionNoteBody(sql, "2.32-salts");
    expect(last.prevNoteId).toBe("2.31-strong-acids");
    expect(last.nextNoteId).toBeNull();
    // specMapJson is the canonical TEXT passthrough, never re-serialized
    expect(first.specMapJson).toBe('{"4CH1-2.31":"recall"}');
  });

  test("body: the asset list is the regex extraction, distinct first-seen", async () => {
    const sql = fakeSql(learnerRoutes());
    const v = await revisionNoteBody(sql, "2.31-ph");
    expect(v.assets).toEqual(["fig-1.png", "fig-2.png"]); // fig-1 repeats — distinct
  });

  test("body: an unknown note is a verbatim 404", async () => {
    const sql = fakeSql(learnerRoutes());
    let msg = "";
    try {
      await revisionNoteBody(sql, "no-such-note");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe("revision note no-such-note not found");
  });

  test("asset: resolves by exact filename with the stored content type", async () => {
    const sql = fakeSql(learnerRoutes());
    const a = await revisionNoteAsset(sql, "fig-1.png");
    expect(a.contentType).toBe("image/png");
    expect([...a.bytes]).toEqual([1, 2, 3, 4, 5]);
  });

  test("asset: an unknown filename is a verbatim 404", async () => {
    const sql = fakeSql(learnerRoutes({ asset: [] }));
    let msg = "";
    try {
      await revisionNoteAsset(sql, "../escape.png");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe("revision note asset ../escape.png not found");
  });

  test("markViewed: 404-first on a missing note, before any viewed access", async () => {
    const sql = fakeSql(learnerRoutes({ noteExists: [] }));
    let msg = "";
    try {
      await revisionNoteMarkViewed(sql, clock, USER, "ghost");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe("revision note ghost not found");
    expect(sql.queries.length).toBe(1); // never touched the viewed table
  });

  test("markViewed: idempotent first-view-wins — the existing marker is returned, no insert", async () => {
    const sql = fakeSql(learnerRoutes({
      existingViewed: [{ note_id: "2.31-ph", viewed_at: "2026-10-05T08:00:00Z" }],
    }));
    const v = await revisionNoteMarkViewed(sql, clock, USER, "2.31-ph");
    expect(v).toEqual({ noteId: "2.31-ph", viewedAt: "2026-10-05T08:00:00.000Z" });
    expect(sql.queries.some((q) => q.startsWith("insert into"))).toBe(false);
  });

  test("markViewed: a fresh view inserts the @PrePersist pair (clock id + clock now)", async () => {
    const sql = fakeSql(learnerRoutes());
    const v = await revisionNoteMarkViewed(sql, clock, USER, "2.31-ph");
    expect(v.viewedAt).toBe("2026-10-06T10:00:00.000Z");
    expect(sql.queries.filter((q) => q.startsWith("insert into")).length).toBe(1);
  });

  test("progress: viewed markers only, newest first", async () => {
    const sql = fakeSql(learnerRoutes({
      viewed: [{ note_id: "n2", viewed_at: "2026-10-05T10:00:00Z" }],
    }));
    const v = await revisionNoteProgress(sql, USER);
    expect(v.viewed).toEqual([{ noteId: "n2", viewedAt: "2026-10-05T10:00:00.000Z" }]);
  });
});

describe("revision-notes learner — the pure helpers", () => {
  test("specCodes: CSV split; blank and null stay empty", () => {
    expect(specCodes(note() as never)).toEqual(["4CH1-2.31", "4CH1-2.32"]);
    expect(specCodes(note({ spec_point_codes: "" }) as never)).toEqual([]);
    expect(specCodes(note({ spec_point_codes: "  " }) as never)).toEqual([]);
  });

  test("assetFilenames: the frozen regex, distinct, ignores non-asset images", () => {
    const md = "![a](assets/x.png) ![b](https://cdn.example/y.png) ![a](assets/x.png) ![c](assets/z.pdf)";
    expect(assetFilenames(md)).toEqual(["x.png", "z.pdf"]);
    expect(assetFilenames("no refs")).toEqual([]);
  });
});

// CORPUS_ROWS referenced for the canonical-order pin record
void CORPUS_ROWS;
