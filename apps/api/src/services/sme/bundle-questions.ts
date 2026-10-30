/**
 * T-MIG-135b — the bundle-questions shim: the sme-exam-questions/1.1 content
 * bundles (apps/hub/content/<slug>/questions.json, the hub course corpus of
 * record) → the sme-question-package/1.0 tree the FROZEN
 * SmeQuestionIngestService parse/validate/replace already accepts.
 *
 * Law of the shim (T-MIG-134b's gate, executed for the Maths A lane):
 * "a faithful 1.1 acceptance or a versioned shim, never a silent rewrite".
 * This is the VERSIONED SHIM, disclosed end-to-end:
 *
 *   - The frozen parsePackage/validate/replace are NEVER edited; the shim
 *     produces a 1.0 tree and the real service laws stay the only authority
 *     (the driver runs the produced bytes through the REAL parse+validate,
 *     and the apply path is the REAL ADR-026 evidence-safe replace).
 *   - Every synthesized field is a DETERMINISTIC, disclosed mapping:
 *
 *     externalRef          `sme-eq-<courseSlug>-<topicSlug>-q<order>` via
 *                          the SHARED law packages/shared/src/smeRef.ts (the
 *                          hub join imports the same function — the two
 *                          sides cannot drift): TIER-SCOPED because F and H
 *                          share 31 topicSlugs (156 collisions under the
 *                          chemistry-era `sme-eq-<topicSlug>-q<N>` law,
 *                          verified); over-long slugs truncate + carry a
 *                          deterministic 8-hex FNV suffix (the 80-char
 *                          frozen validate bound is enforced inside the
 *                          shared law).
 *     questionType         STRUCTURED (option-bearing parts make the frozen
 *                          MIXED -pN emission on their own).
 *     stem                 null → the DB stem "" — the exam_whole shape HAS
 *                          no stem; the parts ARE the question.
 *     marks / parts        question.totalMarks; part.marks verbatim (the
 *                          frozen part-sum law re-checked by validate).
 *     part labels          a..z by part order (1.0 requires non-null unique
 *                          labels; the 1.1 shape has none; max parts = 5).
 *     difficulty           easy→2 medium→3 hard→4 very_hard→5 (1 = reserved
 *                          trivial, unused by the corpus); smeDifficulty
 *                          keeps the word verbatim. T-MIG-136 band 4: the
 *                          past-paper 1.1 shape carries NO difficulty word
 *                          (4MB1: 1249× null) — the deterministic default
 *                          law lands difficulty 3 (neutral middle) with
 *                          difficultySource "DEFAULT" (never "SME" — no SME
 *                          word exists to source from); an unknown NON-null
 *                          word still refuses.
 *     expectedTimeSeconds  max(60, round(totalMarks × 72)) — the 4MA1 pace
 *                          of record (~1.2 min/mark: 100 marks / 120 min);
 *                          the 1.1 shape carries no timing.
 *     commandWord          the first part's commandWord (question level).
 *     primaryTopicCode     the parent TOPIC dbCode of the ANCHORING part's
 *                          (first code-bearing part) FIRST spec code,
 *                          resolved through the 135a mapBundleNodes (bundle
 *                          SPEC_POINT "1.6E" → "4MA1-1.6E" → parent TOPIC
 *                          "4MA1-S1-1.6").
 *     specPoints           the ordered dedupe union of the parts'
 *                          specPointCodes, emitted at the SEED-SIDE dbCodes
 *                          resolved through the 135a mapBundleNodes (the
 *                          T-MIG-136 band-4 code-join amendment): dotted
 *                          courses (4CH1/4PH1/4MA1) land `{subject}-{code}`
 *                          — BYTE-IDENTICAL to the pre-band-4 concat by
 *                          the map's own dotted law — and the 4MB1 alnum
 *                          codes ('1A'..'10N', the T-MIG-136a seed law)
 *                          land `4MB1-S<n>-<code>` — the live KG dbCode
 *                          the frozen replace resolves against; role
 *                          PRIMARY for the anchoring part's codes,
 *                          SECONDARY for the rest (the frozen role law);
 *                          provenance AI_VALIDATED (the frozen
 *                          default). Questions with NO spec codes on ANY
 *                          part are EXCLUDED (unmapped — they cannot anchor
 *                          and validate() refuses them; higher: 9 of 2703,
 *                          foundation: 1 of 275) and counted in counts.
 *                          T-MIG-136 band 4: questions whose parts do not
 *                          close on their printed total are likewise
 *                          EXCLUDED (badSum — the parse lane's disclosed
 *                          arithmetic-flag population, 4MB1: 57 of 1249;
 *                          the frozen part-sum law would refuse the whole
 *                          package; nothing is rewritten — the flags ride
 *                          the archive for the filed QP-total recovery
 *                          round). Questions repeating an order WITHIN
 *                          their set (an upstream corpus defect — higher:
 *                          percentages q34 ×2, algebra-toolkit q28 ×2) are
 *                          skipped past the first occurrence (dupOrder).
 *     sourcePaper          the first part's sourcePaper object verbatim.
 *     options              part.choices → SmeOption (label/textMd/
 *                          isCorrect → label/text/isCorrect).
 *     packageVersion       "1.0" (the shim's normalized envelope — the
 *                          SOURCE envelope 1.1 is carried in corpusVersion
 *                          and in the receipt).
 *
 *   - Assets: the maths corpus references external image URLs (markdown),
 *     never `assets/` refs — the package ships no assets and the frozen law
 *     leaves the serving asset store untouched (the layer-3 note of record).
 *
 * The zip packaging is a deterministic STORED (no compression) writer —
 * fixed DOS timestamp, fixed order — so the same bundle bytes produce the
 * same package bytes (pin-friendly, receipt-friendly).
 */
