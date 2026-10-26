/**
 * rebaseline.test.ts — T-MIG-002-R: offline proofs for the re-baseline tool.
 *
 * These tests are the standing regression gate for the T-MIG-002 baseline:
 *   - fixer: exactly the documented F3 renderer-defect shapes are repaired,
 *     site-for-site, idempotently, byte-identically on re-run;
 *   - verifier: the CHECKED-IN schema is snapshot-faithful — 63 tables at the T-MIG-002
 *     baseline (579 columns / 87 indexes / 54 FKs / 98 checks), advanced band-by-band
 *     as additive migrations land (T-MIG-133 band 133a mechanic; DC-6 phase 3 adds
 *     cla_threads + cla_thread_messages) — 0 drifts (the re-proof
 *     of run-001's "579/579 columns parity" claim, now executed on every
 *     test run);
 *   - differ: identical snapshots → no drift; structural mutations are caught;
 *   - guards: the pull command refuses empty/jdbc/production targets.
 *
 * No network, no Neon contact: everything runs against the checked-in files
 * and in-memory fixtures.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyRendererFixes,
  defaultParity,
  diffSnapshots,
  doctor,
  loadSnapshot,
  loadRuntimeSchema,
  pullGuards,
  specialTypeMap,
  verifyBaseline,
  type Snapshot,
} from "./rebaseline.ts";

// ---------------------------------------------------------------------------
// Fixer — F3a + F3b shapes as documented by T-MIG-002 run-001 (F3)
// ---------------------------------------------------------------------------

const BROKEN = `import { pgTable, uuid, text, varchar, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const teacherValidationEvents = pgTable("teacher_validation_events", {
        id: uuid().primaryKey().notNull(),
        targetLabel: varchar("target_label", { length: 120 }).default(').notNull(),
        note: text().default(').notNull(),
        appliedAt: timestamp("applied_at").defaultNow().notNull(),
})

export const revisionNoteAsset = pgTable("revision_note_asset", {
        id: uuid().primaryKey().notNull(),
        bytes: unknown("bytes").notNull(),
})

export const revisionNote = pgTable("revision_note", {
        specPointCodes: text("spec_point_codes").default(').notNull(),
})

export const content = pgTable("content", {
        id: uuid().primaryKey().notNull(),
        contentTsv: unknown("content_tsv").generatedAlwaysAs(sql\`to_tsvector('english'::regconfig, content)\`),
})

export const questionAsset = pgTable("question_asset", {
        id: uuid().primaryKey().notNull(),
        bytes: unknown("bytes").notNull(),
})

export const contentReviewAudit = pgTable("content_review_audit", {
        id: uuid().primaryKey().notNull(),
        actorLabel: varchar("actor_label", { length: 254 }).default(').notNull(),
        detail: text().default(').notNull(),
})
`;

const SPECIALS = new Map<string, "bytea" | "tsvector">([
  ["bytes", "bytea"],
  ["content_tsv", "tsvector"],
]);

describe("applyRendererFixes (F3)", () => {
  test("repairs exactly the documented defect sites", () => {
    const r = applyRendererFixes(BROKEN, SPECIALS);
    expect(r.f3aSites).toHaveLength(5); // 5 empty-string default sites
    expect(r.f3bSites).toHaveLength(3); // 2× bytea("bytes") + 1× tsvector("content_tsv")
    expect(r.unmappedUnknown).toHaveLength(0);
    expect(r.importInjected).toBe(true);

    // F3a: closing quote restored
    expect(r.text).toContain(`.default('')`);
    expect(r.text).not.toContain(`.default(')`);
    // F3b: shims substituted per the snapshot type map
    expect(r.text.match(/bytea\("bytes"\)/g)).toHaveLength(2);
    expect(r.text).toContain(`tsvector("content_tsv")`);
    expect(r.text).not.toContain(`unknown(`);
    // import carries exactly the used shims
    expect(r.text).toContain(`import { bytea, tsvector } from "./custom_types"`);
  });

  test("is idempotent — second pass is a byte-identical no-op", () => {
    const once = applyRendererFixes(BROKEN, SPECIALS);
    const twice = applyRendererFixes(once.text, SPECIALS);
    expect(twice.f3aSites).toHaveLength(0);
    expect(twice.f3bSites).toHaveLength(0);
    expect(twice.importInjected).toBe(false);
    expect(twice.importAdjusted).toBe(false);
    expect(twice.text).toBe(once.text);
  });

  test("the CHECKED-IN schema is already clean (fresh pull + fix converges to it)", () => {
    // On the committed (fixed) files the fixer must find zero sites.
    const checkedIn = readFileSync(
      fileURLToPath(new URL("../src/schema/schema.ts", import.meta.url)),
      "utf8",
    );
    const r = applyRendererFixes(checkedIn, SPECIALS);
    expect(r.f3aSites).toHaveLength(0);
    expect(r.f3bSites).toHaveLength(0);
    expect(r.text).toBe(checkedIn);
  });

  test("unmapped unknown() sites are reported, never silently kept or mangled", () => {
    const r = applyRendererFixes(
      `export const t = pgTable("t", { x: unknown("mystery") })`,
      SPECIALS,
    );
    expect(r.unmappedUnknown).toEqual(["mystery"]);
    expect(r.text).toContain(`unknown("mystery")`);
  });
});

// ---------------------------------------------------------------------------
// defaultParity — calibrated literal rules over the snapshot's shapes
// ---------------------------------------------------------------------------

function col(snapDefault: unknown, run: Partial<Parameters<typeof defaultParity>[2]> = {}) {
  return [
    { name: "c", type: "text", notNull: true, default: snapDefault } as any,
    {
      name: "c",
      notNull: true,
      hasDefault: run.hasDefault ?? true,
      defaultValue: run.defaultValue,
      hasDefaultFn: run.hasDefaultFn ?? false,
      sqlType: run.sqlType ?? "text",
    } as any,
  ] as const;
}

describe("defaultParity (calibrated shapes)", () => {
  test("empty-string literal", () => {
    const [s, r] = col("''", { defaultValue: "" });
    expect(defaultParity("t.c", s, r)).toBeNull();
  });
  test("non-empty quoted literal", () => {
    const [s, r] = col("'UNVALIDATED'", { defaultValue: "UNVALIDATED" });
    expect(defaultParity("t.c", s, r)).toBeNull();
  });
  test("quoted literal mismatch is drift", () => {
    const [s, r] = col("'DRAFT'", { defaultValue: "OTHER" });
    expect(defaultParity("t.c", s, r)?.kind).toBe("default");
  });
  test("jsonb cast literal", () => {
    const [s, r] = col("'{}'::jsonb", { defaultValue: {} });
    expect(defaultParity("t.c", s, r)).toBeNull();
    const [s2, r2] = col("'[]'::jsonb", { defaultValue: [] });
    expect(defaultParity("t.c", s2, r2)).toBeNull();
    const [s3, r3] = col("'[]'::jsonb", { defaultValue: ["x"] });
    expect(defaultParity("t.c", s3, r3)?.kind).toBe("default");
  });
  test("python-cased booleans", () => {
    const [s, r] = col("True", { defaultValue: true });
    expect(defaultParity("t.c", s, r)).toBeNull();
    const [s2, r2] = col("False", { defaultValue: false });
    expect(defaultParity("t.c", s2, r2)).toBeNull();
    const [s3, r3] = col("True", { defaultValue: false });
    expect(defaultParity("t.c", s3, r3)?.kind).toBe("default");
  });
  test("numerics", () => {
    const [s, r] = col(1, { defaultValue: 1 });
    expect(defaultParity("t.c", s, r)).toBeNull();
    const [s2, r2] = col(0.6, { defaultValue: 0.6 });
    expect(defaultParity("t.c", s2, r2)).toBeNull();
  });
  test("now() — presence via defaultFn", () => {
    const [s, r] = col("now()", { defaultValue: undefined, hasDefaultFn: true });
    expect(defaultParity("t.c", s, r)).toBeNull();
  });
  test("serial DB-side sequence: snapshot records none, runtime hasDefault", () => {
    const [s, r] = col(undefined, { hasDefault: true, sqlType: "bigserial" });
    expect(defaultParity("t.c", s, r)).toBeNull();
  });
  test("one-sided defaults are drift", () => {
    const [s1, r1] = col(undefined, { hasDefault: true, sqlType: "text" });
    expect(defaultParity("t.c", s1, r1)?.kind).toBe("default");
    const [s2, r2] = col("''", { hasDefault: false });
    expect(defaultParity("t.c", s2, r2)?.kind).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// specialTypeMap — the snapshot drives shim selection
// ---------------------------------------------------------------------------

describe("specialTypeMap", () => {
  const snap = loadSnapshot();
  test("baseline special columns resolve to bytea/tsvector", () => {
    const m = specialTypeMap(snap);
    // keyed by COLUMN NAME: "bytes" (bytea) covers both revision_note_asset
    // and question_asset; "content_tsv" (tsvector) is document_chunks.
    expect(m.get("bytes")).toBe("bytea");
    expect(m.get("content_tsv")).toBe("tsvector");
    expect(m.size).toBe(2); // 3 live sites collapse onto 2 distinct names
  });
  test("conflicting types on one column name are rejected", () => {
    const bad = {
      tables: {
        "public.a": {
          name: "a",
          columns: {
            x: { name: "x", type: "bytea", notNull: true },
            y: { name: "y", type: "bytea", notNull: false },
          },
          indexes: {},
          foreignKeys: {},
        },
        "public.b": {
          name: "b",
          columns: {
            x: { name: "x", type: "tsvector", notNull: false },
          },
          indexes: {},
          foreignKeys: {},
        },
      },
    } as unknown as Snapshot;
    expect(() => specialTypeMap(bad)).toThrow(/manual disambiguation/);
  });
});

// ---------------------------------------------------------------------------
// verifyBaseline — the standing re-proof of run-001 (REAL checked-in files)
// ---------------------------------------------------------------------------

describe("verifyBaseline (checked-in baseline)", () => {
  // count bumps per baseline-extending migration: 70/667/98/62/115 was the
  // T-MIG-002-R proof; T-TEACH-011 (0008_teaching_toolkit) adds 2 tables,
  // 17 columns, 1 index, 3 fks, 2 checks → 72/684/99/65/117;
  // DC-3 (0009_dc3-mark-entitlement) adds 3 tables, 18 columns, 3 indexes,
  // 5 fks, 3 checks → 75/702/102/70/120 (measured: verifyBaseline VERIFY
  // PASS, 0 drifts, on the union end-state; renumber receipts: F-182 in the
  // F182 plan, DC-5 in the lane's merge receipt (0010_dc5-... renumbered to
  // 0011_dc5-... — main's F-182 lane took the 0010 slot with drill_surface and
  // the landed F-182 journal repair of record supersedes the DC-5 sandbox copy).
  // DC-5 (0011_dc5-mark-point-alternatives) adds 1 table, 9 columns,
  // 2 indexes, 2 fks, 1 check (uq_mpa_row rides uniqueConstraints, not the
  // index count) on top of the F-182 re-baseline (was 75/702/102/70/120 ->
  // 77/730/105/73/126) -> 78/739/107/75/127
  // (docs/DC5-CONFORMANCE-LINT-PLAN.md + docs/F182-DRILL-BUILD-PLAN.md).
  // Study-Plan Builder (0012_study_plans) adds 1 table, 8 columns,
  // 0 explicit indexes, 1 fk, 1 check (uq_study_plan_learner rides
  // uniqueConstraints; the PK auto-index is not counted — the mpa precedent)
  // on top of the DC-5 baseline -> 79/747/107/76/128
  // (docs/STUDY-PLAN-BUILDER-PLAN.md).
  // T-OPS-PLANE-001 run-004 (0013_warehouse_registry) adds 1 table,
  // 7 columns, 1 index, 1 fk, 1 check on top of the study-plan baseline
  // -> 80/754/108/77/129 (ADR-038 fleet map + the serving flip law).
  // T-SENECA-001 run-004 (0014_assignment_resource_tables, the placement
  // rework) adds 2 tables, 14 columns, 4 indexes, 3 fks, 4 checks (uq pair/
  // triple ride uniqueConstraints, not the index count) on top of the
  // warehouse-registry baseline -> 82/768/112/80/133. seneca_resources
  // itself is a CORPUS plane — it lives in the sci-chem warehouse (template
  // wh-v2), never in main (docs/DATA-PLANE-PLACEMENT.md).
  // ADR-040 (0015_adr040-levels-of-response, re-baselined on the task-owned
  // COW branch t-sm-adr040-mig/r0-0015 after the restore-lost 0007+0014
  // artifacts were re-applied to it — see the PR receipt): mark_bands adds
  // 1 table, 9 columns, 1 index, 1 fk, 4 checks; scheme_kind + metric +
  // band_placement add 3 columns and 2 checks -> 83/780/111/81/139. The
  // index count reads 111 (not 112+1): the restored estate registers
  // uq_book_chapters_identity / uq_documents_canonical_id as unique
  // CONSTRAINTS, which the parity law normalizes against the of-record
  // runtime schema (0 drifts, verified).
  test("83/781/112/82/139 — runtime schema is snapshot-faithful, 0 drifts", async () => {
    const v = await verifyBaseline();
    if (!v.ok) console.error(v.drifts.map((d) => `[${d.kind}] ${d.detail}`).join("\n"));
    expect(v.ok).toBe(true);
    expect(v.inventory).toContain("tables 83/83");
    expect(v.inventory).toContain("columns 781");
    expect(v.inventory).toContain("indexes 112");
    expect(v.inventory).toContain("fks 82");
    expect(v.inventory).toContain("checks 139");
  });

  test("runtime loader sees the real table inventory", async () => {
    const run = await loadRuntimeSchema();
    expect(run.size).toBe(83);
    expect(run.has("public.mark_bands")).toBe(true); // ADR-040 — the levels analog of mark_points
    expect(run.has("public.warehouse_registry")).toBe(true);
    // T-SENECA-001 run-004 — the pack side families ride 0014 in MAIN; the
    // corpus table itself lives in the sci-chem warehouse, never here
    expect(run.has("public.assignment_resources")).toBe(true);
    expect(run.has("public.assignment_resource_states")).toBe(true);
    expect(run.has("public.seneca_resources")).toBe(false);
    expect(run.has("public.flyway_schema_history")).toBe(true);
    expect(run.has("public.document_chunks")).toBe(true);
    expect(run.has("public.book_chapters")).toBe(true);
    // T-BOOK-002 — the interactive rail family (ADR-BOOK-0001)
    expect(run.has("public.book_blocks")).toBe(true);
    expect(run.has("public.book_glossary_terms")).toBe(true);
    expect(run.has("public.chapter_progress")).toBe(true);
    // T-TEACH-002 — the class feature toggles + the course bridge (ADR-CLASS-0001)
    expect(run.has("public.class_features")).toBe(true);
    expect(run.has("public.course_registry")).toBe(true);
    // T-TEACH-011 — the Teaching Toolkit append-only results + quota counter
    expect(run.has("public.teaching_toolkit_resources")).toBe(true);
    expect(run.has("public.teaching_toolkit_usage")).toBe(true);
    // DC-3 — the re-attempt entitlement substrate (additive, v2-owned)
    expect(run.has("public.ai_mark_events")).toBe(true);
    expect(run.has("public.mark_entitlement_policies")).toBe(true);
    expect(run.has("public.mark_entitlements")).toBe(true);
    // F-182 build — the drill surface's own lane (zero-stakes by construction)
    expect(run.has("public.drill_draws")).toBe(true);
    expect(run.has("public.drill_part_evidence")).toBe(true);
    // DC-5 — the materialised acceptable-answer surface (additive, v2-owned)
    expect(run.has("public.mark_point_alternatives")).toBe(true);
    // Study-Plan Builder — the learner's plan-config row (additive, v2-owned;
    // the ONLY persisted state of the lane — the week stays a projection)
    expect(run.has("public.study_plans")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// diffSnapshots — the drift detector
// ---------------------------------------------------------------------------

function withMutations(base: Snapshot, mutate: (t: any) => void): Snapshot {
  const clone = JSON.parse(JSON.stringify(base)) as Snapshot;
  mutate(clone);
  return clone;
}

describe("diffSnapshots", () => {
  const base = loadSnapshot();

  test("identical snapshots → no drift", () => {
    expect(diffSnapshots(base, JSON.parse(JSON.stringify(base)))).toHaveLength(0);
  });

  test("added table / column / index / check are each caught", () => {
    const addedTable = withMutations(base, (s) => {
      s.tables["public.new_table"] = {
        name: "new_table",
        columns: { id: { name: "id", type: "uuid", notNull: true } },
        indexes: {},
        foreignKeys: {},
      } as any;
    });
    let d = diffSnapshots(base, addedTable);
    expect(d.some((l) => l.op === "+" && l.text === "table public.new_table")).toBe(true);

    const addedCol = withMutations(base, (s) => {
      (s.tables["public.users"].columns as any).newcol = {
        name: "newcol",
        type: "text",
        notNull: false,
      };
    });
    d = diffSnapshots(base, addedCol);
    expect(d.some((l) => l.op === "+" && /column public\.users\.newcol/.test(l.text))).toBe(true);

    const addedIdx = withMutations(base, (s) => {
      (s.tables["public.users"].indexes as any)["ix_new"] = {
        name: "ix_new",
        columns: [{ expression: "id", isExpression: false }],
        isUnique: false,
      };
    });
    d = diffSnapshots(base, addedIdx);
    expect(d.some((l) => l.op === "+" && l.text === "index public.users.ix_new")).toBe(true);
  });

  test("removed table and changed column (type / notNull / default) are caught", () => {
    const dropped = withMutations(base, (s) => {
      delete (s.tables as any)["public.users"];
    });
    let d = diffSnapshots(base, dropped);
    expect(d.some((l) => l.op === "-" && l.text === "table public.users")).toBe(true);

    const changed = withMutations(base, (s) => {
      s.tables["public.users"].columns["enabled"].type = "integer";
    });
    d = diffSnapshots(base, changed);
    expect(d.some((l) => /users\.enabled: type /.test(l.text))).toBe(true);

    const notNull = withMutations(base, (s) => {
      s.tables["public.users"].columns["enabled"].notNull = !s.tables["public.users"].columns["enabled"].notNull;
    });
    d = diffSnapshots(base, notNull);
    expect(d.some((l) => /users\.enabled: notNull /.test(l.text))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pull guards — production can never be a pull target
// ---------------------------------------------------------------------------

describe("pullGuards", () => {
  test("missing branch declaration refuses", () => {
    expect(pullGuards("postgres://u:p@ep-x.neon.tech/db", undefined)).toEqual({
      ok: false,
      reason: expect.stringContaining("--on-cow-branch"),
    });
  });
  test("empty DATABASE_URL refuses", () => {
    expect(pullGuards("", "br-ok")).toEqual({ ok: false, reason: expect.stringContaining("DATABASE_URL") });
  });
  test("jdbc: URL refuses", () => {
    expect(pullGuards("jdbc:postgresql://ep-x/db", "br-ok")!.ok).toBe(false);
  });
  test("production branch ids refuse", () => {
    const g = pullGuards(
      "postgresql://u:p@ep-prod.neon.tech/db?options=branch%3Dbr-muddy-bar-a5huwldd",
      "br-some-cow",
    );
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toContain("br-muddy-bar-a5huwldd");
  });
  test("clean COW target passes", () => {
    expect(pullGuards("postgresql://u:p@ep-cow.neon.tech/db", "br-cow-task")).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// doctor — static F2a evidence on the real repo
// ---------------------------------------------------------------------------

describe("doctor", () => {
  test("declared pair proves F2a: kit imports gel-core, orm does not export it", () => {
    const d = doctor();
    expect(d.declared.kit).toBe("^0.30.0");
    expect(d.declared.orm).toBe("^0.38.0");
    expect(d.resolved.kit).toBe("0.30.6");
    expect(d.resolved.orm).toBe("0.38.4");
    expect(d.f2a.kitImportsGelCore).toBe(true);
    expect(d.f2a.ormExportsGelCore).toBe(false);
    expect(d.verdict).toContain("F2a CONFIRMED");
  });
});
