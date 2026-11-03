#!/usr/bin/env node
/** RN-DEBRIS-11 run-001 OPEN — class C: full-corpus katex failure sweep.
 * Reads /tmp/rn11/rn11_segments.jsonl (MATHSEG dollar occurrences, family law),
 * renders every UNIQUE segment with katex 0.16.22 throwOnError, and reports:
 *   - segmentsTotal / uniqueTotal (fresh full-corpus baseline)
 *   - failures: unique failing segments with error + occurrence/file rollup
 *   - braceClass: unbalanced-brace signature classification per failure
 * Read-only; writes /tmp/rn11/rn11_census_c.json.
 */
const fs = require("fs");
const katex = require("/tmp/rn11/node_modules/katex");

const IN = "/tmp/rn11/rn11_segments.jsonl";
const OUT = "/tmp/rn11/rn11_census_c.json";

const lines = fs.readFileSync(IN, "utf8").split("\n").filter(Boolean);
let occ = 0;
const unique = new Map(); // seg -> {count, files:Set, paths:[first few]}
for (const line of lines) {
  occ++;
  const { file, path, seg } = JSON.parse(line);
  if (!unique.has(seg)) unique.set(seg, { count: 0, files: new Set(), paths: [] });
  const u = unique.get(seg);
  u.count++;
  u.files.add(file);
  if (u.paths.length < 3) u.paths.push({ file, path });
}

let rendered = 0;
const failures = [];
for (const [seg, u] of unique) {
  rendered++;
  if (rendered % 20000 === 0) console.error(`... ${rendered}/${unique.size}`);
  const body = seg.length >= 2 && seg.startsWith("$") && seg.endsWith("$") ? seg.slice(1, -1) : seg;
  try {
    katex.renderToString(body, { throwOnError: true, displayMode: false, output: "html" });
  } catch (e) {
    const opens = (seg.match(/\{/g) || []).length;
    const closes = (seg.match(/\}/g) || []).length;
    failures.push({
      seg,
      err: String(e.message).slice(0, 160),
      count: u.count,
      files: [...u.files],
      paths: u.paths,
      braceUnbalanced: opens !== closes,
      opens,
      closes,
    });
  }
}

failures.sort((a, b) => b.count - a.count);
const out = {
  lane: "RN-DEBRIS-11",
  run: "run-001",
  mode: "open-census-readonly-katex",
  katexVersion: require("/tmp/rn11/node_modules/katex/package.json").version,
  meta: { occurrenceSegments: occ, uniqueSegments: unique.size, rendered },
  failureUniqueCount: failures.length,
  failureOccurrenceCount: failures.reduce((s, f) => s + f.count, 0),
  braceUnbalancedUnique: failures.filter((f) => f.braceUnbalanced).length,
  failures,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({
  occurrenceSegments: occ,
  uniqueSegments: unique.size,
  failureUniqueCount: out.failureUniqueCount,
  failureOccurrenceCount: out.failureOccurrenceCount,
  braceUnbalancedUnique: out.braceUnbalancedUnique,
}, null, 1));
console.log("wrote", OUT);
