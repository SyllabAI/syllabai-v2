/**
 * SME ingest service unit tests (T-MIG-033 tranche 3) — stubbed sql via
 * fakeSql (the statements themselves are the tested surface; the replace
 * flow's SQL sequence is pinned in ingest-flow.test.ts). Pins the frozen
 * law @ 6cad6ef: the pure emittedRowRefs/contentTypeOf/sourceDocIdOf laws,
 * the bounded ZIP walker (ZipSafety budgets + traversal guard + CRC),
 * the unzip translations, and the fail-closed validate messages (verbatim).
 */
import { describe, expect, test } from "bun:test";
import { contentTypeOf, emittedRowRefs, sourceDocIdOf, buildSmeModule } from "../../src/services/sme";
import { readEach, zipLimitsDefaults, ArchiveFormatError } from "../../src/services/sme/zip";
import { buildZip, mcq, pkgJson, structured, txSql, clock } from "./helpers";

const enc = new TextEncoder();

// ── pure laws ────────────────────────────────────────────────────────────────

describe("emittedRowRefs (frozen :321-348)", () => {
  test("pure MCQ emits just the base ref", () => {
    expect(emittedRowRefs(mcq())).toEqual(["4CH1-Q1"]);
  });
  test("pure structured emits just the base ref", () => {
    expect(emittedRowRefs(structured())).toEqual(["4CH1-Q2"]);
  });
  test("mixed (option part + plain part) emits -p1 and -s", () => {
    const q = structured({
      parts: [
        { label: "(a)", prompt: "pick", marks: 1, commandWord: null, solutionMd: null,
          options: [{ label: "A", text: "x", isCorrect: true }, { label: "B", text: "y", isCorrect: false }] },
        { label: "(b)", prompt: "plain", marks: 3, commandWord: null, solutionMd: null, options: null },
      ],
    } as Partial<Record<string, unknown>>);
    expect(emittedRowRefs(q)).toEqual(["4CH1-Q2", "4CH1-Q2-p1", "4CH1-Q2-s"]);
  });
  test("option-parts only emit -pN members (no -s without plain parts)", () => {
    const q = structured({
      parts: [
        { label: "(a)", prompt: "pick", marks: 2, commandWord: null, solutionMd: null,
          options: [{ label: "A", text: "x", isCorrect: true }, { label: "B", text: "y", isCorrect: false }] },
        { label: "(b)", prompt: "pick2", marks: 2, commandWord: null, solutionMd: null,
          options: [{ label: "A", text: "x", isCorrect: true }, { label: "B", text: "y", isCorrect: false }] },
      ],
    } as Partial<Record<string, unknown>>);
    expect(emittedRowRefs(q)).toEqual(["4CH1-Q2", "4CH1-Q2-p1", "4CH1-Q2-p2"]);
  });
});

describe("contentTypeOf (R14 demotion law, :571-584)", () => {
  test("raster + pdf are the inline set", () => {
    expect(contentTypeOf("a.png")).toBe("image/png");
    expect(contentTypeOf("a.jpg")).toBe("image/jpeg");
    expect(contentTypeOf("a.jpeg")).toBe("image/jpeg");
    expect(contentTypeOf("a.gif")).toBe("image/gif");
    expect(contentTypeOf("a.webp")).toBe("image/webp");
    expect(contentTypeOf("a.pdf")).toBe("application/pdf");
  });
  test("SVG is DEMOTED to application/octet-stream (stored-XSS defense)", () => {
    expect(contentTypeOf("a.svg")).toBe("application/octet-stream");
    expect(contentTypeOf("a.SVG")).toBe("application/octet-stream");
    expect(contentTypeOf("a.exe")).toBe("application/octet-stream");
  });
});

describe("sourceDocIdOf (:315-319)", () => {
  test("package source wins", () => {
    expect(sourceDocIdOf({ source: "sme-eq-maths", questions: [] } as never)).toBe("sme-eq-maths");
  });
  test("blank or absent falls back to the chemistry constant", () => {
    expect(sourceDocIdOf({ source: "  ", questions: [] } as never)).toBe("sme-eq-igcse-chemistry-19");
    expect(sourceDocIdOf({ source: null, questions: [] } as never)).toBe("sme-eq-igcse-chemistry-19");
  });
});

