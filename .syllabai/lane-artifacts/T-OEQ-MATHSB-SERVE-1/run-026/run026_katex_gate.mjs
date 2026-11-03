// run-025 katex gate: every NEW math span (run024_projection.json) through
// katex.renderToString with throwOnError — the fleet-gate standard.
import { readFileSync } from 'node:fs';
import katex from 'katex';
const proj = JSON.parse(readFileSync('/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-026/run026_projection.json', 'utf8'));
const spans = [];
for (const row of proj) {
  if (!row.field.startsWith('markPoints')) {
    for (const m of row.new.matchAll(/\$[^$]+\$/g)) {
      spans.push({ pid: row.pid, field: row.field, span: m[0].slice(1, -1) });
    }
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
