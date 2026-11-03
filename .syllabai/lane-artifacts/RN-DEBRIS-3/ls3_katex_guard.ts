// RN-DEBRIS-3 run-001 — KaTeX render guard.
// For each content file modified by the wave: collect all $…$ segments from
// HEAD (git show) and from the working tree, render with katex
// throwOnError:true, and fail if the working tree introduces any NEW
// non-rendering segment. Usage:
//   bun ls3_katex_guard.ts <repoRoot> <fileWithPaths>
import katex from "/tmp/ktx/node_modules/katex/dist/katex.mjs";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const repo = process.argv[2];
const fileList = readFileSync(process.argv[3], "utf-8").split("\n").filter(Boolean);
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

let oldFails = new Set(), newFails = new Set(), oldCount = 0, newCount = 0;
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
console.log(`NEW failures introduced: ${introduced.length}`);
for (const s of introduced.slice(0, 8)) console.log("  NEW-FAIL:", s.slice(0, 110));
console.log(`failures healed: ${healed.length}`);
if (introduced.length) { console.error("KATEX GUARD FAILED"); process.exit(1); }
console.log("KATEX GUARD PASSED");
