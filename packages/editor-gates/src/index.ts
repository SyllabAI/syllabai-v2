/**
 * Editor gates — ADR-044 §8, the gate engine of record (Phase 2, run-011).
 *
 * THE SINGLE-MODULE LAW: one module, consumed twice. The same law
 * implementations run (a) in the hub bundle for client-side pre-flight and
 * (b) in the api (and later CI/prebuild) as the corpus gates. A gate that
 * exists only in the UI is a lie, and a gate that exists only in CI is a
 * bad surprise; both directions are the EDX-2 shape in miniature (ADR §8).
 * Zero runtime dependencies, pure functions — the hub imports this into
 * the client bundle; the api imports the same file server-side.
 *
 * The law families of record (ADR §8), each a typed refusal with a stable
 * editor-readable code, the offending field, and the smallest corrective
 * hint:
 *
 *   G-CANON  — content canon (rendering-of-record rules for markdown/KaTeX
 *              field content: delimiter balance, markup hygiene)
 *   G-SER    — the serialization law (no trailing whitespace/newline, no
 *              tab characters — the corpus file law at field granularity)
 *   G-FIELD  — per-field shape laws (required content, marks grammar,
 *              isCorrect grammar)
 *   G-CHAR   — the PUA/control-character ban (the EDX-2 detector: the
 *              RN-DEBRIS-11 corruption class was invisible padding)
 *   G-ASSET  — asset-byte references must resolve (the dangling-image
 *              class the site-wide crawl caught); advisory when no asset
 *              index is supplied, refusal when one is
 *   G-EYES   — the four-eyes predicate (author id ≠ approver id), exported
 *              for the Phase 3 review route and pinned here by test
 *   G-SCOPE  — tier bounds: a Tier 3-shaped delta is REFUSED, never
 *              reclassified (ADR §6/§12); non-canonical field paths and
 *              out-of-range part/choice references are structural work
 *
 * The tier classifier is mechanical by law (ADR §6: "the classifier's
 * boundary tests are part of the gate engine's own test suite, so a
 * misclassification is a bug with a failing test, not a judgment call"):
 *
 *   Tier 3 (structural) — a non-canonical field path, or a part/choice
 *     reference outside the supplied base context: the Workbench refuses
 *     to carry it (disclosed hand-off to the lane process).
 *   Tier 2 (content-bearing) — any token-content change on a prose field
 *     (the alphanumeric token multiset of before ≠ after), or any edit to
 *     a content-bearing field (marks, commandWord, isCorrect).
 *   Tier 1 (typography/formatting) — every field delta is a cosmetic-only
 *     transform (KaTeX spacing, punctuation, markup hygiene, whitespace):
 *     the token multiset is preserved (the T-OEQ-PHYS-FORMAT-1 domain).
 *     Anything the classifier cannot pin to Tier 1 with a test defaults
 *     UP to Tier 2 — the four-eyes default (ADR §12).
 *
 * Disclosure law (the reference MVP carried into this build): the Phase 2
 * merge transport is SIMULATED — this engine classifies and refuses; it
 * never writes the corpus, and nothing user-visible changes until Phase 3
 * wires the real PR transport + census-guard serve (ADR §2 E-0, §9).
 */

// ── the typed refusal plane ──────────────────────────────────────────────────

export const GATE_FAMILIES = [
  "G-CANON",
  "G-SER",
  "G-FIELD",
  "G-CHAR",
  "G-ASSET",
  "G-EYES",
  "G-SCOPE",
] as const;
export type GateFamily = (typeof GATE_FAMILIES)[number];

export interface GateRefusal {
  /** Stable editor-readable code, e.g. G-CHAR-PUA. Never repurpose a code. */
  code: string;
  family: GateFamily;
  /** The offending field path (null for proposal-level refusals). */
  field: string | null;
  message: string;
  /** The smallest corrective hint — one sentence, editor-readable. */
  hint: string;
}

export interface GateWarning {
  code: string;
  field: string | null;
  message: string;
}

// ── the canonical field grammar (the QuestionPart shape of record) ───────────

