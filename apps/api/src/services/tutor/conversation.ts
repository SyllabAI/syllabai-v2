/**
 * ConversationTurn port (T-MIG-060 tranche 1) — frozen source @ 6cad6ef:
 * src/main/java/com/syllabai/tutor/ConversationTurn.java :25-109,
 * line-against-line.
 *
 * One turn of the chat transcript the client sends back with a follow-up ask
 * (Tutor working memory, s139). Working memory is deliberately CLIENT-HELD:
 * the transcript is the learner's own visible conversation, passed per-ask
 * and never persisted server-side — the LIM contract is untouched.
 *
 * History is learner-supplied input and is treated with the same distrust as
 * the question itself: roles are whitelisted, citation markers [n]/【n】 are
 * stripped from prior ASSISTANT answers (their numbers belong to SOURCES
 * that are not in the new prompt — a learner typing "[2]" is quoting, not
 * citing, so USER turns keep their text verbatim), every turn is
 * length-bounded and only the most recent MAX_HISTORY_TURNS turns survive.
 */

/** Server-side cap on turns per ask — the client sends fewer (8). :28 */
export const MAX_HISTORY_TURNS = 12;

/** Per-turn bound; tutor answers are capped at ~200 words, so 2000 chars is
 *  generous headroom that still bounds a hostile payload. :32 */
export const MAX_TURN_CHARS = 2000;

export const ROLE_USER = "user";
export const ROLE_ASSISTANT = "assistant";

/**
 * Citation markers as the chat surfaces produce them (s138 pipeline):
 * [n]/【n】 with 1–3 digits — the same shape the web ChatMarkdown plugin
 * rewrites. Wider numbers (e.g. [2025]) are content, not markers. :37-38
 * Java: \s*[\[【][0-9]{1,3}[\]】]
 */
const CITATION_MARKER = /\s*[\u{005B}\u{3010}][0-9]{1,3}[\u{005D}\u{3011}]/gu;

export interface ConversationTurn {
  role: string;
  text: string;
}

/**
 * Remove [n]/【n】 citation markers from a tutor answer (s140: also used by
 * the §22 session store — a stored transcript renders as the learner-visible
 * prose, and its source numbers belong to the KA_RAG_COMPLETED telemetry
 * row, the citation archive of record). ConversationTurn.stripCitationMarkers
 * :50-52 — null-safe, global replace.
 */
export function stripCitationMarkers(text: string | null): string | null {
  if (text == null) return null;
  return text.replace(CITATION_MARKER, "");
}

function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

/**
 * Normalize one raw client turn; returns null when it carries nothing usable
 * (unknown/blank role, blank text) — callers drop nulls rather than failing
 * the whole ask on one bad turn. ConversationTurn.of :59-79.
 */
export function conversationTurnOf(
  role: string | null | undefined,
  text: string | null | undefined,
): ConversationTurn | null {
  if (role == null || text == null) return null;
  const normalizedRole = role.trim();
  const assistant = ROLE_ASSISTANT === normalizedRole;
  if (!assistant && ROLE_USER !== normalizedRole) return null;
  // Assistant turns systematically carry [n] markers whose numbers refer to
  // sources absent from the next prompt — strip them (:68-70).
  let cleaned = assistant ? (stripCitationMarkers(text) as string) : text;
  // T-MIG-070: this trim-to-null is DEFENSIVE ONLY — the wire can no longer
  // deliver a blank turn (the notBlank refine on HistoryTurn.text rejects it
  // at binding time with 400 validation_failed, the frozen TutorController
  // :123-141 @NotBlank law). The former reachable drop silently served a 200
  // with the turn gone — the #104 blocker this band closes.
  cleaned = cleaned.trim();
  if (cleaned.length === 0) return null;
  return {
    role: normalizedRole,
    text:
      cleaned.length <= MAX_TURN_CHARS
        ? cleaned
        : cleaned.substring(0, MAX_TURN_CHARS) + "…",
  };
}

/**
 * Bound a history list for pipeline use: every turn is re-normalized through
 * `conversationTurnOf` (the service layer is the policy boundary — direct
 * callers of the ask pipeline get the same marker-stripping and length
 * bounds as the controller path), unusable turns drop out, and only the most
 * recent MAX_HISTORY_TURNS survive. Null-safe. ConversationTurn.sanitize
 * :88-104 — the retention cut keeps the TAIL (the newest turns).
 */
export function sanitizeHistory(
  history: ReadonlyArray<ConversationTurn | null> | null | undefined,
): ConversationTurn[] {
  if (history == null || history.length === 0) return [];
  const clean: ConversationTurn[] = [];
  for (const turn of history) {
    const normalized =
      turn == null ? null : conversationTurnOf(turn.role, turn.text);
    if (normalized != null) clean.push(normalized);
  }
  if (clean.length <= MAX_HISTORY_TURNS) return [...clean];
  return [...clean.slice(clean.length - MAX_HISTORY_TURNS)];
}

export function isAssistantTurn(turn: ConversationTurn): boolean {
  return ROLE_ASSISTANT === turn.role;
}
