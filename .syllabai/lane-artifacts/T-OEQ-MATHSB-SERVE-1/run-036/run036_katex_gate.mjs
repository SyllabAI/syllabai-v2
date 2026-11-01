// run-035 katex gate: every NEW math span (run036_projection.json, problemMd) through
// katex.renderToString with throwOnError — run-033 clone, run-035 paths.
import { readFileSync } from 'node:fs';
import katex from 'katex';
const proj = JSON.parse(readFileSync('/home/z/my-project/scratch/toeq_state/fmt/run036_projection.json', 'utf8'));
const spans = [];
for (const row of proj) {
  const t = row.new.replace(/\\\$/g, '');
  for (const m of t.matchAll(/\$[^$]+\$/g)) {
    spans.push({ pid: row.pid, field: row.field, span: m[0].slice(1, -1) });
  }
}
let fails = 0;
for (const { pid, field, span } of spans) {
  try {
    katex.renderToString(span, { throwOnError: true, displayMode: false });
  } catch (e) {
    fails++;
    console.log(`FAIL ${pid} ${field}: ${span}\n  -> ${e.message?.slice(0, 140)}`);
  }
}
console.log(`katex gate: ${spans.length - fails}/${spans.length} spans OK @ katex ${katex.version} throwOnError`);
process.exit(fails ? 4 : 0);
