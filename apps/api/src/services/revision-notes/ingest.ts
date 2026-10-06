/**
 * T-MIG-053 tranche-3 (r3a) — the operator-facing corpus ingestion.
 * Port of the frozen law (syllabai-core @ 6cad6ef,
 * revisionnotes/RevisionNoteIngestService.java :30-245):
 *
 *   - the ZIP package produced by scripts/c13_build_note_package.py:
 *     package.json (tree + note bodies + spec maps) + assets/* (diagrams);
 *   - FAIL-CLOSED VALIDATION (:24-27): unknown package version, duplicate
 *     ids/orders, traversal-looking asset names, asset references without a
 *     provided file, invalid spec-map JSON — any violation rejects the whole
 *     package (400) and leaves the previous corpus untouched;
 *   - the bounded walker is the SHARED ZipSafety port (sme/zip.ts readEach,
 *     T-MIG-033 tranche-3 — deep-audit 09-28 M3): per-entry/total/count
 *     budgets + the structural traversal guard, reused not redeclared. The
 *     service-level `name.contains("..")` check is RETAINED on top of it
 *     (:135-139) — the shared guard only rejects `..` PATH SEGMENTS (plain
 *     names like `a..b.png` stay legal there), so the service-level
 *     substring rejection is load-bearing and keeps its verbatim message;
 *   - the R14 fixed media allowlist (:33-34): text/html and image/svg+xml
 *     would be script-capable served inline from the app origin — never
 *     accepted for learner-facing assets;
 *   - SAFE_FILENAME (:42-43) — package-provided filenames stay boring and
 *     traversal-free (the DB check `filename !~ '[/\\]'` is the second
 *     layer, V27 :32);
 *   - REPLACE-ALL IN ONE TRANSACTION (:60-106): `replaced` is sampled from
 *     the count BEFORE the delete; notes + assets deleteAllInBatch; the
 *     orphan sweep (deleteOrphans — the loose note_id reference, V27 :43-45)
 *     runs AFTER the fresh corpus is written. The frozen flush() calls are
 *     a JPA first-level-cache artifact (the JPQL subquery could not see
 *     unflushed rows); the port's statements run in SQL order inside one
 *     transaction, so the sweep's NOT EXISTS naturally sees the fresh rows.
 *   - the two Java-primitive defaults (:77-78): specMapJson null → "{}",
 *     specPointCodes null → "";
 *   - status (:108-116): an un-ingested corpus reads honest nulls.
 *
 * Transactionality: the frozen ingest is one @Transactional. The port runs
 * every statement of the replace inside the createSql adapter's
 * begin/commit/rollback (the sme/index.ts TxSqlFn seam — the
 * register-repository precedent); unit tests forward the transaction to
 * the base fakeSql.
 *
 * The multipart ENVELOPE is the route layer's (the frozen @RequestPart
 * "file" + the empty-part 400, :33-46): this seam takes the raw ZIP bytes
 * exactly like the frozen service, and the 051 multipart runner ext stays
 * the golden vehicle for the eventual route capture.
 */
import { BadRequestError, type SubmitClock } from "../selfmark";
import {
  revisionNotePackageSchema,
  type RevisionNotePackage,
} from "@syllabai/contracts";
import { ArchiveFormatError, readEach, zipLimitsDefaults, type ZipLimits } from "../sme/zip";
import type { TxSqlFn } from "../sme/index.js";

// ── frozen constants (RevisionNoteIngestService :33-43) ──────────────────────

/** The only media types an ingested revision-note asset may claim (R14). */
export const ALLOWED_ASSET_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

/** Package format this build understands; bump when the format changes. */
export const SUPPORTED_PACKAGE_VERSION = "1.0";

/** Asset filenames are package-provided; keep them boring and traversal-free. */
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,511}$/;

// ── the verbatim 400 vocabulary (:240-244 + :136-161) ────────────────────────

const requireThat = (condition: boolean, what: string): void => {
  if (!condition) {
    throw new BadRequestError("invalid revision-notes package: " + what);
  }
};

/** Java Set.add semantics — true iff the value was NOT already present. */
const addTo = <T>(set: Set<T>, value: T): boolean => {
  if (set.has(value)) return false;
  set.add(value);
  return true;
};

// ── the parse surface ────────────────────────────────────────────────────────

export type ParsedPackage = {
  pkg: RevisionNotePackage;
  assetBytes: Map<string, Uint8Array>;
};

/** unzip(:130-162) — the shared bounded walker + the service-level `..`
 *  rejection + the package.json/assets split. */
