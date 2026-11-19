/**
 * Editor-gates tests — ADR-044 run-011 (the engine's own suite; ADR §6:
 * "the classifier's boundary tests are part of the gate engine's own test
 * suite, so a misclassification is a bug with a failing test, not a
 * judgment call"). Covers: the fixture regression pins (every gates-clean
 * fixture passes with zero refusals), one case per refusal class, the tier
 * classifier's boundary law (Tier 1 vs 2 vs 3), and the G-EYES predicate.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EDITOR_GATES_VERSION,
  canSelfApprove,
  cosmeticOnlyTransform,
  runPreflight,
  type FieldDelta,
  type PreflightInput,
} from "./index";

const FIXTURE_DIR = join(import.meta.dir, "..", "fixtures", "questions");

function input(fields: FieldDelta[], baseCtx?: PreflightInput["baseCtx"]): PreflightInput {
  return { bank: "questions", targetPath: "SME-ExamQuestion/x/y/questions.md", fields, baseCtx };
}

function codesOf(verdict: { refusals: Array<{ code: string }> }): string[] {
  return verdict.refusals.map((r) => r.code);
}

// ── fixture regression pins (the gates-clean corpus law) ─────────────────────

describe("fixture regression pins (gates-clean corpus)", () => {
  const fixtures = ["wave-d-physics-1.json", "wave-d-physics-2.json", "wave-d-physics-3.json"];

  for (const f of fixtures) {
    test(`${f} passes the gates with zero refusals`, () => {
      const parsed = JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf8")) as {
        question: { parts: Array<Record<string, unknown>> };
      };
      const q = parsed.question;
      const fields: FieldDelta[] = [];
      q.parts.forEach((p, i) => {
        fields.push({
          field: `parts[${i}].problemMd`,
          before: String(p.problemMd),
          after: String(p.problemMd),
        });
        if (typeof p.solutionMd === "string") {
          fields.push({ field: `parts[${i}].solutionMd`, before: p.solutionMd, after: p.solutionMd });
        }
        const choices = p.choices as Array<{ label: string; textMd: string }> | null;
        if (choices) {
          for (const c of choices) {
            fields.push({
              field: `parts[${i}].choices[${c.label}].textMd`,
              before: c.textMd,
              after: c.textMd,
            });
          }
        }
      });
      const baseCtx = {
        partCount: q.parts.length,
        choiceLabels: Object.fromEntries(
          q.parts.map((p, i) => {
            const choices = p.choices as Array<{ label: string }> | null;
            return [String(i), choices ? choices.map((c) => c.label) : []];
          }),
        ),
      };
      const verdict = runPreflight(input(fields, baseCtx));
      expect(verdict.refusals).toEqual([]);
      expect(verdict.ok).toBe(true);
    });
  }
});

// ── the refusal classes (one case each) ──────────────────────────────────────

describe("the typed refusal classes (ADR §8 law families)", () => {
  test("G-SER-TRAILING-NEWLINE", () => {
    const v = runPreflight(input([{ field: "parts[0].problemMd", before: "A ball.", after: "A ball. \n" }]));
    expect(codesOf(v)).toContain("G-SER-TRAILING-NEWLINE");
    expect(v.ok).toBe(false);
  });

  test("G-SER-TAB-CHARACTER", () => {
    const v = runPreflight(input([{ field: "parts[0].problemMd", before: "A ball", after: "A\tball" }]));
    expect(codesOf(v)).toContain("G-SER-TAB-CHARACTER");
    expect(v.tier).toBe(1);
  });

  test("G-CHAR-PUA (the EDX-2 detector)", () => {
    const v = runPreflight(input([{ field: "parts[0].problemMd", before: "A ball", after: "A \uE00Fball" }]));
    expect(codesOf(v)).toContain("G-CHAR-PUA");
  });

  test("G-CANON-KATEX-BALANCE (unpaired $)", () => {
    const v = runPreflight(input([{ field: "parts[0].problemMd", before: "$F=ma$ acts", after: "$F=ma acts" }]));
    expect(codesOf(v)).toContain("G-CANON-KATEX-BALANCE");
  });

  test("G-CANON-MARKUP-HYGIENE (unpaired ** and raw HTML)", () => {
    const v1 = runPreflight(input([{ field: "parts[0].problemMd", before: "**bold** text", after: "**bold text" }]));
    expect(codesOf(v1)).toContain("G-CANON-MARKUP-HYGIENE");
    const v2 = runPreflight(input([{ field: "parts[0].problemMd", before: "plain", after: "<b>bold</b> idea" }]));
    expect(codesOf(v2)).toContain("G-CANON-MARKUP-HYGIENE");
  });

  test("G-FIELD-EMPTY-REQUIRED (problemMd cleared)", () => {
    const v = runPreflight(input([{ field: "parts[0].problemMd", before: "A ball rolls.", after: "   " }]));
    expect(codesOf(v)).toContain("G-FIELD-EMPTY-REQUIRED");
  });

  test("G-FIELD-MARKS-GRAMMAR", () => {
    const v = runPreflight(input([{ field: "parts[0].marks", before: "2", after: "two" }]));
    expect(codesOf(v)).toContain("G-FIELD-MARKS-GRAMMAR");
  });

  test("G-FIELD-ISCORRECT-GRAMMAR", () => {
    const v = runPreflight(
      input([{ field: "parts[0].choices[A].isCorrect", before: "true", after: "yes" }]),
    );
    expect(codesOf(v)).toContain("G-FIELD-ISCORRECT-GRAMMAR");
  });

  test("G-ASSET-DANGLING with an index; G-ASSET-UNVERIFIED without", () => {
    const withIndex = runPreflight(
      input(
        [{ field: "parts[0].problemMd", before: "text", after: "text ![fig](assets/circuit-1.png)" }],
        { assetPaths: ["assets/other.png"] },
      ),
    );
    expect(codesOf(withIndex)).toContain("G-ASSET-DANGLING");
    const resolved = runPreflight(
      input(
        [{ field: "parts[0].problemMd", before: "text", after: "text ![fig](assets/circuit-1.png)" }],
        { assetPaths: ["assets/circuit-1.png"] },
      ),
    );
    expect(codesOf(resolved)).not.toContain("G-ASSET-DANGLING");
    const withoutIndex = runPreflight(
      input([{ field: "parts[0].problemMd", before: "text", after: "text ![fig](assets/circuit-1.png)" }]),
    );
    expect(codesOf(withoutIndex)).not.toContain("G-ASSET-DANGLING");
    expect(withoutIndex.warnings.some((w) => w.code === "G-ASSET-UNVERIFIED")).toBe(true);
  });

  test("G-EYES-SELF-APPROVE: the predicate pins the four-eyes law", () => {
    expect(canSelfApprove("u1", "u1")).toBe(true);
    expect(canSelfApprove("u1", "u2")).toBe(false);
  });
});

// ── the tier classifier boundary law (a misclassification is a failing test) ─

describe("tier classifier boundaries (ADR §6, mechanical)", () => {
  test("Tier 1: punctuation-only delta on a prose field", () => {
    const v = runPreflight(
      input([{ field: "parts[0].problemMd", before: "A ball rolls down a slope", after: "A ball rolls down a slope." }]),
    );
    expect(v.tier).toBe(1);
    expect(v.ok).toBe(true);
  });

  test("Tier 1: KaTeX spacing delta (\\, to \\quad)", () => {
    const v = runPreflight(
      input([
        { field: "parts[0].problemMd", before: "speed $2.5\\,\\text{Hz}$", after: "speed $2.5\\quad\\text{Hz}$" },
      ]),
    );
    expect(v.tier).toBe(1);
    expect(v.ok).toBe(true);
  });

  test("Tier 1: markup hygiene (** spacing, backtick balance kept)", () => {
    const v = runPreflight(
      input([{ field: "parts[0].problemMd", before: "the ** resultant ** force", after: "the **resultant** force" }]),
    );
    expect(v.tier).toBe(1);
    expect(v.ok).toBe(true);
  });

  test("Tier 2: a one-word change on a prose field (the four-eyes default)", () => {
    const v = runPreflight(
      input([{ field: "parts[0].problemMd", before: "A ball rolls down a slope", after: "A ball rolls down a ramp" }]),
    );
    expect(v.tier).toBe(2);
    expect(v.ok).toBe(true); // Tier 2 proposals persist as queued_review — carried, not merged
    expect(v.tierReasons.join(" ")).toContain("four-eyes");
  });

  test("Tier 2: marks edit is content-bearing by identity", () => {
    const v = runPreflight(input([{ field: "parts[0].marks", before: "2", after: "3" }]));
    expect(v.tier).toBe(2);
  });

  test("Tier 2: isCorrect flip (answer key)", () => {
    const v = runPreflight(
      input([{ field: "parts[0].choices[A].isCorrect", before: "true", after: "false" }]),
    );
    expect(v.tier).toBe(2);
  });

  test("Tier 3: non-canonical field path is refused, not reclassified", () => {
    const v = runPreflight(input([{ field: "stem", before: "a", after: "b" }]));
    expect(v.tier).toBe(3);
    expect(v.ok).toBe(false);
    expect(codesOf(v)).toContain("G-SCOPE-TIER3-STRUCTURAL");
    expect(v.disclosure).toContain("lane preregistration");
  });

  test("Tier 3: part index outside the served base context", () => {
    const v = runPreflight(
      input([{ field: "parts[2].problemMd", before: "a", after: "b" }], { partCount: 2 }),
    );
    expect(v.tier).toBe(3);
    expect(v.ok).toBe(false);
  });

  test("Tier 3: a choice label that does not exist on the served part", () => {
    const v = runPreflight(
      input([{ field: "parts[0].choices[E].textMd", before: "x", after: "y" }], {
        partCount: 1,
        choiceLabels: { "0": ["A", "B", "C", "D"] },
      }),
    );
    expect(v.tier).toBe(3);
    expect(v.ok).toBe(false);
  });
});

// ── the cosmetic transform primitive + engine identity ───────────────────────

describe("cosmeticOnlyTransform + engine identity", () => {
  test("multiset equality: spacing/punctuation only → true", () => {
    expect(cosmeticOnlyTransform("a-b, c!", "a b c")).toBe(true);
  });
  test("a token change → false", () => {
    expect(cosmeticOnlyTransform("a ball", "a ramp")).toBe(false);
  });
  test("a token count change → false", () => {
    expect(cosmeticOnlyTransform("a ball", "a big ball")).toBe(false);
  });
  test("the engine version of record rides receipts", () => {
    expect(EDITOR_GATES_VERSION).toMatch(/^editor-gates@\d+\.\d+\.\d+-run\d+$/);
  });
});
