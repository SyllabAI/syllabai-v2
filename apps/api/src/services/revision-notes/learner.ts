/**
 * T-MIG-053 tranche-3 (r3a) — the learner-facing revision-notes read model.
 * Port of the frozen law (syllabai-core @ 6cad6ef,
 * revisionnotes/RevisionNoteService.java :21-148):
 *
 *   - the canonical corpus order (topic → subtopic → note) — the index tree
 *     grouping AND the body prev/next both depend on this exact ordering
 *     (RevisionNoteRepository.findAllByOrderByTopicOrderAscSubtopicOrderAsc
 *     NoteOrderAsc; V27's unique (topic_order, subtopic_order, note_order));
 *   - the un-ingested corpus reads honest nulls + empty arrays (:37-39) —
 *     the viewed leg is not even queried on the early return;
 *   - prev/next follow the canonical order and are null at the ends
 *     (:90-91) — a linear scan of the ordered corpus, never a guessed id;
 *   - markViewed is IDEMPOTENT first-view-wins (:102-115 — the existing
 *     marker is returned untouched, nothing refreshes) and 404s a missing
 *     note BEFORE touching the viewed table (:105-107);
 *   - asset filenames referenced by the body are extracted from bodyMd by
 *     the frozen ASSET_REF_FINDER regex (:146-147) — the corpus generator
 *     rewrites every image ref to the flattened assets/<filename> form, so
 *     the body is the single source of truth; distinct, first-seen order;
 *   - specPointCodes split from the stored CSV (blank → [], :126-131);
 *   - spec_map is read back as TEXT (`spec_map::text`) — the frozen entity
 *     field is a String over the jsonb column, so the wire carries the
 *     canonical JSON text exactly as the driver delivers it, never a
 *     re-serialization of a parsed object.
 *
 * NO routes/mounts — the t3 tranche is contracts+services+fakeSql pins.
 * The asset leg returns the stored content type + bytes; the private
 * 1-hour cache-control envelope is the route layer's (frozen :52-53), the
 * 051 multipart/asset runner ext is its golden vehicle.
 */
import { NotFoundError, type SubmitClock } from "../selfmark";
import type { SqlFn } from "../assessment/sql";

/** revision_note row (V27) — snake_case as the driver delivers it. */
export type RevisionNoteRow = {
  note_id: string;
  topic_order: number;
  topic_title: string;
  subtopic_order: number;
  subtopic_title: string;
  note_order: number;
  title: string;
  body_md: string;
  spec_map: string;
  spec_point_codes: string;
  source_url: string | null;
  ingested_at: string | Date;
  corpus_version: string;
};

export type RevisionNoteAssetRow = {
  filename: string;
  content_type: string;
  size_bytes: number;
  bytes: Uint8Array;
  ingested_at: string | Date;
};

export type RevisionNoteViewedRow = {
  note_id: string;
  viewed_at: string | Date;
};

const iso = (v: string | Date): string => new Date(v).toISOString();

async function allNotesInCanonicalOrder(sql: SqlFn): Promise<RevisionNoteRow[]> {
  return (await sql`
    select note_id, topic_order, topic_title, subtopic_order, subtopic_title,
           note_order, title, body_md, spec_map::text as spec_map,
           spec_point_codes, source_url, ingested_at, corpus_version
    from revision_note
    order by topic_order asc, subtopic_order asc, note_order asc`) as RevisionNoteRow[];
}

async function viewedMarkersDesc(sql: SqlFn, userId: string): Promise<RevisionNoteViewedRow[]> {
  return (await sql`
    select note_id, viewed_at from revision_note_viewed
    where user_id = ${userId}::uuid
    order by viewed_at desc`) as RevisionNoteViewedRow[];
}

/** the stored CSV → wire array (RevisionNoteService :126-131) */
export function specCodes(note: RevisionNoteRow): string[] {
  if (note.spec_point_codes == null || note.spec_point_codes.trim() === "") {
    return [];
  }
  return note.spec_point_codes.split(",");
}

