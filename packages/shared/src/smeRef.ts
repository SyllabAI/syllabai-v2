/**
 * smeRef — the ONE law that derives an SME question's external ref for a
 * content-bundle course, shared by BOTH sides of the identity bridge
 * (T-MIG-135):
 *
 *   - apps/api services/sme/bundle-questions.ts (the 1.1→1.0 shim) — the
 *     refs it EMITS into core;
 *   - apps/hub app/api/core/questions (the join) — the refs it LOOKS UP.
 *
 * One module because the two sides MUST NOT drift: a ref the hub derives
 * that core never stored is a skipped question (honest), but a law that
 * diverges silently would mis-join families. Both sides call this function.
 *
 * The law:
 *
 *   ref = "sme-eq-" + courseSlug + "-" + topicSlugPart + "-q" + order
 *
 *   - TIER-SCOPED by the course slug: foundation and higher bundles share 31
 *     topicSlugs (156 order-pair collisions measured across the real Maths A
 *     bundles) — the chemistry-era `sme-eq-<topicSlug>-q<N>` law is only
 *     collision-free while ONE bundle exists per subject. The CHEMISTRY
 *     pilot's stored refs keep the legacy law (the join branches per course;
 *     this function is the law for every NEW bridge-eligible course).
 *   - ≤80 chars (the frozen SmeQuestionIngestService validate bound): an
 *     over-long topicSlug is TRUNCATED and suffixed with a deterministic
 *     8-hex FNV-1a of the FULL slug, keeping the mapping injective for
 *     distinct slugs that share a truncation prefix (max measured maths
 *     topicSlug: 52 chars; the truncation path fires for exactly the long
 *     slugs, e.g. right-angled-triangles---pythagoras-and-trigonometry).
 *   - Fail-closed on a course slug so long the law cannot fit (not a real
 *     registry shape).
 */

export const SME_REF_MAX = 80;

/**
 * The mixed-emission member-suffix reserve — the EXACT mirror of the frozen
 * ingest's emittedRowRefs derivation (services/sme/index.ts): one "-p<idx>"
 * member per OPTION part (idx counts option parts only), plus "-s" when the
 * question also carries plain parts. Pure structured questions reserve 0
 * (byte-identical legacy). Both bridge sides call this with their own corpus
 * parts — the same bytes, the same reserve.
 */
export function smeMemberSuffixReserve(
  parts: ReadonlyArray<{ choices?: { length: number } | null } | null> | null | undefined,
): number {
  if (!parts || parts.length === 0) return 0;
  let optionParts = 0;
  let plainParts = 0;
  for (const p of parts) {
    if (p != null && p.choices != null && p.choices.length > 0) optionParts++;
    else plainParts++;
  }
  if (optionParts === 0) return 0;
  let max = 0;
  for (let i = 1; i <= optionParts; i++) {
    const len = ("-p" + i).length;
    if (len > max) max = len;
  }
  if (plainParts > 0) max = Math.max(max, 2);
  return max;
}
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1aHex8(text: string): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function smeQuestionRef(
  courseSlug: string,
  topicSlug: string,
  order: number,
  reserved = 0,
): string {
  const head = `sme-eq-${courseSlug}-`;
  const tail = `-q${order}`;
  // the member-suffix reserve (the phase-4 run-003 varchar(80) class): a
  // question carrying MCQ parts derives MIXED-EMISSION member rows whose
  // external refs append "-p<idx>" (and "-s" for the structured member) to
  // the base — the base must leave room for the LONGEST suffix or the member
  // insert overflows the frozen questions.external_ref varchar(80). Reserve
  // = smeMemberSuffixReserve(parts) on BOTH sides of the bridge (the shim
  // emits, the hub join derives) — same corpus bytes, same reserve, no
  // drift. Byte-identical for every ref of record: reserve is 0 for
  // choice-less questions and binds only on the hash path (never stored —
  // such members failed to ingest by construction).
  const room = SME_REF_MAX - head.length - tail.length - reserved;
  if (room < 10) {
    throw new Error(`smeQuestionRef: course slug "${courseSlug}" leaves no ref room`);
  }
  const hashRoom = 9; // "-" + 8 hex
  let slugPart = topicSlug;
  if (slugPart.length > room - hashRoom) {
    slugPart = topicSlug.slice(0, room - hashRoom) + "-" + fnv1aHex8(topicSlug);
  }
  const ref = head + slugPart + tail;
  if (ref.length > SME_REF_MAX - reserved) {
    // arithmetic guarantee — this throw is unreachable by construction
    throw new Error(`smeQuestionRef: ref exceeds ${SME_REF_MAX} (${ref.length})`);
  }
  return ref;
}
