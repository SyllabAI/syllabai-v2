/**
 * SME section → official topic numbering backfill (generated table).
 *
 * Four CIE maths courses present their question sets under SME sections
 * whose titles are RENAMES of the official syllabus topics with NO section
 * number in the corpus ("Algebra & Sequences" is official topic 2, "Algebra
 * and graphs" / "Lengths, Areas & Volumes" is official topic 5, "Mensuration"
 * …). Nothing else in the set record — section slug, topic slug, spec anchors
 * — resolves that correspondence, so it is derived once from the
 * SME-ExamQuestion reference manifests (topic lists per section, token
 * overlap scored against each official topic's sub-topic titles, argmax —
 * scripts/sme_section_map_derive.py in the workspace; every row verified)
 * and frozen here.
 *
 * ADR-039 provenance: this is a PLACEMENT table only — no corpus content is
 * edited, no set is relabeled; it feeds the topic-level fallback in
 * subtopicOfQuestionSet() and is disclosed in docs/adr/ADR-039.
 *
 * Key: the course tree's topic-code prefix with the trailing number stripped
 * (…-TC / …-TE keeps the core/extended tier letters, so the two 0580 and two
 * 0607 courses stay distinct). Value: the official topic-code suffix the
 * section corresponds to; null = no official counterpart (the SME section
 * simply does not exist in the parsed specification — an ADR-039 map-gap).
 */
const SME_SECTION_TOPIC: Record<string, Record<string, string | null>> = {
  "cie-igcse-maths-2025-2027-TC": {
    "algebra-and-sequences": "TC2",
    "coordinate-geometry-and-graphs": "TC3",
    "geometry": "TC4",
    "lengths-areas-and-volumes": "TC5",
    "number": "TC1",
    "probability": "TC8",
    "pythagoras-and-trigonometry": "TC6",
    "statistics": "TC9",
    "transformations": "TC7",
  },
  "cie-igcse-maths-2025-2027-TE": {
    "algebra-and-sequences": "TE2",
    "coordinate-geometry-and-graphs": "TE3",
    "geometry": "TE4",
    "lengths-areas-and-volumes": "TE5",
    "number": "TE1",
    "probability": "TE8",
    "pythagoras-and-trigonometry": "TE6",
    "statistics": "TE9",
    "vectors-and-transformations": "TE7",
  },
  "cie-igcse-maths-international-maths-2025-2027-TC": {
    "algebra-and-sequences": "TC2",
    "coordinate-geometry-and-graphs": "TC4",
    "geometry": "TC5",
    "investigations": null,
    "lengths-areas-and-volumes": "TC6",
    "number": "TC1",
    "probability": "TC9",
    "pythagoras-and-trigonometry": "TC7",
    "statistics": "TC10",
    "transformations": "TC8",
  },
  "cie-igcse-maths-international-maths-2025-2027-TE": {
    "algebra-and-sequences": "TE2",
    "coordinate-geometry-and-graphs": "TE4",
    "geometry": "TE5",
    "investigations-and-modelling": null,
    "lengths-areas-and-volumes": "TE6",
    "number": "TE1",
    "probability": "TE9",
    "pythagoras-and-trigonometry": "TE7",
    "statistics": "TE10",
    "vectors-and-transformations": "TE8",
  },
};

/**
 * SME section slug → the course's FULL official topic code, keyed off any
 * topic code of the same tree ("…-2027-TC1" → prefix "…-2027-TC", composed
 * with the table's suffix). Returns null for trees the table does not cover,
 * sections it does not list, and the honest null rows (Investigations /
 * Investigations & Modelling).
 */
export function smeSectionTopicCode(
  sectionSlug: string | null | undefined,
  sampleTopicCode: string,
): string | null {
  if (!sectionSlug) return null;
  const m = /-([ST][CE]?)\d+$/.exec(sampleTopicCode);
  if (!m) return null;
  const row = SME_SECTION_TOPIC[`${sampleTopicCode.slice(0, m.index)}-${m[1]}`];
  if (!row) return null;
  const suffix = row[sectionSlug];
  return suffix ? `${sampleTopicCode.slice(0, m.index)}-${suffix}` : null;
}
