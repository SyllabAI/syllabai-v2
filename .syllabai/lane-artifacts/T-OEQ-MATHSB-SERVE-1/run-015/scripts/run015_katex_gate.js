#!/usr/bin/env node
/* run-015 katex gate (playbook §5.2): every $...$ segment in the plane must parse (throwOnError). */
const fs = require("fs");
const katex = require("/home/z/my-project/scratch/katex-gate/node_modules/katex");
const PLANE = "/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json";
const plane = JSON.parse(fs.readFileSync(PLANE, "utf8"));
let segs = 0, bad = [];
const fields = ["problemMd", "solutionMd"];
for (const paper of plane) {
  for (const q of paper.questions) {
    for (const part of q.parts) {
      const texts = [];
      for (const f of fields) if (part[f]) texts.push([part.id + "." + f, part[f]]);
      (part.markPoints || []).forEach((mp, i) => { if (mp.textMd) texts.push([`${part.id}.markPoints[${i}]`, mp.textMd]); });
      for (const [where, text] of texts) {
        const segsIn = text.split(/(?<!\\)\$/);
        for (let i = 1; i + 1 < segsIn.length; i += 2) {
          const seg = segsIn[i];
          if (!seg.trim()) continue;
          segs++;
          try { katex.renderToString(seg, { throwOnError: true, displayMode: false }); }
          catch (e) { bad.push({ where, seg: seg.slice(0, 80), err: String(e.message).slice(0, 120) }); }
        }
      }
    }
  }
}
console.log(`katex segments scanned: ${segs}, failures: ${bad.length}`);
for (const b of bad.slice(0, 10)) console.log("  FAIL", b.where, JSON.stringify(b.seg), b.err);
process.exit(bad.length ? 1 : 0);
