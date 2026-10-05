/**
 * Contract pins for the wave-2 curriculum port (T-MIG-005).
 *
 * Captured bodies embedded verbatim from the T-MIG-004 fixtures (fixed
 * Flyway seed uuids — replay-stable). Binding pins mirror Spring's
 * @RequestParam conversion semantics; response pins mirror the records.
 */
import { describe, expect, test } from "bun:test";
import {
  curriculumSubjectResponseSchema,
  curriculumSubjectsQuerySchema,
  curriculumVersionsQuerySchema,
  curriculumVersionsResponseSchema,
  curriculumVersionStatusSchema,
  knowledgeNodeValidationStatusSchema,
  knowledgeNodeTypeSchema,
  knowledgeNodeViewSchema,
  teacherCurriculumNodesQuerySchema,
  teacherCurriculumNodesResponseSchema,
  teacherCurriculumVersionsResponseSchema,
} from "./curriculum";

describe("curriculumVersionStatusSchema — CurriculumVersion.java:22", () => {
  test("accepts DRAFT/ACTIVE/ARCHIVED; valueOf is case-sensitive", () => {
    for (const s of ["DRAFT", "ACTIVE", "ARCHIVED"]) {
      expect(curriculumVersionStatusSchema.safeParse(s).success).toBe(true);
    }
    for (const s of ["active", "ACTIVE ", "ARCHIVE", ""]) {
      expect(curriculumVersionStatusSchema.safeParse(s).success).toBe(false);
    }
  });
});

describe("knowledgeNodeValidationStatusSchema — KnowledgeNode.java:28", () => {
  test("accepts UNVALIDATED/SUGGESTED/VALIDATED; rejects unknowns and case drift", () => {
    for (const s of ["UNVALIDATED", "SUGGESTED", "VALIDATED"]) {
      expect(knowledgeNodeValidationStatusSchema.safeParse(s).success).toBe(true);
    }
    expect(knowledgeNodeValidationStatusSchema.safeParse("suggested").success).toBe(false);
    expect(knowledgeNodeValidationStatusSchema.safeParse("REJECTED").success).toBe(false);
  });
});

describe("knowledgeNodeTypeSchema — NodeType.java full domain", () => {
  test("accepts all six values incl. MISCONCEPTION and CONCEPT (T-C11, V15)", () => {
    for (const t of ["SUBJECT", "UNIT", "TOPIC", "SUBTOPIC", "MISCONCEPTION", "CONCEPT"]) {
      expect(knowledgeNodeTypeSchema.safeParse(t).success).toBe(true);
    }
    expect(knowledgeNodeTypeSchema.safeParse("SPECIFICATION_POINT").success).toBe(false);
  });
});

describe("curriculumVersionsQuerySchema — Spring StringToBooleanConverter binding", () => {
  test("absent param defaults to false", () => {
    const r = curriculumVersionsQuerySchema.safeParse({});
    expect(r.success && r.data.includeArchived).toBe(false);
  });

  test("accepts case-insensitive true/false (trimmed), transforms to boolean", () => {
    for (const [input, expected] of [
      ["true", true],
      ["TRUE", true],
      [" true ", true],
      ["false", false],
      ["FALSE", false],
    ] as const) {
      const r = curriculumVersionsQuerySchema.safeParse({ includeArchived: input });
      expect(r.success && r.data.includeArchived).toBe(expected);
    }
  });

  test("rejects 'yes'/'1'/'on' (NOT in Spring's StringToBooleanConverter set) and garbage", () => {
    for (const bad of ["yes", "1", "on", "off", "0", "no", "2", ""]) {
      expect(curriculumVersionsQuerySchema.safeParse({ includeArchived: bad }).success).toBe(false);
    }
  });
});

