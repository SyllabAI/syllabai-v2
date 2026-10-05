/**
 * T-MIG-021 tranche-1 unit tests — the curriculum module's contract-independent
 * surface (repos + view mappings + service law), stubbed-sql (no Neon).
 *
 * The stub dispatches on the rendered query text so every test also PINS the
 * SQL shape its repository issues (order-by clauses, the ACTIVE gate and the
 * VERBATIM subtree CTE are asserted, not just behaviour). Response shapes are
 * pinned to the 13 curriculum golden cases (T-MIG-004 run-002, fixed-uuid V6
 * seed): CurriculumVersionView 6 keys, SubjectView nested
 * curriculumVersion + nullable knowledgeNodeId, CurriculumOverview 9 keys,
 * NodeView 7 keys with nullable provenance/parentId.
 */
import { describe, expect, test } from "bun:test";
import {
  CurriculumVersionsRepository,
  SubjectsRepository,
  KnowledgeStructureRepository,
} from "../../src/services/curriculum/repository";
import {
  CurriculumService,
  CurriculumReviewReadService,
  parsePathUuid,
  byCode,
} from "../../src/services/curriculum/service";
import { toErrorResponse } from "../../src/services/identity/errors";
import { fakeSql, SEED } from "./helpers";

const VERSION_ROW = { ...SEED.version };
const SUBJECT_ROW = {
  id: SEED.subject.id,
  code: SEED.subject.code,
  name: SEED.subject.name,
  knowledge_node_id: SEED.subject.knowledgeNodeId,
  cv_id: SEED.version.id,
  cv_board: SEED.version.board,
  cv_qualification: SEED.version.qualification,
  cv_code: SEED.version.code,
  cv_title: SEED.version.title,
  cv_status: SEED.version.status,
};

describe("CurriculumVersionsRepository — observed query surface", () => {
  test("active-only list gates on status = ACTIVE, newest-first", async () => {
    const sql = fakeSql([
      {
        match: /from curriculum_versions where status = \? order by created_at desc$/i,
        rows: [VERSION_ROW],
      },
    ]);
    const repo = new CurriculumVersionsRepository(sql);
    const rows = await repo.findByStatusOrderByCreatedAtDesc("ACTIVE");
    expect(rows).toHaveLength(1);
    // golden curriculum-versions-student-200: exactly these 6 keys, no createdAt
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ["board", "code", "id", "qualification", "status", "title"],
    );
    expect(sql.queries[0]).toContain("where status = ?");
    expect(sql.queries[0]).toContain("order by created_at desc");
  });

  test("includeArchived=true drops the status gate (findAllByOrderByCreatedAtDesc)", async () => {
    const sql = fakeSql([
      { match: /from curriculum_versions order by created_at desc$/i, rows: [VERSION_ROW] },
    ]);
    const repo = new CurriculumVersionsRepository(sql);
    const rows = await repo.findAllByOrderByCreatedAtDesc();
    expect(rows).toHaveLength(1);
    expect(sql.queries[0]).not.toContain("where");
  });
});

describe("SubjectsRepository — joined read model", () => {
  test("list joins curriculum_versions (EntityGraph parity) and orders by s.code", async () => {
    const sql = fakeSql([
      { match: /from subjects s join curriculum_versions cv .* order by s\.code$/i, rows: [SUBJECT_ROW] },
    ]);
    const repo = new SubjectsRepository(sql);
    const rows = await repo.findAllByOrderByCode();
    expect(rows).toHaveLength(1);
    expect(sql.queries[0]).toContain("join curriculum_versions cv on cv.id = s.curriculum_version_id");
    expect(sql.queries[0]).toContain("order by s.code");
  });

  test("version-scoped list filters on s.curriculum_version_id", async () => {
    const sql = fakeSql([
      {
        match: /where s\.curriculum_version_id = \? order by s\.code$/i,
        rows: [],
      },
    ]);
    const repo = new SubjectsRepository(sql);
    const rows = await repo.findByCurriculumVersionIdOrderByCode(SEED.version.id);
    expect(rows).toEqual([]);
  });

  test("findWithVersionById returns null on miss (controller 404 path)", async () => {
    const sql = fakeSql([{ match: /where s\.id = \?$/i, rows: [] }]);
    const repo = new SubjectsRepository(sql);
    expect(await repo.findWithVersionById(SEED.subject.id)).toBeNull();
  });
});

