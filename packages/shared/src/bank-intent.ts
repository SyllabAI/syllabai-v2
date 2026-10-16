/**
 * Bank-intent — the deterministic (zero-LLM) classifier behind the hub
 * chat's tutor-bank bands (T-MIG-130, operator trace 1a140a3f4c796e11).
 *
 * Lives in @syllabai/shared because it is pure, deterministic domain logic
 * with zero I/O (the package's exact charter) and because its behaviour is
 * contract, not presentation: the relay decides WHETHER to probe the v2
 * bank routes (T-MIG-128/129) from this verdict, and the suite of record
 * (`bun test apps/api packages`) pins it first-hand.
 *
 * Design posture — PRECISION FIRST, honesty always:
 * - A false negative costs nothing: the question falls through to the
 *   grounded ask (the ALWAYS-ON tutor path), exactly as before this band.
 * - A false positive costs one fast indexed SQL probe and still degrades
 *   honestly (a non-binding identity 404s → fall-through; an empty census
 *   falls through). The ONE guarded-against hijack is a conceptual question
 *   being answered by a paper fetch — hence the gates below require BOTH a
 *   bank-ish noun/phrase AND a fullness/fetch/listing signal, never one
 *   alone.
 * - Run-004 law (proposal #1): an explicit question number ALWAYS yields
 *   to the per-question grounded path, and a fullness word only counts
 *   when it sizes the paper itself ("full 2019 june paper 1", not "a
 *   full-credit answer").
 * - No regex list can be exhaustive; that is fine. The bands are an
 *   enhancement layer over the tutor, never a gate in front of it.
 */

/** Band (1) axes — mirrors the /bank/questions params (topic | spec; the
 *  service's precedence is nodeId > spec > topic, the classifier never
 *  produces nodeId). */
export interface BankQuestionsIntent {
  kind: "questions";
  spec?: string;
  topic?: string;
}

/** Band (2) — the whole-paper fetch takes the WHOLE question as its
 *  free-text identity (the v2 fetch-parser owns binding; the classifier
 *  only decides to probe). */
export interface BankPaperIntent {
  kind: "paper";
}

export type BankIntent = BankPaperIntent | BankQuestionsIntent | null;

/** A paper-ish noun — "question paper", "mark scheme", "paper N", "paper".
 *  Deliberately NOT \bqp\b/\bms\b: those abbreviations collide with real
 *  chemistry ("MS" = mass spectrometry). */
const PAPER_NOUN = /\b(?:question\s+papers?|mark\s+schemes?|papers?)\b/i;

/** Fullness — the learner wants the WHOLE paper (operator example #2:
 *  "give me the full 2019 june paper 1").
 *
 *  TIGHTENED (T-MIG-130 run-004 proposal #1): the fullness word must size
 *  the paper noun ITSELF — only session-ish tokens (a year, a series word,
 *  "exam", a unit code) may sit between. A fullness word that sizes a
 *  DIFFERENT noun ("a full-credit answer", "full marks", "complete the
 *  reaction") must NOT arm band 2: those are per-question/study asks the
 *  grounded arm answers with page-pinned citations. The old bare-word
 *  regex hijacked exactly those asks (run-004 LEG A: \bfull\b matched the
 *  hyphenated compound "full-credit" — a word boundary at the hyphen). */
const FULLNESS_PAPER =
  /\b(?:full|whole|entire|complete)\b\s+(?:(?:(?:19|20)\d{2}|june|jan(?:uary)?|nov(?:ember)?|exam(?:ination)?|\d{1,2}[a-z]?)\s+){0,3}(?:question\s+papers?|exam(?:ination)?\s+papers?|mark\s+schemes?|papers?)\b/i;

/** An explicit question number binds a PER-QUESTION ask — band 2 (and the
 *  listing band) YIELD to it (run-004 proposal #1's qnum-guard): "question
 *  6", "q6", "q. 6", "question no. 6", "questions 3". The grounded arm's
 *  paper-question resolver pins the exact QP/MS pages for that question;
 *  the whole-paper card cannot answer it. Runs before every band gate so
 *  even fetch-verb + session-anchor phrasings ("show me question 6 of june
 *  2019 paper 1") yield. "question paper 1" is NOT a question number (the
 *  noun phrase never reaches the digit). */
