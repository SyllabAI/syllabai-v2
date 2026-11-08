/**
 * subject-identity.ts — the ONE source of truth for course-subject identity.
 *
 * T-HUB-COURSES-UI-1 run-001 (the /courses redesign plan, stage 1): every
 * subject in the course registry (content/courses.json) carries a stable
 * identity — family, bespoke glyph and tile colour pair — so the directory,
 * the course hub and any future surface render the same subject the same
 * way. This module is the hub-maintained registry of those identities.
 *
 * The law (enforced twice, on purpose):
 *  - BUILD GATE: scripts/verify_subject_identity.ts runs in the prebuild
 *    chain (package.json prebuild → bun run build:hub → CI hub lane). It
 *    walks EVERY course row in content/courses.json and fails the build if
 *    any slug's subject does not resolve here, if an identity went unused
 *    (stale mapping after a registry rename), if a glyph has no component,
 *    or if a colour pair is malformed. An unknown subject fails CI by
 *    design — add it here in the same commit that adds it to the registry.
 *  - COMPILE GATE: the glyph component map in
 *    components/icons/subject-glyph.tsx is typed Record<SubjectGlyphId, …>,
 *    so a glyph id without an SVG component fails typecheck.
 *
 * Client-safe by construction: no "server-only" import, no node APIs — the
 * directory is a client component and resolves identities at render time.
 *
 * Design provenance: the families, glyphs and colour pairs are the approved
 * /courses redesign mockup (Courses-Redesign-Plan.docx stage 1; mockup of
 * record download/redesign/mockup/courses-redesign-mockup.html, 2026-11-07).
 * The mockup drew a bespoke glyph for EVERY registry subject (17 designs —
 * the plan's "12 bespoke + fallback" estimate was made before the mockup),
 * so the fallback icon below is a resilience net for subjects that do not
 * exist yet, not a rendered lane today.
 *
 * Canonicalisation: the registry strings are operator-maintained and carry
 * two known spellings of the same subject ("Mathematics"/"Maths" — split by
 * board) and one case variant ("Ict"). Canonical keys below are what
 * grouping headers will render; SUBJECT_ALIASES folds the alternate
 * spellings onto them. Resolution is alias → exact → case-insensitive.
 */

/** Curriculum family — the directory's group order is this array's order. */
export const SUBJECT_FAMILIES = [
  "sciences",
  "maths-cs",
  "english",
  "business-econ",
  "humanities",
] as const;

export type SubjectFamily = (typeof SUBJECT_FAMILIES)[number];

/** Display labels for the family group headers (mockup famhead strings). */
export const FAMILY_LABELS: Record<SubjectFamily, string> = {
  sciences: "Sciences",
  "maths-cs": "Maths & Computer Science",
  english: "English",
  "business-econ": "Business & Economics",
  humanities: "Humanities",
};

/** The bespoke glyph set — every id MUST have an SVG component in
 * components/icons/subject-glyph.tsx (compile-gated there). */
export const SUBJECT_GLYPH_IDS = [
  "chemistry",
  "physics",
  "biology",
  "science",
  "maths",
  "further-maths",
  "computer-science",
  "ict",
  "english-language",
  "english-literature",
  "economics",
  "business",
  "accounting",
  "geography",
  "history",
  "religious-studies",
  "environmental",
] as const;

export type SubjectGlyphId = (typeof SUBJECT_GLYPH_IDS)[number];

export interface SubjectIdentity {
  /** Canonical display subject (grouping header text). */
  subject: string;
  family: SubjectFamily;
  glyph: SubjectGlyphId;
  /** Tile colour pair from the approved mockup (bg behind the glyph, fg on
   *  the glyph strokes). Plain hex — surfaces apply them, this module only
   *  carries them. */
  tile: { bg: string; fg: string };
}

/**
 * The identity registry of record. 18 canonical subjects — exactly the
 * distinct canonical subjects in content/courses.json (2026-11-07 census:
 * 106 course rows → 20 raw subject strings → 18 after folding Mathematics
 * into Maths and the Ict case variant into ICT).
 */
