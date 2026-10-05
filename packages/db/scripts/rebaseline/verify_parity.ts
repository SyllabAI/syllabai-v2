/**
 * T-MIG-002-R — repo-resident columns-parity verifier (the "579/579" proof).
 *
 * Successor of the D1 one-shot verification: compares the checked-in GENERATED
 * schema module (src/schema/schema.ts — imported at runtime, never parsed by
 * regex) against the machine-readable baseline snapshot
 * (drizzle/meta/0000_snapshot.json) column by column:
 *
 *   - table set parity (62/62 expected for the T-MIG-002 baseline)
 *   - column name parity per table (579/579 expected)
 *   - notNull parity (snapshot boolean vs runtime column; PK-implied skipped)
 *   - literal-default parity: snapshot SQL literal ("'UNVALIDATED'", 1, true,
 *     "''") vs runtime column default; SQL-expression defaults (now(),
 *     gen_random_uuid()) require hasDefault only; generated columns are
 *     matched by presence, not default value.
 *
 * Exit 1 on any mismatch / missing column / count drift (CLI mode). This
 * makes the T-MIG-002 capture verification a LIVING gate: any regeneration
 * that diverges from the snapshot fails here.
 *
 * Usage: bun verify_parity.ts   (report-only; exit code carries the verdict)
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DB_ROOT = resolve(import.meta.dir, "../..");

export type SnapDefault =
  | { kind: "none" }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "expression" };

/** Snapshot defaults are SQL literal text: "'UNVALIDATED'", "''", 1, true, "now()". */
export function normalizeSnapshotDefault(df: unknown): SnapDefault {
  if (df === null || df === undefined) return { kind: "none" };
  if (typeof df === "number" || typeof df === "boolean") return { kind: "literal", value: df };
  if (typeof df === "string") {
    const s = df.trim();
    const quoted = s.match(/^'(.*)'$/s);
    if (quoted) return { kind: "literal", value: quoted[1].replace(/''/g, "'") };
    if (s === "true" || s === "false") return { kind: "literal", value: s === "true" };
    if (/^-?\d+(\.\d+)?$/.test(s)) return { kind: "literal", value: Number(s) };
    return { kind: "expression" };
  }
  return { kind: "expression" };
}

export type ParityReport = {
  snapshotTables: number;
  runtimeTables: number;
  snapshotColumns: number;
  runtimeColumns: number;
  checked: number;
  literalDefaultChecked: number;
  mismatches: string[];
  missingInRuntime: string[];
  missingInSnapshot: string[];
};

