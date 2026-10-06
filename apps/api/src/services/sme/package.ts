/**
 * SME question-package DTO tree + parser — port of
 * com.syllabai.sme.SmeQuestionPackageDtos (frozen @ 6cad6ef), the
 * sme-question-package/1.0 envelope produced by
 * scripts/s104_build_question_package.py (syllabai-resources).
 *
 * Parser parity (Jackson readValue into the @JsonIgnoreProperties records):
 *   - unknown JSON properties are IGNORED (the format grows additively);
 *   - a missing record component binds as null (objects/lists) or the
 *     primitive default 0/false (marks, difficulty, isCorrect, …) — the
 *     ingest's fail-closed validate() is what rejects zeroed primitives;
 *   - a TYPE mismatch (object where a string belongs, a word where an int
 *     belongs, a scalar where a list belongs) is an IOException in Jackson
 *     → the service translates it to
 *     "package.json is not valid sme-question-package JSON" (BadRequest).
 *
 * Coercion note (disclosed in the claim receipt): Jackson 2.x coerces
 * numeric STRINGS to ints and numbers to strings by default; the port
 * replicates those two benign coercions and nothing else. Packages are
 * machine-generated (always typed JSON), so no real corpus exercises the
 * narrower corners.
 */

export const NOT_VALID_PACKAGE_JSON = "package.json is not valid sme-question-package JSON";

export interface SmeSpecPoint {
  code: string | null;
  role: string | null;
  provenance: string | null;
}

export interface SmeOption {
  label: string | null;
  text: string | null;
  isCorrect: boolean;
}

export interface SmePart {
  label: string | null;
  prompt: string | null;
  marks: number;
  commandWord: string | null;
  solutionMd: string | null;
  /** ADR-026 amendment: option-bearing parts make a STRUCTURED question MIXED */
  options: SmeOption[] | null;
}

export interface SmeQuestion {
  externalRef: string | null;
  /** MCQ_SINGLE | STRUCTURED */
  questionType: string | null;
  stem: string | null;
  marks: number;
  /** 1–5 */
  difficulty: number;
  /** "SME" */
  difficultySource: string | null;
  expectedTimeSeconds: number;
  commandWord: string | null;
  /** KG node code, e.g. 4CH1-S1-c */
  primaryTopicCode: string | null;
  secondaryTopicCodes: string[] | null;
  specPoints: SmeSpecPoint[] | null;
  sourcePaper: Record<string, unknown> | null;
  smeSet: string | null;
  smeDifficulty: string | null;
  options: SmeOption[] | null;
  solutionMd: string | null;
  parts: SmePart[] | null;
}

export interface SmePackage {
  packageVersion: string | null;
  corpusVersion: string | null;
  generatedAt: string | null;
  source: string | null;
  counts: Record<string, number> | null;
  questions: SmeQuestion[] | null;
}

export interface SmeIngestSummary {
  questions: number;
  mcq: number;
  structured: number;
  parts: number;
  options: number;
  markPoints: number;
  specPointMappings: number;
  topicMappings: number;
  assets: number;
  deactivated: number;
  corpusVersion: string | null;
}

// ── parsing (Jackson readValue parity, fail-closed) ─────────────────────────

export class PackageFormatError extends Error {}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v); // Jackson coercion
  throw new PackageFormatError("expected string");
}

function integer(v: unknown): number {
  if (v === undefined || v === null) return 0; // Jackson primitive default
  if (typeof v === "number") {
    if (!Number.isInteger(v)) throw new PackageFormatError("expected int");
    return v;
  }
  if (typeof v === "string" && v.trim() !== "" && Number.isInteger(Number(v))) {
    return Number(v); // Jackson numeric-string coercion
  }
  throw new PackageFormatError("expected int");
}

function boolean(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  throw new PackageFormatError("expected boolean");
}

function list(v: unknown): unknown[] | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v;
  throw new PackageFormatError("expected array");
}

function parseOption(v: unknown): SmeOption {
  if (!isObj(v)) throw new PackageFormatError("expected option object");
  return { label: str(v.label), text: str(v.text), isCorrect: boolean(v.isCorrect) };
}

function parseOptions(v: unknown): SmeOption[] | null {
  const items = list(v);
  return items === null ? null : items.map(parseOption);
}

function parseSpecPoint(v: unknown): SmeSpecPoint {
  if (!isObj(v)) throw new PackageFormatError("expected spec point object");
  return { code: str(v.code), role: str(v.role), provenance: str(v.provenance) };
}

function parsePart(v: unknown): SmePart {
  if (!isObj(v)) throw new PackageFormatError("expected part object");
  return {
    label: str(v.label),
    prompt: str(v.prompt),
    marks: integer(v.marks),
    commandWord: str(v.commandWord),
    solutionMd: str(v.solutionMd),
    options: parseOptions(v.options),
  };
}

function parseQuestion(v: unknown): SmeQuestion {
  if (!isObj(v)) throw new PackageFormatError("expected question object");
  const secondary = list(v.secondaryTopicCodes);
  return {
    externalRef: str(v.externalRef),
    questionType: str(v.questionType),
    stem: str(v.stem),
    marks: integer(v.marks),
    difficulty: integer(v.difficulty),
    difficultySource: str(v.difficultySource),
    expectedTimeSeconds: integer(v.expectedTimeSeconds),
    commandWord: str(v.commandWord),
    primaryTopicCode: str(v.primaryTopicCode),
    secondaryTopicCodes:
      secondary === null ? null : secondary.map((t) => {
        const s = str(t);
        if (s === null) throw new PackageFormatError("expected topic code");
        return s;
      }),
    specPoints: list(v.specPoints)?.map(parseSpecPoint) ?? null,
    sourcePaper: isObj(v.sourcePaper) ? (v.sourcePaper as Record<string, unknown>) : null,
    smeSet: str(v.smeSet),
    smeDifficulty: str(v.smeDifficulty),
    options: parseOptions(v.options),
    solutionMd: str(v.solutionMd),
    parts: list(v.parts)?.map(parsePart) ?? null,
  };
}

/**
 * Jackson readValue(SmeQuestionPackageDtos.Package) parity: syntax and type
 * failures surface the service's not-valid-JSON BadRequest; the returned
 * tree carries the DTO's defaults for anything the JSON omitted.
 */
export function parsePackage(text: string): SmePackage {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (e) {
    if (e instanceof PackageFormatError) throw e;
    throw new PackageFormatError("invalid JSON document");
  }
  if (!isObj(root)) throw new PackageFormatError("expected package object");
  try {
    const counts = isObj(root.counts)
      ? Object.fromEntries(
          Object.entries(root.counts).map(([k, v]) => {
            if (typeof v !== "number" || !Number.isInteger(v)) {
              throw new PackageFormatError("expected counts map of ints");
            }
            return [k, v];
          }),
        )
      : null;
    return {
      packageVersion: str(root.packageVersion),
      corpusVersion: str(root.corpusVersion),
      generatedAt: str(root.generatedAt),
      source: str(root.source),
      counts,
      questions: list(root.questions)?.map(parseQuestion) ?? null,
    };
  } catch (e) {
    if (e instanceof PackageFormatError) throw e;
    throw new PackageFormatError("unexpected structure");
  }
}
