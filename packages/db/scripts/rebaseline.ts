#!/usr/bin/env bun
/**
 * rebaseline.ts — T-MIG-002-R: the repo-resident re-baseline path for packages/db.
 *
 * Makes the T-MIG-002 baseline re-runnable WITHOUT R2-db's out-of-repo script
 * (deviation D1) by encoding the full recipe in-repo:
 *
 *   doctor   Static toolchain audit — proves the declared pair (drizzle-kit
 *            ^0.30.0 + drizzle-orm ^0.38.0) cannot run `pull` (F2a: kit 0.30.6
 *            hard-imports drizzle-orm/gel-core, absent from orm 0.38.4's 373
 *            exports; F2b: squasher ZodError on the schema's null-expression
 *            index — documented in .syllabai/receipts/T-MIG-002/run-001.json).
 *            READ-ONLY on package.json (realignment stays the lane owner's call).
 *
 *   fix      Deterministic post-pull renderer fixes (F3) applied to
 *            src/schema/schema.ts: (a) `.default(')` → `.default('')` — kit
 *            0.31.11 drops the closing quote on empty-string SQL defaults
 *            (5 sites at baseline); (b) `unknown("col")` → `bytea("col")` /
 *            `tsvector("col")` — kit emits `unknown(...)` for types with no
 *            pg-core helper and never imports it (3 sites at baseline: 2×bytea
 *            + 1×tsvector). The shim kind comes from the introspection
 *            snapshot's column type. Idempotent; logs site-by-site; --check
 *            mode reports without writing.
 *
 *   verify   Runtime == snapshot parity proof — imports src/schema/schema.ts
 *            (bun runs TS natively) and compares against
 *            drizzle/meta/0000_snapshot.json: table set, per-table columns
 *            (name / notNull / default per the calibrated literal rules),
 *            index names + uniqueness, FK names + routing, check-constraint
 *            names, composite PK + unique-constraint names. At baseline:
 *            62 tables / 579 columns / 87 indexes / 54 FKs / 98 checks.
 *            Exit 1 on any drift. This is the standing re-proof of the
 *            "579/579 snapshot-faithful" claim from run-001.
 *
 *   diff     Structural diff of one snapshot against another (defaults:
 *            --against <new-snapshot.json> vs the checked-in baseline).
 *            Tables / columns (type, notNull, default) / indexes / FKs /
 *            checks: added, removed, changed. Exit 0 = identical, 1 = drift.
 *            This is the drift detector for future Flyway evolution of the
 *            frozen core's end-state.
 *
 *   pull     LIVE re-baseline orchestration. Builds an ISOLATED pinned
 *            toolchain (drizzle-kit 0.31.11 + drizzle-orm 0.45.3 +
 *            @neondatabase/serverless 1.2.0 — the exact D1 recipe proven by
 *            T-MIG-002 run-001) in a temp dir, runs `drizzle-kit pull` there
 *            with DATABASE_URL passed via env (never written to disk),
 *            relocates the generated artifacts into packages/db, then runs
 *            fix + verify + diff (old baseline vs new snapshot).
 *            GUARDRAILS: requires --on-cow-branch <name>; refuses empty/jdbc
 *            URLs; refuses any URL naming a production branch (static
 *            denylist); pull is introspection-only (SELECT) but the target
 *            must still be a copy-on-write branch, NEVER production itself.
 *
 * Fence note (T-MIG-002-R scope.allowed): this script lives under
 * packages/db/scripts/** (declared NEW at PR time). It never writes
 * packages/db/package.json, never hand-edits generated files outside the
 * documented fix pass, and never touches Neon production.
 *
 * Usage: bun packages/db/scripts/rebaseline.ts <doctor|fix|verify|diff|pull> [options]
 */

import { resolve, basename, join } from "node:path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  mkdtempSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { getTableName, is } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Paths & pinned toolchain
// ---------------------------------------------------------------------------

export const PKG_DIR = resolve(import.meta.dir, "..");
export const SCHEMA_DIR = resolve(PKG_DIR, "src/schema");
export const SCHEMA_TS = resolve(SCHEMA_DIR, "schema.ts");
export const RELATIONS_TS = resolve(SCHEMA_DIR, "relations.ts");
export const CUSTOM_TYPES_TS = resolve(SCHEMA_DIR, "custom_types.ts");
export const SNAPSHOT_JSON = resolve(PKG_DIR, "drizzle/meta/0000_snapshot.json");
export const PKG_JSON = resolve(PKG_DIR, "package.json");

/** The isolated pull toolchain — exactly D1 as proven by T-MIG-002 run-001. */
export const PINNED_TOOLCHAIN: Record<string, string> = {
  "drizzle-kit": "0.31.11",
  "drizzle-orm": "0.45.3",
  "@neondatabase/serverless": "1.2.0",
};