const QUESTION_NUMBER =
  /\b(?:questions?|qs?)\s*(?:no\.?\s*)?(\d{1,2})\b/i;

/** Fetch verbs — "open/show/pull up the june 2019 paper". */
const FETCH_VERB =
  /\b(?:open|show|display|pull\s+up|bring\s+up|load|fetch|get|give)\b/i;

/** Session anchor — a year or series, required to arm the fetch-verb path
 *  (a bare "open the paper" is ambiguous; the ask should answer it). */
const SESSION_ANCHOR = /\b(?:19|20)\d{2}\b|\b(?:june|jan(?:uary)?|nov(?:ember)?)\b/i;

/** Listing openers — the question STARTS by asking for a listing. */
const LISTING_OPENER =
  /^(?:please\s+)?(?:can\s+you\s+)?(?:list|give|show|find|get|fetch|pull)\b/i;

/** Conceptual openers never list — they ask the tutor to teach ("why are
 *  all questions in chemistry hard?"). Checked before every band gate. */
const CONCEPTUAL_OPENER = /^(?:how\b|why\b|when\b|who\b|where\b)/i;
const LISTING_WHAT = /^(?:what|which)\s+questions\b/i;
const LISTING_ALL = /\ball\s+questions\b/i;
const LISTING_PAST_PAPER = /\bpast[-\s]?paper\s+questions\b/i;

/** Spec axis: a dotted code directly after the preposition (optionally
 *  introduced by the word "spec"), or anywhere after an explicit
 *  "spec(ification) (point)" mention. The dotted shape (N.N) is required —
 *  plain integers would hijack years/counts. */
const SPEC_AFTER_PREP =
  /(?:about|on|for|from|at|covering|under)\s+(?:spec(?:ification)?\s*(?:point)?\s*)?(\d{1,2}\.\d{1,3}(?:\.\d+)?)\b/i;