// ── the bounded ZIP walker (ZipSafety port) ─────────────────────────────────

describe("zip walker (ZipSafety.java laws)", () => {
  const dec = new TextDecoder();

  test("walks stored + deflated entries; directories skipped uncounted", () => {
    const zip = buildZip([
      { name: "docs/", data: new Uint8Array(0), method: 0 }, // directory
      { name: "package.json", data: pkgJson([]) },
      { name: "assets/img a(1).png", data: new Uint8Array([1, 2, 3]), method: 0 },
      { name: "assets/z.txt", data: enc.encode("hello deflate"), method: 8 },
    ]);
    const seen: string[] = [];
    readEach(zip, zipLimitsDefaults(), (name) => seen.push(name));
    expect(seen).toEqual(["package.json", "assets/img a(1).png", "assets/z.txt"]);
  });

  test("data-descriptor archives (sizes zeroed in the local header) parse via the central directory", () => {
    const zip = buildZip([{ name: "package.json", data: pkgJson([]), flags: 0x08, lieLocalSizes: true }]);
    const seen: string[] = [];
    readEach(zip, zipLimitsDefaults(), (name) => seen.push(name));
    expect(seen).toEqual(["package.json"]);
  });

  test("entry-count budget: 'archive contains more than N entries'", () => {
    const zip = buildZip([
      { name: "a.txt", data: new Uint8Array([1]), method: 0 },
      { name: "b.txt", data: new Uint8Array([2]), method: 0 },
    ]);
    expect(() =>
      readEach(zip, { maxEntryBytes: 1024, maxTotalBytes: 1024, maxEntries: 1 }, () => {}),
    ).toThrow("archive contains more than 1 entries");
  });

  test("per-entry budget aborts the inflate: verbatim message names the entry", () => {
    const big = new Uint8Array(4096); // deflates small, inflates past 100
    const zip = buildZip([{ name: "bomb.txt", data: big }]);
    expect(() =>
      readEach(zip, { maxEntryBytes: 100, maxTotalBytes: 1024, maxEntries: 10 }, () => {}),
    ).toThrow("archive entry 'bomb.txt' decompresses beyond the 100 byte per-entry budget");
  });

  test("total budget: verbatim message", () => {
    const zip = buildZip([
      { name: "a.bin", data: new Uint8Array(600), method: 0 },
      { name: "b.bin", data: new Uint8Array(600), method: 0 },
    ]);
    expect(() =>
      readEach(zip, { maxEntryBytes: 1024, maxTotalBytes: 1000, maxEntries: 10 }, () => {}),
    ).toThrow("archive decompresses beyond the 1000 byte total budget");
  });

  test("traversal guard: .. segments, backslashes, absolute paths, drive letters — verbatim", () => {
    for (const name of ["../evil.png", "a/../../evil.png", "win\\path.png", "/abs.png", "C:drive.png"]) {
      const zip = buildZip([{ name, data: new Uint8Array([1]), method: 0 }]);
      expect(() => readEach(zip, zipLimitsDefaults(), () => {})).toThrow(
        "archive contains an unsafe entry path: " + name,
      );
    }
  });

  test("plain dotted names stay legal (only RESOLVING upward is refused)", () => {
    const zip = buildZip([{ name: "a..b.png", data: new Uint8Array([1, 2]), method: 0 }]);
    expect(() => readEach(zip, zipLimitsDefaults(), () => {})).not.toThrow();
  });

  test("structural surprises are the ArchiveFormatError class (not-a-ZIP translation)", () => {
    expect(() => readEach(enc.encode("not a zip"), zipLimitsDefaults(), () => {})).toThrow(ArchiveFormatError);
    const truncated = buildZip([{ name: "a.txt", data: new Uint8Array([1]), method: 0 }]).slice(0, 40);
    expect(() => readEach(truncated, zipLimitsDefaults(), () => {})).toThrow(ArchiveFormatError);
  });

  test("CRC mismatch is a format error (java.util.zip verifies on close)", () => {
    const zip = buildZip([{ name: "a.txt", data: new Uint8Array([1, 2, 3]), method: 0, crcOverride: 0xdeadbeef }]);
    expect(() => readEach(zip, zipLimitsDefaults(), () => {})).toThrow(ArchiveFormatError);
  });

  test("encrypted entries are format errors", () => {
    const zip = buildZip([{ name: "a.txt", data: new Uint8Array([1]), method: 0, flags: 0x01 }]);
    expect(() => readEach(zip, zipLimitsDefaults(), () => {})).toThrow(ArchiveFormatError);
  });
});