describe("curriculumSubjectsQuerySchema — optional UUID", () => {
  test("accepts absent and well-formed; rejects bad uuids (binding 400)", () => {
    expect(curriculumSubjectsQuerySchema.safeParse({}).success).toBe(true);
    expect(
      curriculumSubjectsQuerySchema.safeParse({
        versionId: "10000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
    expect(curriculumSubjectsQuerySchema.safeParse({ versionId: "abc" }).success).toBe(false);
  });
});

describe("teacherCurriculumNodesQuerySchema — optional ValidationStatus", () => {
  test("accepts absent and exact enum values; trims before valueOf; rejects case drift", () => {
    expect(teacherCurriculumNodesQuerySchema.safeParse({}).success).toBe(true);
    const ok = teacherCurriculumNodesQuerySchema.safeParse({ status: "SUGGESTED" });
    expect(ok.success && ok.data.status).toBe("SUGGESTED");
    const padded = teacherCurriculumNodesQuerySchema.safeParse({ status: " VALIDATED " });
    expect(padded.success && padded.data.status).toBe("VALIDATED");
    expect(teacherCurriculumNodesQuerySchema.safeParse({ status: "suggested" }).success).toBe(false);
    expect(teacherCurriculumNodesQuerySchema.safeParse({ status: "FOO" }).success).toBe(false);
  });
});

describe("curriculumVersionsResponseSchema — pinned by curriculum-versions-student-200", () => {
  test("parses the captured V6 seed row verbatim (fixed uuid, ACTIVE)", () => {
    const r = curriculumVersionsResponseSchema.safeParse([
      {
        id: "10000000-0000-0000-0000-000000000001",
        board: "Edexcel",
        qualification: "IAL",
        code: "IAL-CHEM-2018",
        title: "Edexcel International A Level Chemistry (2018 specification)",
        status: "ACTIVE",
      },
    ]);
    expect(r.success).toBe(true);
  });

  test("rejects an out-of-enum status", () => {
    expect(
      curriculumVersionsResponseSchema.safeParse([
        {
          id: "10000000-0000-0000-0000-000000000001",
          board: "b",
          qualification: "q",
          code: "c",
          title: "t",
          status: "PUBLISHED",
        },
      ]).success,
    ).toBe(false);
  });
});

describe("curriculumSubjectResponseSchema — pinned by curriculum-subject-by-id-student-200", () => {
  test("parses the captured subject with its nested curriculumVersion", () => {
    const r = curriculumSubjectResponseSchema.safeParse({
      id: "10000000-0000-0000-0000-000000000010",
      code: "CHM",
      name: "Chemistry",
      knowledgeNodeId: "20000000-0000-0000-0000-000000000001",
      curriculumVersion: {
        id: "10000000-0000-0000-0000-000000000001",
        board: "Edexcel",
        qualification: "IAL",
        code: "IAL-CHEM-2018",
        title: "Edexcel International A Level Chemistry (2018 specification)",
        status: "ACTIVE",
      },
    });
    expect(r.success).toBe(true);
  });

  test("accepts null knowledgeNodeId (subject without a KG root — capture-unproven, recorded)", () => {
    const r = curriculumSubjectResponseSchema.safeParse({
      id: "10000000-0000-0000-0000-000000000011",
      code: "PHY",
      name: "Physics",
      knowledgeNodeId: null,
      curriculumVersion: {
        id: "10000000-0000-0000-0000-000000000001",
        board: "Edexcel",
        qualification: "IAL",
        code: "IAL-CHEM-2018",
        title: "t",
        status: "ACTIVE",
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("teacherCurriculumVersionsResponseSchema — CurriculumOverview rows", () => {
  test("parses an overview row; rejects bad status/statuses", () => {
    expect(
      teacherCurriculumVersionsResponseSchema.safeParse([
        {
          id: "10000000-0000-0000-0000-000000000001",
          board: "Edexcel",
          qualification: "IAL",
          code: "IAL-CHEM-2018",
          title: "Edexcel International A Level Chemistry (2018 specification)",
          status: "ACTIVE",
          validatedNodes: 0,
          suggestedNodes: 0,
          unvalidatedNodes: 0,
        },
      ]).success,
    ).toBe(true);
  });
});

describe("teacherCurriculumNodesResponseSchema — NodeView rows", () => {
  test("parses [] (captured: seed tree has no SUGGESTED nodes)", () => {
    expect(teacherCurriculumNodesResponseSchema.safeParse([]).success).toBe(true);
  });

  test("parses a node with null provenance/parentId (root node)", () => {
    const r = teacherCurriculumNodesResponseSchema.safeParse([
      {
        id: "20000000-0000-0000-0000-000000000001",
        code: "WCH11",
        nodeType: "SUBJECT",
        title: "Chemistry",
        validationStatus: "VALIDATED",
        provenance: null,
        parentId: null,
      },
    ]);
    expect(r.success).toBe(true);
  });

  test("rejects a nodeType outside the enum", () => {
    expect(
      teacherCurriculumNodesResponseSchema.safeParse([
        {
          id: "20000000-0000-0000-0000-000000000001",
          code: "X",
          nodeType: "ANCHOR",
          title: "x",
          validationStatus: "SUGGESTED",
          provenance: "fp",
          parentId: null,
        },
      ]).success,
    ).toBe(false);
  });
});
