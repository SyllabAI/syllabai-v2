/**
 * Citation-debris strip — the chat answer-side render hygiene law
 * (T-MIG-130 run-010, operator trace 1a1458af5eed4b21 "hub math-render").
 *
 * Evidence (live capture, math-heavy grounded ask through the hub relay):
 * the serving model (openai/gpt-oss-120b via groq) can emit its INTERNAL
 * source markers — `【4†L1-L3】`-shaped spans (chunk index † line range) —
 * which are NOT the tutor's [n] citation markers and render as raw
 * CJK-bracket junk in the chat answer. Six spans leaked in the one captured
 * answer; the class is a model-emission property, not a corpus one.
 *
 * Layering law:
 *   - the API marker law (apps/api sanitize.ts CITATION_MARKER) correctly
 *     leaves these alone — it range-checks DIGIT-only markers, and the
 *     frozen-port discipline keeps that byte-faithful; the s22 record stays
 *     verbatim of record;
 *   - THIS law is the hub render boundary: the chat does not display the
 *     model's internal plumbing. Applied to assistant content before the
 *     math-delimiter normalizer in the tutor chat renderer.
 *
 * Precision: the match requires 【 digits † anything-but-】 】 — the measured
 * wire shape — so a legitimate fullwidth-bracket run (no exam-prose of
 * record carries one), a digit-only marker 【n】 (the API's range-checked
 * territory), and square-bracket [n] markers (the hub's chip territory)
 * never match. Leading whitespace collapses with the span so prose joints
 * stay clean; mid-word joints lose nothing (the debris never carries
 * leading content).
 */

const CITATION_DEBRIS = /\s*【\d{1,3}†[^】]*】/g;

export function stripCitationDebris(text: string): string {
  return text.replace(CITATION_DEBRIS, "");
}