// ── unzip + package parse (through the service) ─────────────────────────────

describe("unzip (service translation :586-626)", () => {
  function service() {
    return buildSmeModule(txSql([]), { newId: () => "7e571d00-0000-4000-8000-000000000099", now: () => new Date(0) }).ingestService;
  }

  test("package.json + assets collected; assets/ prefix stripped", () => {
    const svc = service();
    const zip = buildZip([
      { name: "package.json", data: pkgJson([]) },
      { name: "assets/deep/dir pic.svg", data: new Uint8Array([9]), method: 0 },
    ]);
    const parsed = svc.unzip(zip);
    expect(parsed.pkg.corpusVersion).toBe("cor-9");
    expect(parsed.pkg.source).toBe("sme-eq-test-1");
    expect(parsed.assetBytes.has("deep/dir pic.svg")).toBe(true);
  });

  test("missing package.json → verbatim message", () => {
    const svc = service();
    const zip = buildZip([{ name: "assets/x.png", data: new Uint8Array([1]), method: 0 }]);
    expect(() => svc.unzip(zip)).toThrow("package.json missing from the corpus package");
  });

  test("invalid package.json → the not-valid-JSON translation", () => {
    const svc = service();
    const zip = buildZip([{ name: "package.json", data: enc.encode("{nope") }]);
    expect(() => svc.unzip(zip)).toThrow("package.json is not valid sme-question-package JSON");
  });

  test("type-mismatched package.json → the same not-valid-JSON translation (Jackson class)", () => {
    const svc = service();
    const bad = JSON.stringify({ packageVersion: "1.0", questions: "not-a-list" });
    const zip = buildZip([{ name: "package.json", data: enc.encode(bad) }]);
    expect(() => svc.unzip(zip)).toThrow("package.json is not valid sme-question-package JSON");
  });

  test("not a ZIP → 'could not read the corpus package (not a ZIP?)'", () => {
    const svc = service();
    expect(() => svc.unzip(enc.encode("definitely not a zip"))).toThrow(
      "could not read the corpus package (not a ZIP?)",
    );
  });

  test("budget failures keep the ZipSafety verbatim message (BadRequest, not not-a-ZIP)", () => {
    const svc = service();
    const zip = buildZip([{ name: "bomb", data: new Uint8Array(2048) }]);
    expect(() =>
      svc.unzip(zip, { maxEntryBytes: 10, maxTotalBytes: 100, maxEntries: 10 }),
    ).toThrow("archive entry 'bomb' decompresses beyond the 10 byte per-entry budget");
  });

  test("unknown fields are ignored (JsonIgnoreProperties) and primitive defaults bind", () => {
    const svc = service();
    const doc = JSON.stringify({
      packageVersion: "1.0",
      someFutureField: { nested: true },
      questions: [{ externalRef: "R1", questionType: "MCQ_SINGLE" }], // marks etc default to 0
    });
    const parsed = svc.unzip(buildZip([{ name: "package.json", data: enc.encode(doc) }]));
    expect(parsed.pkg.questions?.length).toBe(1);
    expect(parsed.pkg.questions?.[0]?.marks).toBe(0); // Jackson int default → validate rejects later
  });
});

