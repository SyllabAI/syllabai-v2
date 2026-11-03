// RN-DEBRIS-5 run-001 — stage 2: KaTeX failure census + longest-known-prefix
// command-boundary decomposition.
//
// Render law = of-record jd4_katex_pair.ts / ls3_katex_guard.ts:
//   katex.renderToString(body, { throwOnError: true, displayMode: false })
//
// A command token \NAME extracted by maximal munch ([A-Za-z]+) is UNKNOWN iff
// rendering \NAME fails with "Undefined control sequence". An unknown token is
// a command-boundary GLUE hit iff it decomposes as P + S (S non-empty) where P
// is a known command (longest-first probe) and \P + " " + S parses. The fix
// inserts exactly one boundary space; the suffix is preserved verbatim
// (zero-invention). Whole-segment gate: the fixed segment must parse, else the
// segment is kept unchanged (fail-closed).
import katex from "/tmp/ktx/node_modules/katex/dist/katex.mjs";
import { readFileSync, writeFileSync } from "fs";

const data = JSON.parse(readFileSync("/tmp/rnd5_segments.json", "utf-8"));
const segs = Object.keys(data.sites);
const CMD = /\\([A-Za-z]+)/g;

function render(s) {
  try {
    katex.renderToString(s, { throwOnError: true, displayMode: false });
    return null;
  } catch (e) {
    return String((e && e.message) || e);
  }
}

const knownCache = new Map();
function known(name) {
  if (knownCache.has(name)) return knownCache.get(name);
  const err = render("\\" + name);
  const k = err === null || !/Undefined control sequence/.test(err);
  knownCache.set(name, k);
  return k;
}

let pass = 0, fail = 0;
const fails = [];
for (const seg of segs) {
  const body = seg.slice(1, -1);
  const err = render(body);
  if (err === null) { pass++; continue; }
  fail++;
  const tokens = [...new Set([...body.matchAll(CMD)].map((m) => m[1]))];
  const unknown = tokens.filter((t) => !known(t));
  const decos = [];
  for (const name of unknown) {
    const cands = [];
    for (let L = name.length - 1; L >= 1; L--) {
      const P = name.slice(0, L), S = name.slice(L);
      if (!known(P)) continue;
      if (render("\\" + P + " " + S) === null) cands.push({ P, S });
    }
    decos.push({ name, cands, longest: cands.length ? cands[0] : null });
  }
  let fixed = body;
  let anyGlue = false;
  for (const d of decos) {
    if (d.longest) {
      anyGlue = true;
      // ONE literal backslash in the replacement (JS "\\" is a single char;
      // String.replace does not interpret backslash escapes)
      fixed = fixed.replace(
        new RegExp("\\\\" + d.name + "(?![A-Za-z])", "g"),
        "\\" + d.longest.P + " " + d.longest.S,
      );
    }
  }
  // BYTE-INVARIANT gate: the fix inserts spaces only — the char multiset of
  // the fixed body minus spaces must equal the original's minus spaces
  // (parse-only guards can be fooled by linebreak-misread forms).
  const strip = (s) => s.replace(/ /g, "").split("").sort().join("");
  if (strip(fixed) !== strip(body)) {
    throw new Error("BYTE-INVARIANT VIOLATION for segment: " + body.slice(0, 90));
  }
  const fixedErr = anyGlue ? render(fixed) : null;
  fails.push({
    seg, err, unknown, decos,
    fixed: anyGlue ? fixed : null,
    fixedOk: anyGlue && fixedErr === null,
    fixedErr: anyGlue ? fixedErr : null,
  });
}

const glueFixable = fails.filter((f) => f.fixedOk);
const glueBlocked = fails.filter((f) => f.fixed && !f.fixedOk);
const noGlue = fails.filter((f) => !f.fixed);
console.log(JSON.stringify({
  segments: segs.length, pass, fail,
  glueFixable: glueFixable.length, glueBlocked: glueBlocked.length, noGlue: noGlue.length,
}));
writeFileSync("/tmp/rnd5_decomposed.json", JSON.stringify({ pass, fail, fails }, null, 1));
console.log("-> /tmp/rnd5_decomposed.json");