/**
 * The canonical editable field paths, derived from the served question
 * shape (hub contracts ExamQuestion/QuestionPart — the field grammar of
 * record, ADR §6 step 1: structured edit mode over canonical fields):
 *
 *   parts[N].problemMd              — the part's question text (required)
 *   parts[N].solutionMd             — the worked answer (nullable — may clear)
 *   parts[N].marks                  — the part mark count (integer)
 *   parts[N].commandWord            — the command word (nullable)
 *   parts[N].choices[L].textMd      — MCQ option text (required)
 *   parts[N].choices[L].isCorrect   — the answer-key flag (true|false)
 *
 * N is the part ORDER (0-based, the served array order); L is the choice
 * label A–F. Anything else is non-canonical (structural, G-SCOPE).
 */
const FIELD_PATH_RE = /^parts\[(\d+)\]\.(problemMd|solutionMd|marks|commandWord)$/;
const CHOICE_PATH_RE = /^parts\[(\d+)\]\.choices\[([A-F])\]\.(textMd|isCorrect)$/;

const REQUIRED_PROSE_FIELDS = new Set(["problemMd", "textMd"]);
/** Fields whose edit is content-bearing by identity (ADR §6 Tier 2 class). */
const CONTENT_BEARING_FIELDS = new Set(["marks", "commandWord", "isCorrect"]);
const PROSE_FIELDS = new Set(["problemMd", "solutionMd", "textMd"]);

export interface FieldDelta {
  field: string;
  before: string;
  after: string;
}

/** Base-shape context the client derives from the SERVED artifact (the hub
 * renders the served question; the base counts ride from there). Advisory
 * data, not classification — the server re-runs the same engine over the
 * same delta (the client's tier is advisory, never authoritative, ADR §6). */
export interface BaseContext {
  /** The served question's part count — references beyond it are structural. */
  partCount?: number;
  /** part index (as string) → the served choice labels. */
  choiceLabels?: Record<string, string[]>;
  /** The asset paths of record for the bank — dangling image refs refuse. */
  assetPaths?: string[];
}

export interface PreflightInput {
  bank: string;
  targetPath?: string;
  fields: FieldDelta[];
  baseCtx?: BaseContext;
}

export interface PreflightVerdict {
  /** true = no refusals AND tier ≤ 2 (a Tier 3 verdict is never ok). */
  ok: boolean;
  /** null only when a structural refusal stopped the classification. */
  tier: 1 | 2 | 3 | null;
  tierReasons: string[];
  refusals: GateRefusal[];
  warnings: GateWarning[];
  disclosure: string;
}

// ── the G-EYES predicate (the four-eyes law, ADR §6/§8) ──────────────────────

/** Author-independence: the proposal author can never approve their own
 * proposal. Exported as the predicate + the refusal of record so the Phase
 * 3 review route composes the SAME law (single-module: no drift possible). */
export const G_EYES_SELF_APPROVE: GateRefusal = {
  code: "G-EYES-SELF-APPROVE",
  family: "G-EYES",
  field: null,
  message: "the proposal author cannot approve their own proposal (four-eyes law)",
  hint: "a second, distinct editor must review Tier 2 proposals (Phase 3 wires the review queue)",
};

export function canSelfApprove(authorId: string, approverId: string): boolean {
  return authorId === approverId;
}

// ── the tier classifier (mechanical; boundary tests pin every rule) ──────────

export interface FieldClassification {
  field: string;
  /** null when the field is non-canonical (structural). */
  canonical: boolean;
  /** true when the after-value preserves the alphanumeric token multiset. */
  cosmeticOnly: boolean;
  contentBearing: boolean;
}

/** Strip everything the Tier 1 class is allowed to touch (KaTeX spacing,
 * punctuation, markup-hygiene characters, whitespace) and compare the
 * remaining alphanumeric token multisets. Equal multisets = the edit can
 * only have moved spacing/punctuation/markup — typography, not content. */
