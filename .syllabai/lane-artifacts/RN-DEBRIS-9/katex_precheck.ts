// RN-DEBRIS-9 — render-status precondition set: which candidate segments'
// OLD forms already fail katex throwOnError (pre-existing failure class).
import katex from "/tmp/ktx/node_modules/katex/dist/katex.mjs";
import { readFileSync, writeFileSync } from "fs";
const rep = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const fails = [];
for (const c of rep.convertedSegments) {
  if (c.kind !== "dollar-segment") continue;
  const seg = c.before;
  try {
    katex.renderToString(seg.slice(1, -1), { throwOnError: true, displayMode: false });
  } catch (e) {
    fails.push(seg);
  }
}
writeFileSync(process.argv[3], JSON.stringify(fails, null, 1));
console.log("pre-existing render failures among candidates:", fails.length);
