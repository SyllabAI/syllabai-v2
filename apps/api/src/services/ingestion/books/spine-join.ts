/**
 * T-MIG-133 band 133b (r0) — the LO→spine join engine for Student Books.
 *
 * Join law of record (package intake run-001): the book prints NO spec
 * codes — the chapter LO-box bullets are verbatim-class matches of the
 * 4CH1 spine's official_wording (probe: 1.2 interconversions, 1.8
 * classify, chromatogram). This engine therefore matches NORMALIZED TEXT
 * of each LO bullet against the spine's official wording, never printed
 * refs. Weak/absent matches go to the REVIEW lane — never silent (the
 * content-maps/fig46 law); provenance rides the content-maps code grammar
 * {spineCode, officialCode, officialId, tier, score, lineage, method}.
 *
 * F-BOOK-0003 r1 — the TWO-PHASE widened law: the book's LO boxes
 * interleave colon-continuation sub-clauses AFTER the next top-level
 * bullet (the p.39 c4 typesetting: 1.18's "in order of atomic number" and
 * "in groups and periods" fold into the 1.19 bullet), so a head bullet's
 * flattened matchText misses its own official wording's continuation
 * tokens (containment 0.611 < 0.75 → honest review). Phase 1 matches the
 * flattened bullets exactly as r0 did. Phase 2 rescues REVIEW bullets
 * ONLY, by EVIDENCE-BASED attach: the missing official tokens must be
 * carried verbatim-class by a sub-clause bullet folded into a DIFFERENT
 * bullet of the same box (tokens(sub) ⊆ tokens(official)), and the
 * reconstituted containment (head ∪ attached) must clear the same 0.9/
 * 0.75 bars the single-phase law uses. The bind records method="widened"
 * (the data-repair precedent class, now native) and lineage "lo:<id>#b<n>
 * +attach". Deterministic: best tier first, then score, then spine order,
 * then bullet order; each sub-clause attaches at most once.
 *
 * Deterministic: no clocks, no randomness, no model calls. The spine is
 * INJECTED (the runner passes loadConceptGraphSnapshot().specPoints; tests
 * pass synthetic points) — this module never touches the filesystem.
 *
 * Normalization: lowercase; unicode dashes/quotes folded; every non-
 * alphanumeric run → one space; trim. Statement text itself is NEVER
 * repaired (the verbatim law — normalization exists only for matching).
 */
import type { SpecCodeRef } from "@syllabai/contracts";

/** Minimal spine point shape consumed here (SnapshotSpecPoint's fields). */
export interface SpinePoint {
  code: string;
  officialCode: string;
  wording: string;
  globalOrder: number;
}

export function normalizeStatement(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Leading verbs that mark a TOP-LEVEL LO bullet (lowercase compare). */
const TOP_LEVEL_VERBS = [
  "understand",
  "recall",
  "describe",
  "explain",
  "be able",
  "state",
  "write",
  "draw",
  "plot",
  "calculate",
  "compare",
  "investigate",
  "use",
  "know",
  "practical",
  "suggest",
  "discuss",
  "evaluate",
  "carry out",
];

export interface LoBullet {
  /** 1-based index of the top-level bullet within its LO box text. */
  index: number;
  /** the top-level bullet text (its folded sub-bullets NOT included). */
  text: string;
  /** folded sub-bullet texts (logical children of this bullet). */
  subs: string[];
  /** the full match text: top-level + subs joined (bullet-flattened). */
  matchText: string;
}

/**
 * Split an LO box text ("LEARNING OBJECTIVES\n\n• bullet\n\n• sub\n\n• …")
 * into top-level bullets with folded sub-bullets. Top-level = starts with
 * an uppercase letter or a known leading verb; a lowercase-start bullet is
 * a sub-bullet of the previous top-level. The "LEARNING OBJECTIVES" header
 * line and empties are dropped. The book repeats the LO box per spread —
 * callers dedupe by matchText.
 */
export function splitBullets(loText: string): LoBullet[] {
  const pieces = loText
    .split("•")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0 && p.toLowerCase() !== "learning objectives");
  const bullets: LoBullet[] = [];
  let current: LoBullet | null = null;
  for (const piece of pieces) {
    const isFirstCharUpper = /^\p{Lu}/u.test(piece);
    const lowered = piece.toLowerCase();
    const startsWithVerb = TOP_LEVEL_VERBS.some((v) => lowered.startsWith(v));
    if (current !== null && !(isFirstCharUpper || startsWithVerb)) {
      current.subs.push(piece);
      current.matchText = `${current.matchText} ${piece}`;
    } else {
      current = { index: bullets.length + 1, text: piece, subs: [], matchText: piece };
      bullets.push(current);
    }
  }
  return bullets;
}

