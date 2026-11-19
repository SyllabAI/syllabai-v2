/**
 * Guided chunking law (P3, redesign plan §5.2/§5.3/§6/§8) — the SINGLE
 * SOURCE OF TRUTH for the micro-chunking budgets and the deterministic
 * check→key-point mapping. Imported by:
 *   - the flow renderer (guided-flow.tsx — the P1 arc reads keyPointGroups /
 *     mapChecksToGroups from here, so render and validation can never drift),
 *   - the import runner's G-CHUNK gate (run_import.mjs — node-native; this
 *     file is deliberately plain .mjs, zero dependencies),
 *   - the QA census (scripts/guided_qa/census.mjs) and bun tests.
 *
 * Budgets of record (plan §5.3, §6, Table 2):
 *   - opener ("Here is what this lesson covers"): max 45 words (§5.3)
 *   - prerequisite bridge: one beat, max 45 words (§6 beat law; the audit's
 *     F1 wall measured ~75 — the law exists to keep that from re-landring)
 *   - key points: one per card, or two per card when BOTH fit 30 words (§5.2;
 *     the live corpus sits ~16 — compliant)
 *   - any beat: one idea in at most 45 words, or one figure with at most 30
 *     words of framing (§6) — depth layers (plain words / analogy / exam
 *     pointer) are beats, so each layer text ≤ 45 words
 *   - mandatory analogy and exam pointer per depth band (§8)
 *   - check→key-point mappability: a module with checks but ZERO checks that
 *     map to any key-point group fails the interleave backbone (§8); the
 *     per-check conservative fallback (multi-group checks stay in the end
 *     block) is NOT a violation — it is the §7 note's designed behaviour
 *   - minimum interaction cadence once interactions[] exists (§8, "one
 *     interaction per one or two beats"): a module that carries ANY
 *     interactions[] must carry them on at least half its checks — a lone
 *     widget in an otherwise-MCQ module would read as a one-off, not a ladder
 *
 * This module is pure: no fs, no network, no React. The mapping helpers are
 * byte-for-byte the P1 implementation (KP_PAIR_WORD_BUDGET=30,
 * MAP_SCORE_FLOOR=0.15, MAP_MARGIN_RATIO=0.75) — the P1 QA interleave rates
 * (chem 71.0% / phys 67.4% / bio 72.0%) are the parity anchors; the census
 * re-derives them from this module.
 */

/** §5.2 pairing budget: two key points may share a card only when BOTH are under 30 words. */
export const KP_PAIR_WORD_BUDGET = 30;

/** §6 beat law: one idea in at most 45 words (opener, bridge, depth layers). */
export const BEAT_WORD_BUDGET = 45;

/** §6 figure framing: one figure carries at most 30 words of framing. */
export const FIGURE_FRAME_WORD_BUDGET = 30;

export function wordCount(s) {
  return s.trim().split(/\s+/).length;
}

/** §5.2: key points one per card, or two per card when both fit the 30-word
 *  beat budget — greedy over the authored order, deterministic. */
export function keyPointGroups(kps) {
  const groups = [];
  for (const kp of kps) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.length === 1 &&
      wordCount(last[0]) < KP_PAIR_WORD_BUDGET &&
      wordCount(kp) < KP_PAIR_WORD_BUDGET
    ) {
      last.push(kp);
    } else {
      groups.push([kp]);
    }
  }
  return groups;
}

const MAP_SCORE_FLOOR = 0.15;
const MAP_MARGIN_RATIO = 0.75;

/** Content words for the mapping and the recall auto-check — stopword-stripped,
 *  plural-trimmed. (Moved here from guided-flow.tsx at P3: the mapping, the
 *  import gate and the census must tokenize IDENTICALLY.) */
export const PRACTICE_STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "was", "one",
  "our", "out", "get", "has", "him", "his", "how", "its", "new", "now", "old", "see",
  "two", "way", "who", "did", "that", "this", "with", "from", "they", "have", "will",
  "your", "what", "when", "where", "which", "into", "than", "then", "them", "these",
  "those", "there", "their", "been", "were", "also", "such", "each", "other", "more",
  "most", "some", "only", "same", "very", "just", "because", "about", "over", "under",
  "between", "both", "must", "like", "made", "make", "makes", "called", "call", "uses",
  "used", "use", "using",
]);

