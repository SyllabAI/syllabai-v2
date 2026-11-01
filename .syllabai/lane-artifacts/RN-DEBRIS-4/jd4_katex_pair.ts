// RN-DEBRIS-4 run-001 — KaTeX guard + defect-pairing verifier.
// Same render law as the of-record ls3_katex_guard.ts (renderToString,
// throwOnError:true, string-set diff), PLUS: dumps the introduced/healed
// sets so each introduced string can be matched to its healed pre-image
// through the applied conversion list (jd4_apply_report.json). A segment
// whose OLD string failed and whose NEW string fails for the SAME untouched
// defect (e.g. \timesr glued into a command) is a defect-pair, not a new
// incapacity. Usage: bun jd4_katex_pair.ts <repoRoot> <fileWithPaths> <outJson>
import katex from "/tmp/ktx/node_modules/katex/dist/katex.mjs";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

const repo = process.argv[2];
const fileList = readFileSync(process.argv[3], "utf-8").split("\n").filter(Boolean);
const outFile = process.argv[4];
const SEG = /\$[^$]+\$/g;

function collect(text, out) {
  const data = JSON.parse(text);
  const stack = [data];
  while (stack.length) {
    const n = stack.pop();
    if (n && typeof n === "object") {
      if (Array.isArray(n)) stack.push(...n);
      else stack.push(...Object.values(n));
    } else if (typeof n === "string") {
      for (const m of n.matchAll(SEG)) out.add(m[0]);
    }
  }
}

const oldFails = new Set(), newFails = new Set();
let oldCount = 0, newCount = 0;
function renderAll(segs, failSet) {
  for (const s of segs) {
    try {
      katex.renderToString(s.slice(1, -1), { throwOnError: true, displayMode: false });
    } catch (e) {
      failSet.add(s);
    }
  }
}

for (const f of fileList) {
  const oldSegs = new Set(), newSegs = new Set();
  try {
    collect(execSync(`git show HEAD:${JSON.stringify(f)}`, { cwd: repo, maxBuffer: 1e9 }).toString(), oldSegs);
  } catch (e) { /* new file */ }
  collect(readFileSync(`${repo}/${f}`, "utf-8"), newSegs);
  oldCount += oldSegs.size; newCount += newSegs.size;
  renderAll(oldSegs, oldFails);
  renderAll(newSegs, newFails);
}

const introduced = [...newFails].filter((s) => !oldFails.has(s));
const healed = [...oldFails].filter((s) => !newFails.has(s));
console.log(`segments: old ${oldCount}, new ${newCount}`);
console.log(`render failures: old ${oldFails.size}, new ${newFails.size}`);
console.log(`string-diff: introduced ${introduced.length}, healed ${healed.length}`);

// build OLD->NEW map from the apply report BEFORE pairing
const MAP = new Map();
const rep = JSON.parse(readFileSync("/tmp/jd4_apply_report.json", "utf-8"));
for (const rel of Object.keys(rep.detail)) {
  for (const [seg, d] of Object.entries(rep.detail[rel])) {
    MAP.set(seg, d.fixed);
  }
}

// pairing: an introduced string is defect-paired iff it is the direct
// conversion output of a healed string (OLD -> NEW via one applied segment)
const pairs = [];
const healedPool = new Set(healed);
let unpaired = [];
for (const s of introduced) {
  let match = null;
  for (const h of healedPool) {
    if (derives(h, s)) { match = h; break; }
  }
  if (match) { pairs.push({ old: match, new: s }); healedPool.delete(match); }
  else unpaired.push(s);
}
console.log(`defect-paired: ${pairs.length}/${introduced.length}, unpaired: ${unpaired.length}`);
for (const u of unpaired.slice(0, 5)) console.log("  UNPAIRED:", u.slice(0, 110));

function derives(h, s) {
  // s derives from h iff the applied conversion maps h to s exactly
  return MAP.has(h) && MAP.get(h) === s;
}

writeFileSync(outFile, JSON.stringify({
  segmentsOld: oldCount, segmentsNew: newCount,
  failsOld: oldFails.size, failsNew: newFails.size,
  introduced, healed, pairs, unpaired,
}, null, 1));
console.log("->", outFile);
if (unpaired.length) { console.error("KATEX GUARD: UNPAIRED NEW FAILURES"); process.exit(1); }
console.log("KATEX GUARD PASSED (all introduced failures defect-paired)");