describe("KnowledgeStructureRepository — subtree read model", () => {
  test("findSubtreeIds ports the recursive CTE VERBATIM (PART_OF single source of truth)", async () => {
    const sql = fakeSql([
      {
        match: /WITH RECURSIVE subtree AS \( SELECT n\.id FROM knowledge_nodes n WHERE n\.id = \? UNION SELECT e\.source_node_id FROM knowledge_edges e JOIN subtree s ON e\.target_node_id = s\.id WHERE e\.relation_type = 'PART_OF' \) SELECT n\.id FROM knowledge_nodes n WHERE n\.id IN \(SELECT id FROM subtree\)$/,
        rows: [{ id: SEED.subjectRoot.id }],
      },
    ]);
    const repo = new KnowledgeStructureRepository(sql);
    const ids = await repo.findSubtreeIds(SEED.subjectRoot.id);
    expect(ids).toEqual([SEED.subjectRoot.id]);
    const q = sql.queries[0]!;
    expect(q).toContain("WITH RECURSIVE subtree AS");
    expect(q).toContain("UNION");
    expect(q).toContain("WHERE e.relation_type = 'PART_OF'");
  });

  test("findNodesByIds batch-selects the node slice; empty input short-circuits", async () => {
    const sql = fakeSql([
      { match: /from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/i, rows: [SEED.subjectRoot] },
    ]);
    const repo = new KnowledgeStructureRepository(sql);
    const rows = await repo.findNodesByIds([SEED.subjectRoot.id]);
    expect(rows).toHaveLength(1);
    expect(await repo.findNodesByIds([])).toEqual([]);
    expect(sql.queries).toHaveLength(1); // empty path issued NO query
  });

  test("findPartOfParentsBySources resolves the PART_OF parent map; empty input short-circuits", async () => {
    const sql = fakeSql([
      {
        match: /from knowledge_edges where relation_type = 'PART_OF' and source_node_id = any\( \? ::uuid\[\]\)$/i,
        rows: [{ source_node_id: SEED.unit.id, target_node_id: SEED.subjectRoot.id }],
      },
    ]);
    const repo = new KnowledgeStructureRepository(sql);
    const map = await repo.findPartOfParentsBySources([SEED.unit.id]);
    expect(map[SEED.unit.id]).toBe(SEED.subjectRoot.id);
    expect(await repo.findPartOfParentsBySources([])).toEqual({});
  });
});

describe("CurriculumService — learner surface (golden-pinned shapes)", () => {
  test("versions maps the 6-key view (golden curriculum-versions-student-200)", async () => {
    const sql = fakeSql([
      {
        match: /from curriculum_versions where status = \? order by created_at desc$/i,
        rows: [VERSION_ROW],
      },
    ]);
    const svc = new CurriculumService(new CurriculumVersionsRepository(sql), new SubjectsRepository(sql));
    const out = await svc.versions(false);
    expect(out).toEqual([
      {
        id: SEED.version.id,
        board: "Edexcel",
        qualification: "IAL",
        code: "IAL-CHEM-2018",
        title: SEED.version.title,
        status: "ACTIVE",
      },
    ]);
  });

  test("subjects maps the nested view incl. nullable knowledgeNodeId (golden curriculum-subjects-student-200)", async () => {
    const sql = fakeSql([
      { match: /from subjects s join curriculum_versions cv .* order by s\.code$/i, rows: [SUBJECT_ROW] },
    ]);
    const svc = new CurriculumService(new CurriculumVersionsRepository(sql), new SubjectsRepository(sql));
    const out = await svc.subjects(null);
    expect(out).toEqual([
      {
        id: SEED.subject.id,
        code: "CHM",
        name: "Chemistry",
        knowledgeNodeId: SEED.subject.knowledgeNodeId,
        curriculumVersion: {
          id: SEED.version.id,
          board: "Edexcel",
          qualification: "IAL",
          code: "IAL-CHEM-2018",
          title: SEED.version.title,
          status: "ACTIVE",
        },
      },
    ]);
  });

  test("subjectById hit returns the view (golden curriculum-subject-by-id-student-200)", async () => {
    const sql = fakeSql([{ match: /where s\.id = \?$/i, rows: [SUBJECT_ROW] }]);
    const svc = new CurriculumService(new CurriculumVersionsRepository(sql), new SubjectsRepository(sql));
    const out = await svc.subjectById(SEED.subject.id);
    expect(out.id).toBe(SEED.subject.id);
    expect(out.curriculumVersion.id).toBe(SEED.version.id);
  });

  test("subjectById miss throws NotFoundException mapping to the golden 404 body (curriculum-subject-unknown-404)", async () => {
    const sql = fakeSql([{ match: /where s\.id = \?$/i, rows: [] }]);
    const svc = new CurriculumService(new CurriculumVersionsRepository(sql), new SubjectsRepository(sql));
    try {
      await svc.subjectById("00000000-0000-4000-8000-0000000000a1");
      throw new Error("should have thrown");
    } catch (e) {
      const mapped = toErrorResponse(e);
      expect(mapped).not.toBeNull();
      expect(mapped!.status).toBe(404);
      expect(mapped!.body.error).toBe("not_found");
      expect(mapped!.body.message).toBe(
        "subject 00000000-0000-4000-8000-0000000000a1 not found",
      );
    }
  });

  test("parsePathUuid guards the tranche-2 route with the golden 400 body (curriculum-subject-bad-uuid-400)", () => {
    expect(parsePathUuid(SEED.subject.id)).toBe(SEED.subject.id);
    try {
      parsePathUuid("not-a-uuid");
      throw new Error("should have thrown");
    } catch (e) {
      const mapped = toErrorResponse(e);
      expect(mapped).not.toBeNull();
      expect(mapped!.status).toBe(400);
      expect(mapped!.body.error).toBe("bad_request");
      expect(mapped!.body.message).toBe("malformed request");
    }
  });
});

