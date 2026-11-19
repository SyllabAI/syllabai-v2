/**
 * Typed facade over the chunking law of record (guided-chunk-law.mjs — the
 * plain-.mjs single source so the import runner (node) and this module can
 * never drift). The renderer, tests and the census all import from here.
 */
export {
  KP_PAIR_WORD_BUDGET,
  BEAT_WORD_BUDGET,
  FIGURE_FRAME_WORD_BUDGET,
  wordCount,
  keyPointGroups,
  practiceTokens,
  mapChecksToGroups,
  validateChunkLaw,
} from "./guided-chunk-law.mjs";
