/**
 * Questions module barrel (T-MIG-031 tranche 1) — the servable-question read
 * model cluster: ServableQuestions (one-owner boundary + V20 paper gate),
 * QuestionFamilyAssembler (whole-question reassembly), QuestionTaxonomy
 * (sidebar census), MarkSchemeReveal (policy-gated reveal). Routes wire
 * these at tranche-2.
 */
import type { SqlFn } from "./sql";
import { QuestionFamilyAssembler } from "./families";
import { ServableQuestions } from "./servable";
import { QuestionTaxonomy } from "./taxonomy";
import { MarkSchemeReveal, parseRevealPolicy } from "./reveal";

export type { SqlFn } from "./sql";
export { QuestionFamilyAssembler, compareSource } from "./families";
export { ServableQuestions, isServable } from "./servable";
export { QuestionTaxonomy } from "./taxonomy";
export { MarkSchemeReveal, parseRevealPolicy } from "./reveal";
export type { RevealPolicy } from "./reveal";

export interface QuestionsModule {
  servable: ServableQuestions;
  families: QuestionFamilyAssembler;
  taxonomy: QuestionTaxonomy;
  reveal: MarkSchemeReveal;
}

/**
 * Module factory — the composition root injects the sql adapter and the raw
 * reveal-policy env value (fail-fast parse at construction, mirroring the
 * frozen @Value + valueOf boot law).
 */
export function buildQuestionsModule(
  sql: SqlFn,
  revealPolicyRaw: string | undefined | null,
): QuestionsModule {
  const servable = new ServableQuestions(sql);
  const families = new QuestionFamilyAssembler();
  const taxonomy = new QuestionTaxonomy(sql, servable, families);
  const reveal = new MarkSchemeReveal(sql, servable, parseRevealPolicy(revealPolicyRaw));
  return { servable, families, taxonomy, reveal };
}
