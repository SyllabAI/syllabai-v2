/**
 * T-MIG-021 tranche-1 unit tests — SubjectsRepository (the learner-facing
 * GET /api/v1/curriculum/subjects[?versionId=][/{id}] query surface,
 * CurriculumController.java:48-61), stubbed-sql (no Neon).
 *
 * Parity pins: the EntityGraph join is in-statement (LazyInitialization
 * parity), listings order by s.code, the by-id path returns null on miss
 * (the route layer renders the captured 404 ApiError envelope —
 * NotFoundException.java:16-19 format "subject <uuid> not found").
 */
import { describe, expect, test } from "bun:test";
import { SubjectsRepository, subjectView } from "../../src/services/curriculum/subjects";
import { CAPTURED_SUBJECT_VIEW, SUBJECT_ROW, fakeSql } from "./helpers";

describe("SubjectsRepository — observed query surface", () => {
  test("list joins the version in-statement, orders by code (EntityGraph parity)", async () => {
    const sql = fakeSql([
      {
        match: /join curriculum_versions v on v\.id = s\.curriculum_version_id order by s\.code$/i,
        rows: [SUBJECT_ROW],
      },
    ]);
    const list = await new SubjectsRepository(sql).findAllByOrderByCode();
    expect(list).toHaveLength(1);
    expect(sql.queries[0]).toMatch(/join curriculum_versions v on v\.id = s\.curriculum_version_id order by s\.code$/i);
    expect(list[0]!.code).toBe("CHM");
    expect(list[0]!.version.code).toBe("IAL-CHEM-2018");
  });

  test("versionId filter pins the where clause and keeps the code ordering", async () => {
    const sql = fakeSql([
      {
        match: /where s\.curriculum_version_id = \? order by s\.code$/i,
        rows: [SUBJECT_ROW],
      },
    ]);
    const list = await new SubjectsRepository(sql).findByCurriculumVersionIdOrderByCode(
      "10000000-0000-0000-0000-000000000001",
    );
    expect(list).toHaveLength(1);
    expect(sql.queries[0]).toMatch(/where s\.curriculum_version_id = \? order by s\.code$/i);
  });

  test("findById joins the same way and maps to the captured SubjectView (by-id-200 body)", async () => {
    const sql = fakeSql([
      { match: /where s\.id = \?$/i, rows: [SUBJECT_ROW] },
    ]);
    const hit = await new SubjectsRepository(sql).findById("10000000-0000-0000-0000-000000000010");
    expect(hit).not.toBeNull();
    expect(subjectView(hit!)).toEqual(CAPTURED_SUBJECT_VIEW);
  });

  test("unknown id -> null (route layer renders 'subject <uuid> not found', 404 envelope)", async () => {
    const sql = fakeSql([{ match: /where s\.id = \?$/i, rows: [] }]);
    expect(await new SubjectsRepository(sql).findById("00000000-0000-4000-8000-0000000000a1")).toBeNull();
  });

  test("nullable knowledgeNodeId maps to null (column allows a subject without a KG root)", async () => {
    const sql = fakeSql([
      { match: /where s\.id = \?$/i, rows: [{ ...SUBJECT_ROW, knowledge_node_id: null }] },
    ]);
    const hit = await new SubjectsRepository(sql).findById("10000000-0000-0000-0000-000000000010");
    expect(hit!.knowledgeNodeId).toBeNull();
  });
});
