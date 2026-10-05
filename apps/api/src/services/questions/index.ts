/**
 * Questions module barrel (T-MIG-031 tranche 1) — the servable-question read
 * model cluster: ServableQuestions (one-owner boundary + V20 paper gate),
 * QuestionFamilyAssembler (whole-question reassembly), QuestionTaxonomy
 * (sidebar census), MarkSchemeReveal (policy-gated reveal). Routes wire
 * these at tranche-2.
 *
 * Tranche-2 addition (fence-internal, disclosed): QuestionsModule exposes
 * the composition methods the frozen QuestionController actually calls —
 * ServableQuestionService.familiesByTopic / familiesWithin / allFamilies
 * (:95-107, thin `families.assemble(<list>)` wrappers) and
 * KnowledgeGraphService.subtreeIds via taxonomy.subtreeIds (the 404-first
 * root resolver list/families/topics share). The route layer stays a thin
 * binding shell exactly like the frozen controller.
 */
import type { QuestionFamilyView } from "@syllabai/contracts";
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
  /** KnowledgeGraphService.subtreeIds port (404-first root resolution). */
  subtreeIds(rootId: string): Promise<string[]>;
  /** ServableQuestionService.allFamilies (:105-107). */
  allFamilies(): Promise<QuestionFamilyView[]>;
  /** ServableQuestionService.familiesByTopic (:95-99). */
  familiesByTopic(topicNodeId: string): Promise<QuestionFamilyView[]>;
  /** ServableQuestionService.familiesWithin (:100-104) — node ids already
   * resolved (the controller resolves the subtree on the rootId path). */
  familiesWithin(nodeIds: string[]): Promise<QuestionFamilyView[]>;
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
  return {
    servable,
    families,
    taxonomy,
    reveal,
    subtreeIds: (rootId) => taxonomy.subtreeIds(rootId),
    allFamilies: async () => families.assemble(await servable.allActive()),
    familiesByTopic: async (topicNodeId) =>
      families.assemble(await servable.activeByTopic(topicNodeId)),
    familiesWithin: async (nodeIds) =>
      families.assemble(await servable.activeWithin(nodeIds)),
  };
}
