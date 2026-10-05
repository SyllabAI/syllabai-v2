/**
 * QuestionAssetRepository port — the OBSERVED query surface of
 * QuestionAssetRepository.java (findByFilename only — the read tranche).
 *
 * Table (V30__sme_question_bank.sql:37-44, Flyway-owned — row-level read):
 *   question_asset(filename varchar(512) PK, content_type varchar(128) NOT NULL,
 *     size_bytes bigint NOT NULL, bytes bytea NOT NULL,
 *     ingested_at timestamptz NOT NULL)
 *   (filename CHECK: no path separators — containment-safe package names)
 *
 * Route parity (QuestionAssetController.java:26-36): GET
 * /api/v1/content/question-assets/{filename} — 404 is ResponseEntity
 * .notFound().build() = a ZERO-BYTE body (captured as the runner's
 * <non-json:0 bytes> sentinel, T-MIG-004 F-8); a hit carries
 * Content-Type + Content-Length and the raw bytes. The response assembly
 * lives in the route layer; this module returns the row or null.
 */
import type { SqlFn } from "./sql";

export interface QuestionAssetRow {
  filename: string;
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
  ingestedAt: Date;
}

const mapAsset = (r: Record<string, unknown>): QuestionAssetRow => ({
  filename: String(r.filename),
  contentType: String(r.content_type),
  sizeBytes: Number(r.size_bytes),
  // bytea arrives as a Node Buffer over the Neon driver; the identity module
  // never touches bytea, so the mapping here is the port's own contract.
  bytes: r.bytes as Buffer,
  ingestedAt: new Date(r.ingested_at as string),
});

export class QuestionAssetsRepository {
  constructor(private readonly sql: SqlFn) {}

  async findByFilename(filename: string): Promise<QuestionAssetRow | null> {
    const rows = await this.sql`
      select * from question_asset where filename = ${filename}`;
    const row = rows[0];
    return row == null ? null : mapAsset(row);
  }
}
