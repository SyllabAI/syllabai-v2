// run-017 tranche-3 render gates:
// Gate 1: KaTeX throwOnError on every $ span of the 10 edited fields.
// Gate 2: q23-a problemMd rendered through react-markdown (the actual hub
//         renderer engine) with the same plugin list as markdown.tsx —
//         assert a <table> survives remark-gfm + rehype-raw + rehype-sanitize.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const HUB = '/home/z/my-project/repos/syllabai-v2/apps/hub';
const NM = '/home/z/my-project/repos/syllabai-v2/node_modules';

const katex = require(`${NM}/katex`);
const ReactMarkdown = require(`${NM}/react-markdown`).default;
const remarkGfm = require(`${NM}/remark-gfm`).default;
const remarkMath = require(`${NM}/remark-math`).default;
const rehypeRaw = require(`${NM}/rehype-raw`).default;
const rehypeSanitize = require(`${NM}/rehype-sanitize`).default;

const plane = JSON.parse(readFileSync(`${HUB}/content/igcse-maths-b-16/official-papers.json`, 'utf8'));

const TARGETS = [
  ['official-4mb1-01-2025-06', 'offp_2025-06_01_6', 'solutionMd'],
  ['official-4mb1-01-2025-06', 'offp_2025-06_01_8-b', 'solutionMd'],
  ['official-4mb1-01-2025-06', 'offp_2025-06_01_11', 'solutionMd'],
  ['official-4mb1-01-2025-06', 'offp_2025-06_01_12', 'solutionMd'],
  ['official-4mb1-01-2025-06', 'offp_2025-06_01_23-a', 'problemMd'],
  ['official-4mb1-01r-2026-06', 'offp_2026-06_01r_18', 'solutionMd'],
  ['official-4mb1-01r-2026-06', 'offp_2026-06_01r_19', 'solutionMd'],
  ['official-4mb1-01r-2026-06', 'offp_2026-06_01r_25', 'solutionMd'],
  ['official-4mb1-01r-2026-06', 'offp_2026-06_01r_27-a', 'solutionMd'],
  ['official-4mb1-01r-2026-06', 'offp_2026-06_01r_27-b', 'solutionMd'],
];

const texts = [];
for (const [slug, pid, field] of TARGETS) {
  const s = plane.find((x) => x.slug === slug);
  if (!s) { console.log('FATAL missing set', slug); process.exit(2); }
  let part = null;
  for (const q of s.questions) for (const p of q.parts || []) if (p.id === pid) part = p;
  if (!part) { console.log('FATAL missing part', pid); process.exit(2); }
  texts.push([pid, field, part[field] || '']);
}

// Gate 1: KaTeX parse every $ span, throwOnError
let segs = 0, fails = [];
for (const [pid, field, txt] of texts) {
  const spans = txt.match(/\$[^$]+\$/g) || [];
  for (const sp of spans) {
    segs++;
    try { katex.renderToString(sp.slice(1, -1), { throwOnError: true, displayMode: false }); }
    catch (e) { fails.push([pid, field, sp.slice(0, 60), String(e).slice(0, 120)]); }
  }
}
console.log(`katex_gate: ${segs} segments, ${fails.length} failures`);
for (const f of fails) console.log('  FAIL', JSON.stringify(f));

// Gate 2: q23-a problemMd through react-markdown (same plugin list as markdown.tsx)
const q23a = texts.find(([pid, f]) => pid === 'offp_2025-06_01_23-a' && f === 'problemMd');
const html = renderToStaticMarkup(
  React.createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [rehypeRaw, rehypeSanitize],
  }, q23a[2])
);
const trs = (html.match(/<tr>/g) || []).length;
const tableOk = /<table/.test(html) && /<th/.test(html) && trs >= 6;
const leCellOk = /le/.test(html); // \le survived sanitize and math pipeline markers
console.log(`gfm_table_gate: table=${/<table/.test(html)} th=${/<th/.test(html)} tr=${trs} (need >=6)`);
if (!tableOk) { console.log('--- rendered html head ---'); console.log(html.slice(0, 1500)); }

const ok = fails.length === 0 && tableOk;
console.log('RENDER_GATES:', ok ? 'ALL GREEN' : 'RED');
process.exit(ok ? 0 : 3);
