import { describe, expect, test } from "bun:test";
import { PROMPT_VERSION, promptIdentity, systemPrompt } from "../../src/services/tutor/prompt";

/**
 * T-TUTOR-AIM-P1 — DC10 §13.1: the prompt instruction budget.
 *
 * The law: reliable instruction-follow tops out around 150–200 instructions;
 * past ~200 lines measured adherence drops by more than 30%, and the drop
 * hits the load-bearing rules too. Every DC10 phase adds law text to the
 * pinned tutor prompt, so the ACTIVE system prompt carries a hard
 * non-blank-line cap of record, enforced HERE at build/CI time: a bump that
 * exceeds the cap fails this test, and the bump author must either subtract
 * law text (promotion is subtractive — admitting a law names the law it
 * replaces or evicts) or raise the cap deliberately, with the raise recorded
 * in the bump's own version comment.
 *
 * The whole system prompt is instruction surface (every non-blank line is a
 * rule, a rule's continuation, or the identity framing) — so non-blank lines
 * are the honest deterministic proxy for "instruction lines"; a word-class
 * imperative classifier would be nondeterminism in a lint whose whole job is
 * determinism.
 */
const PROMPT_LINE_CAP = 200;

function nonBlankLines(s: string): number {
  return s.split("\n").filter((l) => l.trim() !== "").length;
}

describe("prompt instruction budget (DC10 §13.1)", () => {
  test("both system-prompt variants stay under the cap of record", () => {
    for (const variant of ["chemistry", "general"] as const) {
      const n = nonBlankLines(systemPrompt(variant));
      if (n > PROMPT_LINE_CAP) {
        throw new Error(
          `prompt instruction budget exceeded for variant "${variant}": ` +
            `${n} non-blank lines > cap ${PROMPT_LINE_CAP} (DC10 §13.1). ` +
            `Subtract law text (promotion is subtractive) or raise the cap ` +
            `deliberately and record the raise in the bump's version comment.`,
        );
      }
      expect(n).toBeLessThanOrEqual(PROMPT_LINE_CAP);
    }
  });

  test("the budget leaves headroom recorded at the v18 bump", () => {
    // v18 (T-TUTOR-AIM-P1) landed with real headroom so P2/P3 bumps do not
    // immediately hit the cap; when this pin breaks, the raise is a
    // deliberate, recorded decision — never a silent one.
    const n = nonBlankLines(systemPrompt("chemistry"));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(PROMPT_LINE_CAP - 40);
  });

  test("the identity stays registry-shaped (the budget governs content, not identity)", () => {
    expect(promptIdentity()).toBe(`tutor-grounded/v${PROMPT_VERSION}`);
    expect(promptIdentity()).toMatch(/^tutor-grounded\/v\d+$/);
  });
});