import type { BundleCurriculum } from "../curriculum/bundle-seed";
import { mapBundleNodes } from "../curriculum/bundle-seed";
import type {
  SmeMarkPoint,
  SmeOption,
  SmePackage,
  SmePart,
  SmeQuestion,
  SmeSpecPoint,
} from "./package";
import { smeMemberSuffixReserve, smeQuestionRef } from "@syllabai/shared";

export class BundleQuestionsError extends Error {}

// ── the 1.1 bundle shapes (the hub course corpus of record) ────────────────

interface BundleSourcePaper {
  date?: string;
  number?: string;
  questionNumber?: number;
  questionPart?: string | null;
}

interface BundleChoice {
  label: string;
  isCorrect: boolean;
  textMd?: string;
}

interface BundlePart {
  id: string;
  order: number;
  questionType: string;
  marks: number;
  commandWord: string | null;
  specPointIds: string[];
  specPointCodes: string[];
  sourcePaper: BundleSourcePaper | null;
  problemMd: string | null;
  solutionMd: string | null;
  smeSpecPointIds?: string[];
  choices?: BundleChoice[] | null;
  /** ADR-037 (v0.7): per-point awardable marks; marks ALWAYS sum to part.marks (converter gate G7) */
  markPoints?: { id?: string; marks: number; textMd?: string }[] | null;
}

interface BundleQuestion {
  id: string;
  order: number;
  difficulty: string | null; // the past-paper 1.1 shape carries null (T-MIG-136 band 4)
  style: string;
  totalMarks: number;
  parts: BundlePart[];
}

export interface BundleQuestionSet {
  topicId: string;
  slug: string;
  name: string | null;
  topicSlug: string;
  section: string | null;
  sectionSlug: string | null;
  curriculum: { code?: string };
  schema?: string;
  questions: BundleQuestion[];
}

// ── the deterministic mapping laws ──────────────────────────────────────────

export const SHIM_SOURCE_ENVELOPE = "syllabai.sme-exam-questions/1.1";

