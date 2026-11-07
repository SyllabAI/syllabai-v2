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
 *         [ + "-w" | "-w2" .. "-w9" ]        ^ the structured-twin series
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
 *
 * ─── D-KG1b SERIES NAMESPACE AMENDMENT (operator-authorised 2026-11-06,
 * IM trace 1a1b15cbb24f4a11; r1 design delta 2026-11-07, execution lane
 * evidence dkg1b-audit-current-r0/r1) ─────────────────────────────────────
 *
 *   SaveMyExams publishes some topics as SEVERAL pages that each restart
 *   their numbering at q0 — an MCQ page plus structured pages. Two page
 *   families exist in the current corpus (vintage 55b586e0):
 *     - A-level + accounting vintages: `--structured-questions` pages;
 *     - IGCSE-23 vintages: `--theory-questions` and
 *       `--alternative-to-practical-questions` pages (structured CONTENT,
 *       discovered by the execution lane — the staged slug-suffix law
 *       missed them entirely and even three-way collisions exist:
 *       MCQ + ATP + theory per topic, e.g. 4-1-electrolysis).
 *   T-SPECS-CIE-CONSUME-3 resolved the resulting same-ref collisions by
 *   awarding the base-ref namespace to the FIRST file-order claimer and
 *   exclusion-skipping every later claimer — permanently locking the
 *   structured twins out of the bank.
 *
 *   THE CORRECTED LAW (per-(topicSlug, order) claim index over the course's
 *   census-valid questions, in corpus file order):
 *
 *     - the FIRST claimer of a (topicSlug, order) slot derives the LEGACY
 *       ref — byte-identical to everything ever stored (the exclusion always
 *       kept the first file-order claimer, so stored state == first
 *       claimers by construction; sole claimers were always bankable);
 *     - the k-th claimer (k = 2, 3, ... in file order) derives the series
 *       marker: k=2 → "-w", k=3 → "-w2", ... k=10 → "-w9"; beyond, the law
 *       fails closed (not a corpus shape);
 *     - the marker can never collide with the frozen member-suffix reserve
 *       ("-p<digits>", "-s"): no stored ref ends in "-w" or "-w<digits>",
 *       and members append AFTER the marker (`-q3-w-p1`, `-q3-w2-s`).
 *   The 80-char bound, the reserve room arithmetic and both
 *   truncation/compression branches are unchanged — the marker rides inside
 *   `tail`, and the full-slug FNV-1a hash keeps the mapping injective.
 *
 *   BACK-COMPAT IS TOTAL: series absent or "mcq" = legacy bytes; every
 *   already-banked ref re-derives BYTE-IDENTICAL (first claimers + sole
 *   claimers). Nothing stored changes; the amendment is purely additive
 *   (structured twins were never banked — there is no migration). The
 *   frozen SmeQuestionIngestService is UNTOUCHED: it validates and stores
 *   whatever base it receives.
 *
 *   CALLERS: every side derives the claim index from the SAME course file
 *   with the SAME census gates (unmapped / badSum / dupOrder — a gated
 *   question never claims a slot, mirroring the shim's skip order):
 *     - the census/driver mirror (bankfill_ingest.ts, sme_gap_composition.ts)
 *       builds `seriesBySetOrder` from the FULL file and passes it into the
 *       shim (whose input tree is pre-filtered to never families and
 *       therefore cannot rebuild the index itself);
 *     - the shim, when NO map is supplied (full-bundle production path),
 *       builds the index from its own input sets — conservative: an absent
 *       or partial view degrades to legacy bytes, never to a wrong -w;
 *     - the hub join builds the index from its own course corpus (full
 *       census fidelity: parts carry marks, specPointCodes, choices).
 */

export const SME_REF_MAX = 80;

/** D-KG1b: the question series a ref belongs to. "mcq" (and absent) = the
 * legacy namespace (byte-identical to the pre-amendment law); "structured"
 * = the first structured-twin series ("-w"); "structured2".."structured9"
 * = further structured-twin series of the same topic ("-w2".."-w9"). */
export type SmeSeries =
  | "mcq"
  | "structured"
  | "structured2"
  | "structured3"
  | "structured4"
  | "structured5"
  | "structured6"
  | "structured7"
  | "structured8"
  | "structured9";

/** The marker a series rides in the ref tail. Sole/first claimers take the
 * legacy bytes; the k-th structured twin takes "-w" (k=1) / "-w<k>" (k≥2). */
export function smeSeriesMarker(series: SmeSeries | undefined): string {
  if (series == null || series === "mcq") return "";
  if (series === "structured") return "-w";
  const n = Number(series.slice("structured".length));
  if (!Number.isInteger(n) || n < 2 || n > 9) {
    throw new Error(`smeSeriesMarker: unknown series "${series}"`);
  }
  return "-w" + String(n);
}

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
  series?: SmeSeries,
): string {
  // D-KG1b: the series marker rides the tail. "-w"/"-w<digits>" are reserved
  // by NOTHING in the member-suffix grammar ("-p<digits>", "-s"), and no
  // legacy ref ends in them (legacy tails end "-q<digits>", "-p<digits>"
  // or "-s"), so the series are disjoint by construction for every member
  // shape.
  const tail = `-q${order}` + smeSeriesMarker(series);
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
  let head = `sme-eq-${courseSlug}-`;
  let room = SME_REF_MAX - head.length - tail.length - reserved;
  if (room < 10) {
    // the course-slug compression branch (the phase-4 run-006 varchar(80)
    // class — the 0973 trio's 55-char registry slugs): the SAME
    // deterministic law the topic side already carries — a bounded slice of
    // the course slug + "-" + the 8-hex FNV-1a of the FULL slug (injective
    // for distinct slugs sharing a truncation prefix — the 0973 trio shares
    // its 44-char prefix and is differentiated by the full-slug hash). Both
    // bridge sides derive identically (this shared function is the only
    // law); the stored refs of record (shorter slugs) never take the branch
    // — byte-identical. The budget lands the topic side exactly on its own
    // floor (room = 10: the topic hash path fits by construction).
    const headPrefix = "sme-eq-";
    const fixedOverhead = headPrefix.length + 1 + 8 + 1; // prefix + "-" + 8 hex + "-"
    const budget = SME_REF_MAX - fixedOverhead - tail.length - reserved - 10;
    if (budget < 1) {
      throw new Error(
        `smeQuestionRef: course slug "${courseSlug}" cannot fit even compressed (tail ${tail.length} + reserve ${reserved})`,
      );
    }
    head = headPrefix + courseSlug.slice(0, budget) + "-" + fnv1aHex8(courseSlug) + "-";
    room = SME_REF_MAX - head.length - tail.length - reserved;
    if (room < 10) {
      // unreachable by the budget arithmetic
      throw new Error(`smeQuestionRef: course slug "${courseSlug}" compression did not clear the ref room`);
    }
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

// ── D-KG1b claim index: the deterministic series law over a course file ─────

/** One page's claims, reduced by the caller to the census-valid orders
 * (unmapped / badSum / dupOrder gated — a gated question never claims).
 * The caller owns the gates; this module owns the index and the series. */
export interface SmeClaimPage {
  topicSlug: string;
  orders: Iterable<number>;
}

/** The per-course claim index: (topicSlug, order) → claiming page indices
 * in corpus file order. Deterministic; built ONCE per course file. */
export function smeClaimIndex(
  pages: ReadonlyArray<SmeClaimPage>,
): Map<string, number[]> {
  const index = new Map<string, number[]>();
  pages.forEach((p, i) => {
    for (const order of p.orders) {
      const key = p.topicSlug + "|" + String(order);
      const list = index.get(key);
      if (list == null) index.set(key, [i]);
      else list.push(i);
    }
  });
  return index;
}

/** The series of a question at (pageIndex, order) under the claim index.
 * Sole or first claimer → "mcq" (legacy bytes); k-th claimer (k≥2) → its
 * structured series. Fail-closed: a page that did not claim the order, or
 * more than 9 claimers, throws (caller/index drift — never guess). */
export function smeSeriesFor(
  claims: Map<string, number[]>,
  topicSlug: string,
  pageIndex: number,
  order: number,
): SmeSeries {
  const list = claims.get(topicSlug + "|" + String(order));
  if (list == null) {
    throw new Error(
      `smeSeriesFor: no claim of record for "${topicSlug}|${order}" (page ${pageIndex}) — index/caller drift`,
    );
  }
  const k = list.indexOf(pageIndex);
  if (k < 0) {
    throw new Error(
      `smeSeriesFor: page ${pageIndex} did not claim "${topicSlug}|${order}" — index/caller drift`,
    );
  }
  if (k === 0) return "mcq";
  if (k > 9) {
    throw new Error(
      `smeSeriesFor: ${list.length} claimers of "${topicSlug}|${order}" exceed the series bound`,
    );
  }
  return k === 1 ? "structured" : ("structured" + String(k) as SmeSeries);
}

/** The SOFT variant for the hub JOIN side only: identical mapping, but a
 * question the census gates excluded (no valid claim of record, or this
 * page did not claim the slot) degrades to UNDEFINED — the legacy bytes,
 * which is EXACTLY the pre-amendment serving semantics (the family lookup
 * then decides honestly) — instead of failing closed. The join must never
 * 500 on a corpus defect; the emit side must use the strict smeSeriesFor. */
export function smeSeriesForSoft(
  claims: Map<string, number[]>,
  topicSlug: string,
  pageIndex: number,
  order: number,
): SmeSeries | undefined {
  const list = claims.get(topicSlug + "|" + String(order));
  if (list == null) return undefined;
  const k = list.indexOf(pageIndex);
  if (k <= 0) return undefined;
  if (k > 9) return undefined; // beyond the bound: legacy bytes (never guess)
  return k === 1 ? "structured" : ("structured" + String(k) as SmeSeries);
}