export function unzipRevisionPackage(
  zipBytes: Uint8Array,
  limits: ZipLimits = zipLimitsDefaults(),
): ParsedPackage {
  const assetBytes = new Map<string, Uint8Array>();
  let packageJson: string | null = null;
  try {
    readEach(zipBytes, limits, (name, data) => {
      if (name.includes("..")) {
        // :135-139 — the service-level check the shared guard does not
        // replace (plain `a..b.png` names pass the structural guard)
        throw new BadRequestError(
          "revision-notes package contains an unsafe entry path: " + name,
        );
      }
      if (name === "package.json") {
        packageJson = new TextDecoder().decode(data);
      } else if (name.startsWith("assets/")) {
        assetBytes.set(name.slice("assets/".length), data);
      }
    });
  } catch (e) {
    if (e instanceof BadRequestError) throw e; // budget/guard/`..` — verbatim
    if (e instanceof ArchiveFormatError) {
      throw new BadRequestError("revision-notes package is not a readable ZIP");
    }
    throw e;
  }
  if (packageJson === null) {
    throw new BadRequestError("revision-notes package is missing package.json");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(packageJson);
  } catch {
    throw new BadRequestError("revision-notes package.json is not valid JSON");
  }
  const parsed = revisionNotePackageSchema.safeParse(raw);
  if (!parsed.success) {
    // Jackson binding failure class → the same not-valid-JSON 400
    throw new BadRequestError("revision-notes package.json is not valid JSON");
  }
  return { pkg: parsed.data, assetBytes };
}

// ── validate (:164-238) — the fail-closed laws, verbatim messages ────────────

export function validateRevisionPackage(pkg: RevisionNotePackage, providedAssets: Set<string>): void {
  if (pkg.packageVersion == null || SUPPORTED_PACKAGE_VERSION !== pkg.packageVersion) {
    throw new BadRequestError(
      "unsupported revision-notes package_version (expected " + SUPPORTED_PACKAGE_VERSION + ")",
    );
  }
  if (pkg.corpusVersion == null || pkg.corpusVersion.trim() === "" || pkg.corpusVersion.length > 128) {
    throw new BadRequestError("corpus_version must be 1..128 chars");
  }
  if (pkg.topics == null || pkg.topics.length === 0) {
    throw new BadRequestError("package must contain at least one topic");
  }
  const topicOrders = new Set<number>();
  const noteIds = new Set<string>();
  const referencedAssets = new Set<string>();
  for (const topic of pkg.topics) {
    requireThat(topic.title != null && topic.title.trim() !== "", "topic title");
    requireThat(topic.subtopics != null && topic.subtopics.length > 0,
      "topic '" + topic.title + "' has no subtopics");
    requireThat(addTo(topicOrders, topic.order ?? 0),
      "duplicate topic order " + topic.order);
    const subOrders = new Set<number>();
    for (const sub of topic.subtopics ?? []) {
      requireThat(sub.title != null && sub.title.trim() !== "", "subtopic title");
      requireThat(addTo(subOrders, sub.order ?? 0),
        "duplicate subtopic order " + topic.order + "." + sub.order);
      requireThat(sub.notes != null && sub.notes.length > 0,
        "subtopic '" + sub.title + "' has no notes");
      const noteOrders = new Set<number>();
      for (const n of sub.notes ?? []) {
        requireThat(n.noteId != null && /^[A-Za-z0-9._-]{1,256}$/.test(n.noteId),
          "note_id must be 1..256 chars of [A-Za-z0-9._-]: " + n.noteId);
        requireThat(addTo(noteIds, n.noteId ?? ""), "duplicate note_id " + n.noteId);
        requireThat(addTo(noteOrders, n.order ?? 0), "duplicate note order " + n.noteId);
        requireThat(n.title != null && n.title.trim() !== "", "note title " + n.noteId);
        requireThat(n.bodyMd != null && n.bodyMd.trim() !== "", "note body " + n.noteId);
        if (n.specMapJson != null) {
          try {
            JSON.parse(n.specMapJson);
          } catch {
            throw new BadRequestError("note " + n.noteId + " spec_map is not valid JSON");
          }
        }
        if (n.assets != null) {
          for (const ref of n.assets) referencedAssets.add(ref);
        }
      }
    }
  }
  for (const a of pkg.assets ?? []) {
    requireThat(a.filename != null && SAFE_FILENAME.test(a.filename),
      "unsafe asset filename: " + a.filename);
    requireThat(providedAssets.has(a.filename ?? ""),
      "asset declared in package.json but missing from ZIP: " + a.filename);
    // fixed allowlist (R14), not a generic media-type regex (:223-226)
    requireThat(a.contentType != null && ALLOWED_ASSET_CONTENT_TYPES.has(a.contentType),
      "asset content type for " + a.filename);
  }
  for (const ref of referencedAssets) {
    requireThat(SAFE_FILENAME.test(ref), "unsafe asset reference: " + ref);
    requireThat(providedAssets.has(ref),
      "note references asset missing from package: " + ref);
  }
}