export async function verifyParity(
  opts: { schemaPath?: string; snapshotPath?: string } = {},
): Promise<ParityReport> {
  const schemaPath = opts.schemaPath ?? join(DB_ROOT, "src/schema/schema.ts");
  const snapshotPath = opts.snapshotPath ?? join(DB_ROOT, "drizzle/meta/0000_snapshot.json");

  const snap = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const mod: Record<string, unknown> = await import(schemaPath);
  const drizzle = await import("drizzle-orm");
  const { getTableColumns, getTableName, is, Table } = drizzle as any;

  const report: ParityReport = {
    snapshotTables: 0,
    runtimeTables: 0,
    snapshotColumns: 0,
    runtimeColumns: 0,
    checked: 0,
    literalDefaultChecked: 0,
    mismatches: [],
    missingInRuntime: [],
    missingInSnapshot: [],
  };

  const runtimeTables = new Map<string, any>();
  for (const [, val] of Object.entries(mod)) {
    if (is(val, Table)) {
      runtimeTables.set(getTableName(val), val);
    }
  }
  report.runtimeTables = runtimeTables.size;

  const snapTables = (snap.tables ?? {}) as Record<string, any>;
  report.snapshotTables = Object.keys(snapTables).length;

  for (const [snapName, t] of Object.entries(snapTables)) {
    const bare = snapName.replace(/^public\./, "");
    const table = runtimeTables.get(bare);
    if (!table) {
      report.missingInRuntime.push(snapName);
      continue;
    }
    const cols = getTableColumns(table) as Record<string, any>;
    const runtimeByName = new Map<string, any>();
    for (const rc of Object.values(cols)) runtimeByName.set(rc.name, rc);
    report.runtimeColumns += runtimeByName.size;

    const snapCols = (t.columns ?? {}) as Record<string, any>;
    for (const [cname, c] of Object.entries(snapCols)) {
      report.snapshotColumns += 1;
      const rcol = runtimeByName.get(cname);
      if (!rcol) {
        report.missingInRuntime.push(`${snapName}.${cname}`);
        continue;
      }
      report.checked += 1;

      // notNull parity — skip PK-implied (snapshot may omit notNull on PK columns)
      if (typeof c.notNull === "boolean" && c.primaryKey !== true && c.notNull !== rcol.notNull) {
        report.mismatches.push(
          `${snapName}.${cname}: notNull snapshot=${c.notNull} runtime=${rcol.notNull}`,
        );
      }

      // literal-default parity — generated columns have no default by construction
      const gen = c.generatedAlwaysAs ?? c.generated;
      if (!gen) {
        const nd = normalizeSnapshotDefault(c.default);
        if (nd.kind === "literal") {
          report.literalDefaultChecked += 1;
          if (!rcol.hasDefault) {
            report.mismatches.push(
              `${snapName}.${cname}: snapshot literal default ${JSON.stringify(nd.value)} but runtime hasDefault=false`,
            );
          } else if (rcol.default !== undefined && rcol.default !== null) {
            const rv = rcol.default;
            const isSqlObj = typeof rv === "object";
            if (!isSqlObj && rv !== nd.value) {
              report.mismatches.push(
                `${snapName}.${cname}: default snapshot=${JSON.stringify(nd.value)} runtime=${JSON.stringify(rv)}`,
              );
            }
          }
        } else if (nd.kind === "expression" && !rcol.hasDefault) {
          report.mismatches.push(
            `${snapName}.${cname}: snapshot expression default but runtime hasDefault=false`,
          );
        }
      }
    }

    for (const [rcName] of runtimeByName) {
      if (!(rcName in snapCols)) {
        report.missingInSnapshot.push(`${bare}.${rcName}`);
      }
    }
  }

  return report;
}

export function formatReport(r: ParityReport): string {
  const lines = [
    "== T-MIG-002-R columns parity (snapshot vs generated runtime schema) ==",
    `tables: snapshot=${r.snapshotTables} runtime=${r.runtimeTables}`,
    `columns: snapshot=${r.snapshotColumns} runtime=${r.runtimeColumns} checked=${r.checked}`,
    `literal-default comparisons: ${r.literalDefaultChecked}`,
    `mismatches: ${r.mismatches.length}`,
    ...r.mismatches.map((m) => `  ! ${m}`),
  ];
  if (r.missingInRuntime.length) {
    lines.push(`missing in runtime schema: ${r.missingInRuntime.length}`);
    lines.push(...r.missingInRuntime.map((m) => `  ! ${m}`));
  }
  if (r.missingInSnapshot.length) {
    lines.push(`missing in snapshot: ${r.missingInSnapshot.length}`);
    lines.push(...r.missingInSnapshot.map((m) => `  ! ${m}`));
  }
  const pass =
    r.mismatches.length === 0 &&
    r.missingInRuntime.length === 0 &&
    r.missingInSnapshot.length === 0 &&
    r.snapshotTables === r.runtimeTables &&
    r.snapshotColumns === r.checked &&
    r.snapshotColumns === r.runtimeColumns;
  lines.push(`columns.parity: ${pass ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

if (import.meta.main) {
  verifyParity().then((r) => {
    console.log(formatReport(r));
    const pass =
      r.mismatches.length === 0 &&
      r.missingInRuntime.length === 0 &&
      r.missingInSnapshot.length === 0 &&
      r.snapshotTables === r.runtimeTables &&
      r.snapshotColumns === r.checked &&
      r.snapshotColumns === r.runtimeColumns;
    if (!pass) process.exit(1);
  });
}
