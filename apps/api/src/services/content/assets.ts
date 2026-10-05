/**
 * QuestionAssetRepository port (T-MIG-020) — learner-facing diagram assets.
 * Source: sme/QuestionAssetRepository.java (findByFilename) over the
 * question_asset table (sme/QuestionAsset.java:19-38; bytes = bytea).
 * The controller answers the RAW bytes with the stored content type and
 * content length — no directory semantics, 404 (empty body) for unknown
 * names (QuestionAssetController.java:26-36).
 */
import { createSql } from "../identity/users";

type Sql = ReturnType<typeof createSql>;

export interface QuestionAssetRow {
  filename: string;
  contentType: string;
  sizeBytes: number;
  bytes: Uint8Array;
}

export class QuestionAssetsRepository {
  constructor(private sql: Sql) {}

  async findByFilename(filename: string): Promise<QuestionAssetRow | null> {
    const rows = await this.sql`select filename, content_type, size_bytes, bytes from question_asset where filename = ${filename}`;
    const r = rows[0];
    if (!r) return null;
    return {
      filename: r.filename as string,
      contentType: r.content_type as string,
      sizeBytes: Number(r.size_bytes),
      bytes: r.bytes as Uint8Array,
    };
  }
}
