// RN-DEBRIS-10 run-001 KaTeX render-equivalence gate.
// For every changed file: compare ALL $-segments (old = git HEAD, new =
// working tree) at the decoded-string level. For each string that changed:
//   - segment count parity (pair guard), and
//   - for every segment pair whose content differs: katex.renderToString
//     (output:'html') must be BYTE-IDENTICAL — proof that the split-law
//     spaces introduced no visual drift in math mode (TeX math mode ignores
//     inter-token whitespace).
// Fail (exit 1) on any parity break or render divergence.
import katex from "katex";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REPO = "/home/z/my-project/work/sv2-rn9";
const changed = readFileSync("/tmp/rnd10_changed_files_r0.txt", "utf8")
  .split("\n").map(s => s.trim()).filter(Boolean);

const DOLLAR = /(?<!\\)\$/g;

function segments(s) {
  const dollars = [];
  let m;
  DOLLAR.lastIndex = 0;
  while ((m = DOLLAR.exec(s)) !== null) dollars.push(m.index);
  const segs = [];
  for (let i = 0; i + 1 < dollars.length; i += 2)
    segs.push(s.slice(dollars[i] + 1, dollars[i + 1]));
  return { segs, odd: dollars.length % 2 };
}

function collect(raw) {
  const out = [];
  const walk = (o) => {
    if (o && typeof o === "object") {
      if (Array.isArray(o)) for (const v of o) walk(v);
      else for (const k of Object.keys(o)) walk(o[k]);
    } else if (typeof o === "string" && o.includes("$")) out.push(o);
  };
  walk(JSON.parse(raw));
  return out;
}

let files = 0, stringsCompared = 0, segPairs = 0, changedSegs = 0, oddTail = 0;
const failures = [];
for (const rel of changed) {
  const oldRaw = execSync(`git show HEAD:${rel}`, { cwd: REPO, maxBuffer: 1 << 30 }).toString("utf8");
  const newRaw = readFileSync(`${REPO}/${rel}`, "utf8");
  const oldMap = new Map(collect(oldRaw).map(s => [s, s]));
  const newStrings = collect(newRaw);
  // multiset compare of $-strings old vs new
  const oldList = collect(oldRaw);
  if (oldList.length !== newStrings.length) {
    failures.push(`${rel}: $-string count ${oldList.length} -> ${newStrings.length}`);
    continue;
  }
  files++;
  const counts = new Map();
  for (const s of oldList) counts.set(s, (counts.get(s) || 0) + 1);
  for (const s of newStrings) counts.set(s, (counts.get(s) || 0) - 1);
  const changedStrings = [...counts.entries()].filter(([, c]) => c !== 0).map(([s]) => s);
  // for each changed string value, find its old counterpart via the old map
  // (identical multiset minus one) — pair by index within the changed class
  for (const s of changedStrings) {
    stringsCompared++;
    const oldSegsAll = oldList.filter(x => x !== s);
    // old counterpart: the string with the splice undone
    const oldS = s
      .replace(/(?<![A-Za-z])d sin(?![A-Za-z])/g, "dsin")
      .replace(/(?<![A-Za-z])use of(?![A-Za-z])/g, "useof");
    if (!oldMap.has(oldS)) {
      failures.push(`${rel}: no old counterpart for ${s.slice(0, 80)}`);
      continue;
    }
    const a = segments(oldS), b = segments(s);
    oddTail += a.odd + b.odd;
    if (a.segs.length !== b.segs.length) {
      failures.push(`${rel}: segment count ${a.segs.length} -> ${b.segs.length} in "${oldS.slice(0, 60)}"`);
      continue;
    }
    for (let i = 0; i < a.segs.length; i++) {
      segPairs++;
      if (a.segs[i] === b.segs[i]) continue;
      changedSegs++;
      const ha = katex.renderToString(a.segs[i], { output: "html", throwOnError: false, strict: false });
      const hb = katex.renderToString(b.segs[i], { output: "html", throwOnError: false, strict: false });
      if (ha !== hb) {
        failures.push(`${rel}: RENDER DIVERGENCE seg#${i}: "${a.segs[i]}" vs "${b.segs[i]}"`);
      }
    }
  }
}

const report = { files, stringsCompared, segPairs, changedSegs, oddTail, failures };
console.log(JSON.stringify({ ...report, failures: failures.length }, null, 1));
import { writeFileSync } from "node:fs";
writeFileSync("/tmp/rnd10_katex_pair_r0.json", JSON.stringify(report, null, 1));
if (failures.length) { console.error("KATEX PAIR GATE: FAIL"); process.exit(1); }
console.log("KATEX PAIR GATE: PASS (all changed $-segments render-identical)");
