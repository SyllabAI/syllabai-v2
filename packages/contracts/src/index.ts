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
export * from "./curriculum";
export * from "./errors";
