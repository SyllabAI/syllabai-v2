/**
 * W2-F1 pins — the Java Instant.toString() writer against the exact
 * T-MIG-022 capture vectors (run-001-diagnosis.txt: 1021 divergences, all
 * the same rule: expected micros "…T12:59:21.578011Z" vs actual millis
 * "…T12:59:21.578Z") plus the Jackson JSR-310 ISO_INSTANT fraction-rule
 * classes and the fail-fast contract. These are the offline stand-in for
 * the live golden replay while the sandbox cannot resolve api.neon.tech —
 * when a Neon-capable environment runs the replay, the 1021 sites must
 * go green WITHOUT touching these pins or the golden cases.
 */
import { describe, expect, it } from "bun:test";
import { javaInstant } from "../../src/services/content/instant";
import {
  ContentReviewAuditRepository,
  DocumentRepository,
  ExamPaperRepository,
} from "../../src/services/content/repositories";

/** The 1021-divergence samples, verbatim from run-001-diagnosis.txt. */
const CAPTURE_VECTORS: Array<[string, string]> = [
  ["2026-09-21T12:59:21.578011", "2026-09-21T12:59:21.578011Z"],
  ["2026-10-04T09:37:00.129532", "2026-10-04T09:37:00.129532Z"],
  ["2026-10-04T09:36:50.349879", "2026-10-04T09:36:50.349879Z"],
  ["2026-10-04T09:36:40.552213", "2026-10-04T09:36:40.552213Z"],
  ["2026-10-04T09:36:30.997255", "2026-10-04T09:36:30.997255Z"],
  ["2026-10-04T09:36:14.761725", "2026-10-04T09:36:14.761725Z"],
  ["2026-10-04T09:36:00.526822", "2026-10-04T09:36:00.526822Z"],
  ["2026-09-28T21:14:15.592864", "2026-09-28T21:14:15.592864Z"],
];

describe("javaInstant — capture-parity (T-MIG-022 F-1 samples)", () => {
  for (const [input, expected] of CAPTURE_VECTORS) {
    it(`${input} → ${expected}`, () => {
      expect(javaInstant(input)).toBe(expected);
    });
  }
});

describe("javaInstant — ISO_INSTANT fraction rule (0/3/6/9 digits)", () => {
  it("zero fraction renders no dot at all", () => {
    expect(javaInstant("2026-01-02T03:04:05.000000")).toBe("2026-01-02T03:04:05Z");
  });
  it("whole-millis micros collapse to the 3-digit group", () => {
    expect(javaInstant("2026-01-02T03:04:05.578000")).toBe("2026-01-02T03:04:05.578Z");
    expect(javaInstant("2026-01-02T03:04:05.129000")).toBe("2026-01-02T03:04:05.129Z");
  });
  it("sub-millis micros keep the 6-digit group", () => {
    expect(javaInstant("2026-01-02T03:04:05.578010")).toBe("2026-01-02T03:04:05.578010Z");
  });
  it("1-2 digit fractions are Java-parsed (groups of three on output)", () => {
    expect(javaInstant("2026-01-02T03:04:05.5Z")).toBe("2026-01-02T03:04:05.500Z");
    expect(javaInstant("2026-01-02T03:04:05.01Z")).toBe("2026-01-02T03:04:05.010Z");
  });
  it("true nanos reach the 9-digit branch (unreachable from timestamptz, defensive)", () => {
    expect(javaInstant("2026-01-02T03:04:05.578011200")).toBe("2026-01-02T03:04:05.578011200Z");
    expect(javaInstant("2026-01-02T03:04:05.000000001")).toBe("2026-01-02T03:04:05.000000001Z");
  });
});

describe("javaInstant — input dialects and offset normalization", () => {
  it("pg raw text (space separator, +00) equals the SQL cast output", () => {
    expect(javaInstant("2026-09-21 12:59:21.578011+00")).toBe("2026-09-21T12:59:21.578011Z");
    expect(javaInstant("2026-09-21 12:59:21+00")).toBe("2026-09-21T12:59:21Z");
  });
  it("compact +0000 and Z inputs", () => {
    expect(javaInstant("2026-09-21 12:59:21.578011+0000")).toBe("2026-09-21T12:59:21.578011Z");
    expect(javaInstant("2026-09-21T12:59:21.578011Z")).toBe("2026-09-21T12:59:21.578011Z");
  });
  it("non-zero offsets normalize to UTC", () => {
    expect(javaInstant("2026-09-21 14:59:21.578011+02")).toBe("2026-09-21T12:59:21.578011Z");
    expect(javaInstant("2026-09-21T07:29:21.500-05:30")).toBe("2026-09-21T12:59:21.500Z");
    expect(javaInstant("2026-09-21 23:59:59.999999+02")).toBe("2026-09-21T21:59:59.999999Z");
  });
  it("offset normalization crosses the day boundary exactly", () => {
    expect(javaInstant("2026-09-21 00:30:00.000001+02")).toBe("2026-09-20T22:30:00.000001Z");
    expect(javaInstant("2026-01-01 00:00:00.000001+00")).toBe("2026-01-01T00:00:00.000001Z");
  });
  it("pre-1970 epochs render exactly (negative seconds, fraction carried separately)", () => {
    expect(javaInstant("1969-12-31 23:59:59.000001+00")).toBe("1969-12-31T23:59:59.000001Z");
  });
  it("the writer is idempotent over its own output", () => {
    for (const [, once] of CAPTURE_VECTORS) expect(javaInstant(once)).toBe(once);
  });
});

