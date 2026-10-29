// KaTeX gate: validate every $...$ / $$...$$ segment in all problemMd/solutionMd.
const katex = require('katex');
const fs = require('fs');
const B = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json';
const d = JSON.parse(fs.readFileSync(B, 'utf8'));
let segs = 0, fails = [];
const seen = new Set();
function check(seg, where) {
  if (seen.has(seg)) return;
  seen.add(seg);
  segs++;
  try {
    katex.renderToString(seg, { throwOnError: true, displayMode: seg.startsWith('$$') || seg.startsWith('\\[') });
  } catch (e) {
    fails.push({ where, seg: seg.slice(0, 120), err: String(e).slice(0, 160) });
  }
}
for (const s of d) {
  for (const q of s.questions) {
    for (const [pi, p] of (q.parts || []).entries()) {
      for (const fld of ['problemMd', 'solutionMd']) {
        const t = p[fld] || '';
        // display $$...$$
        for (const m of t.matchAll(/\$\$([^$]+)\$\$/g)) check(m[1], `${s.slug} q${p.id} ${fld}`);
        // inline $...$ (non-escaped, non-currency: skip \$)
        const cleaned = t.replace(/\\\$/g, '\u0000');
        for (const m of cleaned.matchAll(/\$([^$\n]+)\$/g)) check(m[1], `${s.slug} ${q.id} p${pi} ${fld}`);
      }
    }
  }
}
console.log(`segments checked: ${segs}, failures: ${fails.length}`);
for (const f of fails.slice(0, 20)) console.log('FAIL', f.where, '::', f.seg, '::', f.err);
process.exit(fails.length ? 1 : 0);
