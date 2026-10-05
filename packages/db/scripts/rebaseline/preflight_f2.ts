/**
 * T-MIG-002-R / F2 — declared-pair preflight for drizzle-kit `pull`.
 *
 * (1) Version-pair verdict: the DECLARED pair (drizzle-kit ^0.30.0 +
 *     drizzle-orm ^0.38.0) cannot run `pull` on this database — kit 0.30.x
 *     hard-imports drizzle-orm/gel-core (absent from orm 0.38.x) and its
 *     squasher ZodErrors on null-expression index columns. The D1-proven
 *     trio is drizzle-kit 0.31.11 + drizzle-orm 0.45.x +
 *     @neondatabase/serverless 1.2.0. This tool REPORTS and never edits
 *     packages/db/package.json (F2 realignment is the package owner's call,
 *     per the T-MIG-002-R fence).
 *
 * (2) Crash-shape detector: scans drizzle/meta/*_snapshot.json index columns
 *     for `expression: null` — the exact 0.30.x squashIdx ZodError shape
 *     ('Expected string, received null' at path …columns.expression).
 *     The checked-in snapshot (produced by kit 0.31.11) must contain 0 hits.
 *
 * Usage: bun preflight_f2.ts [dbRoot] [--strict]   (--strict exits 1 on a
 *     KNOWN_BAD pair or crash-shape presence; default is report-only)
 */
import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const DB_ROOT_DEFAULT = resolve(import.meta.dir, "../..");

export type PairVerdict = {
  pair: { kit: string; orm: string };
  usable: boolean;
  reasons: string[];
  recommendation: string;
};

export function verdictForPair(kitRange: string, ormRange: string): PairVerdict {
  const kit030 = /^[\^~]?0\.30(\.|$)/.test(kitRange.trim());
  const orm038 = /^[\^~]?0\.38(\.|$)/.test(ormRange.trim());
  const reasons: string[] = [];
  if (kit030 && orm038) {
    reasons.push(
      "kit 0.30.x hard-imports drizzle-orm/gel-core, which drizzle-orm 0.38.x does not export — 'db:pull' fails at startup as declared (T-MIG-002 finding F2)",
    );
  }
  if (kit030) {
    reasons.push(
      "kit 0.30.x's internal squasher crashes on null-expression index columns (ZodError 'Expected string, received null' at path …columns.expression); this schema contains partial indexes and must be pulled with kit 0.31.x (T-MIG-002 finding F2)",
    );
  }
  return {
    pair: { kit: kitRange, orm: ormRange },
    usable: reasons.length === 0,
    reasons,
    recommendation:
      "pin drizzle-kit 0.31.11 + drizzle-orm 0.45.x (+ @neondatabase/serverless 1.2.0) — the D1-proven trio — in a task that OWNS packages/db/package.json; this preflight never edits it",
  };
}

export type CrashShapeHit = { table: string; index: string; column: number };
export type SnapshotScan = {
  indexCount: number;
  partialIndexes: string[];
  crashShape: CrashShapeHit[];
};

export function scanSnapshot(snapshot: unknown): SnapshotScan {
  const out: SnapshotScan = { indexCount: 0, partialIndexes: [], crashShape: [] };
  const tables = (snapshot as { tables?: Record<string, any> }).tables ?? {};
  for (const [tname, t] of Object.entries(tables)) {
    for (const [iname, ix] of Object.entries(t?.indexes ?? {})) {
      out.indexCount += 1;
      if (ix?.where) out.partialIndexes.push(`${tname}.${iname} ${ix.where}`);
      const cols = Array.isArray(ix?.columns) ? ix.columns : [];
      cols.forEach((c: any, i: number) => {
        if (c !== null && typeof c === "object" && "expression" in c && c.expression === null) {
          out.crashShape.push({ table: tname, index: iname, column: i });
        }
      });
    }
  }
  return out;
}

export type PreflightReport = {
  pair: PairVerdict;
  snapshots: Record<string, SnapshotScan>;
  crashShapeTotal: number;
};

export function readPackagePair(pkgJsonPath: string): { kit: string; orm: string } {
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const kit = pkg.devDependencies?.["drizzle-kit"] ?? pkg.dependencies?.["drizzle-kit"] ?? "(absent)";
  const orm = pkg.dependencies?.["drizzle-orm"] ?? "(absent)";
  return { kit, orm };
}

function listSnapshots(metaDir: string): string[] {
  return readdirSync(metaDir)
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort();
}

function main() {
  const strict = process.argv.includes("--strict");
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"))[0];
  const root = positional ? (isAbsolute(positional) ? positional : resolve(process.cwd(), positional)) : DB_ROOT_DEFAULT;

  const pkgPath = join(root, "package.json");
  const pair = readPackagePair(pkgPath);
  const verdict = verdictForPair(pair.kit, pair.orm);

  const metaDir = join(root, "drizzle", "meta");
  const snapshots: Record<string, SnapshotScan> = {};
  let crashShapeTotal = 0;
  for (const f of listSnapshots(metaDir)) {
    const scan = scanSnapshot(JSON.parse(readFileSync(join(metaDir, f), "utf8")));
    snapshots[f] = scan;
    crashShapeTotal += scan.crashShape.length;
  }

  console.log("== T-MIG-002-R F2 preflight ==");
  console.log(`declared pair: drizzle-kit ${verdict.pair.kit} + drizzle-orm ${verdict.pair.orm}`);
  console.log(`usable for db:pull: ${verdict.usable ? "YES" : "NO"}`);
  for (const r of verdict.reasons) console.log(`  ! ${r}`);
  console.log(`recommendation: ${verdict.recommendation}`);
  for (const [f, s] of Object.entries(snapshots)) {
    console.log(
      `snapshot ${f}: ${s.indexCount} indexes, ${s.partialIndexes.length} partial, crash-shape columns: ${s.crashShape.length}`,
    );
    for (const h of s.crashShape) {
      console.log(`  ! crash-shape: ${h.table}.${h.index} column#${h.column} expression:null`);
    }
  }

  if (strict && (!verdict.usable || crashShapeTotal > 0)) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
