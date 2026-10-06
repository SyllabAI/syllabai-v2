/**
 * SME question-bank package contracts — port of SmeQuestionPackageDtos.java
 * (:15-94 @ 6cad6ef) plus the response records the SME admin controller
 * serves (SmeQuestionAdminController.BankStatusView :55-61; IngestSummary
 * lives in the DTO tree :81-93). T-MIG-054 (salvaged from the closed T-MIG-033 tranche-3 duplicate PR #78; comment-only renumber per the T-MIG-049 mechanics).
 *
 * Jackson binding semantics mirrored (the ingest parses package.json with a
 * plain ObjectMapper — SmeQuestionIngestService.java :103, :618-624):
 *
 *   - @JsonIgnoreProperties(ignoreUnknown = true) on every record
 *     → `.passthrough()` everywhere: unknown JSON properties are ignored so
 *       the package format can grow additively (class javadoc :12-13).
 *   - absent PRIMITIVE components bind as Java primitive defaults
 *     (int → 0, boolean → false); absent OBJECT components bind null.
 *     The schemas stay ADDITIVE (optional fields), NOT stricter — the
 *     fail-closed laws live in the ingest validate() port, which turns the
 *     primitive defaults into the verbatim 400s exactly like Java
 *     (:437-559, e.g. marks absent → 0 → "bad marks/difficulty/time on X").
 *   - a zod schema FAILURE (wrong JSON type where Jackson would fail to
 *     bind) maps to the same 400 envelope the service throws for a
 *     JsonMappingException: "package.json is not valid sme-question-package
 *     JSON" (SmeQuestionIngestService :620-624). Binding-failure class, not
 *     a new law.
 *
 * Java-primitive int coercion nuance (disclosed): Jackson also coerces
 * numeric strings ("5" → 5); the schemas require real JSON numbers — a
 * hand-crafted package relying on string coercion gets the binding-failure
 * 400 instead of passing. Fail-closed direction; the production builder
 * (scripts/s104_build_question_package.py) always emits real numbers.
 */
import { z } from "zod";

// ── package DTO tree (SmeQuestionPackageDtos :20-78) ────────────────────────

/** :52-56 — code + role (PRIMARY|SECONDARY) + provenance, validated :521-528. */
export const smeSpecPointSchema = z
  .object({
    code: z.string().nullish(),
    role: z.string().nullish(),
    provenance: z.string().nullish(),
  })
  .passthrough();
export type SmeSpecPoint = z.infer<typeof smeSpecPointSchema>;

/** :58-63 — MCQ option; isCorrect is a Java primitive boolean (absent → false). */
export const smeOptionSchema = z
  .object({
    label: z.string().nullish(),
    text: z.string().nullish(),
    isCorrect: z.boolean().optional(),
  })
  .passthrough();
export type SmeOption = z.infer<typeof smeOptionSchema>;

/**
 * :65-78 — structured part; the ADR-026 layer-3 amendment (:72-77) lets a
 * part carry its own options — an option-bearing part inside a STRUCTURED
 * question makes it MIXED (the -pN/-s multi-row family emission).
 */
export const smePartSchema = z
  .object({
    label: z.string().nullish(),
    prompt: z.string().nullish(),
    marks: z.number().int().optional(),
    commandWord: z.string().nullish(),
    solutionMd: z.string().nullish(),
    options: z.array(smeOptionSchema).nullish(),
  })
  .passthrough();
export type SmePart = z.infer<typeof smePartSchema>;

/** :30-49 — one corpus question; questionType: MCQ_SINGLE | STRUCTURED. */
export const smeQuestionSchema = z
  .object({
    externalRef: z.string().nullish(),
    questionType: z.string().nullish(),
    stem: z.string().nullish(),
    marks: z.number().int().optional(),
    difficulty: z.number().int().optional(),
    difficultySource: z.string().nullish(),
    expectedTimeSeconds: z.number().int().optional(),
    commandWord: z.string().nullish(),
    primaryTopicCode: z.string().nullish(),
    secondaryTopicCodes: z.array(z.string()).nullish(),
    specPoints: z.array(smeSpecPointSchema).nullish(),
    sourcePaper: z.record(z.unknown()).nullish(),
    smeSet: z.string().nullish(),
    smeDifficulty: z.string().nullish(),
    options: z.array(smeOptionSchema).nullish(),
    solutionMd: z.string().nullish(),
    parts: z.array(smePartSchema).nullish(),
  })
  .passthrough();
export type SmeQuestion = z.infer<typeof smeQuestionSchema>;

/** :20-28 — the sme-question-package/1.0 envelope. */
export const smePackageSchema = z
  .object({
    packageVersion: z.string().nullish(),
    corpusVersion: z.string().nullish(),
    generatedAt: z.string().nullish(),
    source: z.string().nullish(),
    counts: z.record(z.number().int()).nullish(),
    questions: z.array(smeQuestionSchema).nullish(),
  })
  .passthrough();
export type SmePackage = z.infer<typeof smePackageSchema>;

// ── response records (controller + DTO tree) ───────────────────────────────

/** IngestSummary :80-93 — the ADR-026 replace receipt (corpusVersion nullable). */
export const smeIngestSummarySchema = z.object({
  questions: z.number().int(),
  mcq: z.number().int(),
  structured: z.number().int(),
  parts: z.number().int(),
  options: z.number().int(),
  markPoints: z.number().int(),
  specPointMappings: z.number().int(),
  topicMappings: z.number().int(),
  assets: z.number().int(),
  deactivated: z.number().int(),
  corpusVersion: z.string().nullable(),
});
export type SmeIngestSummary = z.infer<typeof smeIngestSummarySchema>;

/** BankStatusView (SmeQuestionAdminController :55-61) — the live bank snapshot. */
export const smeBankStatusSchema = z.object({
  activeQuestions: z.number(),
  activeMcq: z.number(),
  activeStructured: z.number(),
  specPointMappings: z.number(),
  assets: z.number(),
});
export type SmeBankStatus = z.infer<typeof smeBankStatusSchema>;