const DIFFICULTY_TO_INT: Record<string, number> = {
  easy: 2,
  medium: 3,
  hard: 4,
  very_hard: 5,
};

const MAX_REF = 80; // enforced inside the shared smeQuestionRef law (documented here for the reader)
/** Edexcel 4MA1 allocates ≈1.2 min per mark (100 marks / 120 min). */
const SECONDS_PER_MARK = 72;
const MIN_TIME_SECONDS = 60;

function partLabel(order: number): string {
  if (order < 0 || order > 25) {
    throw new BundleQuestionsError("part order out of the a..z label range: " + order);
  }
  return String.fromCharCode(97 + order);
}

/** spec code → the parent TOPIC dbCode (the 135a map; SPEC_POINT → TOPIC). */
function topicCodeResolver(
  mapped: ReturnType<typeof mapBundleNodes>,
): (specCode: string) => string {
  const specToTopic = new Map<string, string>();
  for (const node of mapped.values()) {
    // T-MIG-139: spec points land SPEC_POINT post-G2 (was SUBTOPIC pre-139)
    if (node.nodeType !== "SPEC_POINT") continue;
    const parent = mapped.get(node.parentBundleCode ?? "");
    if (parent == null || parent.nodeType !== "TOPIC") {
      throw new BundleQuestionsError(
        "spec point " + node.dbCode + " parent is not a mapped TOPIC",
      );
    }
    specToTopic.set(node.bundleCode, parent.dbCode);
  }
  return (specCode: string) => {
    const hit = specToTopic.get(specCode);
    if (hit == null) {
      throw new BundleQuestionsError(
        "spec code not in the bundle spine: " + specCode + " (seed the curriculum first)",
      );
    }
    return hit;
  };
}

// ── the shim ────────────────────────────────────────────────────────────────

export interface BundleQuestionsInput {
  /** the hub course slug (igcse-maths-a-18-higher) — the ref namespace */
  courseSlug: string;
  curriculum: BundleCurriculum;
  sets: BundleQuestionSet[];
  generatedUtc: string | null;
  importRef: string | null;
}