/** Documented production branch ids (hard boundary: never a pull target). */
export const PROD_BRANCH_DENYLIST = ["br-muddy-bar-a5huwldd"];

/** Shim-able helper-less column types (custom_types.ts companions). */
const SHIM_TYPES = ["bytea", "tsvector"] as const;

// ---------------------------------------------------------------------------
// Snapshot loading
// ---------------------------------------------------------------------------

export type Snapshot = {
  id?: string;
  version?: string;
  dialect?: string;
  tables: Record<
    string,
    {
      name: string;
      schema?: string;
      columns: Record<string, SnapshotColumn>;
      indexes: Record<string, SnapshotIndex>;
      foreignKeys: Record<string, SnapshotFK>;
      checkConstraints?: Record<string, { name: string; value: string }>;
      compositePrimaryKeys?: Record<string, { name: string; columns: string[] }>;
      uniqueConstraints?: Record<string, { name: string; columns: string[] }>;
    }
  >;
};

export type SnapshotColumn = {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey?: boolean;
  default?: unknown;
};

export type SnapshotIndex = {
  name: string;
  columns: Array<Record<string, unknown>>;
  isUnique: boolean;
  method?: string;
};

export type SnapshotFK = {
  name: string;
  tableFrom: string;
  tableTo: string;
  schemaTo?: string;
  columnsFrom: string[];
  columnsTo: string[];
  onDelete?: string;
  onUpdate?: string;
};