// ── the service ──────────────────────────────────────────────────────────────

export type RevisionNoteIngestSummaryView = {
  topics: number;
  subtopics: number;
  notes: number;
  assets: number;
  replaced: boolean;
};

export type RevisionNoteStatusView = {
  ingested: boolean;
  notes: number;
  assets: number;
  ingestedAt: string | null;
  corpusVersion: string | null;
};

export class RevisionNoteIngestService {
  constructor(
    private readonly sql: TxSqlFn,
    private readonly clock: SubmitClock,
  ) {}

  /** ingest(:60-106) — parse + validate BEFORE the transaction; the whole
   *  replace-all + orphan sweep inside one transaction (the frozen
   *  @Transactional). */
  async ingest(zipBytes: Uint8Array): Promise<RevisionNoteIngestSummaryView> {
    const parsed = unzipRevisionPackage(zipBytes);
    const pkg = parsed.pkg;
    validateRevisionPackage(pkg, new Set(parsed.assetBytes.keys()));

    return this.sql.transaction(async (tx) => {
      const now = this.clock.now();
      const replaced =
        Number((await tx`select count(*) as n from revision_note` as Array<{ n: number | string }>)[0]!.n) > 0;

      await tx`delete from revision_note`;
      await tx`delete from revision_note_asset`;

      for (const topic of pkg.topics ?? []) {
        for (const sub of topic.subtopics ?? []) {
          for (const n of sub.notes ?? []) {
            // the Java-primitive defaults (:77-78)
            await tx`
              insert into revision_note (note_id, topic_order, topic_title,
                  subtopic_order, subtopic_title, note_order, title, body_md,
                  spec_map, spec_point_codes, source_url, ingested_at, corpus_version)
              values (${n.noteId}, ${topic.order ?? 0}, ${topic.title},
                  ${sub.order ?? 0}, ${sub.title}, ${n.order ?? 0}, ${n.title},
                  ${n.bodyMd}, ${n.specMapJson == null ? "{}" : n.specMapJson}::jsonb,
                  ${n.specPointCodes == null ? "" : n.specPointCodes},
                  ${n.sourceUrl}, ${now.toISOString()}::timestamptz,
                  ${pkg.corpusVersion})`;
          }
        }
      }
      for (const a of pkg.assets ?? []) {
        const bytes = parsed.assetBytes.get(a.filename ?? "")!;
        await tx`
          insert into revision_note_asset (filename, content_type, size_bytes, bytes, ingested_at)
          values (${a.filename}, ${a.contentType}, ${bytes.length}, ${bytes},
              ${now.toISOString()}::timestamptz)`;
      }
      // the orphan sweep (:88-93) — loose note_id reference, V27 :43-45. The
      // frozen flush() calls are a JPA artifact; SQL order already sees the
      // fresh rows here. The swept-row count is log-only in the frozen too
      // (log.info) — never wire-visible, not carried on the summary.
      await tx`
        delete from revision_note_viewed v
        where not exists (
          select 1 from revision_note n where n.note_id = v.note_id)`;

      return {
        topics: (pkg.topics ?? []).length,
        subtopics: (pkg.topics ?? []).reduce((acc, t) => acc + (t.subtopics ?? []).length, 0),
        notes: (pkg.topics ?? []).reduce(
          (acc, t) => acc + (t.subtopics ?? []).reduce((a, s) => a + (s.notes ?? []).length, 0),
          0,
        ),
        assets: (pkg.assets ?? []).length,
        replaced,
      };
    });
  }

  /** status(:108-116) — what is live; honest nulls before the first ingest. */
  async status(): Promise<RevisionNoteStatusView> {
    const countRows = (await this.sql`select count(*) as n from revision_note`) as Array<{
      n: number | string;
    }>;
    const noteCount = Number(countRows[0]!.n);
    if (noteCount === 0) {
      return { ingested: false, notes: 0, assets: 0, ingestedAt: null, corpusVersion: null };
    }
    // frozen findAll().get(0) — any row; after a replace-all every row
    // shares corpus_version/ingested_at
    const any = (await this.sql`
      select ingested_at, corpus_version from revision_note limit 1`) as Array<{
      ingested_at: string | Date;
      corpus_version: string;
    }>;
    const assetRows = (await this.sql`select count(*) as n from revision_note_asset`) as Array<{
      n: number | string;
    }>;
    return {
      ingested: true,
      notes: noteCount,
      assets: Number(assetRows[0]!.n),
      ingestedAt: new Date(any[0]!.ingested_at).toISOString(),
      corpusVersion: any[0]!.corpus_version,
    };
  }
}