describe("javaInstant — fail-fast contract", () => {
  it("throws on Date (a Date renders millis only — fix the select, never this)", () => {
    expect(() => javaInstant(new Date())).toThrow(TypeError);
  });
  it("throws on null/undefined/non-string", () => {
    expect(() => javaInstant(null)).toThrow(TypeError);
    expect(() => javaInstant(undefined)).toThrow(TypeError);
    expect(() => javaInstant(42)).toThrow(TypeError);
  });
  it("throws on garbage and out-of-range components (no silent rollover)", () => {
    expect(() => javaInstant("not-a-time")).toThrow(TypeError);
    expect(() => javaInstant("2026-13-01T00:00:00.000000")).toThrow(TypeError);
    expect(() => javaInstant("2026-01-01T24:00:00.000000")).toThrow(TypeError);
    expect(() => javaInstant("2026-01-01T00:00:60.000000")).toThrow(TypeError);
    expect(() => javaInstant("2026-09-21 12:59:21.578011+99")).toThrow(TypeError);
  });
});

/**
 * Repository wiring pins: the SQL selects the UTC text cast LITERALLY
 * (SqlFn interpolations are bound parameters — toQuery() — so the cast
 * must never move into ${}), and the mappers route through javaInstant.
 */
describe("repositories — W2-F1 timestamp wiring", () => {
  const DOC_ROW = {
    id: "00000000-0000-0000-0000-000000000001",
    document_id: "doc-1",
    doc_version: 1,
    kind: "QUESTION_PAPER",
    file_name: "paper.pdf",
    source_uri: "s3://bucket/paper.pdf",
    page_count: 4,
    element_count: 40,
    text_element_count: 32,
    chunk_count: 12,
    source_engine: "glm_ocr",
    source_engine_version: "1",
    checksum: "abc",
    checksum_algorithm: "sha256",
    canonical_json: { sealed: true },
    created_at: "2026-09-21T12:59:21.578011", // the SQL cast's canonical form
  };

  function capturingStub(rows: Array<Record<string, unknown>>) {
    const queries: string[] = [];
    const stub = ((strings: TemplateStringsArray) => {
      queries.push(strings.join("?"));
      return Promise.resolve(rows);
    }) as unknown as (s: TemplateStringsArray, ...p: unknown[]) => Promise<Array<Record<string, unknown>>>;
    return { stub, queries };
  }

  it("DocumentRepository selects the UTC text cast verbatim and maps micros through", async () => {
    const { stub, queries } = capturingStub([DOC_ROW]);
    const doc = await new DocumentRepository(stub).findById("x");
    expect(doc?.createdAt).toBe("2026-09-21T12:59:21.578011Z");
    expect(
      queries[0]!.includes(
        `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as created_at`,
      ),
    ).toBe(true);
    expect(queries[0]!.includes("from documents where id")).toBe(true);
  });

  it("DocumentRepository list query keeps the Java finder ordering on the raw column", async () => {
    const { stub, queries } = capturingStub([DOC_ROW]);
    const docs = await new DocumentRepository(stub).findAllByOrderByCreatedAtDesc();
    expect(docs[0]?.createdAt).toBe("2026-09-21T12:59:21.578011Z");
    expect(
      queries[0]!.includes(
        `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as created_at`,
      ),
    ).toBe(true);
    expect(queries[0]!.includes("order by created_at desc")).toBe(true);
  });

  it("ExamPaperRepository maps paper createdAt through the writer", async () => {
    const paper = {
      id: "00000000-0000-0000-0000-000000000002",
      subject_id: "00000000-0000-0000-0000-000000000003",
      title: "Paper",
      paper_code: null,
      session_label: null,
      board: "Edexcel",
      qualification: "GCSE",
      validation_state: "VALIDATED",
      question_paper_document_id: null,
      mark_scheme_document_id: null,
      created_at: "2026-10-04T09:36:00.526822",
    };
    const { stub, queries } = capturingStub([paper]);
    const row = await new ExamPaperRepository(stub).findById("p");
    expect(row?.createdAt).toBe("2026-10-04T09:36:00.526822Z");
    expect(
      queries[0]!.includes(
        `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as created_at`,
      ),
    ).toBe(true);
  });

  it("ContentReviewAuditRepository keeps the null branch and maps occurred_at", async () => {
    const rows = [
      {
        occurred_at: "2026-10-04T09:37:00.129532",
        actor_label: "teacher",
        action: "VALIDATE",
        target_type: "exam_paper",
        target_id: "t1",
        from_state: "SUGGESTED",
        to_state: "VALIDATED",
        detail: "d",
      },
      {
        occurred_at: null,
        actor_label: "teacher",
        action: "AUDIT",
        target_type: "exam_paper",
        target_id: "t1",
        from_state: null,
        to_state: null,
        detail: "e",
      },
    ];
    const { stub, queries } = capturingStub(rows);
    const audit = await new ContentReviewAuditRepository(stub).findPaperAudit(
      "p",
      [],
      [],
      [],
    );
    expect(audit[0]?.occurredAt).toBe("2026-10-04T09:37:00.129532Z");
    expect(audit[1]?.occurredAt).toBeNull();
    expect(
      queries[0]!.includes(
        `to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as occurred_at`,
      ),
    ).toBe(true);
    expect(queries[0]!.includes("order by occurred_at asc")).toBe(true);
  });

  it("a Date slipping through the transport is a loud failure, not silent millis", async () => {
    const { stub } = capturingStub([{ ...DOC_ROW, created_at: new Date(0) }]);
    await expect(new DocumentRepository(stub).findById("x")).rejects.toThrow(TypeError);
  });
});
