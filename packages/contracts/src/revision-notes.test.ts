/**
 * T-MIG-053 tranche-3 contract pins (r3a) — the revision-notes wire, frozen
 * laws @ 6cad6ef (RevisionNoteDtos.java):
 *
 *   - the un-ingested corpus reads honest nulls + empty arrays (:38) —
 *     never a fabricated tree;
 *   - the canonical prev/next are nullable (:39-48 — null at the corpus
 *     ends, :90-91);
 *   - specMapJson is the stored JSON TEXT passthrough, never re-serialized;
 *   - MarkNoteViewedRequest noteId carries the @Size(max = 80) wire bound
 *     (:53);
 *   - the admin status view reads honest nulls when nothing is ingested
 *     (:60-63, :111);
 *   - the ingest summary is a plain int×4 + replaced boolean (:56-58);
 *   - the package tree is the Jackson-parity parse surface (SME precedent):
 *     passthrough + nullish — the fail-closed laws live in the ingest
 *     validate() port, not in the binding.
 */
import { describe, expect, test } from "bun:test";
import {
  markNoteViewedRequestSchema,
  revisionNoteBodyViewSchema,
  revisionNoteIngestSummarySchema,
  revisionNotePackageSchema,
  revisionNoteProgressViewSchema,
  revisionNotesIndexViewSchema,
  revisionNoteStatusViewSchema,
} from "./revision-notes.js";

const T = "2026-10-06T01:02:03Z";

describe("revision-notes contracts — the learner wire", () => {
  test("the un-ingested corpus: nulls + empty arrays, honest absence (:38)", () => {
    const v = revisionNotesIndexViewSchema.parse({
      corpusVersion: null,
      ingestedAt: null,
      topics: [],
      viewed: [],
    });
    expect(v.corpusVersion).toBeNull();
    expect(v.topics).toEqual([]);
    expect(v.viewed).toEqual([]);
    // a fabricated corpusVersion is rejected — absence is null, not a guess
    expect(() =>
      revisionNotesIndexViewSchema.parse({
        corpusVersion: "c1",
        ingestedAt: null,
        topics: [],
        viewed: [],
      }),
    ).not.toThrow(); // string is legal when a corpus IS live
    expect(() =>
      revisionNotesIndexViewSchema.parse({
        corpusVersion: 7,
        ingestedAt: null,
        topics: [],
        viewed: [],
      }),
    ).toThrow(); // but a number is not
  });

  test("the index tree grain: order ints, noteCount int, specPointCodes array", () => {
    const v = revisionNotesIndexViewSchema.parse({
      corpusVersion: "4CH1-notes-2026-09",
      ingestedAt: T,
      topics: [
        {
          order: 2,
          title: "Inorganic chemistry",
          subtopics: [
            {
              order: 1,
              title: "Acids and bases",
              noteCount: 2,
              notes: [
                {
                  noteId: "2.31-strong-acids",
                  title: "Strong acids",
                  order: 1,
                  specPointCodes: ["4CH1-2.31", "4CH1-2.32"],
                },
                { noteId: "2.31-ph", title: "pH", order: 2, specPointCodes: [] },
              ],
            },
          ],
        },
      ],
      viewed: [{ noteId: "2.31-ph", viewedAt: T }],
    });
    expect(v.topics[0]!.subtopics[0]!.noteCount).toBe(2);
    expect(v.viewed[0]!.viewedAt).toBe(T);
    expect(() =>
      revisionNotesIndexViewSchema.parse({
        corpusVersion: "c",
        ingestedAt: T,
        topics: [
          {
            order: 1.5,
            title: "t",
            subtopics: [],
          },
        ],
        viewed: [],
      }),
    ).toThrow(); // order is an int
  });

  test("the body view: prev/next nullable, specMapJson raw-text passthrough", () => {
    const v = revisionNoteBodyViewSchema.parse({
      noteId: "2.31-ph",
      title: "pH",
      bodyMd: "![fig](assets/fig-1.png) body",
      specMapJson: '{"4CH1-2.31":"recall"}',
      sourceUrl: null,
      assets: ["fig-1.png"],
      prevNoteId: null,
      nextNoteId: "2.31-strong-acids",
    });
    expect(v.specMapJson).toBe('{"4CH1-2.31":"recall"}');
    expect(v.prevNoteId).toBeNull();
    expect(() =>
      revisionNoteBodyViewSchema.parse({
        noteId: "n",
        title: "t",
        bodyMd: "b",
        specMapJson: {},
        sourceUrl: null,
        assets: [],
        prevNoteId: null,
        nextNoteId: null,
      }),
    ).toThrow(); // specMapJson is TEXT on the wire, not a parsed object
  });

  test("MarkNoteViewedRequest: the @Size(max = 80) bound is exact (:53)", () => {
    expect(markNoteViewedRequestSchema.parse({ noteId: "a".repeat(80) }).noteId.length).toBe(80);
    expect(() => markNoteViewedRequestSchema.parse({ noteId: "a".repeat(81) })).toThrow();
    expect(() => markNoteViewedRequestSchema.parse({})).toThrow();
  });

  test("progress view: viewed markers only (:50)", () => {
    const v = revisionNoteProgressViewSchema.parse({
      viewed: [{ noteId: "n1", viewedAt: T }],
    });
    expect(v.viewed.length).toBe(1);
  });
});

