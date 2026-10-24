const katex = require('katex');
const fs = require('fs');
const B = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json';
const d = JSON.parse(fs.readFileSync(B, 'utf8'));
let segs = 0, fails = [];
const seen = new Set();
function check(seg, where) {
  seg = seg.replace(/\u0000/g, '\\$');
  if (seen.has(seg)) return;
  seen.add(seg);
  segs++;
  try {
    katex.renderToString(seg, { throwOnError: true, displayMode: seg.startsWith('$$') || seg.startsWith('\\[') });
  } catch (e) {
    fails.push({ where, seg: seg.slice(0, 140), err: String(e).slice(0, 160) });
  }
}
for (const s of d) {
  for (const q of s.questions) {
    for (const [pi, p] of (q.parts || []).entries()) {
      for (const fld of ['problemMd', 'solutionMd']) {
        const t = (p[fld] || '').replace(/\\\$/g, '\u0000');
        for (const m of t.matchAll(/\$\$([^$]+)\$\$/g)) check(m[1], `${s.slug} q${q.order}p${pi} ${fld}`);
        for (const m of t.matchAll(/\$([^$\n]+)\$/g)) check(m[1], `${s.slug} q${q.order}p${pi} ${fld}`);
      }
    }
  }
}
console.log(`KaTeX gate: ${segs} unique segments, ${fails.length} failures`);
for (const f of fails.slice(0, 10)) console.log('FAIL', f.where, JSON.stringify(f.seg), f.err);
process.exit(fails.length ? 1 : 0);
