// run-019 katex gate: every NEW math span (run019_spans.json, 100 spans)
// through katex.renderToString with throwOnError — the fleet-gate standard
// (katex 0.16.47 @ bun.lock pin).
import { readFileSync } from 'node:fs';
import katex from 'katex';

const spans = JSON.parse(readFileSync('/home/z/my-project/scripts/run019_spans.json', 'utf8'));
let fails = 0;
for (const { fix, pid, span } of spans) {
  try {
    katex.renderToString(span, { throwOnError: true, displayMode: false });
  } catch (e) {
    fails++;
    console.log(`FAIL fix#${fix} ${pid}: ${span}\n  -> ${e.message?.slice(0, 140)}`);
  }
}
console.log(`katex gate: ${spans.length - fails}/${spans.length} spans OK @ katex ${katex.version} throwOnError`);
process.exit(fails ? 4 : 0);