describe("CurriculumReviewReadService — teacher GET surface", () => {
  test("versions() merges subtree status counts across subjects into the 9-key overview (golden teacher-curriculum-versions-teacher-200)", async () => {
    const sql = fakeSql([
      { match: /from curriculum_versions order by created_at desc$/i, rows: [VERSION_ROW] },
      {
        match: /where s\.curriculum_version_id = \? order by s\.code$/i,
        rows: [SUBJECT_ROW],
      },
      {
        match: /WITH RECURSIVE subtree/i,
        rows: [
          { id: SEED.subjectRoot.id },
          { id: SEED.unit.id },
        ],
      },
      {
        match: /from knowledge_nodes where id = any/i,
        rows: [SEED.subjectRoot, SEED.unit],
      },
    ]);
    const svc = new CurriculumReviewReadService(
      new CurriculumVersionsRepository(sql),
      new SubjectsRepository(sql),
      new KnowledgeStructureRepository(sql),
    );
    const out = await svc.versions();
    expect(out).toEqual([
      {
        id: SEED.version.id,
        board: "Edexcel",
        qualification: "IAL",
        code: "IAL-CHEM-2018",
        title: SEED.version.title,
        status: "ACTIVE",
        validatedNodes: 1, // subject root VALIDATED
        suggestedNodes: 0, // seed tree has no SUGGESTED rows (golden suggested-200 = [])
        unvalidatedNodes: 1, // unit UNVALIDATED
      },
    ]);
  });

  test("nodes() resolves parents, applies the status filter and sorts by code (golden teacher-curriculum-nodes-teacher-200)", async () => {
    const topic = {
      id: "20000000-0000-0000-0000-000000000011",
      code: "WCH11-T1",
      node_type: "TOPIC",
      title: "Formulae, Equations and Amount of Substance",
      validation_status: "UNVALIDATED",
      provenance: "Edexcel IAL specification topic list",
    };
    const sql = fakeSql([
      { match: /where s\.curriculum_version_id = \? order by s\.code$/i, rows: [SUBJECT_ROW] },
      {
        match: /WITH RECURSIVE subtree/i,
        rows: [
          { id: SEED.subjectRoot.id },
          { id: SEED.unit.id },
          { id: topic.id },
        ],
      },
      {
        match: /from knowledge_nodes where id = any/i,
        rows: [SEED.subjectRoot, topic, SEED.unit], // deliberately unsorted input
      },
      {
        match: /from knowledge_edges where relation_type = 'PART_OF' and source_node_id = any/i,
        rows: [
          { source_node_id: SEED.unit.id, target_node_id: SEED.subjectRoot.id },
          { source_node_id: topic.id, target_node_id: SEED.unit.id },
        ],
      },
    ]);
    const svc = new CurriculumReviewReadService(
      new CurriculumVersionsRepository(sql),
      new SubjectsRepository(sql),
      new KnowledgeStructureRepository(sql),
    );
    const out = await svc.nodes(SEED.version.id, null);
    // sorted by code: CHM < WCH11 < WCH11-T1 (Java String.compareTo parity)
    expect(out.map((n) => n.code)).toEqual(["CHM", "WCH11", "WCH11-T1"]);
    expect(out[0]).toEqual({
      id: SEED.subjectRoot.id,
      code: "CHM",
      nodeType: "SUBJECT",
      title: "Chemistry",
      validationStatus: "VALIDATED",
      provenance: "Edexcel IAL specification 2018",
      parentId: null, // subject root has no PART_OF parent (golden-pinned null)
    });
    expect(out[1]!.parentId).toBe(SEED.subjectRoot.id);
    expect(out[2]!.parentId).toBe(SEED.unit.id);
  });

  test("status=SUGGESTED filter over the VALIDATED/UNVALIDATED seed tree → [] (golden teacher-curriculum-nodes-suggested-200)", async () => {
    const sql = fakeSql([
      { match: /where s\.curriculum_version_id = \? order by s\.code$/i, rows: [SUBJECT_ROW] },
      { match: /WITH RECURSIVE subtree/i, rows: [{ id: SEED.subjectRoot.id }] },
      { match: /from knowledge_nodes where id = any/i, rows: [SEED.subjectRoot] },
      { match: /from knowledge_edges where relation_type = 'PART_OF' and source_node_id = any/i, rows: [] },
    ]);
    const svc = new CurriculumReviewReadService(
      new CurriculumVersionsRepository(sql),
      new SubjectsRepository(sql),
      new KnowledgeStructureRepository(sql),
    );
    expect(await svc.nodes(SEED.version.id, "SUGGESTED")).toEqual([]);
  });

  test("unknown version → empty subject list → 200 [] with NO subtree walk (golden teacher-curriculum-nodes-unknown-version-200-empty)", async () => {
    const sql = fakeSql([
      { match: /where s\.curriculum_version_id = \? order by s\.code$/i, rows: [] },
    ]);
    const svc = new CurriculumReviewReadService(
      new CurriculumVersionsRepository(sql),
      new SubjectsRepository(sql),
      new KnowledgeStructureRepository(sql),
    );
    expect(await svc.nodes("00000000-0000-4000-8000-0000000000a2", null)).toEqual([]);
    // exactly ONE query issued: the subjects list — no CTE, no node fetch
    expect(sql.queries).toHaveLength(1);
  });

  test("subject with null knowledge_node_id contributes nothing to counts (treeCounts Map.of() parity)", async () => {
    const orphanSubject = { ...SUBJECT_ROW, knowledge_node_id: null };
    const sql = fakeSql([
      { match: /from curriculum_versions order by created_at desc$/i, rows: [VERSION_ROW] },
      { match: /where s\.curriculum_version_id = \? order by s\.code$/i, rows: [orphanSubject] },
    ]);
    const svc = new CurriculumReviewReadService(
      new CurriculumVersionsRepository(sql),
      new SubjectsRepository(sql),
      new KnowledgeStructureRepository(sql),
    );
    const out = await svc.versions();
    expect(out[0]!.validatedNodes).toBe(0);
    expect(out[0]!.suggestedNodes).toBe(0);
    expect(out[0]!.unvalidatedNodes).toBe(0);
    expect(sql.queries).toHaveLength(2); // no CTE issued for the null root
  });
});

describe("byCode — Java String.compareTo parity", () => {
  test("UTF-16 code-unit order, case-sensitive", () => {
    expect(byCode({ code: "CHM" }, { code: "WCH11" })).toBe(-1);
    expect(byCode({ code: "WCH11" }, { code: "WCH11-T1" })).toBe(-1);
    expect(byCode({ code: "a" }, { code: "B" })).toBe(1); // case-sensitive
    expect(byCode({ code: "X" }, { code: "X" })).toBe(0);
  });
});
