/**
 * Two-plane past-paper merge (official ADR-037 precedence).
 *
 * Regression guard for the maths-B duplication report: collectPastPapers
 * groups strictly by (dateSlug-numberSlug), so concatenating the official
 * plane with the SME plane piled the SME copy of every question on top of
 * the official copy for the 63 paper keys both planes attest — the player
 * rendered each question twice. All past-paper surfaces must build their
 * reconstructions through collectPastPapersTwoPlane.
 */
import { describe, expect, test } from "bun:test";
import type { ExamQuestion } from "@/lib/contracts";
import {
  collectPastPapers,
  collectPastPapersTwoPlane,
  dropOfficialCoveredSme,
  officialCoveredKeys,
  type QuestionBankLike,
} from "@/lib/past-papers";

let seq = 0;

function q(
  date: string,
  number: string,
  questionNumber: number,
  totalMarks = 1,
  tag = "",
): ExamQuestion {
  seq += 1;
  return {
    id: tag || `q-${seq}`,
    prompt: tag || `q-${seq}`,
    totalMarks,
    parts: [{ sourcePaper: { date, number, questionNumber } }],
  } as unknown as ExamQuestion;
}

function qNoProvenance(): ExamQuestion {
  seq += 1;
  return {
    id: `q-${seq}`,
    prompt: `q-${seq}`,
    totalMarks: 2,
    parts: [{ prompt: "topic question, no paper provenance" }],
  } as unknown as ExamQuestion;
}

const officialBank = (): QuestionBankLike => ({
  questions: [
    q("June 2018", "4MB1/01", 23, 2, "official-23"),
    q("June 2018", "4MB1/01", 24, 3, "official-24"),
  ],
});

const smeBank = (): QuestionBankLike => ({
  questions: [
    // same paper key as the official plane — the collision that doubled the player
    q("June 2018", "4MB1/01", 23, 2, "sme-23"),
    q("June 2018", "4MB1/01", 24, 3, "sme-24"),
    // SME-only key must survive (May 2020 shape)
    q("May 2020", "4MB1/01", 1, 4, "sme-may2020"),
    // no provenance → never grouped into a paper, must pass through the filter
    qNoProvenance(),
  ],
});

describe("officialCoveredKeys", () => {
  test("collects slugified paper keys from sourcePaper provenance", () => {
    const covered = officialCoveredKeys([officialBank()]);
    expect(covered.size).toBe(1);
    expect(covered.has("june-2018-4mb1-01")).toBe(true);
  });
});

describe("dropOfficialCoveredSme", () => {
  test("drops only questions whose paper key is official-covered", () => {
    const kept = dropOfficialCoveredSme(officialCoveredKeys([officialBank()]), [smeBank()]);
    const ids = kept[0].questions.map((q) => q.id);
    // sme-23/sme-24 dropped (collision); May 2020 + no-provenance survive
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(officialBank().questions[0].id);
  });

  test("empty coverage passes banks through by reference", () => {
    const banks = [smeBank()];
    expect(dropOfficialCoveredSme(new Set(), banks)).toBe(banks);
  });

  test("zero-overlap (chemistry shape) preserves content", () => {
    const banks = [smeBank()];
    const covered = officialCoveredKeys([
      { questions: [q("June 2021", "WCH11/01", 1)] },
    ]);
    const kept = dropOfficialCoveredSme(covered, banks);
    expect(kept.map((b) => b.questions.map((q) => q.id))).toEqual(
      banks.map((b) => b.questions.map((q) => q.id)),
    );
  });
});

describe("collectPastPapersTwoPlane", () => {
  test("official-covered key holds ONLY the official questions (no doubles)", () => {
    const papers = collectPastPapersTwoPlane([officialBank()], [smeBank()]);
    const paper = papers.find((p) => p.key === "june-2018-4mb1-01")!;
    expect(paper).toBeDefined();
    expect(paper.questions).toHaveLength(2);
    expect(paper.questions.map((x) => x.id)).toEqual(["official-23", "official-24"]);
    expect(paper.totalMarks).toBe(5);
  });

  test("SME-only key survives untouched", () => {
    const papers = collectPastPapersTwoPlane([officialBank()], [smeBank()]);
    const may2020 = papers.find((p) => p.key === "may-2020-4mb1-01")!;
    expect(may2020).toBeDefined();
    expect(may2020.questions.map((x) => x.id)).toEqual(["sme-may2020"]);
    expect(may2020.totalMarks).toBe(4);
  });

  test("the raw concatenation it replaces really did double (trap documented)", () => {
    const doubled = collectPastPapers([officialBank(), smeBank()]);
    expect(doubled.find((p) => p.key === "june-2018-4mb1-01")!.questions).toHaveLength(4);
  });
});
