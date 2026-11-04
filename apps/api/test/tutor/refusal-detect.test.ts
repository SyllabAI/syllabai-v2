/**
 * T-TUTOR-PIVOT-1 run-001 — the refusal-truth detector pins. The measured
 * defect (2026-11-05 live, session bd6c89ff seq 13-16): a model-worded
 * refusal (evidence present but wrong) recorded refused=false — invisible
 * to the tutor analytics and the struggle signals. The detector keys on
 * the v17 refusal shape law's canonical stem, plus a tolerant apology
 * family gated on material + negation. Deterministic string laws only —
 * LLM outputs are never golden-gated (R-LLM doctrine).
 */
import { describe, expect, test } from "bun:test";
import {
  APOLOGY_REFUSAL_STEMS,
  CANONICAL_REFUSAL_STEMS,
  REFUSAL_HEAD_CHARS,
  REFUSAL_REDIRECT_SUFFIX,
  modelRefusalLikely,
  withRefusalRedirect,
} from "../../src/services/tutor/refusal-detect";
import { TUTOR_REFUSAL } from "../../src/services/tutor/prompt";

describe("refusal truth detector — T-TUTOR-PIVOT-1", () => {
  test("the measured live refusal (session bd6c89ff seq 14) is detected", () => {
    expect(
      modelRefusalLikely(
        "I'm sorry, but the supplied sources do not contain any information about the difference between boiling and evaporation.",
      ),
    ).toBe(true);
  });

  test("the deterministic refusal bytes are detected (one refusal voice)", () => {
    expect(modelRefusalLikely(TUTOR_REFUSAL)).toBe(true);
  });

  test("the canonical stem is detected regardless of what follows", () => {
    expect(
      modelRefusalLikely(
        "I can't answer that from the validated course material yet. The SOURCES cover boiling only in an exam-technique context.",
      ),
    ).toBe(true);
  });

  test("the canonical stem survives casing, line breaks and doubled spaces", () => {
    expect(
      modelRefusalLikely(
        "I  CANNOT Answer that\nfrom the VALIDATED Course Material yet — nothing on evaporation.",
      ),
    ).toBe(true);
  });

  test("the tolerant apology family detects a rotated-provider refusal", () => {
    expect(
      modelRefusalLikely(
        "Sorry, but the sources do not cover electrolysis. Try rephrasing your question.",
      ),
    ).toBe(true);
  });

  test("a corrective answer that opens with an apology is NOT a refusal (no negation)", () => {
    expect(
      modelRefusalLikely(
        "I'm sorry, but your answer used the sources incorrectly: boiling happens throughout a liquid, not only at the surface.",
      ),
    ).toBe(false);
  });

  test("an apology without a material-limitation phrase is NOT a refusal", () => {
    expect(
      modelRefusalLikely("I'm sorry, but I already covered that above."),
    ).toBe(false);
  });

  test("a normal grounded answer is never a refusal", () => {
    expect(
      modelRefusalLikely(
        "Boiling happens throughout the liquid at its boiling point [1], while evaporation happens only at the surface [2].",
      ),
    ).toBe(false);
  });

  test("the canonical phrase quoted mid-answer does not trigger (head window anchor)", () => {
    const preamble = "x".repeat(REFUSAL_HEAD_CHARS + 40);
    expect(
      modelRefusalLikely(
        `${preamble} The tutor must never open with "I can't answer that from the validated course material".`,
      ),
    ).toBe(false);
  });

  test("null and empty answers are not refusals", () => {
    expect(modelRefusalLikely(null)).toBe(false);
    expect(modelRefusalLikely(undefined)).toBe(false);
    expect(modelRefusalLikely("")).toBe(false);
  });

  test("the stem families are the pinned constants", () => {
    expect(CANONICAL_REFUSAL_STEMS[0]).toBe(
      "i can't answer that from the validated course material",
    );
    expect(APOLOGY_REFUSAL_STEMS).toContain("i'm sorry, but");
    expect(APOLOGY_REFUSAL_STEMS).toContain("sorry, but");
  });
});

// ── run-002 — the live-measured wording families + the deterministic redirect ─

describe("refusal truth detector run-002 — the rotated pool's real wordings", () => {
  test("tier 3: the source-first family (groq, live-measured 2026-11-05) is detected", () => {
    expect(
      modelRefusalLikely(
        "The supplied sources do not contain information about the capital city of France.",
      ),
    ).toBe(true);
    expect(
      modelRefusalLikely(
        "The provided sources do not contain information or definitions comparing evaporation and boiling.",
      ),
    ).toBe(true);
  });

  test("tier 3: 'none of the …' (groq, live-measured) is detected", () => {
    expect(
      modelRefusalLikely(
        "I'm sorry, but none of the supplied sources contain that information.",
      ),
    ).toBe(true);
    expect(
      modelRefusalLikely("None of the provided sources mention photosynthesis."),
    ).toBe(true);
  });

  test("tier 3: correction verbs stay UNLISTED — a corrective opener is not a refusal", () => {
    expect(
      modelRefusalLikely(
        "The sources do not support that claim — the correction is below.",
      ),
    ).toBe(false);
    expect(modelRefusalLikely("The sources say the opposite: boiling IS a form of evaporation.")).toBe(false);
  });

  test("tier 3: a sources-mentioning correct answer without a lack verb is not a refusal", () => {
    expect(
      modelRefusalLikely(
        "The supplied sources cover this: evaporation happens at the surface at any temperature [1].",
      ),
    ).toBe(false);
  });

  test("withRefusalRedirect appends the way-forward line (idempotent)", () => {
    const bare = "The supplied sources do not contain information about the capital city of France.";
    const appended = withRefusalRedirect(bare);
    expect(appended.startsWith(bare)).toBe(true);
    expect(appended).toContain("rephrase");
    expect(appended).toContain("new conversation");
    expect(withRefusalRedirect(appended)).toBe(appended); // idempotent
  });

  test("withRefusalRedirect leaves a law-compliant refusal untouched", () => {
    const compliant =
      "I can't answer that from the validated course material yet. Nothing here covers it. " +
      "Could you rephrase the question, or start a new conversation on this topic?";
    expect(withRefusalRedirect(compliant)).toBe(compliant);
  });
});
