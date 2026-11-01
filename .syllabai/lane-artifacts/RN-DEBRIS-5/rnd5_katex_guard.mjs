// RN-DEBRIS-5 run-001 — KaTeX pair guard (jd4_katex_pair.ts law, no pairing leg).
// Over every content file changed by the lane: collect ALL $-spans from the
// HEAD blob and the worktree file, render both with the of-record law
// (renderToString, throwOnError, displayMode:false). Assert introduced == 0;
// report healed. Also asserts the 31 of-record seed strings healed.
import katex from "/tmp/ktx/node_modules/katex/dist/katex.mjs";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

const repo = process.argv[2];
const fileList = readFileSync(process.argv[3], "utf-8").split("\n").filter(Boolean);
const outFile = process.argv[4];
const SEG = /\$[^$]+\$/g;
const SEED = JSON.parse(readFileSync("/tmp/jd4_katex_pair_r0.json", "utf-8")).introduced;

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
for (const f of fileList) {
  const oldSegs = new Set(), newSegs = new Set();
  try {
    collect(execSync(`git show HEAD:${JSON.stringify(f)}`, { cwd: repo, maxBuffer: 1e9 }).toString(), oldSegs);
  } catch (e) { /* new file — none expected */ }
  collect(readFileSync(`${repo}/${f}`, "utf-8"), newSegs);
  oldCount += oldSegs.size; newCount += newSegs.size;
  for (const s of oldSegs) {
    try { katex.renderToString(s.slice(1, -1), { throwOnError: true, displayMode: false }); }
    catch (e) { oldFails.add(s); }
  }
  for (const s of newSegs) {
    try { katex.renderToString(s.slice(1, -1), { throwOnError: true, displayMode: false }); }
    catch (e) { newFails.add(s); }
  }
}

const introduced = [...newFails].filter((s) => !oldFails.has(s));
const healed = [...oldFails].filter((s) => !newFails.has(s));
const seedHealed = SEED.filter((s) => healed.includes(s));

// independent byte-invariant verification of every conversion pair in the
// manifest: old and new must differ by SPACES ONLY (char multiset minus
// spaces identical) — catches double-backslash / linebreak-misread forms
// that parse-only guards accept
const manifest = JSON.parse(readFileSync("/tmp/rnd5_manifest.json", "utf-8"));
const strip = (s) => s.replace(/ /g, "").split("").sort().join("");
let badPairs = 0, insTotal = 0;
for (const p of manifest) {
  if (strip(p.old) !== strip(p.new)) { badPairs++; if (badPairs <= 3) console.log("  BAD PAIR:", p.old.slice(0, 90), "->", p.new.slice(0, 90)); }
  insTotal += p.new.length - p.old.length;
}
console.log(`manifest pairs: ${manifest.length}, byte-invariant violations: ${badPairs} (must be 0), boundary insertions: ${insTotal}`);
console.log(`files: ${fileList.length}`);
console.log(`spans: old ${oldCount}, new ${newCount}`);
console.log(`render failures: old ${oldFails.size} -> new ${newFails.size}`);
console.log(`introduced: ${introduced.length} (must be 0)`);
console.log(`healed: ${healed.length}`);
console.log(`of-record seed healed: ${seedHealed.length}/${SEED.length}`);
for (const u of introduced.slice(0, 5)) console.log("  INTRODUCED:", u.slice(0, 120));
writeFileSync(outFile, JSON.stringify({
  files: fileList.length, spansOld: oldCount, spansNew: newCount,
  failsOld: oldFails.size, failsNew: newFails.size,
  introduced, healedCount: healed.length, healed,
  seedHealed: seedHealed.length, seedTotal: SEED.length,
  manifestPairs: manifest.length, byteInvariantViolations: badPairs, boundaryInsertions: insTotal,
}, null, 1));
if (introduced.length) { console.error("KATEX GUARD: INTRODUCED NEW FAILURES"); process.exit(1); }
if (seedHealed.length !== SEED.length) { console.error("KATEX GUARD: SEED NOT FULLY HEALED"); process.exit(1); }
if (badPairs) { console.error("KATEX GUARD: BYTE-INVARIANT VIOLATIONS IN MANIFEST"); process.exit(1); }
console.log("KATEX GUARD PASSED");