export function practiceTokens(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !PRACTICE_STOP_WORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/** §5.2: deterministic check→key-point-group mapping. Keyword containment
 *  between the check (stem + options) and each group's key points; a check
 *  interleaves only when one group wins CLEARLY (score floor + margin) —
 *  otherwise it stays in the end block (the conservative fallback law).
 *  `questions` carry { id, stem, options: [{ text }] } — the exact fields the
 *  mapping reads; written kinds (empty options) map on the stem alone. */
export function mapChecksToGroups(groups, questions) {
  const groupWords = groups.map((g) => new Set(practiceTokens(g.join(" "))));
  const out = new Map();
  for (const q of questions) {
    const checkWords = practiceTokens([q.stem, ...(q.options || []).map((o) => o.text)].join(" "));
    if (checkWords.length === 0) continue;
    let best = -1;
    let bestScore = 0;
    let second = 0;
    groupWords.forEach((gw, gi) => {
      if (gw.size === 0) return;
      const hits = checkWords.filter((w) => gw.has(w)).length;
      const score = hits / checkWords.length;
      if (score > bestScore) {
        second = bestScore;
        bestScore = score;
        best = gi;
      } else if (score > second) {
        second = score;
      }
    });
    if (best >= 0 && bestScore >= MAP_SCORE_FLOOR && bestScore >= second / MAP_MARGIN_RATIO) {
      out.set(q.id, best);
    }
  }
  return out;
}

/* ── the §8 import-time chunking law ─────────────────────────────────────── */

/** The words of one module's authored beats (opener + key points + both
 *  depth bands) — the census's budget signal inputs. */
function moduleBeatWords(m) {
  const layers = [];
  for (const band of ["low", "medium"]) {
    const d = (m.depthLayers && m.depthLayers[band]) || {};
    for (const field of ["restatement", "analogy", "examPointer"]) {
      if (typeof d[field] === "string" && d[field].trim() !== "") {
        layers.push({ band, field, words: wordCount(d[field]), text: d[field] });
      }
    }
  }
  return {
    openerWords: wordCount(typeof m.opening === "string" ? m.opening : ""),
    keyPointWords: (Array.isArray(m.keyPoints) ? m.keyPoints : []).map((kp) => ({
      words: wordCount(typeof kp === "string" ? kp : ""),
      text: kp,
    })),
    layers,
  };
}

/**
 * §8 validateChunkLaw — the import-time chunking law over ONE hub lesson
 * artifact (`lessonObj.lesson.modules[]`, plus `lessonObj.lesson.primer` for
 * the bridge). `questionsByModule` (optional, moduleId → question[] from the
 * note's sme-question-package) enables the mappability + cadence laws; the
 * schema gate (G-C) has already guaranteed shape by the time this runs.
 *
 * Returns { violations, signals }:
 *   violations — every breach of the law of record (empty in a compliant
 *                lesson); each carries { moduleId, law, detail }.
 *   signals    — the Table 2 measurements of record for the QA census.
 */
export function validateChunkLaw(lessonObj, questionsByModule) {
  const lesson = lessonObj && lessonObj.lesson;
  const violations = [];
  const signals = {
    modules: 0,
    checks: 0,
    keyPoints: 0,
    openerMaxWords: 0,
    bridgeWords: lesson && lesson.primer && typeof lesson.primer.text === "string" ? wordCount(lesson.primer.text) : 0,
    keyPointMaxWords: 0,
    depthLayerMaxWords: 0,
    mappedChecks: 0,
    interactionChecks: 0,
    modulesWithInteractions: 0,
    interleaveRate: null,
  };
  if (!lesson || !Array.isArray(lesson.modules)) return { violations, signals };

  if (signals.bridgeWords > BEAT_WORD_BUDGET) {
    violations.push({
      moduleId: "(lesson)",
      law: "bridge-beat-45",
      detail: `prerequisite bridge is ${signals.bridgeWords} words (budget ${BEAT_WORD_BUDGET}, §6)`,
    });
  }

  for (const m of lesson.modules) {
    signals.modules += 1;
    const bw = moduleBeatWords(m);
    const kps = Array.isArray(m.keyPoints) ? m.keyPoints : [];
    signals.keyPoints += kps.length;
    signals.openerMaxWords = Math.max(signals.openerMaxWords, bw.openerWords);
    for (const kp of bw.keyPointWords) {
      signals.keyPointMaxWords = Math.max(signals.keyPointMaxWords, kp.words);
    }
    for (const l of bw.layers) {
      signals.depthLayerMaxWords = Math.max(signals.depthLayerMaxWords, l.words);
    }

    if (bw.openerWords > BEAT_WORD_BUDGET) {
      violations.push({
        moduleId: m.id,
        law: "opener-beat-45",
        detail: `opening is ${bw.openerWords} words (budget ${BEAT_WORD_BUDGET}, §5.3)`,
      });
    }
    for (const kp of bw.keyPointWords) {
      if (kp.words > KP_PAIR_WORD_BUDGET) {
        violations.push({
          moduleId: m.id,
          law: "key-point-30",
          detail: `key point is ${kp.words} words (budget ${KP_PAIR_WORD_BUDGET}, §5.2): "${String(kp.text).slice(0, 60)}…"`,
        });
      }
    }
    // §8 mandatory analogy + exam pointer per depth band (restatement too —
    // the "In plain words" layer is the band's teaching spine, §5.3)
    for (const band of ["low", "medium"]) {
      const present = bw.layers.filter((l) => l.band === band).map((l) => l.field);
      for (const field of ["restatement", "analogy", "examPointer"]) {
        if (!present.includes(field)) {
          violations.push({
            moduleId: m.id,
            law: "mandatory-beats",
            detail: `${band} band is missing "${field}" (§8)`,
          });
        }
      }
    }
    for (const l of bw.layers) {
      if (l.words > BEAT_WORD_BUDGET) {
        violations.push({
          moduleId: m.id,
          law: "beat-45",
          detail: `${l.band}.${l.field} is ${l.words} words (budget ${BEAT_WORD_BUDGET}, §6)`,
        });
      }
    }

    const qs = questionsByModule && questionsByModule.get ? questionsByModule.get(m.id) : undefined;
    const checks = Array.isArray(qs) ? qs : [];
    signals.checks += checks.length;
    if (kps.length === 0) {
      violations.push({
        moduleId: m.id,
        law: "mappability",
        detail: "module carries no key points — the check→key-point interleave backbone is unbuildable (§8)",
      });
    } else if (checks.length > 0) {
      const mapped = mapChecksToGroups(keyPointGroups(kps), checks);
      signals.mappedChecks += mapped.size;
      if (mapped.size === 0) {
        violations.push({
          moduleId: m.id,
          law: "mappability",
          detail: `${checks.length} checks, ZERO map to any key-point group (§8) — the module would render as a wall plus an end block`,
        });
      }
    }
    const interactionChecks = checks.filter(
      (q) => Array.isArray(q.interactions) && q.interactions.length > 0,
    ).length;
    signals.interactionChecks += interactionChecks;
    if (interactionChecks > 0) {
      signals.modulesWithInteractions += 1;
      // §8 cadence: "one interaction per one or two beats" — once a module
      // carries interactions[], at least half its checks must carry one
      const minCadence = Math.ceil(checks.length / 2);
      if (interactionChecks < minCadence) {
        violations.push({
          moduleId: m.id,
          law: "interaction-cadence",
          detail: `${interactionChecks}/${checks.length} checks carry interactions[] — below the §8 minimum cadence (≥ ${minCadence})`,
        });
      }
    }
  }

  signals.interleaveRate = signals.checks > 0 ? signals.mappedChecks / signals.checks : null;
  return { violations, signals };
}
