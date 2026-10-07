/**
 * @syllabai/contracts — the single source of API truth for the v2 platform.
 *
 * RULES (contracts-first, see docs/MIGRATION_PLAN.md §4):
 *
 * 1. Every schema here is a PORT of a Java DTO/record in
 *    syllabai-core/src/main/java/com/syllabai/**\/dto/*.java — constraints
 *    are copied EXACTLY (same max/min/regex), with a header comment naming
 *    the source file. When the Java record and this schema disagree, the
 *    Java record wins and this schema gets fixed — never the reverse.
 *
 * 2. Golden-master parity depends on this: the v2 api validates request
 *    bodies with the same rules the Java core enforces via
 *    jakarta.validation, so the same payload is accepted/rejected by both.
 *
 * 3. Never widen a schema to make a test pass. If a payload is rejected
 *    here but accepted by the Java core, that is a BUG in the schema port.
 */

export * from "./auth";
export * from "./content";
export * from "./content-writes";
export * from "./curriculum";
export * from "./errors";

export * from "./assessment";
export * from "./learner";
export * from "./decay";
export * from "./teacher-marking";
export * from "./sme-question-package";
export * from "./test-builder";
export * from "./transcription";
export * from "./learner-me";
export * from "./classroom"; // T-MIG-052 (r9-hubx) — Wave-5 classes+rosters wire (OUT-OF-FENCE-flagged one-liner, 010/034/043-t1 precedent)
export * from "./knowledge"; // T-MIG-053 (r3a) — Wave-5 KG+coverage wire, tranche-1 (OUT-OF-FENCE-flagged one-liner, 010/034/043-t1/052 precedent)
export * from "./tutor"; // T-MIG-060 (w0a) — Wave-6 tutor+sessions wire (same-lane contracts-first precedent 033/043/049)
export * from "./intervention"; // T-MIG-061 (r9-hubx) — Wave-6 intervention-run wire (OUT-OF-FENCE-flagged one-liner, 010/034/043-t1/052/053 precedent)
export * from "./teacher"; // T-MIG-053 (r3a) — Wave-5 teacher analytics+concept-graph wire, tranche-2 (OUT-OF-FENCE-flagged one-liner, 010/034/043-t1/052/053-t1 precedent)
export * from "./research"; // T-MIG-062 (R4-api-b) — Wave-6 research calibration wire (OUT-OF-FENCE-flagged one-liner, 010/034/043-t1/052/053/061 precedent)
export * from "./cla"; // T-MIG-069 (w0a, refiled from 067) — Wave-6 CLA wire (OUT-OF-FENCE-flagged one-liner, 010/034/043-t1/052/053/061/062 precedent)
export * from "./revision-notes"; // T-MIG-053 (r3a) — Wave-5 revision-notes wire, tranche-3 (OUT-OF-FENCE-flagged one-liner, 010/034/043-t1/052/053-t1/053-t2 precedent)
export * from "./ingestion"; // T-MIG-082 tranche B (R0) — the Fetch/Enumerate + glm-ocr bridge + exam-series import wire (OUT-OF-FENCE-flagged one-liner, 010/034/043-t1/052/053/061/062/069/revision-notes precedent)
