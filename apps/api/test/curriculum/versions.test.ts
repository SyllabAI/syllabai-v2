/**
 * T-MIG-021 tranche-1 unit tests — CurriculumVersionsRepository (the
 * learner-facing GET /api/v1/curriculum/versions query surface,
 * CurriculumController.java:39-46), stubbed-sql (no Neon).
 *
 * The stub dispatches on the rendered query text so every test also PINS the
 * SQL shape its repository issues (the status gate and the created_at-desc
 * ordering are load-bearing parity, not implementation detail).
 */
import { describe, expect, test } from "bun:test";
import { CurriculumVersionsRepository, versionView } from "../../src/services/curriculum/versions";
import { CAPTURED_VERSION_VIEW, VERSION_ROW, fakeSql } from "./helpers";

const row = (over: Partial<Record<string, unknown>> = {}) => ({ ...VERSION_ROW, ...over });

describe("CurriculumVersionsRepository — observed query surface", () => {
  test("default path filters status = ACTIVE, newest-first (findByStatusOrderByCreatedAtDesc)", async () => {
    const sql = fakeSql([
      {
        match: /from curriculum_versions where status = \? order by created_at desc$/i,
        rows: [row()],
      },
    ]);
    const list = await new CurriculumVersionsRepository(sql).findActiveByOrderByCreatedAtDesc();
    expect(list).toHaveLength(1);
    expect(sql.queries[0]).toMatch(/where status = \? order by created_at desc$/i);
    expect(list[0]!.status).toBe("ACTIVE");
    expect(list[0]!.code).toBe("IAL-CHEM-2018");
  });

  test("includeArchived=true path drops the status gate (findAllByOrderByCreatedAtDesc)", async () => {
    const sql = fakeSql([
      {
        match: /from curriculum_versions order by created_at desc$/i,
        rows: [
          row(),
          row({ id: "10000000-0000-0000-0000-000000000002", status: "ARCHIVED", created_at: "2026-10-03T10:00:00Z" }),
        ],
      },
    ]);
    const list = await new CurriculumVersionsRepository(sql).findAllByOrderByCreatedAtDesc();
    expect(list).toHaveLength(2);
    expect(sql.queries[0]).not.toMatch(/where status/);
    // newest first: the ACTIVE row (newer created_at) precedes the ARCHIVED row
    expect(list[0]!.status).toBe("ACTIVE");
    expect(list[1]!.status).toBe("ARCHIVED");
  });

  test("row maps to the captured CurriculumVersionView (curriculum-versions-student-200 body)", () => {
    const mapped = versionView({
      id: VERSION_ROW.id,
      board: VERSION_ROW.board,
      qualification: VERSION_ROW.qualification,
      code: VERSION_ROW.code,
      title: VERSION_ROW.title,
      status: "ACTIVE",
      createdAt: new Date(VERSION_ROW.created_at),
    });
    expect(mapped).toEqual(CAPTURED_VERSION_VIEW);
  });

  test("status is the stored string (DB CHECK constrains the domain, ck_curriculum_status)", async () => {
    const sql = fakeSql([
      { match: /from curriculum_versions order by created_at desc$/i, rows: [row({ status: "DRAFT" })] },
    ]);
    const list = await new CurriculumVersionsRepository(sql).findAllByOrderByCreatedAtDesc();
    expect(list[0]!.status).toBe("DRAFT");
  });
});