/** Containment of the official wording's token set in the bullet's. */
function containment(officialTokens: string[], bulletTokens: Set<string>): number {
  if (officialTokens.length === 0) return 0;
  let shared = 0;
  for (const t of officialTokens) if (bulletTokens.has(t)) shared += 1;
  return shared / officialTokens.length;
}

// F-BOOK-0003 r1 — the two-phase widened law's bars. The head floor keeps
// the anchor bullet genuinely about the point (a random low-overlap bullet
// must not borrow a foreign sub-clause); the reconstituted bars are the
// SAME 0.9/0.75 the single-phase tiers require — widening changes WHERE the
// continuation tokens come from, never how much evidence a bind needs.
const WIDENED_HEAD_FLOOR = 0.5;
const WIDENED_TIER2_BAR = 0.9;
const WIDENED_TIER3_BAR = 0.75;

const TIER_VERBATIM = 1;
const TIER_HIGH = 2;
const TIER_MEDIUM = 3;

export interface BulletMatchResult {
  ref: SpecCodeRef | null;
  best: { officialCode: string; score: number } | null;
}

/**
 * Match ONE (deduped) bullet against the spine. Tiers (scored, best-wins,
 * ties broken by lower globalOrder — deterministic):
 *   tier 1 "verbatim": normalized equality (score 1.0);
 *   tier 2 "normalized": official-containment ≥ 0.9 AND bullet-containment
 *          ≥ 0.5 (the bullet may carry clarifiers);
 *   tier 3 "fuzzy": ≥ 0.75 / ≥ 0.35;
 *   else null → the REVIEW lane (with the best near-miss for the operator).
 */
export function matchBullet(
  bullet: LoBullet,
  spine: readonly SpinePoint[],
  loId: string,
): BulletMatchResult {
  const bn = normalizeStatement(bullet.matchText);
  if (bn === "") return { ref: null, best: null };
  const bt = new Set(bn.split(" "));
  let bestTier = Number.POSITIVE_INFINITY;
  let bestScore = 0;
  let bestPoint: SpinePoint | null = null;
  let nearCode: string | null = null;
  let nearScore = 0;
  for (const sp of spine) {
    const on = normalizeStatement(sp.wording);
    if (on === "") continue;
    const ot = on.split(" ");
    const cOff = containment(ot, bt);
    const cBul = ot.length === 0 ? 0 : containment(bn.split(" "), new Set(ot));
    let tier: number;
    let score: number;
    if (bn === on) {
      tier = TIER_VERBATIM;
      score = 1;
    } else if ((cOff >= 0.9 && cBul >= 0.5) || (cOff >= 1 && ot.length >= 6)) {
      // tier 2 includes the SUPERSET class: the bullet fully contains the
      // official wording but carries trailing caption/prose noise (the book
      // repeats the LO box with figure text) — cOff=1.0 on a ≥6-token
      // official wording is itself the evidence; no bullet-ratio guard.
      tier = TIER_HIGH;
      score = cOff;
    } else if (cOff >= 0.75 && cBul >= 0.35) {
      tier = TIER_MEDIUM;
      score = cOff;
    } else {
      if (cOff > nearScore) {
        nearScore = cOff;
        nearCode = sp.officialCode;
      }
      continue;
    }
    const better =
      tier < bestTier ||
      (tier === bestTier && score > bestScore) ||
      (tier === bestTier && score === bestScore && bestPoint !== null && sp.globalOrder < bestPoint.globalOrder);
    if (better) {
      bestTier = tier;
      bestScore = score;
      bestPoint = sp;
    }
  }
  if (bestPoint === null) {
    return { ref: null, best: nearCode !== null ? { officialCode: nearCode, score: nearScore } : null };
  }
  const tierName = bestTier === TIER_VERBATIM ? "1" : bestTier === TIER_HIGH ? "2" : "3";
  const method = bestTier === TIER_VERBATIM ? "verbatim" : bestTier === TIER_HIGH ? "normalized" : "fuzzy";
  return {
    ref: {
      spineCode: bestPoint.code,
      officialCode: bestPoint.officialCode,
      officialId: bestPoint.code,
      tier: tierName,
      score: Number(bestScore.toFixed(4)),
      lineage: `lo:${loId}#b${bullet.index}`,
      method,
    },
    best: null,
  };
}

