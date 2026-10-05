/**
 * QuestionFamilyAssembler port (T-MIG-031 tranche 1).
 *
 * Frozen law (QuestionFamilyAssembler.java, syllabai-core @ 6cad6ef) — the
 * ONE owner of the whole-question family rule (session-121): how row-level
 * servable questions reassemble into the SME questions the learner actually
 * sees — the demo's serving logic (build_bundles.py) ported server-side.
 *
 * Rules (production-verified, session-120 forensics — javadoc verbatim):
 *   - a corpus row's external ref is `sme-eq-<unit>-<n>-<slug>-q<N>` plus an
 *     optional part suffix `-p<M>` (one MCQ part row) or `-s` (the structured
 *     section row of a mixed question); every row of a family carries the
 *     SAME topic tags, so a topic-scoped list always contains the whole family;
 *   - difficulty is uniform within a family;
 *   - `qN` equals the SME question's 0-based page order, so families sort by
 *     source then qN — the SME page order;
 *   - 23 of the 46 mixed families interleave the structured section among the
 *     MCQ parts in a way the refs alone cannot express — those member orders
 *     are PINNED below (derived from the demo bundle built from the same
 *     corpus; member sets verified 1:1 against the production refs).
 *
 * Anything outside the SME ref convention (seed MCQs, past-paper refs like
 * `WCH11-2022-01-03a`, null refs) is its own single-member family keyed by
 * row id, served after the corpus (NON_SME_SOURCE sentinel sorts after every
 * real source).
 */
import type { QuestionFamilyView, StudentQuestionView } from "@syllabai/contracts";

/** `sme-eq-<source>-q<N>` + optional `-p<M>` / `-s` (SME_REF, verbatim shape). */
const SME_REF = /^(sme-eq-.*)-q(\d+)(-p(\d+)|-s)?$/;

/** SME part order for the interleaved families (suffix sequence per family
 * key). Families absent here use the default order: plain row, then
 * `-p1..pN`, then `-s`. Ported VERBATIM from the production forensics —
 * 23 families, byte-identical keys (QuestionFamilyAssembler.java). */
const FAMILY_PART_ORDER: Record<string, string[]> = {
  "sme-eq-1-1-states-of-matter-q16": ["-p1", "-s", "-p2"],
  "sme-eq-1-2-elements-compounds-and-mixtures-q18": ["-s", "-p1"],
  "sme-eq-1-2-elements-compounds-and-mixtures-q24": ["-s", "-p1"],
  "sme-eq-1-8-metallic-bonding-q3": ["-s", "-p1", "-p2"],
  "sme-eq-1-8-metallic-bonding-q4": ["-p1", "-s", "-p2"],
  "sme-eq-2-2-group-7-halogens-q16": ["-s", "-p1"],
  "sme-eq-2-4-reactivity-series-q4": ["-s", "-p1"],
  "sme-eq-2-4-reactivity-series-q18": ["-s", "-p1"],
  "sme-eq-2-5-extraction-and-uses-of-metals-q8": ["-s", "-p1"],
  "sme-eq-2-6-acids-alkalis-and-titrations-q11": ["-s", "-p1"],
  "sme-eq-2-7-acids-bases-and-salt-preparations-q3": ["-s", "-p1"],
  "sme-eq-3-3-reversible-reactions-and-equilibria-q3": ["-s", "-p1"],
  "sme-eq-3-3-reversible-reactions-and-equilibria-q4": ["-s", "-p1"],
  "sme-eq-4-2-crude-oil-q15": ["-s", "-p1"],
  "sme-eq-4-3-alkanes-q3": ["-s", "-p1", "-p2"],
  "sme-eq-4-4-alkenes-q4": ["-s", "-p1", "-p2"],
  "sme-eq-4-4-alkenes-q8": ["-s", "-p1"],
  "sme-eq-4-5-alcohols-q4": ["-s", "-p1"],
  "sme-eq-4-6-carboxylic-acids-q3": ["-p1", "-p2", "-s", "-p3"],
  "sme-eq-4-6-carboxylic-acids-q4": ["-s", "-p1"],
  "sme-eq-4-7-esters-q3": ["-s", "-p1"],
  "sme-eq-4-7-esters-q10": ["-s", "-p1"],
  "sme-eq-4-8-synthetic-polymers-q9": ["-s", "-p1"],
};

/** sorts after every real source, so non-corpus rows serve after the corpus
 * (Java literal "￿" = U+FFFF). */
const NON_SME_SOURCE = "￿";

interface RefParse {
  family: string;
  suffix: string;
  source: string;
  qNum: number;
}

interface RowWithParse {
  row: StudentQuestionView;
  parse: RefParse;
}

function parseRef(externalRef: string | null, rowId: string): RefParse {
  if (externalRef !== null) {
    const m = SME_REF.exec(externalRef);
    if (m) {
      // group presence is guaranteed by the regex shape
      const base = m[1]!;
      const qNum = m[2]!;
      return {
        family: `${base}-q${qNum}`,
        suffix: m[3] ?? "",
        source: base,
        qNum: Number.parseInt(qNum, 10),
      };
    }
  }
  // not an SME corpus ref: its own family, sorts after the corpus
  return { family: rowId, suffix: "", source: NON_SME_SOURCE, qNum: 0 };
}

