/**
 * Guided interactions bridge (P2, redesign plan §5.4) — the pure seam
 * between the guided check slots and the book reader's rail widgets.
 *
 * The plan's contract: the book reader already ships the interaction
 * vocabulary (sort-match, table-fill, drag-label, equation builder, plus
 * mcq-embed); P2 wires these into the check-in slots of guided lessons via
 * an optional interactions[] field on a check — when absent, the check
 * falls back to the existing MCQ or written UI, so nothing about the 5,355
 * live checks changes until the P3 backfill authors interactions.
 *
 * LAWS carried here:
 *  - Fail-closed: an unknown kind or a payload that would render as an
 *    UNCHECKABLE widget (each widget's own honest-empty law, restated
 *    pure below) yields null — the check falls back to the standard UI,
 *    never a blank or fake player.
 *  - No new runtime: the widget components of record are the books rail's
 *    own (components/books/rail/widgets); this module only VALIDATES the
 *    payload, synthesizes the RailBlock envelope they consume, and builds
 *    the "ask the tutor on this beat" deep link (§5.5) — the anchored
 *    /tutor?q=…&spec=… entry point the rest of the hub already uses.
 *  - Presentation-only: nothing here touches stage mechanics, payloads,
 *    gate semantics or the zero-DB progress persistence.
 */
import { matchesAny } from "@/lib/books-chem";
import type { RailBlock } from "@/lib/books-rail";
import type {
  GuidedCheckInteraction,
  GuidedQuestion,
} from "@/lib/guided-lessons";

/** The ask-prompt cap for the tutor deep link. Well under the tutor's own
 *  QUESTION_CAP (2000) so the spec anchor suffix the tutor appends always
 *  fits; the tutor displays the learner's words verbatim and uses them for
 *  retrieval anchoring only — nothing writes to canonical data. */
const ASK_CAP = 600;

/**
 * The stage-mode answering surface for a check, or null when the check
 * falls back to the standard MCQ/written UI. Takes the FIRST interaction
 * only (the plan's "a new optional interactions[] field … selects THE
 * widget"); every later entry is inert.
 *
 * Validation restates each widget's honest-empty law verbatim (an
 * uncheckable assembly never ships):
 *  - sort-match  ≥2 items; match mode needs a solution covering every item
 *                with known target ids, order mode a correctOrder of the
 *                same ids
 *  - table-fill  ≥1 column, ≥1 row, and every cell carrying ≥1 accept
 *  - drag-label  ≥1 non-empty label, ≥1 slot, every slot answerable
 *  - eq-builder  a non-empty target and ≥1 non-empty bank token
 */
export function usableInteraction(q: GuidedQuestion): GuidedCheckInteraction | null {
  const raw = q.interactions?.[0];
  if (raw == null || typeof raw !== "object") return null;
  switch (raw.kind) {
    case "sort-match": {
      const it = raw;
      const items = strPairs(it.items);
      if (items.length < 2 || items.length !== it.items.length) return null;
      if (it.targets != null) {
        // match mode: every item must map to a KNOWN target id
        const targets = strPairs(it.targets);
        if (targets.length === 0 || targets.length !== it.targets.length) return null;
        const targetIds = new Set(targets.map((t) => t.id));
        const solution = it.solution;
        if (solution == null || typeof solution !== "object") return null;
        return items.every((i) => solution[i.id] != null && targetIds.has(solution[i.id]))
          ? it
          : null;
      }
      // order mode: the mark-scheme order must be a reachable arrangement —
      // a permutation of the item ids (same length, every id known, no
      // duplicates; a repeated id would make the correct order unreachable)
      const order = Array.isArray(it.correctOrder) ? it.correctOrder : null;
      if (order == null) return null;
      const itemIds = new Set(items.map((i) => i.id));
      return order.length === items.length &&
        order.every((id) => itemIds.has(id)) &&
        new Set(order).size === order.length
        ? it
        : null;
    }
    case "table-fill": {
      const it = raw;
      const columns = strList(it.columns);
      if (columns.length === 0 || columns.length !== it.columns.length) return null;
      if (!Array.isArray(it.rows) || it.rows.length === 0) return null;
      return it.rows.every(
        (r) =>
          r != null &&
          typeof r === "object" &&
          Array.isArray(r.cells) &&
          r.cells.length > 0 &&
          r.cells.every(
            (c) => c != null && typeof c === "object" && strList(c.accepts).length > 0,
          ),
      )
        ? it
        : null;
    }
    case "drag-label": {
      const it = raw;
      const labels = strList(it.labels);
      if (labels.length === 0 || labels.length !== it.labels.length) return null;
      if (!Array.isArray(it.slots) || it.slots.length === 0) return null;
      return it.slots.every(
        (s) =>
          s != null &&
          typeof s === "object" &&
          typeof s.id === "string" &&
          s.id !== "" &&
          typeof s.answer === "string" &&
          s.answer !== "" &&
          slotPlaceable(s.answer, s.alt, labels),
      )
        ? it
        : null;
    }
    case "eq-builder": {
      const it = raw;
      const tokens = strList(it.tokens);
      if (typeof it.target !== "string" || it.target === "") return null;
      if (tokens.length === 0 || tokens.length !== it.tokens.length) return null;
      // SOLVABILITY BOUNDARY (review follow-up): shape laws end here at
      // runtime. The full reachability law — some ordered sub-multiset of
      // the bank renders to the target under normalizeEquation — cannot be
      // restated as a cheap string predicate (species-internal "+" interacts
      // with the normalizer's spacing rules), so it is enforced OFFLINE by
      // the P3 backfill bake's headless walk (plan §8), which brute-forces
      // each authored eq-builder before it ships. An unreachable target that
      // slips through is fail-safe for the learner (the flow's remediation
      // row + tutor affordance still serve), never a crash.
      return it;
    }
    default:
      return null; // unknown kind — fail closed to the standard UI
  }
}

