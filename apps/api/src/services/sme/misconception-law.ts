/**
 * T-TUTOR-AIM-P1 (DC10 §7.1): the misconception-tag law for MCQ options.
 *
 * The corpus-side half of the DC10 distractor law. The read side and the
 * model-update side predate this module (question_options.misconception_node_id
 * → assessment submit's expressedMisconceptionIds → learner-model
 * updateMisconceptions "wrong strengthens only the expressed distractor's;
 * an untagged wrong answer is ambiguous evidence and updates nothing") —
 * they were dormant because the SME ingest hard-coded the option tag to
 * null ("the corpus carries none"). This law retires that hardcode.
 *
 * The law, fail-closed, enforced in the apply flow BEFORE any option row is
 * written (the package is refused, never rewritten):
 *   L1 — a tag may ride a WRONG option only; a correct option carries no
 *        misconception (it does not express a wrong model);
 *   L2 — a wrong option's tag MUST resolve into the primary topic's
 *        misconception catalog (knowledge_nodes type MISCONCEPTION joined by
 *        knowledge_edges relation MISCONCEPTION_OF to the topic node);
 *   L3 — a wrong option WITHOUT a tag is refused when the topic's catalog is
 *        live — every distractor must name its node (DC10 §7.1: "a distractor
 *        that cannot name one is regenerated or cut"; at ingest, refused);
 *   L4 — a wrong option without a tag PASSES when the catalog carries no rows
 *        for the topic — there is nothing to name. Disclosed residual (the
 *        DC5 R-DC5-4 activation-law pattern): the catalog is progressive;
 *        untagged-ingest-because-no-catalog counts into the ingest summary's
 *        misconceptionUntaggedNoCatalog, observable per package.
 *
 * Pure module — no SQL; the resolution set is queried once per package by
 * the apply flow and passed in. Unit-pinned in test/sme/misconception-law.test.ts.
 */

import { BadRequestError } from "../selfmark";

export interface MisconceptionTaggedOption {
  readonly isCorrect: boolean;
  readonly misconceptionNodeId: string | null;
}

export function checkOptionMisconceptionTag(
  o: MisconceptionTaggedOption,
  ref: string,
  topicHasCatalog: boolean,
  topicCatalog: ReadonlySet<string>,
): void {
  // normalize: hand-constructed rows (tests, legacy callers) may leave the
  // field absent — the markPointRowsFor precedent; absent binds as null
  const tag = o.misconceptionNodeId ?? null;
  if (o.isCorrect) {
    // L1
    if (tag !== null) {
      throw new BadRequestError(
        `correct option of ${ref} carries a misconception tag ` +
          `(${tag}) — tags express wrong models only (DC10 §7.1 L1)`,
      );
    }
    return;
  }
  if (tag === null) {
    // L3 / L4
    if (topicHasCatalog) {
      throw new BadRequestError(
        `wrong option of ${ref} carries no misconception tag while the ` +
          `question's primary topic catalog carries ${topicCatalog.size} node(s) — ` +
          `every distractor must name its node (DC10 §7.1 L3)`,
      );
    }
    return;
  }
  // L2
  if (!topicCatalog.has(tag)) {
    throw new BadRequestError(
      `misconception tag ${tag} on ${ref} does not resolve ` +
        `into the primary topic's catalog (DC10 §7.1 L2)`,
    );
  }
}
