/**
 * T-MIG-053 tranche-3 fakeSql pins (r3a) — the operator ingest/status pair,
 * frozen laws @ 6cad6ef (RevisionNoteIngestService.java :30-245 + the admin
 * controller :33-51):
 *
 *   - replace-all in ONE transaction: replaced sampled from the count BEFORE
 *     the delete; deletes → note inserts → asset inserts → orphan sweep, in
 *     SQL order (the frozen flush() calls are a JPA artifact);
 *   - the two Java-primitive defaults bind ("{}" / "") (:77-78);
 *   - fail-closed validation with the verbatim messages — unknown package
 *     version, corpus_version bounds, no topics, duplicate orders/ids,
 *     bad note_id charset, invalid spec-map JSON, the R14 media allowlist
 *     (image/svg+xml NEVER), SAFE_FILENAME, declared-but-missing and
 *     referenced-but-missing assets;
 *   - the service-level `..` entry check is LOAD-BEARING on top of the
 *     shared structural guard: plain names like `a..b.png` pass the shared
 *     guard and must still be rejected with the verbatim message (:135-139);
 *   - missing package.json / not-valid JSON / not-a-ZIP translations;
 *   - status reads honest nulls before the first ingest (:108-116).
 */
import { describe, expect, test } from "bun:test";
import {
  RevisionNoteIngestService,
  unzipRevisionPackage,
  validateRevisionPackage,
  ALLOWED_ASSET_CONTENT_TYPES,
  SUPPORTED_PACKAGE_VERSION,
} from "../../src/services/revision-notes/ingest";
import { BadRequestError } from "../../src/services/selfmark";
import { buildZip, clock, ingestRoutes, pkg, txSql } from "./helpers";

const T = "2026-10-06T10:00:00Z";

const PKG_ZIP_PARTS = () => [
  { name: "package.json", data: new TextEncoder().encode(JSON.stringify(pkg())) },
  { name: "assets/fig-1.png", data: new Uint8Array([1]) },
];

const ingest = (routes: Parameters<typeof txSql>[0]) =>
  new RevisionNoteIngestService(txSql(routes), clock);

describe("revision-notes ingest — the replace-all transaction", () => {
  test("fresh ingest: replaced=false, the statements run in frozen order, defaults bound", async () => {
    const capture: { notes: unknown[][]; assets: unknown[][] } = { notes: [], assets: [] };
    const sql = ingest(ingestRoutes({}, capture));
    const summary = await sql.ingest(buildZip(PKG_ZIP_PARTS()));
    expect(summary).toEqual({ topics: 1, subtopics: 1, notes: 1, assets: 1, replaced: false });
    // statement order: count → deletes → note insert → asset insert → sweep
    const queries = ((sql as unknown as { sql: { queries: string[] } }).sql).queries;
    const order = queries.map((q) =>
      /select count\(\*\) as n from revision_note$/.test(q) ? "count"
      : q === "delete from revision_note" ? "delNotes"
      : q === "delete from revision_note_asset" ? "delAssets"
      : q.startsWith("insert into revision_note (") ? "insNote"
      : q.startsWith("insert into revision_note_asset") ? "insAsset"
      : q.startsWith("delete from revision_note_viewed") ? "sweep"
      : "other",
    );
    expect(order).toEqual(["count", "delNotes", "delAssets", "insNote", "insAsset", "sweep"]);
    // the specMapJson/s specPointCodes bind verbatim when present (:77-78
    // defaults apply only to null)
    expect(capture.notes[0]![8]).toBe('{"4CH1-2.31":"recall"}');
    expect(capture.notes[0]![9]).toBe("4CH1-2.31");
    expect(capture.notes[0]![0]).toBe("2.31-ph");
    expect(capture.assets[0]![0]).toBe("fig-1.png");
  });

  test("replace ingest: replaced=true when the corpus is live before the delete", async () => {
    const sql = ingest(ingestRoutes({ noteCount: [{ n: 3 }] }));
    const summary = await sql.ingest(buildZip(PKG_ZIP_PARTS()));
    expect(summary.replaced).toBe(true);
    const queries = ((sql as unknown as { sql: { queries: string[] } }).sql).queries;
    expect(queries.findIndex((q) => q === "delete from revision_note"))
      .toBeGreaterThan(queries.findIndex((q) => /select count\(\*\) as n from revision_note$/.test(q)));
  });

  test("specPointCodes/specMapJson null bind the empty defaults; sourceUrl null passthrough", async () => {
    const p = pkg();
    (p.topics as Array<{ subtopics: Array<{ notes: Array<Record<string, unknown>> }> }>)
      [0]!.subtopics[0]!.notes[0]!.specPointCodes = null;
    (p.topics as Array<{ subtopics: Array<{ notes: Array<Record<string, unknown>> }> }>)
      [0]!.subtopics[0]!.notes[0]!.specMapJson = null;
    (p.topics as Array<{ subtopics: Array<{ notes: Array<Record<string, unknown>> }> }>)
      [0]!.subtopics[0]!.notes[0]!.sourceUrl = null;
    const capture: { notes: unknown[][]; assets: unknown[][] } = { notes: [], assets: [] };
    const sql = ingest(ingestRoutes({}, capture));
    await sql.ingest(buildZip([
      { name: "package.json", data: new TextEncoder().encode(JSON.stringify(p)) },
      { name: "assets/fig-1.png", data: new Uint8Array([1]) },
    ]));
    expect(capture.notes[0]![9]).toBe(""); // the specPointCodes default
    expect(capture.notes[0]![8]).toBe("{}"); // the specMapJson default
    expect(capture.notes[0]![10]).toBeNull(); // sourceUrl null passthrough
  });
});