export function cosmeticOnlyTransform(before: string, after: string): boolean {
  const strip = (s: string): string[] =>
    s
      .replace(/\\[$,;:!]/g, " ")
      .replace(/\\quad\b|\\qquad\b|\\enspace\b|\\,|\\;/g, " ")
      .replace(/[.,;:!?"'`(){}\[\]—–…\/\\*·•~=<>|+#%^&_-]/g, " ")
      .replace(/[*`~]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .sort();
  const a = strip(before);
  const b = strip(after);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function classifyFields(fields: FieldDelta[], baseCtx?: BaseContext): {
  perField: FieldClassification[];
  structural: GateRefusal[];
} {
  const perField: FieldClassification[] = [];
  const structural: GateRefusal[] = [];
  for (const d of fields) {
    const fieldMatch = FIELD_PATH_RE.exec(d.field);
    const choiceMatch = CHOICE_PATH_RE.exec(d.field);
    const m = fieldMatch ?? choiceMatch;
    if (!m) {
      perField.push({ field: d.field, canonical: false, cosmeticOnly: false, contentBearing: false });
      structural.push({
        code: "G-SCOPE-TIER3-STRUCTURAL",
        family: "G-SCOPE",
        field: d.field,
        message: `"${d.field}" is outside the canonical field grammar — the Workbench refuses to carry structural edits`,
        hint: "file a lane preregistration instead (the lane pipeline owns structural corpus surgery — ADR §4/§6)",
      });
      continue;
    }
    const partIndex = Number(m[1] ?? "0");
    if (baseCtx?.partCount !== undefined && partIndex >= baseCtx.partCount) {
      perField.push({ field: d.field, canonical: false, cosmeticOnly: false, contentBearing: false });
      structural.push({
        code: "G-SCOPE-TIER3-STRUCTURAL",
        family: "G-SCOPE",
        field: d.field,
        message: `part index ${partIndex} is outside the served question (${baseCtx.partCount} parts) — adding or removing parts is structural`,
        hint: "file a lane preregistration instead (the lane pipeline owns structural corpus surgery — ADR §4/§6)",
      });
      continue;
    }
    // for choice paths group 2 is the LABEL; field paths have no label group
    const choiceLabel = choiceMatch ? (choiceMatch[2] ?? null) : null;
    if (choiceLabel && baseCtx?.choiceLabels?.[String(partIndex)]) {
      const served = baseCtx.choiceLabels[String(partIndex)] ?? [];
      if (!served.includes(choiceLabel)) {
        perField.push({ field: d.field, canonical: false, cosmeticOnly: false, contentBearing: false });
        structural.push({
          code: "G-SCOPE-TIER3-STRUCTURAL",
          family: "G-SCOPE",
          field: d.field,
          message: `choice "${choiceLabel}" does not exist on part ${partIndex} of the served question — adding or removing choices is structural`,
          hint: "file a lane preregistration instead (the lane pipeline owns structural corpus surgery — ADR §4/§6)",
        });
        continue;
      }
    }
    const leaf = leafOf(d.field);
    const isContent = CONTENT_BEARING_FIELDS.has(leaf);
    perField.push({
      field: d.field,
      canonical: true,
      cosmeticOnly: PROSE_FIELDS.has(leaf) ? cosmeticOnlyTransform(d.before, d.after) : false,
      contentBearing: isContent,
    });
  }
  return { perField, structural };
}

/** The leaf field name of a canonical path (problemMd/solutionMd/marks/
 * commandWord for part paths; textMd/isCorrect for choice paths). */
function leafOf(field: string): string {
  const c = CHOICE_PATH_RE.exec(field);
  if (c) return c[3] ?? "";
  return FIELD_PATH_RE.exec(field)?.[2] ?? "";
}

function CHOIX_LABEL(field: string): string | null {
  const m = CHOICE_PATH_RE.exec(field);
  return m?.[2] ?? null;
}

// ── the value gates (run against every after-value) ──────────────────────────

const PUA_OR_CONTROL_RE =
  /[\uE000-\uF8FF]|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

function katexDelimiterBalance(s: string): { balanced: boolean; detail: string } {
  const stripped = s.replace(/\\\$/g, "");
  const dollars = (stripped.match(/\$/g) ?? []).length;
  if (dollars % 2 !== 0) {
    return { balanced: false, detail: `${dollars} unpaired "$" delimiter(s)` };
  }
  const openParen = (stripped.match(/\\\(/g) ?? []).length;
  const closeParen = (stripped.match(/\\\)/g) ?? []).length;
  if (openParen !== closeParen) {
    return { balanced: false, detail: `\\( count ${openParen} ≠ \\) count ${closeParen}` };
  }
  const openBracket = (stripped.match(/\\\[/g) ?? []).length;
  const closeBracket = (stripped.match(/\\\]/g) ?? []).length;
  if (openBracket !== closeBracket) {
    return { balanced: false, detail: `\\[ count ${openBracket} ≠ \\] count ${closeBracket}` };
  }
  return { balanced: true, detail: "" };
}

function assetRefs(s: string): string[] {
  const refs: string[] = [];
  for (const m of s.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (m[1]) refs.push(m[1]);
  }
  return refs;
}

function valueGates(d: FieldDelta, baseCtx?: BaseContext): { refusals: GateRefusal[]; warnings: GateWarning[] } {
  const refusals: GateRefusal[] = [];
  const warnings: GateWarning[] = [];
  const after = d.after;
  const leaf = d.field.replace(/^parts\[\d+\]\.choices\[[A-F]\]\./, "").replace(/^parts\[\d+\]\./, "");

  // G-SER — the serialization law at field granularity
  if (/[ \t\n\r]+$/.test(after)) {
    refusals.push({
      code: "G-SER-TRAILING-NEWLINE",
      family: "G-SER",
      field: d.field,
      message: "the value ends with trailing whitespace or a newline",
      hint: "trim the trailing whitespace — the corpus serialization law forbids it (G-SER)",
    });
  }
  if (after.includes("\t")) {
    refusals.push({
      code: "G-SER-TAB-CHARACTER",
      family: "G-SER",
      field: d.field,
      message: "the value contains a tab character",
      hint: "replace the tab with spaces — tabs never survive the corpus serialization law (G-SER)",
    });
  }
  if (after.includes("\n") !== d.before.includes("\n")) {
    warnings.push({
      code: "G-SER-NEWLINE-DRIFT",
      field: d.field,
      message:
        "the edit adds or removes line breaks — corpus prose fields are single-line markdown cells; keep the field on one line unless the corpus already breaks it",
    });
  }

  // G-CHAR — the PUA/control-character ban (the EDX-2 detector)
  const pua = after.match(PUA_OR_CONTROL_RE);
  if (pua) {
    refusals.push({
      code: "G-CHAR-PUA",
      family: "G-CHAR",
      field: d.field,
      message: `the value contains a private-use or control character (U+${pua[0]
        ?.codePointAt(0)
        ?.toString(16)
        .toUpperCase()
        .padStart(4, "0")}) — the EDX-2 corruption class`,
      hint: "delete the invisible character and retype the character you meant (often a pasted glyph)",
    });
  }

  // G-CANON — rendering-of-record rules for markdown/KaTeX content
  if (PROSE_FIELDS.has(leaf)) {
    const katex = katexDelimiterBalance(after);
    if (!katex.balanced) {
      refusals.push({
        code: "G-CANON-KATEX-BALANCE",
        family: "G-CANON",
        field: d.field,
        message: `unbalanced KaTeX delimiters: ${katex.detail}`,
        hint: "pair every $…$ (and \\(…\\) / \\[…\\]) — the renderer requires balanced math delimiters",
      });
    }
    const bold = (after.match(/\*\*/g) ?? []).length;
    if (bold % 2 !== 0) {
      refusals.push({
        code: "G-CANON-MARKUP-HYGIENE",
        family: "G-CANON",
        field: d.field,
        message: "unpaired ** emphasis markers",
        hint: "close every **bold** span or remove the stray **",
      });
    }
    const ticks = (after.match(/`/g) ?? []).length;
    if (ticks % 2 !== 0) {
      refusals.push({
        code: "G-CANON-MARKUP-HYGIENE",
        family: "G-CANON",
        field: d.field,
        message: "unpaired ` code markers",
        hint: "close every `code` span or remove the stray backtick",
      });
    }
    if (/<\/?(b|i|u|sub|sup|br|div|span|p|font)[\s>/]/i.test(after)) {
      refusals.push({
        code: "G-CANON-MARKUP-HYGIENE",
        family: "G-CANON",
        field: d.field,
        message: "raw HTML tags in markdown content",
        hint: "use markdown (emphasis, lists) — raw HTML never survives the rendering-of-record rules",
      });
    }
  }

  // G-FIELD — per-field shape laws
  if (REQUIRED_PROSE_FIELDS.has(leaf) && after.trim() === "") {
    refusals.push({
      code: "G-FIELD-EMPTY-REQUIRED",
      family: "G-FIELD",
      field: d.field,
      message: `"${leaf}" is required content and cannot be emptied`,
      hint: "restore the text — clear a field only where the schema makes it nullable (solutionMd, commandWord)",
    });
  }
  if (leaf === "marks" && !/^\d+$/.test(after)) {
    refusals.push({
      code: "G-FIELD-MARKS-GRAMMAR",
      family: "G-FIELD",
      field: d.field,
      message: `"${after}" is not a non-negative integer — marks are whole numbers`,
      hint: "write the mark count as digits (e.g. 2); mark totals drive the MA-4 tiling checks",
    });
  }
  if (leaf === "isCorrect" && after !== "true" && after !== "false") {
    refusals.push({
      code: "G-FIELD-ISCORRECT-GRAMMAR",
      family: "G-FIELD",
      field: d.field,
      message: `"${after}" is not an answer-key flag — isCorrect is exactly true or false`,
      hint: "use true for the keyed option, false for the distractors",
    });
  }

  // G-ASSET — asset-byte references must resolve (dangling-image class)
  for (const ref of assetRefs(after)) {
    const normalized = ref.replace(/^\.\//, "");
    if (baseCtx?.assetPaths) {
      if (!baseCtx.assetPaths.includes(normalized)) {
        refusals.push({
          code: "G-ASSET-DANGLING",
          family: "G-ASSET",
          field: d.field,
          message: `asset reference "${ref}" does not resolve in the bank's asset index`,
          hint: "reference an existing asset path, or drop the image — dangling refs are the crawl-caught class",
        });
      }
    } else {
      warnings.push({
        code: "G-ASSET-UNVERIFIED",
        field: d.field,
        message: `asset reference "${ref}" could not be verified (no asset index supplied) — check the path resolves in the bank before proposing`,
      });
    }
  }

  return { refusals, warnings };
}

// ── the preflight run (the stateless gate engine entry point) ────────────────

export const PREFLIGHT_DISCLOSURE =
  "Phase 2 pre-flight is advisory-only: the same engine re-runs server-side at propose time, and Tier 1 auto-merge stays simulated until Phase 3 wires the real PR transport (ADR-044 §9).";

export function runPreflight(input: PreflightInput): PreflightVerdict {
  const refusals: GateRefusal[] = [];
  const warnings: GateWarning[] = [];
  const tierReasons: string[] = [];

  const { perField, structural } = classifyFields(input.fields, input.baseCtx);
  refusals.push(...structural);

  if (structural.length > 0) {
    // G-SCOPE law: a Tier 3-shaped delta is refused, not reclassified.
    return {
      ok: false,
      tier: 3,
      tierReasons: ["structural shape: the field grammar or the base context places this delta in Tier 3"],
      refusals,
      warnings,
      disclosure:
        "Tier 3 is closed from the Workbench by law (ADR-044 §6): the classification is disclosed and the proposal is not carried. File a lane preregistration instead.",
    };
  }

  for (const d of input.fields) {
    const { refusals: r, warnings: w } = valueGates(d, input.baseCtx);
    refusals.push(...r);
    warnings.push(...w);
  }

  let tier: 1 | 2;
  const tokenChanges = perField.filter((f) => f.canonical && !f.cosmeticOnly && PROSE_FIELD_NAME(f.field));
  const contentFields = perField.filter((f) => f.contentBearing);
  if (contentFields.length > 0) {
    tier = 2;
    tierReasons.push(
      `content-bearing field edit (${contentFields.map((f) => f.field).join(", ")}) — four-eyes territory (ADR §6 Tier 2)`,
    );
  } else if (tokenChanges.length > 0) {
    tier = 2;
    tierReasons.push(
      `token content changes on ${tokenChanges.map((f) => f.field).join(", ")} — a prose edit that is not cosmetic-only classifies Tier 2 (the four-eyes default)`,
    );
  } else {
    tier = 1;
    tierReasons.push("every field delta preserves the alphanumeric token multiset — typography/formatting only (ADR §6 Tier 1)");
  }

  return {
    ok: refusals.length === 0,
    tier,
    tierReasons,
    refusals,
    warnings,
    disclosure: PREFLIGHT_DISCLOSURE,
  };
}

function PROSE_FIELD_NAME(field: string): boolean {
  const leaf = field.replace(/^parts\[\d+\]\.choices\[[A-F]\]\./, "").replace(/^parts\[\d+\]\./, "");
  return PROSE_FIELDS.has(leaf);
}

// ── the engine version of record (rides every receipt's gate_run_id) ─────────

export const EDITOR_GATES_VERSION = "editor-gates@1.0.0-run011";