export const SUBJECT_IDENTITY = {
  Chemistry: {
    subject: "Chemistry",
    family: "sciences",
    glyph: "chemistry",
    tile: { bg: "#ffedd5", fg: "#ea580c" },
  },
  Physics: {
    subject: "Physics",
    family: "sciences",
    glyph: "physics",
    tile: { bg: "#dbeafe", fg: "#2563eb" },
  },
  Biology: {
    subject: "Biology",
    family: "sciences",
    glyph: "biology",
    tile: { bg: "#dcfce7", fg: "#16a34a" },
  },
  Science: {
    subject: "Science",
    family: "sciences",
    glyph: "science",
    tile: { bg: "#ccfbf1", fg: "#0d9488" },
  },
  Maths: {
    subject: "Maths",
    family: "maths-cs",
    glyph: "maths",
    tile: { bg: "#ede9fe", fg: "#7c3aed" },
  },
  "Further Maths": {
    subject: "Further Maths",
    family: "maths-cs",
    glyph: "further-maths",
    tile: { bg: "#e0e7ff", fg: "#4f46e5" },
  },
  "Computer Science": {
    subject: "Computer Science",
    family: "maths-cs",
    glyph: "computer-science",
    tile: { bg: "#f3e8ff", fg: "#9333ea" },
  },
  ICT: {
    subject: "ICT",
    family: "maths-cs",
    glyph: "ict",
    tile: { bg: "#f1f5f9", fg: "#475569" },
  },
  English: {
    subject: "English",
    family: "english",
    glyph: "english-language",
    tile: { bg: "#ffe4e6", fg: "#e11d48" },
  },
  "English Language": {
    subject: "English Language",
    family: "english",
    glyph: "english-language",
    tile: { bg: "#ffe4e6", fg: "#e11d48" },
  },
  "English Literature": {
    subject: "English Literature",
    family: "english",
    glyph: "english-literature",
    tile: { bg: "#fecdd3", fg: "#be123c" },
  },
  Economics: {
    subject: "Economics",
    family: "business-econ",
    glyph: "economics",
    tile: { bg: "#fef3c7", fg: "#d97706" },
  },
  Business: {
    subject: "Business",
    family: "business-econ",
    glyph: "business",
    tile: { bg: "#e0f2fe", fg: "#0284c7" },
  },
  Accounting: {
    subject: "Accounting",
    family: "business-econ",
    glyph: "accounting",
    tile: { bg: "#d1fae5", fg: "#059669" },
  },
  Geography: {
    subject: "Geography",
    family: "humanities",
    glyph: "geography",
    tile: { bg: "#fef9c3", fg: "#ca8a04" },
  },
  History: {
    subject: "History",
    family: "humanities",
    glyph: "history",
    tile: { bg: "#ffedd5", fg: "#b45309" },
  },
  "Religious Studies": {
    subject: "Religious Studies",
    family: "humanities",
    glyph: "religious-studies",
    tile: { bg: "#fae8ff", fg: "#c026d3" },
  },
  "Environmental Management": {
    subject: "Environmental Management",
    family: "humanities",
    glyph: "environmental",
    tile: { bg: "#ecfccb", fg: "#4d7c0f" },
  },
} as const satisfies Record<string, SubjectIdentity>;

export type CanonicalSubject = keyof typeof SUBJECT_IDENTITY;

/** Canonical subjects, registry order (grouping-iteration order). */
export const CANONICAL_SUBJECTS = Object.keys(SUBJECT_IDENTITY) as CanonicalSubject[];

/**
 * Registry spellings that fold onto a canonical key. Keyed lowercase; the
 * case-insensitive pass in resolveSubjectKey handles pure case variants
 * ("Ict" → ICT) without an entry here.
 */
const SUBJECT_ALIASES: Record<string, CanonicalSubject> = {
  mathematics: "Maths",
};

/** Resolve a registry subject string to its canonical key, or null.
 *  Order: exact → alias (lowercased) → case-insensitive. */
export function resolveSubjectKey(subject: string): CanonicalSubject | null {
  if (!subject) return null;
  if (subject in SUBJECT_IDENTITY) return subject as CanonicalSubject;
  const alias = SUBJECT_ALIASES[subject.toLowerCase()];
  if (alias) return alias;
  const lowered = subject.toLowerCase();
  const hit = CANONICAL_SUBJECTS.find((k) => k.toLowerCase() === lowered);
  return hit ?? null;
}

/** Identity for a registry subject string, or null when unmapped.
 *  Callers decide policy: the build gate fails on null, render surfaces
 *  fall back to the generic glyph. */
export function getSubjectIdentity(subject: string): SubjectIdentity | null {
  const key = resolveSubjectKey(subject);
  return key ? SUBJECT_IDENTITY[key] : null;
}

/** Family for a registry subject string, or null when unmapped. */
export function subjectFamily(subject: string): SubjectFamily | null {
  return getSubjectIdentity(subject)?.family ?? null;
}

/** Family group-order rank (run-002 directory grouping uses this; the
 *  array order IS the law — Sciences first, per the approved mockup). */
export function familyRank(family: SubjectFamily): number {
  return SUBJECT_FAMILIES.indexOf(family);
}