/** the frozen ASSET_REF_FINDER (:146-147) — distinct, first-seen order */
export function assetFilenames(bodyMd: string): string[] {
  const out: string[] = [];
  const re = /!\[[^\]]*\]\(assets\/([^\)\s]+)\)/g;
  for (const m of bodyMd.matchAll(re)) {
    const name = m[1]!;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

export type RevisionNoteIndexView = {
  corpusVersion: string | null;
  ingestedAt: string | null;
  topics: Array<{
    order: number;
    title: string;
    subtopics: Array<{
      order: number;
      title: string;
      noteCount: number;
      notes: Array<{
        noteId: string;
        title: string;
        order: number;
        specPointCodes: string[];
      }>;
    }>;
  }>;
  viewed: Array<{ noteId: string; viewedAt: string }>;
};

/** index(:35-77) — the full tree + the caller's viewed markers in one GET. */
export async function revisionNotesIndex(
  sql: SqlFn,
  userId: string,
): Promise<RevisionNoteIndexView> {
  const all = await allNotesInCanonicalOrder(sql);
  if (all.length === 0) {
    // the early return (:37-39): viewed is NOT queried on an empty corpus
    return { corpusVersion: null, ingestedAt: null, topics: [], viewed: [] };
  }
  // group by (topic, subtopic) preserving canonical order (:40-68)
  const byTopic = new Map<number, RevisionNoteRow[]>();
  for (const n of all) {
    const list = byTopic.get(n.topic_order) ?? [];
    list.push(n);
    byTopic.set(n.topic_order, list);
  }
  const topics = [...byTopic.values()].map((topicNotes) => {
    const bySub = new Map<number, RevisionNoteRow[]>();
    for (const n of topicNotes) {
      const list = bySub.get(n.subtopic_order) ?? [];
      list.push(n);
      bySub.set(n.subtopic_order, list);
    }
    const subs = [...bySub.values()].map((subNotes) => {
      const first = subNotes[0]!;
      return {
        order: first.subtopic_order,
        title: first.subtopic_title,
        noteCount: subNotes.length,
        notes: subNotes.map((n) => ({
          noteId: n.note_id,
          title: n.title,
          order: n.note_order,
          specPointCodes: specCodes(n),
        })),
      };
    });
    const first = topicNotes[0]!;
    return { order: first.topic_order, title: first.topic_title, subtopics: subs };
  });
  const viewed = (await viewedMarkersDesc(sql, userId)).map((v) => ({
    noteId: v.note_id,
    viewedAt: iso(v.viewed_at),
  }));
  const any = all[0]!;
  return { corpusVersion: any.corpus_version, ingestedAt: iso(any.ingested_at), topics, viewed };
}

export type RevisionNoteBodyView = {
  noteId: string;
  title: string;
  bodyMd: string;
  specMapJson: string;
  sourceUrl: string | null;
  assets: string[];
  prevNoteId: string | null;
  nextNoteId: string | null;
};

/** body(:79-94) — canonical prev/next by linear scan; 404-first. */
export async function revisionNoteBody(sql: SqlFn, noteId: string): Promise<RevisionNoteBodyView> {
  const all = await allNotesInCanonicalOrder(sql);
  let at = -1;
  for (let i = 0; i < all.length; i++) {
    if (all[i]!.note_id === noteId) {
      at = i;
      break;
    }
  }
  if (at === -1) {
    // NotFoundException("revision note " + noteId + " not found") — :89
    throw new NotFoundError("revision note", noteId);
  }
  const note = all[at]!;
  const prev = at > 0 ? all[at - 1]!.note_id : null;
  const next = at < all.length - 1 ? all[at + 1]!.note_id : null;
  return {
    noteId: note.note_id,
    title: note.title,
    bodyMd: note.body_md,
    specMapJson: note.spec_map,
    sourceUrl: note.source_url,
    assets: assetFilenames(note.body_md),
    prevNoteId: prev,
    nextNoteId: next,
  };
}

export type RevisionNoteAssetView = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

/** asset(:96-100) — the authenticated blob leg; 404-first. The private
 *  1h cache-control + content-type headers are the route layer's. */
export async function revisionNoteAsset(
  sql: SqlFn,
  filename: string,
): Promise<RevisionNoteAssetView> {
  const rows = (await sql`
    select filename, content_type, size_bytes, bytes, ingested_at
    from revision_note_asset where filename = ${filename}`) as RevisionNoteAssetRow[];
  const row = rows[0];
  if (row == null) {
    // NotFoundException("revision note asset " + filename + " not found") — :98-99
    throw new NotFoundError("revision note asset", filename);
  }
  return { filename: row.filename, contentType: row.content_type, bytes: row.bytes };
}

/** markViewed(:104-115) — 404-first, then IDEMPOTENT first-view-wins:
 *  the existing marker is returned untouched; a fresh view stamps
 *  clock.now() and a fresh uuid (the @PrePersist pair). */
export async function revisionNoteMarkViewed(
  sql: SqlFn,
  clock: SubmitClock,
  userId: string,
  noteId: string,
): Promise<{ noteId: string; viewedAt: string }> {
  const note = (await sql`
    select note_id from revision_note where note_id = ${noteId}`) as Array<{ note_id: string }>;
  if (note.length === 0) {
    throw new NotFoundError("revision note", noteId);
  }
  const existing = (await sql`
    select note_id, viewed_at from revision_note_viewed
    where user_id = ${userId}::uuid and note_id = ${noteId}`) as RevisionNoteViewedRow[];
  if (existing.length > 0) {
    return { noteId: existing[0]!.note_id, viewedAt: iso(existing[0]!.viewed_at) };
  }
  const viewedAt = clock.now();
  await sql`
    insert into revision_note_viewed (id, user_id, note_id, viewed_at)
    values (${clock.newId()}::uuid, ${userId}::uuid, ${noteId}, ${viewedAt.toISOString()}::timestamptz)`;
  return { noteId, viewedAt: viewedAt.toISOString() };
}

/** progress(:117-124) — the ring input, newest first. */
export async function revisionNoteProgress(
  sql: SqlFn,
  userId: string,
): Promise<{ viewed: Array<{ noteId: string; viewedAt: string }> }> {
  const viewed = (await viewedMarkersDesc(sql, userId)).map((v) => ({
    noteId: v.note_id,
    viewedAt: iso(v.viewed_at),
  }));
  return { viewed };
}