export function buildSmePackage(input: BundleQuestionsInput): SmePackage {
  const { courseSlug, curriculum, sets } = input;
  if (sets.length === 0) throw new BundleQuestionsError("bundle carries no question sets");
  // the 135a node map, computed ONCE: the topic resolver and the spec-code
  // dbCode emission (the T-MIG-136 band-4 code-join amendment) share it, so
  // the two sides cannot drift
  const mapped = mapBundleNodes(curriculum, "official specification structure");
  const resolveTopic = topicCodeResolver(mapped);
  // spec code → the seed-side dbCode the frozen replace resolves against
  // knowledge_nodes.code with (fail-closed): dotted courses byte-identical
  // to the pre-band-4 concat; 4MB1 alnum codes land 4MB1-S<n>-<code>
  const specDbCode = (code: string): string => {
    const node = mapped.get(code);
    if (node == null || node.nodeType !== "SPEC_POINT") {
      throw new BundleQuestionsError(
        "spec code not in the bundle spine: " + code + " (seed the curriculum first)",
      );
    }
    return node.dbCode;
  };

  const questions: SmeQuestion[] = [];
  const seenRefs = new Set<string>();
  let partCount = 0;
  let optionCount = 0;
  let unmapped = 0;
  let badSum = 0;
  let dupOrder = 0;
  // the cross-set ref-namespace exclusion (T-SPECS-CIE-CONSUME-3, operator
  // trace 1a18bc6701800065): the ref namespace is (course, topicSlug, order)
  // and the corpus carries MCQ + structured set twins per topic sharing the
  // order numbering. When BOTH twins become ingestable (the wave3 codes made
  // the MCQ banks servable of record), the second twin's base ref is taken.
  // The honest shim EXCLUDES + COUNTS the collision exactly like the
  // T-MIG-136 band-4 badSum class: the bank ingests only questions that
  // pass every frozen law; nothing is rewritten; the skipped twin never
  // ingests so no stored identity changes; the hub join degrades the
  // skipped family symmetrically (the served bundle keeps both — the
  // census law is the DB-plane archive law, not the serving law).
  let crossSetRefCollision = 0;

  for (const set of sets) {
    const setOrders = new Set<number>();
    if (!set.topicSlug || set.topicSlug.trim() === "") {
      throw new BundleQuestionsError("set " + set.slug + " carries no topicSlug");
    }
    if (set.curriculum?.code != null && set.curriculum.code !== curriculum.code) {
      throw new BundleQuestionsError(
        "set curriculum code " + set.curriculum.code + " != bundle code " + curriculum.code,
      );
    }
    for (const q of set.questions) {
      // the anchor law: a question whose parts carry NO spec codes cannot
      // join the learner model / tutor KG (no spec_point rows, no topic
      // anchor) and the frozen validate() would refuse it (primaryTopicCode
      // is required) — the honest shim EXCLUDES it and counts it; the hub
      // player's join already degrades unmapped families to local-only.
      const anchorPartIdx = q.parts.findIndex(
        (p) => (p.specPointCodes ?? []).length > 0,
      );
      if (anchorPartIdx === -1) {
        unmapped++;
        continue;
      }
      // the part-sum law (T-MIG-136 band 4): the frozen validate refuses any
      // package containing a question whose parts do not close on its
      // printed total — the past-paper corpus carries the parse lane's
      // disclosed arithmetic-flag population (4MB1: 57 of 1249), so the
      // honest shim EXCLUDES + COUNTS them (badSum) exactly like unmapped:
      // the bank ingests only questions that pass every frozen law; nothing
      // is rewritten (the flags ride the archive for the QP-total recovery
      // round filed in the band-2 receipt)
      const sum = q.parts.reduce((s, p) => s + p.marks, 0);
      if (sum !== q.totalMarks) {
        badSum++;
        continue;
      }
      // the order-identity law: the ref namespace is (topicSlug, order) — a
      // question repeating an order WITHIN its set is an upstream corpus
      // defect (higher: percentages q34 ×2, algebra-toolkit q28 ×2); the
      // shim ingests the FIRST occurrence and skips the duplicate (counted),
      // and the hub join skips duplicate orders symmetrically. Both
      // duplicate ids stay honest local-only practice in the player.
      if (setOrders.has(q.order)) {
        dupOrder++;
        continue;
      }
      setOrders.add(q.order);
      // the member-suffix reserve (the run-003 varchar(80) law): a question
      // carrying MCQ parts derives "-p<idx>"/"-s" member rows — the base
      // leaves room for the longest suffix on BOTH bridge sides
      const externalRef = smeQuestionRef(
        courseSlug,
        set.topicSlug,
        q.order,
        smeMemberSuffixReserve(q.parts),
      );
      if (externalRef.length > MAX_REF) {
        // unreachable — the shared law enforces the bound by construction;
        // kept as the shim's own belt-and-braces pin
        throw new BundleQuestionsError(
          `externalRef exceeds ${MAX_REF} chars (${externalRef.length}): ${externalRef}`,
        );
      }
      if (seenRefs.has(externalRef)) {
        crossSetRefCollision++;
        continue;
      }
      seenRefs.add(externalRef);

      if (q.parts.length === 0) {
        throw new BundleQuestionsError("question " + externalRef + " carries no parts");
      }
      // T-MIG-136 band 4: the past-paper 1.1 shape has no difficulty word
      // (4MB1: 1249× null) — deterministic default: 3 (neutral middle) with
      // difficultySource "DEFAULT"; an unknown NON-null word still refuses
      // (the worded bundles 4CH1/4PH1/4MA1 keep the verbatim SME law)
      const hasSmeDifficulty =
        q.difficulty != null && q.difficulty in DIFFICULTY_TO_INT;
      if (!hasSmeDifficulty && q.difficulty != null) {
        throw new BundleQuestionsError(
          "unknown difficulty word on " + externalRef + ": " + q.difficulty,
        );
      }
      const difficultyInt = hasSmeDifficulty ? DIFFICULTY_TO_INT[q.difficulty as string]! : 3;

      // labels a..z by part order; option parts ride the frozen MIXED emission
      const parts: SmePart[] = q.parts.map((p, idx) => {
        if (p.problemMd == null && p.solutionMd == null) {
          throw new BundleQuestionsError(
            "part " + idx + " of " + externalRef + " has neither problemMd nor solutionMd",
          );
        }
        partCount++;
        let options: SmeOption[] | null = null;
        if (p.choices != null && p.choices.length > 0) {
          if (p.choices.length < 2) {
            throw new BundleQuestionsError(
              "MCQ part needs >=2 options: " + externalRef + " part " + idx,
            );
          }
          options = p.choices.map((c) => ({
            label: c.label,
            text: c.textMd ?? "",
            isCorrect: c.isCorrect,
          }));
          optionCount += options.length;
        }
        // ADR-037 (v0.7): per-point awardable marks ride through — fail-closed
        // on the G7 sum law (points must close on the part's marks), exactly
        // like the part-sum law above; a violating bundle is refused, never
        // rewritten
        let markPoints: SmeMarkPoint[] | null = null;
        if (p.markPoints != null && p.markPoints.length > 0) {
          const mpSum = p.markPoints.reduce((acc, mp) => acc + mp.marks, 0);
          if (p.markPoints.some((mp) => !(mp.marks > 0)) || mpSum !== p.marks) {
            throw new BundleQuestionsError(
              "mark points do not sum to the part marks on " +
                externalRef +
                " part " +
                idx,
            );
          }
          markPoints = p.markPoints.map((mp) => ({
            marks: mp.marks,
            text: mp.textMd ?? null,
          }));
        }
        return {
          label: partLabel(idx),
          prompt: p.problemMd,
          marks: p.marks,
          commandWord: p.commandWord,
          solutionMd: p.solutionMd,
          options,
          markPoints,
        };
      });

      // spec points: ordered dedupe union across parts; PRIMARY = the
      // anchoring (first code-bearing) part's codes, SECONDARY = the rest
      // (the frozen role law)
      const specPoints: SmeSpecPoint[] = [];
      const seenSpec = new Set<string>();
      let primaryTopicCode: string | null = null;
      for (let pIdx = 0; pIdx < q.parts.length; pIdx++) {
        const codes = q.parts[pIdx]!.specPointCodes ?? [];
        for (const code of codes) {
          if (pIdx === anchorPartIdx && primaryTopicCode == null) {
            primaryTopicCode = resolveTopic(code);
          }
          if (seenSpec.has(code)) continue;
          seenSpec.add(code);
          specPoints.push({
            code: specDbCode(code),
            role: pIdx === anchorPartIdx ? "PRIMARY" : "SECONDARY",
            provenance: "AI_VALIDATED",
          });
        }
      }

      questions.push({
        externalRef,
        questionType: "STRUCTURED",
        stem: null,
        marks: q.totalMarks,
        difficulty: difficultyInt,
        difficultySource: hasSmeDifficulty ? "SME" : "DEFAULT",
        expectedTimeSeconds: Math.max(MIN_TIME_SECONDS, Math.round(q.totalMarks * SECONDS_PER_MARK)),
        commandWord: q.parts[0]!.commandWord,
        primaryTopicCode,
        secondaryTopicCodes: null,
        specPoints,
        sourcePaper: (q.parts[0]!.sourcePaper ?? null) as Record<string, unknown> | null,
        smeSet: set.name,
        smeDifficulty: q.difficulty,
        options: null,
        solutionMd: null,
        parts,
      });
    }
  }

  return {
    packageVersion: "1.0",
    corpusVersion: `${SHIM_SOURCE_ENVELOPE}@${input.importRef ?? "unknown"}`,
    generatedAt: input.generatedUtc,
    source: `sme-eq-${courseSlug}`,
    counts: {
      questions: questions.length,
      parts: partCount,
      options: optionCount,
      sets: sets.length,
      unmapped: unmapped,
      badSum: badSum,
      dupOrder: dupOrder,
      crossSetRefCollision: crossSetRefCollision,
    },
    questions,
  };
}