const SPEC_NAMED =
  /\bspec(?:ification)?\s*(?:point)?\s*[:#\-]?\s*(\d{1,2}\.\d{1,3}(?:\.\d+)?)\b/i;

/** Topic axis: the phrase after "questions <prep> …". */
const TOPIC_AFTER_QUESTIONS =
  /questions?\s+(?:about|on|related\s+to|for|from|covering|in|under)\s+(.+)$/i;

/**
 * Classify one learner question into a bank-band probe intent.
 * Order matters: the paper gate is the more specific shape and wins.
 */
export function classifyBankIntent(question: string): BankIntent {
  const q = question.trim();
  if (!q) return null;
  if (CONCEPTUAL_OPENER.test(q)) return null;

  // A per-question ask yields the bands entirely (run-004 law): the
  // resolver-pinned grounded answer is the right surface, the whole-paper
  // card never carries the mark scheme for ONE question.
  if (QUESTION_NUMBER.test(q)) return null;

  // Band (2): a paper noun AND a want-the-whole-paper signal.
  if (
    PAPER_NOUN.test(q) &&
    (FULLNESS_PAPER.test(q) ||
      (/\bquestion\s+papers?\b/i.test(q) && /\bmark\s+schemes?\b/i.test(q)) ||
      (FETCH_VERB.test(q) && SESSION_ANCHOR.test(q)))
  ) {
    return { kind: "paper" };
  }

  // Band (1): a listing-shaped question AND an extractable axis.
  if (!(LISTING_OPENER.test(q) || LISTING_WHAT.test(q) || LISTING_ALL.test(q) || LISTING_PAST_PAPER.test(q))) {
    return null;
  }
  const spec =
    SPEC_AFTER_PREP.exec(q)?.[1] ??
    SPEC_NAMED.exec(q)?.[1] ??
    undefined;
  const topic = extractTopic(q);
  if (!spec && !topic) return null;
  return {
    kind: "questions",
    ...(spec ? { spec } : {}),
    ...(topic ? { topic } : {}),
  };
}

/** Pull the topic phrase out of a listing question and clean it down to
 *  what the bank's exact-then-unique-substring node resolution can bind:
 *  strip trailing punctuation, wrapping quotes, leading filler, trailing
 *  session/paper refinements (the v1 wiring does not carry year/series
 *  filters — the card shows each question's paper instead), collapse
 *  whitespace. Returns null for anything that cannot plausibly bind a
 *  knowledge-node title. */
function extractTopic(q: string): string | undefined {
  const raw = TOPIC_AFTER_QUESTIONS.exec(q)?.[1];
  if (!raw) return undefined;
  let topic = raw
    .replace(/[?.!…]+\s*$/, "")
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .replace(/^(?:the|all|any)\s+/i, "")
    // trailing session/year refinement — "… from june 2019", "… in 2019"
    .replace(/\s+(?:from|in|for)\s+(?:june|jan(?:uary)?|nov(?:ember)?|(?:19|20)\d{2}).*$/i, "")
    // trailing paper refinement — "… paper 1", "… paper 2C"
    .replace(/\s+papers?\s*\d[a-z]?\b.*$/i, "")
    // trailing spec refinement — "… spec point 2.44" (the spec axis carries it)
    .replace(/\s+specs?(?:ification)?\s*(?:point)?\s*[:#\-]?\s*\d{1,2}(?:\.\d+)+.*$/i, "")
    // a topic that IS the spec phrase ("specification 1.15") is no topic at all
    .replace(/^\s*specs?(?:ification)?\s*(?:point)?\s*[:#\-]?\s*\d{1,2}(?:\.\d+)+\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (topic.length < 2 || topic.length > 80) return undefined;
  // a bare code/number is a spec axis, not a topic — and if the spec axis
  // did not fire on it, the phrase cannot bind a node title
  if (/^\d+(?:\.\d+)*$/.test(topic)) return undefined;
  if (!/\p{L}/u.test(topic)) return undefined;
  return topic;
}

// ── deterministic lead-ins ──────────────────────────────────────────────

/** The one-line markdown answer text a band turn carries (the transcript,
 *  copy, export and future-ask history all read the content string — the
 *  structured card renders BELOW it, like citations). Built here so hub
 *  and tests share THE ONE phrasing. */

export interface BankLeadPaperRef {
  paperCode: string | null;
  series: string | null;
  year: number | null;
  title: string | null;
}

const SERIES_LABELS: Record<string, string> = {
  JUN: "June",
  JUNE: "June",
  JAN: "January",
  JANUARY: "January",
  NOV: "November",
  NOVEMBER: "November",
};

export function seriesLabel(series: string | null | undefined): string | null {
  const t = series?.trim().toUpperCase();
  if (!t) return null;
  return SERIES_LABELS[t] ?? (t.charAt(0) + t.slice(1).toLowerCase());
}

/** "June 2019 · Paper 1C — 15 questions · 110 marks, served with the paired
 *  mark scheme. Same-session papers also in the bank: 1CR, 2C, 2CR." */
export function bankPaperLeadIn(
  paper: BankLeadPaperRef,
  questionCount: number,
  marks: number,
  siblingCodes: string[],
): string {
  const session = [seriesLabel(paper.series), paper.year ?? null]
    .filter((x): x is string | number => x != null)
    .join(" ");
  const head = [paper.paperCode ?? null, session || null]
    .filter((x): x is string => x != null && x !== "")
    .join(" · ");
  const label = head || paper.title?.trim() || "The paper";
  const plural = questionCount === 1 ? "question" : "questions";
  const markBit = marks > 0 ? ` · ${marks} marks` : "";
  let out = `**${label}** — ${questionCount} ${plural}${markBit}, served with the paired mark scheme.`;
  if (siblingCodes.length > 0) {
    out += ` Same-session papers also in the bank: ${siblingCodes.join(", ")}.`;
  }
  return out;
}

/** "**248 past-paper questions** match “Organic chemistry”. Showing the
 *  first 25." — the honest total-then-shown census line. */
export function bankQuestionsLeadIn(
  total: number,
  shown: number,
  axisLabel: string,
): string {
  const plural = total === 1 ? "question" : "questions";
  let out = `**${total} past-paper ${plural}** match ${axisLabel}.`;
  if (shown < total) {
    out += ` Showing the first ${shown} — refine the topic to narrow the list.`;
  }
  return out;
}

/** Axis label for the lead-in: a spec point reads bare (it IS a code), a
 *  topic reads quoted. */
export function bankAxisLabel(intent: BankQuestionsIntent): string {
  if (intent.spec) return `specification point ${intent.spec}`;
  return `“${intent.topic ?? "your topic"}”`;
}
