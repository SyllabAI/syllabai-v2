/**
 * PARITY CANONICAL moved to @syllabai/shared (T-MIG-011).
 *
 * This file is now a re-export shim: every hub call site (ChatMarkdown,
 * QuestionMarkdown, tutor/CLA surfaces) keeps importing "@/lib/mathNormalize"
 * but receives THE ONE implementation that both sides of the api/hub
 * boundary share — packages/shared/src/mathNormalize.ts, lifted
 * BYTE-IDENTICAL from this file at the T-MIG-011 lift point (syllabai-hub
 * @ 93226a43 lineage). Behaviour pins live next to the canonical copy
 * (packages/shared/src/mathNormalize.test.ts).
 */
export { hasMathCommand, normalizeMathDelimiters } from "@syllabai/shared";