/** Chapter-level aggregate of the join (the book_chapters.spec_codes law). */
export interface ChapterJoinResult {
  /** one ref per matched spine code, best-tier-wins, official-code order. */
  refs: SpecCodeRef[];
  matchedBullets: number;
  /** caption-prefixed pieces dropped from the bullet stream (counted). */
  droppedCaptions: number;
  /** REVIEW lane — unmapped top-level bullets (deduped), never silent. */
  review: Array<{ text: string; nearOfficialCode: string | null; nearScore: number | null }>;
}

const CAPTION_PREFIX = /^(figure|table|photo|photograph|graph|chart)\b/i;

/**
 * Join one chapter's LO box text (the repeats already collapsed) against
 * the spine. `loRef` labels the lineage (the first LO chunk id of the
 * chapter). SpecCodeRef.lineage for chapter-level refs carries the bullet
 * indices; per-chapter dedupe keeps the BEST ref per spine code.
 */
export function joinChapterLearningObjectives(
  loText: string,
  loId: string,
  spine: readonly SpinePoint[],
): ChapterJoinResult {
  const allBullets = splitBullets(loText);
  const bullets = allBullets.filter((b) => !CAPTION_PREFIX.test(b.text));
  const droppedCaptions = allBullets.length - bullets.length;
  const bySpine = new Map<string, SpecCodeRef>();
  const seen = new Set<string>();
  const review: ChapterJoinResult["review"] = [];
  // F-BOOK-0003 r1: review entries keyed by their deduped matchText so the
  // widened phase can re-associate them with their LoBullet objects
  const reviewByKey = new Map<string, ChapterJoinResult["review"][number]>();
  const boundKeys = new Set<string>();
  let matched = 0;
  for (const bullet of bullets) {
    const key = normalizeStatement(bullet.matchText);
    if (seen.has(key)) continue;
    seen.add(key);
    const { ref, best } = matchBullet(bullet, spine, loId);
    if (ref === null) {
      const entry = {
        text: bullet.text,
        nearOfficialCode: best?.officialCode ?? null,
        nearScore: best?.score ?? null,
      };
      review.push(entry);
      reviewByKey.set(key, entry);
      continue;
    }
    matched += 1;
    boundKeys.add(key);
    const prev = bySpine.get(ref.spineCode);
    if (prev === undefined) {
      bySpine.set(ref.spineCode, ref);
    } else {
      // duplicate LO box repeats: keep the better tier/score (widened outranks
      // fuzzy: it is attach-evidenced like normalized, not a bare near-miss)
      const rank = (r: SpecCodeRef) =>
        r.method === "verbatim" ? 0 : r.method === "normalized" ? 1 : r.method === "widened" ? 2 : 3;
      if (rank(ref) < rank(prev) || (rank(ref) === rank(prev) && (ref.score ?? 0) > (prev.score ?? 0))) {
        bySpine.set(ref.spineCode, ref);
      }
    }
  }
  // ── phase 2 (F-BOOK-0003 r1): the widened attach for REVIEW bullets ──
  // Evidence law: a sub-clause folded under a DIFFERENT bullet carries the
  // missing official tokens verbatim-class. Best-wins, deterministic.
  const reviewBullets: Array<{ bullet: LoBullet; review: ChapterJoinResult["review"][number] }> = [];
  for (const bullet of bullets) {
    const key = normalizeStatement(bullet.matchText);
    if (boundKeys.has(key)) continue;
    const entry = reviewByKey.get(key);
    if (entry !== undefined && !reviewBullets.some((rb) => rb.bullet.text === bullet.text)) {
      reviewBullets.push({ bullet, review: entry });
    }
  }
  // sub-clause inventory (dedupe identical sub texts across box repeats;
  // first occurrence order is the deterministic inventory order)
  const subInventory: Array<{ text: string; tokens: string[] }> = [];
  const subSeen = new Set<string>();
  for (const bullet of bullets) {
    for (const sub of bullet.subs) {
      const n = normalizeStatement(sub);
      if (n === "" || subSeen.has(n)) continue;
      subSeen.add(n);
      subInventory.push({ text: sub, tokens: n.split(" ") });
    }
  }
  const boundCodes = new Set(bySpine.keys());
  interface Candidate {
    bullet: LoBullet;
    point: SpinePoint;
    officialTokens: string[];
    score: number;
    tier: number;
    subs: Array<{ text: string; tokens: string[] }>;
  }
  const candidates: Candidate[] = [];
  for (const { bullet } of reviewBullets) {
    const headTokens = new Set(normalizeStatement(bullet.text).split(" "));
    for (const sp of spine) {
      if (boundCodes.has(sp.code)) continue;
      const on = normalizeStatement(sp.wording);
      if (on === "") continue;
      const ot = on.split(" ");
      const cHead = containment(ot, headTokens);
      if (cHead < WIDENED_HEAD_FLOOR) continue;
      const otSet = new Set(ot);
      const attachable = subInventory.filter(
        (s) => s.tokens.length > 0 && s.tokens.every((t) => otSet.has(t)),
      );
      if (attachable.length === 0) continue;
      const union = new Set(headTokens);
      for (const s of attachable) for (const t of s.tokens) union.add(t);
      const score = containment(ot, union);
      if (score >= WIDENED_TIER3_BAR) {
        candidates.push({
          bullet,
          point: sp,
          officialTokens: ot,
          score,
          tier: score >= WIDENED_TIER2_BAR ? TIER_HIGH : TIER_MEDIUM,
          subs: attachable,
        });
      }
    }
  }
  // deterministic best-wins assignment: tier asc, score desc, spine order,
  // bullet order; each bullet binds at most once more, each sub at most once
  candidates.sort(
    (a, b) =>
      a.tier - b.tier ||
      b.score - a.score ||
      a.point.globalOrder - b.point.globalOrder ||
      a.bullet.index - b.bullet.index,
  );
  const widenedBound = new Set<string>();
  const usedSubs = new Set<string>();
  let widenedBullets = 0;
  for (const c of candidates) {
    if (widenedBound.has(c.bullet.text) || boundCodes.has(c.point.code)) continue;
    if (c.subs.some((s) => usedSubs.has(s.text))) continue;
    for (const s of c.subs) usedSubs.add(s.text);
    widenedBound.add(c.bullet.text);
    boundCodes.add(c.point.code);
    widenedBullets += 1;
    const tierName = c.tier === TIER_HIGH ? "2" : "3";
    bySpine.set(c.point.code, {
      spineCode: c.point.code,
      officialCode: c.point.officialCode,
      officialId: c.point.code,
      tier: tierName,
      score: Number(c.score.toFixed(4)),
      lineage: `${loId}#b${c.bullet.index}+attach`,
      method: "widened",
    });
  }
  // the review lane shrinks by exactly the widened binds (never silent:
  // what remains here is what NO bullet+attach evidence could map)
  const finalReview = reviewBullets
    .filter(({ bullet }) => !widenedBound.has(bullet.text))
    .map(({ review }) => review);

  // collapse duplicate box repeats into one lineage label per code
  const refs = [...bySpine.values()].map((r) => ({
    ...r,
    lineage: r.lineage.includes("+attach") ? r.lineage : `${loId}#${r.lineage.split("#")[1]}`,
  }));
  refs.sort((a, b) => {
    const pa = a.officialCode.split(".").map((x) => parseInt(x, 10) || 0);
    const pb = b.officialCode.split(".").map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
    }
    return a.officialCode < b.officialCode ? -1 : a.officialCode > b.officialCode ? 1 : 0;
  });
  return { refs, matchedBullets: matched + widenedBullets, droppedCaptions, review: finalReview };
}
