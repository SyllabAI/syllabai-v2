/**
 * QuestionAssetsRepository unit tests — the binary asset read surface
 * (QuestionAssetController.java:26-36). The 404 shape is a ZERO-BYTE body
 * (ResponseEntity.notFound().build() — captured as <non-json:0 bytes>,
 * T-MIG-004 F-8); that shape is produced by the route layer returning no
 * body, so the repo contract here is: row or null.
 */
import { describe, expect, test } from "bun:test";
import { QuestionAssetsRepository } from "../../src/services/content/assets";
import { fakeSql } from "./helpers";

describe("QuestionAssetsRepository", () => {
  test("findByFilename maps the bytea row (content-type, size, bytes)", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const sql = fakeSql([
      {
        match: /from question_asset where filename = \?$/i,
        rows: [
          {
            filename: "fig-2-moles.png",
            content_type: "image/png",
            size_bytes: bytes.length,
            bytes,
            ingested_at: "2026-10-04T12:00:00Z",
          },
        ],
      },
    ]);
    const asset = await new QuestionAssetsRepository(sql).findByFilename("fig-2-moles.png");
    expect(asset).not.toBeNull();
    expect(asset!.contentType).toBe("image/png");
    expect(asset!.sizeBytes).toBe(4);
    expect(asset!.bytes).toEqual(bytes);
  });

  test("unknown filename → null (route layer renders the zero-byte 404, F-8)", async () => {
    const sql = fakeSql([
      { match: /from question_asset where filename = \?$/i, rows: [] },
    ]);
    expect(await new QuestionAssetsRepository(sql).findByFilename("unknown-figure.png")).toBeNull();
  });
});
