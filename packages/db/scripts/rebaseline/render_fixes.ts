/**
 * T-MIG-002-R / F3 — in-repo renderer fixes for drizzle-kit 0.31.11 `pull` output.
 *
 * Repo-resident port of the D1 agent-side script (scripts/fix_kit_empty_default.py,
 * which lived OUTSIDE the repo per T-MIG-002 deviation D1). Deterministic,
 * idempotent, logs every site. Two laws:
 *
 *   A. Empty-string default law — kit drops the closing quote on DB default '':
 *      `.default(')`  ->  `.default('')`        (5 sites in the T-MIG-002 baseline)
 *
 *   B. unknown->shim law — kit emits `unknown("<col>")` (and never imports it —
 *      unresolvable on ANY orm version) for column types with no native pg-core
 *      helper, preceded by its `// TODO: failed to parse database type '<t>'`
 *      comment. Replace the call with the matching customType shim from
 *      `src/schema/custom_types.ts` and synthesize/extend the import line:
 *        bytea   -> bytea("col")     (2 sites: revision_note_asset/document bytes)
 *        tsvector-> tsvector("col")  (1 site: content.content_tsv)
 *
 * Refuses to guess: an `unknown(` site without a preceding TODO type comment
 * is an error, not a heuristic case.
 *
 * Usage:   bun render_fixes.ts <schema.ts> [--write]
 *          without --write = check mode (exit 1 if fixes pending)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export type FixSite = {
  kind: "empty-default" | "unknown-shim" | "import";
  line: number;
  detail: string;
};
export type FixResult = { text: string; sites: FixSite[] };

/** DB type -> customType shim export name (custom_types.ts). Extend only with a new shim + test. */
const SHIM_FOR: Record<string, string> = {
  bytea: "bytea",
  tsvector: "tsvector",
};

const EMPTY_DEFAULT_BROKEN = /\.default\('\)/g;
const EMPTY_DEFAULT_FIXED = ".default('')";

export function applyRendererFixes(input: string): FixResult {
  const lines = input.split("\n");
  const sites: FixSite[] = [];
  const usedShims = new Set<string>();
  let pendingType: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const todo = line.match(/\/\/ TODO: failed to parse database type '(\w+)'/);
    if (todo) {
      pendingType = todo[1];
      continue;
    }

    if (line.includes("unknown(")) {
      if (!pendingType) {
        throw new Error(
          `render_fixes: unknown( site at line ${i + 1} has no preceding ` +
            `'failed to parse database type' TODO comment — refusing to guess`,
        );
      }
      const shim = SHIM_FOR[pendingType];
      if (!shim) {
        throw new Error(
          `render_fixes: no customType shim for database type '${pendingType}' (line ${i + 1}) — ` +
            `add the shim to src/schema/custom_types.ts and register it in SHIM_FOR`,
        );
      }
      const replaced = line.replace(/unknown\("([^"]+)"\)/, (_m, col: string) => `${shim}("${col}")`);
      if (replaced === line) {
        throw new Error(`render_fixes: could not rewrite unknown( call at line ${i + 1}`);
      }
      lines[i] = replaced;
      usedShims.add(shim);
      sites.push({
        kind: "unknown-shim",
        line: i + 1,
        detail: `unknown("…") -> ${shim}("…") [db type ${pendingType}]`,
      });
      pendingType = null;
      continue;
    }

    // a different column consumed the TODO slot without an unknown( call — stop waiting
    if (/^\s*[A-Za-z_]\w*\s*:/.test(line) && !/^\s*\/\//.test(line)) {
      pendingType = null;
    }

    const fixed = line.replace(EMPTY_DEFAULT_BROKEN, EMPTY_DEFAULT_FIXED);
    if (fixed !== line) {
      const n = (line.match(EMPTY_DEFAULT_BROKEN) ?? []).length;
      sites.push({
        kind: "empty-default",
        line: i + 1,
        detail: `.default(') -> .default('') x${n}`,
      });
      lines[i] = fixed;
    }
  }

  if (pendingType) {
    throw new Error(
      `render_fixes: dangling 'failed to parse database type ${pendingType}' TODO with no column — refusing to guess`,
    );
  }

  // import synthesis / extension for used shims
  const need = [...usedShims];
  if (need.length > 0) {
    const importRe = /import\s*\{([^}]*)\}\s*from\s*"\.\/custom_types"/;
    const existingIdx = lines.findIndex((l) => importRe.test(l));
    if (existingIdx >= 0) {
      const m = lines[existingIdx].match(importRe)!;
      const have = m[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const missing = need.filter((n) => !have.includes(n));
      if (missing.length > 0) {
        const merged = [...have, ...missing].sort().join(", ");
        lines[existingIdx] = lines[existingIdx].replace(
          importRe,
          `import { ${merged} } from "./custom_types"`,
        );
        sites.push({
          kind: "import",
          line: existingIdx + 1,
          detail: `extended custom_types import with ${missing.join(", ")}`,
        });
      }
    } else {
      let lastImport = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i])) lastImport = i;
      }
      const stmt = `import { ${need.sort().join(", ")} } from "./custom_types"`;
      lines.splice(lastImport + 1, 0, stmt);
      sites.push({
        kind: "import",
        line: lastImport + 2,
        detail: `synthesized "${stmt}"`,
      });
    }
  }

  return { text: lines.join("\n"), sites };
}

function resolveTarget(file: string): string {
  return isAbsolute(file) ? file : resolve(process.cwd(), file);
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: bun render_fixes.ts <schema.ts> [--write]");
    process.exit(2);
  }
  const target = resolveTarget(file);
  const before = readFileSync(target, "utf8");
  const { text, sites } = applyRendererFixes(before);
  for (const s of sites) {
    console.log(`  line ${s.line}: ${s.kind} — ${s.detail}`);
  }
  if (text === before) {
    console.log(`render_fixes: 0 sites changed (${target} already canonical)`);
    return;
  }
  if (write) {
    writeFileSync(target, text);
    console.log(`render_fixes: ${sites.length} site(s) fixed -> ${target}`);
  } else {
    console.log(`render_fixes: ${sites.length} site(s) pending (re-run with --write to apply)`);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
