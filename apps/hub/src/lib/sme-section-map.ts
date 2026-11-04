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
 * overlap scored against each official topic's sub-topic titles, argmax
 * verified per row — scripts/sme_section_map_derive.py) and frozen here.
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
    "number": "TC1",
    "algebra-and-sequences": "TC2",
    "coordinate-geometry-and-graphs": "TC3",
    "geometry": "TC4",
    "lengths-areas-and-volumes": "TC5",
    "pythagoras-and-trigonometry": "TC6",
    "transformations": "TC7",
    "probability": "TC8",
    "statistics": "TC9",
  },
  "cie-igcse-maths-2025-2027-TE": {
    "number": "TE1",
    "algebra-and-sequences": "TE2",
    "coordinate-geometry-and-graphs": "TE3",
    "geometry": "TE4",
    "lengths-areas-and-volumes": "TE5",
    "pythagoras-and-trigonometry": "TE6",
    "vectors-and-transformations": "TE7",
    "probability": "TE8",
    "statistics": "TE9",
  },
  "cie-igcse-maths-international-maths-2025-2027-TC": {
    "number": "TC1",
    "algebra-and-sequences": "TC2",
    "coordinate-geometry-and-graphs": "TC4",
    "geometry": "TC5",
    "lengths-areas-and-volumes": "TC6",
    "pythagoras-and-trigonometry": "TC7",
    "transformations": "TC8",
    "probability": "TC9",
    "statistics": "TC10",
    "investigations": null,
  },
  "cie-igcse-maths-international-maths-2025-2027-TE": {
    "number": "TE1",
    "algebra-and-sequences": "TE2",
    "coordinate-geometry-and-graphs": "TE4",
    "geometry": "TE5",
    "lengths-areas-and-volumes": "TE6",
    "pythagoras-and-trigonometry": "TE7",
    "vectors-and-transformations": "TE8",
    "probability": "TE9",
    "statistics": "TE10",
    "investigations-and-modelling": null,
  },
};

/**
 * Topic code the course's SME section corresponds to, or null when the
 * section has no official counterpart / the course is not in the table.
 * `firstTopicCode` disambiguates core vs extended trees that share a
 * syllabus code (0580 / 0607).
 */
export function smeSectionTopicCode(
  sectionSlug: string | undefined,
  firstTopicCode: string,
): string | null {
  if (!sectionSlug) return null;
  const prefix = firstTopicCode.replace(/\d+$/, "");
  const row = SME_SECTION_TOPIC[prefix];
  if (!row) return null;
  const suffix = row[sectionSlug];
  if (!suffix) return null;
  return prefix + suffix.replace(/^T[CE]?/, "");
}