describe("revision-notes ingest — fail-closed validation (verbatim 400s)", () => {
  const ingestZip = async (p: Record<string, unknown>, assets: Array<{ name: string; data: Uint8Array }> = [{ name: "assets/fig-1.png", data: new Uint8Array([1]) }]) => {
    const sql = ingest(ingestRoutes());
    const parts = [{ name: "package.json", data: new TextEncoder().encode(JSON.stringify(p)) }, ...assets];
    return sql.ingest(buildZip(parts)).catch((e) => (e as Error).message);
  };

  test("unsupported package_version", async () => {
    expect(await ingestZip(pkg({ packageVersion: "2.0" }))).toBe(
      "unsupported revision-notes package_version (expected 1.0)",
    );
    expect(SUPPORTED_PACKAGE_VERSION).toBe("1.0");
  });

  test("corpus_version bounds (blank / 129 chars)", async () => {
    expect(await ingestZip(pkg({ corpusVersion: "" }))).toBe("corpus_version must be 1..128 chars");
    expect(await ingestZip(pkg({ corpusVersion: "x".repeat(129) }))).toBe("corpus_version must be 1..128 chars");
  });

  test("no topics / empty topics array", async () => {
    expect(await ingestZip(pkg({ topics: [] }))).toBe("package must contain at least one topic");
  });

  test("duplicate note_id — the second occurrence rejects", async () => {
    const p = pkg();
    const n = { ...(p.topics as Array<{ subtopics: Array<{ notes: Array<Record<string, unknown>> }> }>)[0]!.subtopics[0]!.notes[0]! };
    (p.topics as Array<{ subtopics: Array<{ notes: Array<Record<string, unknown>> }> }>)
      [0]!.subtopics[0]!.notes.push(n);
    expect(await ingestZip(p)).toBe("invalid revision-notes package: duplicate note_id 2.31-ph");
  });

  test("bad note_id charset", async () => {
    const p = pkg();
    ((p.topics as Array<{ subtopics: Array<{ notes: Array<Record<string, unknown>> }> }>)
      [0]!.subtopics[0]!.notes[0]!)["noteId"] = "../evil";
    expect(await ingestZip(p)).toBe(
      "invalid revision-notes package: note_id must be 1..256 chars of [A-Za-z0-9._-]: ../evil",
    );
  });

  test("invalid spec_map JSON", async () => {
    const p = pkg();
    ((p.topics as Array<{ subtopics: Array<{ notes: Array<Record<string, unknown>> }> }>)
      [0]!.subtopics[0]!.notes[0]!)["specMapJson"] = "{not json";
    expect(await ingestZip(p)).toBe("note 2.31-ph spec_map is not valid JSON");
  });

  test("declared asset missing from the ZIP", async () => {
    expect(
      await ingestZip(pkg(), []),
    ).toBe("invalid revision-notes package: asset declared in package.json but missing from ZIP: fig-1.png");
  });

  test("the R14 allowlist: image/svg+xml is NEVER accepted (script-capable media)", async () => {
    expect(ALLOWED_ASSET_CONTENT_TYPES.has("image/svg+xml")).toBe(false);
    expect(ALLOWED_ASSET_CONTENT_TYPES.has("text/html")).toBe(false);
    expect(
      await ingestZip(pkg({ assets: [{ filename: "fig-1.png", contentType: "image/svg+xml" }] })),
    ).toBe("invalid revision-notes package: asset content type for fig-1.png");
  });

  test("unsafe asset filename (SAFE_FILENAME: must start alnum, traversal chars excluded)", async () => {
    expect(
      await ingestZip(pkg({ assets: [{ filename: "../x.png", contentType: "image/png" }] })),
    ).toBe("invalid revision-notes package: unsafe asset filename: ../x.png");
    expect(
      await ingestZip(pkg({ assets: [{ filename: "/abs/x.png", contentType: "image/png" }] })),
    ).toBe("invalid revision-notes package: unsafe asset filename: /abs/x.png");
  });

  test("note references asset missing from the package", async () => {
    const p = pkg();
    ((p.topics as Array<{ subtopics: Array<{ notes: Array<Record<string, unknown>> }> }>)
      [0]!.subtopics[0]!.notes[0]!)["assets"] = ["ghost.png"];
    expect(await ingestZip(p)).toBe(
      "invalid revision-notes package: note references asset missing from package: ghost.png",
    );
  });

  test("the service-level `..` entry check is load-bearing on plain names (the shared structural guard passes them)", async () => {
    expect(
      await ingestZip(pkg(), [{ name: "assets/a..b.png", data: new Uint8Array([1]) }]),
    ).toBe("revision-notes package contains an unsafe entry path: assets/a..b.png");
  });

  test("missing package.json / not-valid JSON / not-a-ZIP", async () => {
    const sql = ingest(ingestRoutes());
    await expect(
      sql.ingest(buildZip([{ name: "assets/fig-1.png", data: new Uint8Array([1]) }])),
    ).rejects.toThrow("revision-notes package is missing package.json");
    await expect(
      sql.ingest(buildZip([{ name: "package.json", data: new TextEncoder().encode("{not json") }])),
    ).rejects.toThrow("revision-notes package.json is not valid JSON");
    await expect(sql.ingest(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      "revision-notes package is not a readable ZIP",
    );
  });
});

describe("revision-notes ingest — the parse + status surface", () => {
  test("unzipRevisionPackage splits package.json from assets/", () => {
    const parsed = unzipRevisionPackage(buildZip([
      { name: "package.json", data: new TextEncoder().encode(JSON.stringify(pkg())) },
      { name: "assets/fig-1.png", data: new Uint8Array([9, 9]) },
      { name: "ignored.txt", data: new Uint8Array([1]) }, // non-package entries skipped
    ]));
    expect(parsed.pkg.corpusVersion).toBe("4CH1-notes-2026-09");
    expect(parsed.assetBytes.get("fig-1.png")).toEqual(new Uint8Array([9, 9]));
    expect(parsed.assetBytes.has("ignored.txt")).toBe(false);
  });

  test("validateRevisionPackage: a happy package passes", () => {
    const parsed = unzipRevisionPackage(buildZip([
      { name: "package.json", data: new TextEncoder().encode(JSON.stringify(pkg())) },
      { name: "assets/fig-1.png", data: new Uint8Array([9]) },
    ]));
    expect(() => validateRevisionPackage(parsed.pkg, new Set(parsed.assetBytes.keys()))).not.toThrow();
  });

  test("status: honest nulls before the first ingest; counts after", async () => {
    const before = ingest(ingestRoutes({ noteCount: [{ n: 0 }] }));
    expect(await before.status()).toEqual({
      ingested: false, notes: 0, assets: 0, ingestedAt: null, corpusVersion: null,
    });
    const live = ingest(ingestRoutes({
      noteCount: [{ n: 182 }],
      assetCount: [{ n: 12 }],
    }));
    const s = await live.status();
    expect(s).toEqual({
      ingested: true, notes: 182, assets: 12,
      ingestedAt: "2026-10-05T09:00:00.000Z", corpusVersion: "4CH1-notes-2026-09",
    });
  });

  test("a BadRequestError subclass from the shared walker passes through verbatim (budget/guard)", () => {
    let caught: unknown;
    try {
      unzipRevisionPackage(new Uint8Array(0));
    } catch (e) {
      caught = e;
    }
    // an empty byte array is a malformed archive → the not-a-ZIP translation
    expect(caught).toBeInstanceOf(BadRequestError);
    expect((caught as Error).message).toBe("revision-notes package is not a readable ZIP");
  });

  test("the clock anchor: every ingested row stamps the SAME now (the frozen `now` variable)", async () => {
    const capture: { notes: unknown[][]; assets: unknown[][] } = { notes: [], assets: [] };
    const sql = ingest(ingestRoutes({}, capture));
    await sql.ingest(buildZip(PKG_ZIP_PARTS()));
    expect(capture.notes[0]![11]).toBe("2026-10-06T10:00:00.000Z");
    expect(capture.assets[0]![4]).toBe("2026-10-06T10:00:00.000Z");
    expect(capture.notes[0]![12]).toBe("4CH1-notes-2026-09");
  });
});