describe("revision-notes contracts — the admin wire", () => {
  test("ingest summary: int×4 + replaced boolean (:56-58)", () => {
    const v = revisionNoteIngestSummarySchema.parse({
      topics: 4,
      subtopics: 28,
      notes: 182,
      assets: 12,
      replaced: false,
    });
    expect(v.replaced).toBe(false);
    expect(() =>
      revisionNoteIngestSummarySchema.parse({
        topics: 1,
        subtopics: 1,
        notes: 1,
        assets: 1,
        replaced: 1,
      }),
    ).toThrow(); // boolean, not a numeric truthy
  });

  test("status view: honest nulls before the first ingest (:111)", () => {
    const v = revisionNoteStatusViewSchema.parse({
      ingested: false,
      notes: 0,
      assets: 0,
      ingestedAt: null,
      corpusVersion: null,
    });
    expect(v.ingested).toBe(false);
    expect(v.ingestedAt).toBeNull();
  });
});

describe("revision-notes contracts — the package parse tree (Jackson parity)", () => {
  test("passthrough: unknown keys ignored (ignoreUnknown parity)", () => {
    const p = revisionNotePackageSchema.parse({
      packageVersion: "1.0",
      corpusVersion: "4CH1-notes-2026-09",
      generatedAt: "2026-09-23T00:00:00Z",
      topics: [
        {
          order: 2,
          title: "Inorganic",
          subtopics: [
            {
              order: 1,
              title: "Acids",
              notes: [
                {
                  noteId: "2.31-ph",
                  title: "pH",
                  order: 1,
                  bodyMd: "b",
                  specMapJson: "{}",
                  specPointCodes: "4CH1-2.31,4CH1-2.32",
                  sourceUrl: "https://example.test/2.31",
                  assets: ["fig-1.png"],
                  someFutureField: { nested: true },
                },
              ],
              futureSubtopicKey: 1,
            },
          ],
        },
      ],
      assets: [{ filename: "fig-1.png", contentType: "image/png" }],
      futureTopKey: "ignored",
    });
    expect(p.topics![0]!.subtopics![0]!.notes![0]!.specPointCodes).toBe("4CH1-2.31,4CH1-2.32");
  });

  test("absent object components bind null — the validate() port rejects, not the binder", () => {
    const p = revisionNotePackageSchema.parse({});
    expect(p.packageVersion).toBeUndefined(); // nullish — Jackson would bind null
    expect(p.topics).toBeUndefined();
    // specPointCodes is the raw CSV STRING in the parse tree (stored verbatim,
    // split at read time) — an array here is a binding failure
    expect(() =>
      revisionNotePackageSchema.parse({
        topics: [{ order: 1, title: "t", subtopics: [{ order: 1, title: "s", notes: [{ noteId: "n", specPointCodes: ["4CH1-2.31"] }] }] }],
      }),
    ).toThrow();
  });
});