// ── validate (fail-closed, verbatim messages :437-559) ──────────────────────

describe("validate (verbatim messages)", () => {
  const svc = buildSmeModule(txSql([]), { newId: () => "7e571d00-0000-4000-8000-000000000099", now: () => new Date(0) }).ingestService;
  const noAssets = new Map<string, Uint8Array>();

  test("no questions", () => {
    expect(() => svc.validate({ packageVersion: "1.0", questions: [] } as never, noAssets)).toThrow(
      "package carries no questions",
    );
  });
  test("unsupported version — null renders 'null' in the message (Java concat law)", () => {
    expect(() => svc.validate({ packageVersion: null, questions: [mcq()] } as never, noAssets)).toThrow(
      "unsupported package version: null",
    );
    expect(() => svc.validate({ packageVersion: "2.0", questions: [mcq()] } as never, noAssets)).toThrow(
      "unsupported package version: 2.0",
    );
  });
  test("bad or duplicate externalRef (null, blank, >80, duplicate)", () => {
    for (const ref of [null, "   ", "x".repeat(81)]) {
      expect(() => svc.validate({ packageVersion: "1.0", questions: [mcq({ externalRef: ref })] } as never, noAssets)).toThrow(
        "bad or duplicate externalRef: " + ref,
      );
    }
    expect(() => svc.validate({ packageVersion: "1.0", questions: [mcq(), mcq()] } as never, noAssets)).toThrow(
      "bad or duplicate externalRef: 4CH1-Q1",
    );
  });
  test("bad marks/difficulty/time", () => {
    for (const [field, v] of [["marks", 0], ["difficulty", 0], ["difficulty", 6], ["expectedTimeSeconds", 0]] as const) {
      expect(() => svc.validate({ packageVersion: "1.0", questions: [mcq({ [field]: v })] } as never, noAssets)).toThrow(
        "bad marks/difficulty/time on 4CH1-Q1",
      );
    }
  });
  test("unknown questionType", () => {
    expect(() => svc.validate({ packageVersion: "1.0", questions: [mcq({ questionType: "ESSAY" })] } as never, noAssets)).toThrow(
      "unknown questionType on 4CH1-Q1",
    );
  });
  test("missing primaryTopicCode", () => {
    expect(() => svc.validate({ packageVersion: "1.0", questions: [mcq({ primaryTopicCode: " " })] } as never, noAssets)).toThrow(
      "missing primaryTopicCode on 4CH1-Q1",
    );
  });
  test("MCQ option laws (<2 options, !=1 correct, duplicate label)", () => {
    expect(() => svc.validate({ packageVersion: "1.0", questions: [mcq({ options: [] })] } as never, noAssets)).toThrow(
      "MCQ needs >=2 options: 4CH1-Q1",
    );
    expect(() => svc.validate({
      packageVersion: "1.0",
      questions: [mcq({ options: [{ label: "A", text: "a", isCorrect: true }, { label: "B", text: "b", isCorrect: true }] })],
    } as never, noAssets)).toThrow("MCQ must have exactly one correct option: 4CH1-Q1");
    expect(() => svc.validate({
      packageVersion: "1.0",
      questions: [mcq({ options: [{ label: "A", text: "a", isCorrect: true }, { label: "A", text: "b", isCorrect: false }] })],
    } as never, noAssets)).toThrow("bad/duplicate option label: 4CH1-Q1");
  });
  test("structured part laws (no parts, marks sum, duplicate labels)", () => {
    expect(() => svc.validate({ packageVersion: "1.0", questions: [structured({ parts: [] })] } as never, noAssets)).toThrow(
      "STRUCTURED needs parts: 4CH1-Q2",
    );
    expect(() => svc.validate({ packageVersion: "1.0", questions: [structured({ marks: 5 })] } as never, noAssets)).toThrow(
      "part marks sum != question marks on 4CH1-Q2",
    );
    const dup = structured({
      parts: [
        { label: "(a)", prompt: "p", marks: 2, commandWord: null, solutionMd: null, options: null },
        { label: "(a)", prompt: "p", marks: 2, commandWord: null, solutionMd: null, options: null },
      ],
    } as Partial<Record<string, unknown>>);
    expect(() => svc.validate({ packageVersion: "1.0", questions: [dup] } as never, noAssets)).toThrow(
      "bad/duplicate part label: 4CH1-Q2",
    );
  });
  test("option-bearing parts obey the MCQ laws with the 'part <label>' suffix", () => {
    const optPart = { label: "(a)", prompt: "pick", marks: 4, commandWord: null, solutionMd: null, options: [] as unknown[] };
    expect(() => svc.validate({ packageVersion: "1.0", questions: [structured({ parts: [optPart] })] } as never, noAssets)).toThrow(
      "option part needs >=2 options: 4CH1-Q2 part (a)",
    );
    const twoCorrect = structured({
      parts: [{ ...optPart, options: [{ label: "A", text: "x", isCorrect: true }, { label: "B", text: "y", isCorrect: true }] }],
    } as Partial<Record<string, unknown>>);
    expect(() => svc.validate({ packageVersion: "1.0", questions: [twoCorrect] } as never, noAssets)).toThrow(
      "option part must have exactly one correct option: 4CH1-Q2 part (a)",
    );
    const dupLabel = structured({
      parts: [{ ...optPart, options: [{ label: "A", text: "x", isCorrect: true }, { label: "A", text: "y", isCorrect: false }] }],
    } as Partial<Record<string, unknown>>);
    expect(() => svc.validate({ packageVersion: "1.0", questions: [dupLabel] } as never, noAssets)).toThrow(
      "bad/duplicate option label on 4CH1-Q2 part (a)",
    );
  });
  test("bad spec point (blank code / role outside PRIMARY|SECONDARY)", () => {
    for (const sp of [{ code: " ", role: "PRIMARY" }, { code: "4CH1-1.1", role: "OTHER" }]) {
      expect(() => svc.validate({ packageVersion: "1.0", questions: [structured({ specPoints: [sp] })] } as never, noAssets)).toThrow(
        "bad spec point on 4CH1-Q2",
      );
    }
  });
  test("referenced asset missing from package", () => {
    const q = mcq({ stem: "see (assets/diagram.png) here" });
    expect(() => svc.validate({ packageVersion: "1.0", questions: [q] } as never, noAssets)).toThrow(
      "referenced asset missing from package: diagram.png",
    );
  });
  test("unsafe asset filename (the SAFE_FILENAME law; a..b.png stays legal)", () => {
    const q = mcq({ stem: "see (assets/ok.png)" });
    const withOk: Array<[string, Uint8Array]> = [["ok.png", new Uint8Array([1])]];
    expect(() =>
      svc.validate({ packageVersion: "1.0", questions: [q] } as never, new Map([...withOk, ["bad/slash.png", new Uint8Array([1])]])),
    ).toThrow("unsafe asset filename: bad/slash.png");
    expect(() =>
      svc.validate({ packageVersion: "1.0", questions: [q] } as never, new Map([...withOk, ["a..b.png", new Uint8Array([1])]])),
    ).not.toThrow();
  });
  test("derived -pN/-s refs join the uniqueness set (a literal member ref is a duplicate)", () => {
    const mixed = structured({
      parts: [
        { label: "(a)", prompt: "pick", marks: 2, commandWord: null, solutionMd: null,
          options: [{ label: "A", text: "x", isCorrect: true }, { label: "B", text: "y", isCorrect: false }] },
        { label: "(b)", prompt: "plain", marks: 2, commandWord: null, solutionMd: null, options: null },
      ],
    } as Partial<Record<string, unknown>>);
    const literal = mcq({ externalRef: "4CH1-Q2-p1" });
    expect(() => svc.validate({ packageVersion: "1.0", questions: [mixed, literal] } as never, noAssets)).toThrow(
      "duplicate externalRef: 4CH1-Q2-p1",
    );
  });
});