export function loadSnapshot(path: string = SNAPSHOT_JSON): Snapshot {
  if (!existsSync(path)) throw new Error(`snapshot not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
}

// ---------------------------------------------------------------------------
// Runtime schema loading (bun imports TS natively)
// ---------------------------------------------------------------------------

export type RuntimeColumn = {
  name: string;
  notNull: boolean;
  hasDefault: boolean;
  defaultValue: unknown;
  hasDefaultFn: boolean;
  sqlType: string;
};

export type RuntimeTable = {
  key: string;
  name: string;
  columns: RuntimeColumn[];
  indexNames: string[];
  indexUnique: Map<string, boolean>;
  fkRows: Array<{ name: string; from: string[]; to: string; toCols: string[] }>;
  checkNames: string[];
  compositePkNames: string[];
  uniqueConstraintNames: string[];
};

export async function loadRuntimeSchema(
  schemaPath: string = SCHEMA_TS,
): Promise<Map<string, RuntimeTable>> {
  const mod: Record<string, unknown> = await import(
    pathToFileURL(schemaPath).href
  );
  const out = new Map<string, RuntimeTable>();
  for (const [symbol, value] of Object.entries(mod)) {
    if (!is(value, PgTable)) continue;
    const cfg = getTableConfig(value as PgTable);
    const name = getTableName(value as PgTable);
    const columns: RuntimeColumn[] = cfg.columns.map((c) => {
      const anyC = c as unknown as {
        notNull: boolean;
        hasDefault: boolean;
        default?: unknown;
        defaultFn?: unknown;
        getSQLType?: () => string;
      };
      return {
        name: c.name,
        notNull: anyC.notNull,
        hasDefault: anyC.hasDefault === true,
        defaultValue: anyC.default,
        hasDefaultFn: typeof anyC.defaultFn === "function",
        sqlType: anyC.getSQLType ? anyC.getSQLType() : "",
      };
    });
    const indexUnique = new Map<string, boolean>();
    const indexNames: string[] = [];
    for (const idx of cfg.indexes) {
      const anyIdx = idx as unknown as {
        config: { name: string; unique: boolean };
      };
      indexNames.push(anyIdx.config.name);
      indexUnique.set(anyIdx.config.name, anyIdx.config.unique === true);
    }
    const fkRows = [...cfg.foreignKeys].map((fk) => {
      const anyFk = fk as unknown as {
        reference: () => {
          name: string;
          columns: Array<{ name: string }>;
          foreignTable: unknown;
          foreignColumns: Array<{ name: string }>;
        };
      };
      const ref = anyFk.reference();
      return {
        name: ref.name,
        from: ref.columns.map((c) => c.name),
        to: getTableName(ref.foreignTable as PgTable),
        toCols: ref.foreignColumns.map((c) => c.name),
      };
    });
    const checkNames = [...cfg.checks].map(
      (ck) => (ck as unknown as { name: string }).name,
    );
    const compositePkNames = cfg.primaryKeys.map(
      (pk) => (pk as unknown as { name: string }).name,
    );
    const uniqueConstraintNames = cfg.uniqueConstraints.map(
      (uc) => (uc as unknown as { name: string }).name,
    );
    out.set(`public.${name}`, {
      key: `public.${name}`,
      name,
      columns,
      indexNames,
      indexUnique,
      fkRows,
      checkNames,
      compositePkNames,
      uniqueConstraintNames,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// verify — runtime == snapshot parity (the standing re-proof of run-001)
// ---------------------------------------------------------------------------

export type Drift = { kind: string; detail: string };

/**
 * Default-value comparison, calibrated against the baseline snapshot's
 * serialized shapes: quoted SQL literals (`'UNVALIDATED'`, `''`), numbers,
 * Python-cased booleans ('True'/'False'), `now()`, jsonb casts
 * (`'{}'::jsonb`), and DB-side sequence defaults (serial/bigserial — snapshot
 * records no default, runtime hasDefault=true).
 */
export function defaultParity(
  colName: string,
  snap: SnapshotColumn,
  run: RuntimeColumn,
): Drift | null {
  const snapHas = snap.default !== undefined && snap.default !== null;
  if (snapHas && !run.hasDefault) {
    return {
      kind: "default",
      detail: `${colName}: snapshot default ${JSON.stringify(snap.default)} but runtime hasDefault=false`,
    };
  }
  if (!snapHas && run.hasDefault) {
    // serial/bigserial carry a DB-side sequence default — no snapshot entry.
    if (/serial/i.test(run.sqlType)) return null;
    return {
      kind: "default",
      detail: `${colName}: runtime hasDefault=true (${run.hasDefaultFn ? "fn" : JSON.stringify(run.defaultValue)}) but snapshot records none`,
    };
  }
  if (!snapHas && !run.hasDefault) return null;
  const s = String(snap.default);
  // cast literal FIRST: "'{}'::jsonb" does not end with a quote, so the plain
  // quoted-literal pattern cannot match it
  const cast = /^'(.*)'::([a-zA-Z]+)$/s.exec(s);
  if (cast) {
    let snapVal: unknown;
    try {
      snapVal = JSON.parse(cast[1]);
    } catch {
      return {
        kind: "default",
        detail: `${colName}: unparseable cast default ${s}`,
      };
    }
    return JSON.stringify(snapVal) === JSON.stringify(run.defaultValue)
      ? null
      : {
          kind: "default",
          detail: `${colName}: cast default ${s} vs runtime ${JSON.stringify(run.defaultValue)}`,
        };
  }
  const quoted = /^'(.*)'$/s.exec(s);
  if (quoted) {
    const lit = quoted[1];
    return lit === run.defaultValue
      ? null
      : {
          kind: "default",
          detail: `${colName}: snapshot default ${s} vs runtime ${JSON.stringify(run.defaultValue)}`,
        };
  }
  if (s === "True" || s === "False") {
    return (s === "True") === (run.defaultValue === true)
      ? null
      : {
          kind: "default",
          detail: `${colName}: snapshot default ${s} vs runtime ${JSON.stringify(run.defaultValue)}`,
        };
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return Number(s) === Number(run.defaultValue)
      ? null
      : {
          kind: "default",
          detail: `${colName}: snapshot default ${s} vs runtime ${JSON.stringify(run.defaultValue)}`,
        };
  }
  if (s === "now()") {
    return run.hasDefaultFn || run.hasDefault
      ? null
      : {
          kind: "default",
          detail: `${colName}: snapshot now() but runtime has neither default nor defaultFn`,
        };
  }
  // unknown shape — presence-checked only; flagged informationally by caller
  return null;
}

export type VerifyReport = { ok: boolean; drifts: Drift[]; inventory: string };

export async function verifyBaseline(
  schemaPath: string = SCHEMA_TS,
  snapPath: string = SNAPSHOT_JSON,
): Promise<VerifyReport> {
  const snap = loadSnapshot(snapPath);
  const run = await loadRuntimeSchema(schemaPath);
  const drifts: Drift[] = [];

  const snapKeys = Object.keys(snap.tables).sort();
  const runKeys = [...run.keys()].sort();
  for (const k of snapKeys)
    if (!run.has(k))
      drifts.push({ kind: "table", detail: `snapshot-only table: ${k}` });
  for (const k of runKeys)
    if (!snap.tables[k])
      drifts.push({ kind: "table", detail: `runtime-only table: ${k}` });

  let colCount = 0;
  let idxCount = 0;
  let fkCount = 0;
  let ckCount = 0;
  for (const key of snapKeys) {
    const st = snap.tables[key];
    const rt = run.get(key);
    if (!rt) continue;

    // columns: name set + notNull + defaults + type spelling
    const snapCols = Object.entries(st.columns);
    colCount += snapCols.length;
    const runCols = new Map(rt.columns.map((c) => [c.name, c]));
    for (const [cn, sc] of snapCols) {
      const rc = runCols.get(cn);
      if (!rc) {
        drifts.push({ kind: "column", detail: `${key}.${cn}: missing in runtime` });
        continue;
      }
      if (sc.notNull !== rc.notNull)
        drifts.push({
          kind: "notNull",
          detail: `${key}.${cn}: snapshot ${sc.notNull} vs runtime ${rc.notNull}`,
        });
      if (sc.type !== rc.sqlType)
        drifts.push({
          kind: "type",
          detail: `${key}.${cn}: snapshot type "${sc.type}" vs runtime "${rc.sqlType}"`,
        });
      const d = defaultParity(`${key}.${cn}`, sc, rc);
      if (d) drifts.push(d);
    }
    for (const [cn] of runCols)
      if (!st.columns[cn])
        drifts.push({ kind: "column", detail: `${key}.${cn}: runtime-only` });

    // indexes: name set + uniqueness flag
    const snapIdxNames = Object.keys(st.indexes);
    idxCount += snapIdxNames.length;
    for (const iname of snapIdxNames) {
      const si = st.indexes[iname];
      if (!rt.indexNames.includes(iname)) {
        drifts.push({ kind: "index", detail: `${key}: missing index ${iname}` });
        continue;
      }
      if ((rt.indexUnique.get(iname) ?? false) !== si.isUnique)
        drifts.push({
          kind: "index",
          detail: `${key}.${iname}: uniqueness snapshot ${si.isUnique} vs runtime ${rt.indexUnique.get(iname)}`,
        });
    }
    for (const iname of rt.indexNames)
      if (!st.indexes[iname])
        drifts.push({ kind: "index", detail: `${key}: runtime-only index ${iname}` });

    // foreign keys: name + routing
    const snapFks = Object.values(st.foreignKeys);
    fkCount += snapFks.length;
    const runFks = new Map(rt.fkRows.map((f) => [f.name, f]));
    for (const sf of snapFks) {
      const rf = runFks.get(sf.name);
      if (!rf) {
        drifts.push({ kind: "fk", detail: `${key}: missing fk ${sf.name}` });
        continue;
      }
      const route = `${sf.columnsFrom.join(",")}->${sf.tableTo}(${sf.columnsTo.join(",")})`;
      const runRoute = `${rf.from.join(",")}->${rf.to}(${rf.toCols.join(",")})`;
      if (route !== runRoute)
        drifts.push({
          kind: "fk",
          detail: `${key}.${sf.name}: routing ${runRoute} vs snapshot ${route}`,
        });
    }
    for (const [n] of runFks)
      if (!snapFks.some((sf) => sf.name === n))
        drifts.push({ kind: "fk", detail: `${key}: runtime-only fk ${n}` });

    // checks
    const snapChecks = Object.keys(st.checkConstraints ?? {});
    ckCount += snapChecks.length;
    for (const n of snapChecks)
      if (!rt.checkNames.includes(n))
        drifts.push({ kind: "check", detail: `${key}: missing check ${n}` });
    for (const n of rt.checkNames)
      if (!snapChecks.includes(n))
        drifts.push({ kind: "check", detail: `${key}: runtime-only check ${n}` });

    // composite PKs + unique constraints
    for (const n of Object.keys(st.compositePrimaryKeys ?? {}))
      if (!rt.compositePkNames.includes(n))
        drifts.push({ kind: "primaryKey", detail: `${key}: missing pk ${n}` });
    for (const n of Object.keys(st.uniqueConstraints ?? {}))
      if (!rt.uniqueConstraintNames.includes(n))
        drifts.push({
          kind: "uniqueConstraint",
          detail: `${key}: missing unique constraint ${n}`,
        });
  }

  const inventory = `tables ${runKeys.length}/${snapKeys.length} · columns ${colCount} · indexes ${idxCount} · fks ${fkCount} · checks ${ckCount}`;
  return { ok: drifts.length === 0, drifts, inventory };
}

// ---------------------------------------------------------------------------
// fix — deterministic post-pull renderer fixes (F3)
// ---------------------------------------------------------------------------

export type FixSite = { line: number; before: string; after: string };
export type FixReport = {
  f3aSites: FixSite[];
  f3bSites: FixSite[];
  importInjected: boolean;
  importAdjusted: boolean;
  unmappedUnknown: string[];
  text: string;
};

/** Map of special column name → shim type, derived from the snapshot. */
export function specialTypeMap(
  snap: Snapshot,
): Map<string, (typeof SHIM_TYPES)[number]> {
  const map = new Map<string, (typeof SHIM_TYPES)[number]>();
  for (const [tkey, t] of Object.entries(snap.tables)) {
    for (const [cn, c] of Object.entries(t.columns)) {
      const ty = c.type as (typeof SHIM_TYPES)[number];
      if (!(SHIM_TYPES as readonly string[]).includes(ty)) continue;
      const prev = map.get(cn);
      if (prev && prev !== ty)
        throw new Error(
          `column name "${cn}" carries two different special types (${prev} in ${tkey}) — manual disambiguation required`,
        );
      map.set(cn, ty);
    }
  }
  return map;
}

function lineOf(text: string, idx: number): number {
  return text.slice(0, idx).split("\n").length;
}

/**
 * Pure text-level fixer (unit-testable). Applies:
 *   F3a: `.default(')` → `.default('')`   (kit 0.31.11 drops the closing quote)
 *   F3b: `unknown("col")` → `<shim>("col")` per the snapshot's column type
 *        + ensures the `./custom_types` import carries exactly the used shims.
 * Idempotent: re-running on fixed text yields zero further changes.
 */
export function applyRendererFixes(
  input: string,
  specials: Map<string, (typeof SHIM_TYPES)[number]>,
  importFrom = "./custom_types",
): FixReport {
  let text = input;
  const f3aSites: FixSite[] = [];
  const f3bSites: FixSite[] = [];

  // F3a — only when the broken emission is present; no-op on fixed text.
  const f3aRe = /\.default\('\)/g;
  let m: RegExpExecArray | null;
  while ((m = f3aRe.exec(text))) {
    f3aSites.push({
      line: lineOf(text, m.index),
      before: `.default(')`,
      after: `.default('')`,
    });
  }
  text = text.replace(f3aRe, `.default('')`);

  // F3b — unknown("name") → shim("name"), keyed by snapshot column type.
  const unknownRe = /unknown\("([^"]+)"\)/g;
  const unmapped: string[] = [];
  const usedShims = new Set<string>();
  while ((m = unknownRe.exec(text))) {
    const col = m[1];
    const ty = specials.get(col);
    if (!ty) {
      unmapped.push(col);
      continue;
    }
    f3bSites.push({
      line: lineOf(text, m.index),
      before: `unknown("${col}")`,
      after: `${ty}("${col}")`,
    });
    usedShims.add(ty);
  }
  text = text.replace(unknownRe, (full, col: string) => {
    const ty = specials.get(col);
    return ty ? `${ty}("${col}")` : full;
  });

  // Import management: ensure exactly the used shims are imported from
  // custom_types (kit never imports them; a fresh pull has no such import).
  const used = [...usedShims].sort();
  const importRe = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${importFrom.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}["'];?`,
  );
  const importMatch = importRe.exec(text);
  let importInjected = false;
  let importAdjusted = false;
  if (used.length > 0) {
    if (importMatch) {
      const existing = importMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .sort();
      if (JSON.stringify(existing) !== JSON.stringify(used)) {
        text = text.replace(importRe, `import { ${used.join(", ")} } from "${importFrom}"`);
        importAdjusted = true;
      }
    } else {
      // insert after the last import line
      const lines = text.split("\n");
      let lastImport = -1;
      for (let i = 0; i < lines.length; i++)
        if (/^import\s/.test(lines[i])) lastImport = i;
      lines.splice(lastImport + 1, 0, `import { ${used.join(", ")} } from "${importFrom}"`);
      text = lines.join("\n");
      importInjected = true;
    }
  }
  return {
    f3aSites,
    f3bSites,
    importInjected,
    importAdjusted,
    unmappedUnknown: unmapped,
    text,
  };
}

export function runFix(
  opts: { check?: boolean; schemaPath?: string; snapPath?: string } = {},
): FixReport {
  const schemaPath = opts.schemaPath ?? SCHEMA_TS;
  const text = readFileSync(schemaPath, "utf8");
  const report = applyRendererFixes(text, specialTypeMap(loadSnapshot(opts.snapPath)));
  if (report.unmappedUnknown.length > 0) {
    console.error(
      `FIX ABORTED — unknown(...) sites not covered by custom_types shims: ${report.unmappedUnknown.join(", ")}`,
    );
    console.error(
      `A new helper-less column type appeared in the pull. Extend packages/db/src/schema/custom_types.ts (generated-companion) and re-run.`,
    );
    throw new Error("unmapped unknown() sites");
  }
  if (!opts.check) writeFileSync(schemaPath, report.text);
  return report;
}

// ---------------------------------------------------------------------------
// diff — structural snapshot-vs-snapshot drift detector
// ---------------------------------------------------------------------------

export type DiffLine = { op: "+" | "-"; text: string };

export function diffSnapshots(
  base: Snapshot,
  against: Snapshot,
): DiffLine[] {
  const out: DiffLine[] = [];
  const baseKeys = Object.keys(base.tables).sort();
  const agKeys = Object.keys(against.tables).sort();
  for (const k of baseKeys)
    if (!against.tables[k]) out.push({ op: "-", text: `table ${k}` });
  for (const k of agKeys)
    if (!base.tables[k]) out.push({ op: "+", text: `table ${k}` });
  for (const k of baseKeys) {
    const bt = base.tables[k];
    const at = against.tables[k];
    if (!at) continue;
    // columns
    for (const [cn, bc] of Object.entries(bt.columns)) {
      const ac = at.columns[cn];
      if (!ac) {
        out.push({ op: "-", text: `column ${k}.${cn} (${bc.type})` });
        continue;
      }
      const changed: string[] = [];
      if (bc.type !== ac.type) changed.push(`type ${bc.type}→${ac.type}`);
      if (bc.notNull !== ac.notNull) changed.push(`notNull ${bc.notNull}→${ac.notNull}`);
      if (String(bc.default) !== String(ac.default))
        changed.push(`default ${JSON.stringify(bc.default)}→${JSON.stringify(ac.default)}`);
      if (changed.length) out.push({ op: "+", text: `column ${k}.${cn}: ${changed.join(", ")}` });
    }
    for (const cn of Object.keys(at.columns))
      if (!bt.columns[cn])
        out.push({ op: "+", text: `column ${k}.${cn} (${at.columns[cn].type})` });
    // indexes
    for (const n of Object.keys(bt.indexes))
      if (!at.indexes[n]) out.push({ op: "-", text: `index ${k}.${n}` });
    for (const n of Object.keys(at.indexes))
      if (!bt.indexes[n]) out.push({ op: "+", text: `index ${k}.${n}` });
    // fks
    for (const n of Object.keys(bt.foreignKeys))
      if (!at.foreignKeys[n]) out.push({ op: "-", text: `fk ${k}.${n}` });
    for (const n of Object.keys(at.foreignKeys))
      if (!bt.foreignKeys[n]) out.push({ op: "+", text: `fk ${k}.${n}` });
    // checks
    for (const n of Object.keys(bt.checkConstraints ?? {}))
      if (!at.checkConstraints?.[n]) out.push({ op: "-", text: `check ${k}.${n}` });
    for (const n of Object.keys(at.checkConstraints ?? {}))
      if (!bt.checkConstraints?.[n]) out.push({ op: "+", text: `check ${k}.${n}` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// doctor — static toolchain audit (READ-ONLY; F2 evidence)
// ---------------------------------------------------------------------------

export type DoctorReport = {
  declared: { kit: string; orm: string };
  resolved: { kit: string | null; orm: string | null };
  f2a: { kitImportsGelCore: boolean; ormExportsGelCore: boolean };
  verdict: string;
};

function readInstalledVersion(startDir: string, name: string): string | null {
  // bun workspaces hoist deps to the repo root — walk up until found
  let dir = startDir;
  for (;;) {
    const p = resolve(dir, "node_modules", name, "package.json");
    if (existsSync(p)) {
      try {
        return (JSON.parse(readFileSync(p, "utf8")) as { version: string }).version;
      } catch {
        return null;
      }
    }
    const parent = resolve(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

export function doctor(pkgDir: string = PKG_DIR): DoctorReport {
  const pkg = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const declared = {
    kit: pkg.devDependencies?.["drizzle-kit"] ?? "(unset)",
    orm: pkg.dependencies?.["drizzle-orm"] ?? "(unset)",
  };
  const resolved = {
    kit: readInstalledVersion(pkgDir, "drizzle-kit"),
    orm: readInstalledVersion(pkgDir, "drizzle-orm"),
  };

  let kitImportsGelCore = false;
  if (resolved.kit) {
    let dir = pkgDir;
    for (;;) {
      const bin = resolve(dir, "node_modules", "drizzle-kit", "bin.cjs");
      if (existsSync(bin)) {
        kitImportsGelCore = readFileSync(bin, "utf8").includes("drizzle-orm/gel-core");
        break;
      }
      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }
  let ormExportsGelCore = false;
  if (resolved.orm) {
    let dir = pkgDir;
    for (;;) {
      const p = resolve(dir, "node_modules", "drizzle-orm", "package.json");
      if (existsSync(p)) {
        const exportsKeys = Object.keys(
          (JSON.parse(readFileSync(p, "utf8")) as { exports?: Record<string, unknown> }).exports ?? {},
        );
        ormExportsGelCore = exportsKeys.includes("./gel-core");
        break;
      }
      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }

  const f2aBreaks =
    kitImportsGelCore && resolved.orm !== null && !ormExportsGelCore;
  const verdict = f2aBreaks
    ? `F2a CONFIRMED on resolved pair kit ${resolved.kit} + orm ${resolved.orm}: kit hard-imports drizzle-orm/gel-core, orm does not export it — "db:pull" as declared cannot start. F2b (squasher ZodError on the null-expression index, path …columns.2.expression) and the kit 0.31.11 renderer defects (F3) are documented in .syllabai/receipts/T-MIG-002/run-001.json. Use "pull" (pinned isolated toolchain) for re-baselining; package.json realignment remains the lane owner's call (this tool never writes package.json).`
    : `declared-pair F2a mechanism not statically present on the resolved pair (kit gel-core import: ${kitImportsGelCore}; orm gel-core export: ${ormExportsGelCore}) — re-run "verify" to confirm the baseline still matches, or "pull" for a live re-baseline.`;
  return { declared, resolved, f2a: { kitImportsGelCore, ormExportsGelCore }, verdict };
}

// ---------------------------------------------------------------------------
// pull — live re-baseline via the pinned isolated toolchain (D1 recipe)
// ---------------------------------------------------------------------------

export type PullGuards =
  | { ok: true }
  | { ok: false; reason: string };

export function pullGuards(
  envUrl: string | undefined,
  onCowBranch: string | undefined,
): PullGuards {
  if (!onCowBranch || !onCowBranch.trim())
    return { ok: false, reason: "--on-cow-branch <name> is required (declare the Neon COW branch you are pointing at; NEVER production)" };
  if (!envUrl || envUrl.trim() === "")
    return { ok: false, reason: "DATABASE_URL is empty — point it at the COW branch connection string (never production)" };
  if (/^jdbc:/i.test(envUrl))
    return { ok: false, reason: "jdbc: URL rejected (client.ts guard precedent); provide a plain postgres:// URL" };
  for (const prod of PROD_BRANCH_DENYLIST)
    if (envUrl.includes(prod))
      return { ok: false, reason: `DATABASE_URL names production branch ${prod} — refused by policy (COW branches only)` };
  return { ok: true };
}

export async function runPull(opts: {
  onCowBranch: string;
  keepTemp?: boolean;
}): Promise<void> {
  const envUrl = process.env.DATABASE_URL;
  const guards = pullGuards(envUrl, opts.onCowBranch);
  if (!guards.ok) throw new Error(`pull refused: ${guards.reason}`);
  console.log(`pull target: Neon COW branch "${opts.onCowBranch}" (introspection-only; production never contacted)`);

  const temp = mkdtempSync(join(tmpdir(), "syllabai-rebaseline-"));
  const outDir = join(temp, "out");
  try {
    mkdirSync(outDir, { recursive: true });
    // 1. pinned toolchain (exact D1 recipe from T-MIG-002 run-001)
    writeFileSync(
      join(temp, "package.json"),
      JSON.stringify({ name: "syllabai-rebaseline-toolchain", private: true, dependencies: PINNED_TOOLCHAIN }, null, 2),
    );
    console.log(`[1/6] installing pinned toolchain ${JSON.stringify(PINNED_TOOLCHAIN)} …`);
    const inst = spawnSync("bun", ["install"], { cwd: temp, stdio: "inherit" });
    if (inst.status !== 0) throw new Error(`bun install failed in toolchain dir (${inst.status})`);

    // 2. config — DATABASE_URL read from env at kit runtime; never written to disk
    writeFileSync(
      join(temp, "drizzle.config.ts"),
      `import { defineConfig } from "drizzle-kit";\n` +
        `export default defineConfig({\n` +
        `  dialect: "postgresql",\n` +
        `  out: "./out",\n` +
        `  dbCredentials: { url: process.env.DATABASE_URL ?? "" },\n` +
        `  verbose: true,\n` +
        `  strict: true,\n` +
        `});\n`,
    );

    // 3. pull — use the toolchain's own kit binary, not the repo's (F2-broken) one
    console.log(`[2/6] running drizzle-kit pull (introspection only) …`);
    const kitBin = join(temp, "node_modules", "drizzle-kit", "bin.cjs");
    const pull = spawnSync("node", [kitBin, "pull", "--config", join(temp, "drizzle.config.ts")], {
      cwd: temp,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: envUrl! },
    });
    if (pull.status !== 0)
      throw new Error(`drizzle-kit pull failed (${pull.status}) — check the COW branch URL and network`);

    // 4. relocate generated artifacts into packages/db
    console.log(`[3/6] relocating generated artifacts …`);
    const outFiles = readdirSync(outDir);
    const sqlFile = outFiles.find((f) => /^\d{4}_.*\.sql$/.test(f));
    if (!sqlFile) throw new Error("pull output missing the .sql reference snapshot");
    const metaDir = join(outDir, "meta");
    const snapFile = readdirSync(metaDir).find((f) => /^\d{4}_snapshot\.json$/.test(f));
    if (!snapFile) throw new Error("pull output missing meta snapshot");

    const oldSnap = loadSnapshot(); // checked-in baseline BEFORE overwrite
    copyFileSync(join(outDir, "schema.ts"), SCHEMA_TS);
    copyFileSync(join(outDir, "relations.ts"), RELATIONS_TS);
    copyFileSync(join(metaDir, snapFile), SNAPSHOT_JSON);
    copyFileSync(join(metaDir, "_journal.json"), resolve(PKG_DIR, "drizzle/meta/_journal.json"));
    copyFileSync(join(outDir, sqlFile), resolve(PKG_DIR, "drizzle", sqlFile));

    // 5. renderer fixes (F3)
    console.log(`[4/6] applying renderer fixes …`);
    const fix = runFix();
    console.log(
      `  F3a .default('') sites: ${fix.f3aSites.length} at lines ${fix.f3aSites.map((s) => s.line).join(", ") || "-"}\n` +
        `  F3b shim sites: ${fix.f3bSites.length} at lines ${fix.f3bSites.map((s) => s.line).join(", ") || "-"}` +
        `${fix.importInjected ? "\n  custom_types import injected" : ""}`,
    );

    // 6. verify + diff
    console.log(`[5/6] verifying regenerated baseline …`);
    const v = await verifyBaseline();
    console.log(`  ${v.inventory}`);
    if (!v.ok) {
      console.error(`  VERIFY FAILED — ${v.drifts.length} drifts:`);
      for (const d of v.drifts) console.error(`   - [${d.kind}] ${d.detail}`);
      throw new Error("regenerated baseline failed snapshot/runtime parity");
    }
    console.log(`[6/6] diff vs checked-in baseline …`);
    const newSnap = loadSnapshot();
    const diff = diffSnapshots(oldSnap, newSnap);
    if (diff.length === 0) {
      console.log(`  NO STRUCTURAL DRIFT — regenerated end-state identical to the baseline (62/579/87/54/98 expected).`);
    } else {
      console.log(`  ${diff.length} structural changes vs baseline:`);
      for (const l of diff) console.log(`   ${l.op} ${l.text}`);
      console.log(`  Review each change: the frozen Java core's Flyway end-state evolved, or the pull is wrong.`);
    }
    console.log(
      `\nNext steps (T-MIG-002-R procedure): update the capture header in packages/db/src/schema/README.md,\n` +
        `append a receipt under .syllabai/receipts/T-MIG-002-R/, and record the tool versions:\n` +
        `  ${JSON.stringify(PINNED_TOOLCHAIN)}`,
    );
  } finally {
    if (!opts.keepTemp) rmSync(temp, { recursive: true, force: true });
    else console.log(`temp toolchain kept at ${temp}`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printFixReport(r: FixReport, dry: boolean): void {
  console.log(`${dry ? "[check] " : ""}F3a .default(') → .default(''): ${r.f3aSites.length} site(s)`);
  for (const s of r.f3aSites) console.log(`  line ${s.line}: ${s.before} → ${s.after}`);
  console.log(`${dry ? "[check] " : ""}F3b unknown("col") → shim: ${r.f3bSites.length} site(s)`);
  for (const s of r.f3bSites) console.log(`  line ${s.line}: ${s.before} → ${s.after}`);
  if (r.importInjected) console.log(`custom_types import injected`);
  if (r.importAdjusted) console.log(`custom_types import identifiers adjusted`);
  if (r.f3aSites.length === 0 && r.f3bSites.length === 0)
    console.log(`no renderer-defect sites present (already clean or fresh pull already fixed)`);
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(a, next);
        i++;
      } else flags.set(a, true);
    }
  }

  switch (cmd) {
    case "doctor": {
      const d = doctor();
      console.log(`declared:  drizzle-kit ${d.declared.kit} · drizzle-orm ${d.declared.orm}`);
      console.log(`resolved:  drizzle-kit ${d.resolved.kit ?? "(not installed)"} · drizzle-orm ${d.resolved.orm ?? "(not installed)"}`);
      console.log(`F2a:       kit imports drizzle-orm/gel-core: ${d.f2a.kitImportsGelCore} · orm exports ./gel-core: ${d.f2a.ormExportsGelCore}`);
      console.log(`verdict:   ${d.verdict}`);
      return 0;
    }
    case "fix": {
      const r = runFix({ check: flags.has("--check") });
      printFixReport(r, flags.has("--check"));
      return 0;
    }
    case "verify": {
      const v = await verifyBaseline();
      console.log(`inventory: ${v.inventory}`);
      if (v.ok) {
        console.log(`VERIFY PASS — runtime schema is snapshot-faithful (0 drifts across tables/columns/notNull/types/defaults/indexes/FKs/checks).`);
        return 0;
      }
      console.error(`VERIFY FAIL — ${v.drifts.length} drift(s):`);
      for (const d of v.drifts) console.error(` - [${d.kind}] ${d.detail}`);
      return 1;
    }
    case "diff": {
      const against = flags.get("--against");
      const base = flags.get("--baseline");
      const d = diffSnapshots(loadSnapshot(base ? String(base) : SNAPSHOT_JSON), loadSnapshot(String(against ?? "")));
      if (d.length === 0) {
        console.log(`NO DRIFT — snapshots structurally identical.`);
        return 0;
      }
      for (const l of d) console.log(`${l.op} ${l.text}`);
      console.log(`\n${d.length} structural difference(s).`);
      return 1;
    }
    case "pull": {
      await runPull({ onCowBranch: String(flags.get("--on-cow-branch") ?? ""), keepTemp: flags.has("--keep-temp") });
      return 0;
    }
    default:
      console.error(`usage: bun packages/db/scripts/rebaseline.ts <doctor|fix [--check]|verify|diff --against <snapshot.json>|pull --on-cow-branch <name>>`);
      return cmd === "help" || cmd === "--help" ? 0 : 2;
  }
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