/** numeric-aware slug compare: "1-10-x" sorts after "1-2-x"
 * (QuestionFamilyAssembler.compareSource — static, package-visible). */
export function compareSource(a: string, b: string): number {
  const sa = a.split("-");
  const sb = b.split("-");
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const x = i < sa.length ? (sa[i] ?? null) : null;
    const y = i < sb.length ? (sb[i] ?? null) : null;
    if (x === null) return -1;
    if (y === null) return 1;
    const nx = isNumeric(x) ? Number.parseInt(x, 10) : null;
    const ny = isNumeric(y) ? Number.parseInt(y, 10) : null;
    if (nx !== null && ny !== null) {
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function isNumeric(s: string): boolean {
  if (s.length === 0) return false;
  for (const c of s) {
    if (c < "0" || c > "9") return false;
  }
  return true;
}

/** SME member order for a family: pinned order if known, else the default
 * (plain row, then -p1..pN, then -s). (memberRank — the regex admits only
 * "", "-pN", "-s" suffixes, so the rank space is fully covered.) */
function memberRank(family: string, suffix: string): number {
  const pinned = FAMILY_PART_ORDER[family];
  if (pinned) {
    const idx = pinned.indexOf(suffix);
    if (idx >= 0) return idx;
  }
  if (suffix === "") return -1;
  if (suffix === "-s") return 10_000;
  if (suffix.length > 2 && suffix.startsWith("-p") && isNumeric(suffix.slice(2))) {
    return 9_000 + Number.parseInt(suffix.slice(2), 10);
  }
  return Number.MAX_SAFE_INTEGER;
}

export class QuestionFamilyAssembler {
  /**
   * The family identity of one row — the base ref (`sme-eq-…-qN`) for corpus
   * rows, the row id for everything else. Exposed separately because the
   * taxonomy census needs the grouping key over raw rows, before any
   * projection happens. (familyKey)
   */
  familyKey(externalRef: string | null, rowId: string): string {
    return parseRef(externalRef, rowId).family;
  }

  /**
   * Group a topic's (or subject's, or the whole bank's) servable rows into
   * whole SME questions, SME-page-ordered — the demo's serving unit.
   * (assemble — ordering laws verbatim, incl. the first-seen input-order
   * tie-break that killed the random-UUID serving-order flip, CI 36011306580.)
   */
  assemble(rows: StudentQuestionView[]): QuestionFamilyView[] {
    const byFamily = new Map<string, RowWithParse[]>();
    for (const row of rows) {
      const parse = parseRef(row.externalRef, row.id);
      const bucket = byFamily.get(parse.family);
      if (bucket) bucket.push({ row, parse });
      else byFamily.set(parse.family, [{ row, parse }]);
    }

    const units: QuestionFamilyView[] = [];
    const parseByFamily = new Map<string, RefParse>();
    // first-seen position of each family — the deterministic tie-break for
    // equal (source, qNum): input order, never the family KEY, which for
    // non-corpus rows is the RANDOM row UUID (the serving order flipped
    // run-to-run with fresh UUIDs — CI 36011306580)
    const firstSeen = new Map<string, number>();
    let seenIdx = 0;
    for (const [family, bucket] of byFamily) {
      // every member of a family shares source and qNum by construction —
      // keep one parse for the page-order sort below (bucket is non-empty
      // by construction)
      const head = bucket[0]!;
      parseByFamily.set(family, head.parse);
      firstSeen.set(family, seenIdx++);
      bucket.sort((a, b) => memberRank(family, a.parse.suffix) - memberRank(family, b.parse.suffix));
      const parts = bucket.map((r) => r.row);
      const multi = bucket.length > 1 || head.parse.suffix !== "";
      units.push({
        key: family,
        ref: multi ? family : (parts[0]?.externalRef ?? family),
        marks: parts.reduce((sum, p) => sum + p.marks, 0),
        difficulty: parts[0]!.difficulty,
        type: parts.every((p) => p.type !== "STRUCTURED") ? "MCQ" : "STRUCTURED",
        multi,
        parts,
      });
    }

    // SME page order: source topic, then question number (qN = 0-based order),
    // then input order — the key (a random UUID for non-corpus rows) is the
    // LAST resort only, never a serving-order decision
    units.sort((a, b) => {
      const pa = parseByFamily.get(a.key) ?? parseRef(a.ref, a.key);
      const pb = parseByFamily.get(b.key) ?? parseRef(b.ref, b.key);
      const bySource = compareSource(pa.source, pb.source);
      if (bySource !== 0) return bySource;
      if (pa.qNum !== pb.qNum) return pa.qNum < pb.qNum ? -1 : 1;
      const fa = firstSeen.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const fb = firstSeen.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      if (fa !== fb) return fa - fb;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    return units;
  }
}