// ── the deterministic STORED zip writer (package.json only) ────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(): { date: number; time: number } {
  // fixed 2026-01-01 00:00:00 — deterministic bytes for the same input
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  return { date, time: 0 };
}

/**
 * Minimal STORED-mode zip: one entry (package.json), no compression, no
 * data descriptor — the shape SmeQuestionIngestService.unzip walks (the
 * bounded reader accepts stored entries; the chemistry-era packages ship
 * assets through the same reader).
 *
 * Byte layouts (classic ZIP, little-endian):
 *   local header  (30): sig, version-needed(20), flags, method, time, date,
 *                       crc, compSize, uncompSize, nameLen, extraLen
 *   central (46):       sig, version-made-by(20), version-needed(20), flags,
 *                       method, time, date, crc, compSize, uncompSize,
 *                       nameLen, extraLen, commentLen, diskStart, internal,
 *                       external, localOffset
 *   EOCD (22):          sig, disk, cdDisk, entriesThisDisk, totalEntries,
 *                       cdSize, cdOffset, commentLen
 */
export function bundleQuestionsZip(pkg: SmePackage): Uint8Array {
  const name = "package.json";
  const data = new TextEncoder().encode(JSON.stringify(pkg, null, 1));
  const crc = crc32(data);
  const { date, time } = dosDateTime();
  const nameBytes = new TextEncoder().encode(name);

  const out: number[] = [];
  const put = (v: number, n: number) => {
    for (let i = 0; i < n; i++) out.push((v >>> (8 * i)) & 0xff);
  };
  const putBytes = (b: Uint8Array) => {
    for (const byte of b) out.push(byte);
  };

  // local header (30 + name)
  out.push(0x50, 0x4b, 0x03, 0x04);
  put(20, 2); // version needed
  put(0, 2); // flags
  put(0, 2); // method = STORED
  put(time, 2);
  put(date, 2);
  put(crc, 4);
  put(data.length, 4);
  put(data.length, 4);
  put(nameBytes.length, 2);
  put(0, 2); // extra len
  putBytes(nameBytes);

  const localHeaderLength = out.length;
  putBytes(data);
  const cdOffset = localHeaderLength + data.length;

  // central directory entry (46 + name)
  const cdStart = out.length;
  out.push(0x50, 0x4b, 0x01, 0x02);
  put(20, 2); // version made by
  put(20, 2); // version needed
  put(0, 2); // flags
  put(0, 2); // method
  put(time, 2);
  put(date, 2);
  put(crc, 4);
  put(data.length, 4);
  put(data.length, 4);
  put(nameBytes.length, 2);
  put(0, 2); // extra len
  put(0, 2); // comment len
  put(0, 2); // disk start
  put(0, 2); // internal attrs
  put(0, 4); // external attrs
  put(0, 4); // local header offset
  putBytes(nameBytes);
  const cdSize = out.length - cdStart;

  // EOCD (22)
  out.push(0x50, 0x4b, 0x05, 0x06);
  put(0, 2); // disk number
  put(0, 2); // cd disk
  put(1, 2); // entries this disk
  put(1, 2); // total entries
  put(cdSize, 4);
  put(cdOffset, 4);
  put(0, 2); // comment len

  return new Uint8Array(out);
}
