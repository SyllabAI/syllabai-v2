/**
 * T-SM-ROLLOUT-0452 r0 — the pickSubjectRoot selection law (pure, no I/O).
 *
 * Of-record trigger: T-SM-BRIDGE-WIDEN r0's "0452_duplicate_subject_code_
 * ambiguity" exclusion — two subjects rows carry code "0452" (the 2023-2025
 * and 2027-2029 syllabus trees) and the old `.find()` resolution picked an
 * unspecified winner. The law: single hit resolves; a cv pin disambiguates
 * multi-hit codes exactly; ambiguity without a pin refuses deterministically.
 */
import { describe, expect, it } from "bun:test";

import { pickSubjectRoot, type SubjectView } from "./subject-root";

const row = (
  id: string,
  code: string,
  knowledgeNodeId: string | null,
  cvCode?: string | null,
): SubjectView => ({
  id,
  code,
  name: `subject-${id}`,
  knowledgeNodeId,
  curriculumVersion: cvCode === undefined ? null : { code: cvCode },
});

describe("pickSubjectRoot — the deterministic subject selection law", () => {
  it("resolves a unique code to its row (the fleet's default posture, unchanged)", () => {
    const subjects = [row("s1", "4CH1", "root-1"), row("s2", "4MA1", "root-2")];
    expect(pickSubjectRoot(subjects, "4CH1", null)?.id).toBe("s1");
    expect(pickSubjectRoot(subjects, "4CH1")?.id).toBe("s1");
  });

  it("returns null for an unknown code", () => {
    expect(pickSubjectRoot([row("s1", "4CH1", "root-1")], "9999", null)).toBeNull();
    expect(pickSubjectRoot([], "4CH1", null)).toBeNull();
  });

  it("pins the exact curriculum-version row when several rows share a code (the 0452 law)", () => {
    const subjects = [
      row("s-old", "0452", "root-old", "0452-2023-2025"),
      row("s-new", "0452", "root-new", "0452-2027-2029"),
    ];
    expect(pickSubjectRoot(subjects, "0452", "0452-2023-2025")?.id).toBe("s-old");
    expect(pickSubjectRoot(subjects, "0452", "0452-2027-2029")?.id).toBe("s-new");
  });

  it("refuses an ambiguous code deterministically when no pin is supplied", () => {
    const subjects = [
      row("s-old", "0452", "root-old", "0452-2023-2025"),
      row("s-new", "0452", "root-new", "0452-2027-2029"),
    ];
    expect(pickSubjectRoot(subjects, "0452", null)).toBeNull();
    expect(pickSubjectRoot(subjects, "0452")).toBeNull();
  });

  it("refuses when the pin matches none of the shared-code rows (never a guess)", () => {
    const subjects = [
      row("s-old", "0452", "root-old", "0452-2023-2025"),
      row("s-new", "0452", "root-new", "0452-2027-2029"),
    ];
    expect(pickSubjectRoot(subjects, "0452", "0452-2021")).toBeNull();
  });

  it("tolerates rows whose wire shape omits the joined curriculum version", () => {
    const subjects: SubjectView[] = [
      { id: "s-legacy", code: "0452", name: "legacy", knowledgeNodeId: "root-a" },
      { id: "s-b", code: "0452", name: "b", knowledgeNodeId: "root-b", curriculumVersion: { code: "0452-2027-2029" } },
    ];
    expect(pickSubjectRoot(subjects, "0452", "0452-2027-2029")?.id).toBe("s-b");
    expect(pickSubjectRoot(subjects, "0452", "0452-2023-2025")).toBeNull();
  });

  it("ignores null knowledge roots when resolving (a subject without a KG root cannot anchor)", () => {
    const subjects = [
      row("s-null", "0452", null, "0452-2023-2025"),
      row("s-real", "0452", "root-real", "0452-2027-2029"),
    ];
    expect(pickSubjectRoot(subjects, "0452", "0452-2027-2029")?.knowledgeNodeId).toBe("root-real");
  });
});