/** The RailBlock envelope the books widget components consume, synthesized
 *  from a validated interaction. `content` IS the interaction payload (the
 *  widgets read c.items / c.rows / c.slots / c.tokens / … verbatim); the
 *  envelope's own fields are inert placeholders — the block never rides the
 *  books rail's data lane and nothing here fetches anything. */
export function interactionBlock(
  questionId: string,
  interaction: GuidedCheckInteraction,
  ord: number,
): RailBlock {
  const { kind, ...content } = interaction;
  return {
    id: `guided-${questionId}`,
    documentId: "guided-interaction",
    docVersion: 1,
    chapterKey: "guided",
    ord,
    type: kind,
    pdfPageAnchor: null,
    content: content as Record<string, unknown>,
    checkRefs: [],
    glossaryRefs: [],
    specPointRefs: [],
    validationState: "VALIDATED",
    version: 1,
  };
}

/** §5.5 "Ask SillyAI" — the existing tutor, opened ON this beat: the missed
 *  check's stem plus (when the P1 mapping identified it) the key point that
 *  teaches the concept, anchored to the module's specification code. The
 *  same anchored-entry law as the exam player's "Question help" (/tutor?…),
 *  retrieval anchoring only — the user's words are displayed verbatim. */
export function tutorAskHref(
  course: string,
  stem: string,
  replayKps: string[] | null,
  specRef: string | null,
): string {
  const kp = replayKps && replayKps.length > 0 ? ` — please explain: ${replayKps.join(" ")}` : "";
  const q = `I got this guided-lesson check wrong: "${stem}"${kp}`.slice(0, ASK_CAP);
  const params = new URLSearchParams({ course, q });
  if (specRef) params.set("spec", specRef);
  return `/tutor?${params.toString()}`;
}

/* ── the defensive list/pair readers (the widgets' own guards, pure) ── */

/** drag-label solvability (the honest-empty law, completed): the learner
 *  can only PLACE tokens from the `labels` pool, so a slot is answerable
 *  only when at least one label grades correct against [answer, ...alt]
 *  under the widget's own matchesAny. An answer naming a label the bank
 *  does not carry would render an unmarkable check — fail closed. */
function slotPlaceable(answer: string, alt: unknown, labels: string[]): boolean {
  const alts = Array.isArray(alt)
    ? alt.filter((a): a is string => typeof a === "string")
    : [];
  return labels.some((l) => matchesAny(l, [answer, ...alts]));
}

function strList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
}

function strPairs(v: unknown): { id: string; text: string }[] {
  return Array.isArray(v)
    ? v.filter(
        (x): x is { id: string; text: string } =>
          x != null &&
          typeof x === "object" &&
          typeof (x as { id?: unknown }).id === "string" &&
          (x as { id: string }).id !== "" &&
          typeof (x as { text?: unknown }).text === "string" &&
          (x as { text: string }).text !== "",
      )
    : [];
}
