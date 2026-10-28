// run-018 fleet KaTeX gate: every $...$ / $$...$$ span across problemMd,
// solutionMd, markPoints[].textMd of official-papers.json, throwOnError.
const katex = require('katex');
const fs = require('fs');
const B = '/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json';
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
      const carriers = [['problemMd', p.problemMd || ''], ['solutionMd', p.solutionMd || '']];
      for (const mp of p.markPoints || []) carriers.push([`markPoints[${mp.id}]`, mp.textMd || '']);
      for (const [fld, t] of carriers) {
        for (const m of t.matchAll(/\$\$([^$]+)\$\$/g)) check(m[1], `${s.slug} ${q.id} p${pi} ${fld}`);
        const cleaned = t.replace(/\\\$/g, '\u0000');
        for (const m of cleaned.matchAll(/\$([^$\n]+)\$/g)) check(m[1], `${s.slug} ${q.id} p${pi} ${fld}`);
      }
    }
  }
}
console.log(`fleet katex segments checked: ${segs}, failures: ${fails.length}`);
for (const f of fails.slice(0, 10)) console.log('FAIL', f.where, '::', f.seg, '::', f.err);
process.exit(fails.length ? 1 : 0);
