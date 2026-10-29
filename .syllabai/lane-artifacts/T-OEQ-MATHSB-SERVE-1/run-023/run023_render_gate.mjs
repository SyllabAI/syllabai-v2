// run-023 render gate: the 5 projected field-writes (q10(b) head-row completion,
// q11(a)/(b) overspill reunite) through the ACTUAL hub pipeline engine —
// markdown.tsx of-record plugin list (react-markdown + remark-gfm + remark-math +
// rehype-raw + rehype-sanitize + the hub's LOCAL rehypeKatexMhchem).
// Law (run-022 standard): OLD zero .katex-error; NEW zero .katex-error;
// .katex count NEW >= OLD. Run with bun (TS plugin import).
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { rehypeKatexMhchem } from '../../../../apps/hub/src/lib/rehypeKatexMhchem.ts';

const REPO = '/home/z/my-project/repos/syllabai-v2';
const PLANE_PATH = 'apps/hub/content/igcse-maths-b-16/official-papers.json';

const oldPlane = JSON.parse(execSync(`git -C ${REPO} show HEAD:${PLANE_PATH}`, { maxBuffer: 1024 * 1024 * 64 }).toString());
const newPlane = JSON.parse(readFileSync(`${REPO}/${PLANE_PATH}`, 'utf8'));

function collect(plane) {
  const out = {};
  for (const s of plane) for (const q of s['questions']) for (const p of q['parts']) {
    out[p.id] = {
      solutionMd: p.solutionMd || '',
      mp: Object.fromEntries((p.markPoints || []).map(m => [m.id, m.textMd || ''])),
    };
  }
  return out;
}
const O = collect(oldPlane), N = collect(newPlane);

const FIELDS = [
  ['offp_2021-06_02_10-b', 'solutionMd'],
  ['offp_2021-06_02_11-a', 'solutionMd'],
  ['offp_2021-06_02_11-b', 'solutionMd'],
  ['offp_2021-06_02_11-a', 'markPoints[2021-06-11-a-MP1].textMd'],
  ['offp_2021-06_02_11-b', 'markPoints[2021-06-11-b-MP1].textMd'],
];

function render(txt) {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeRaw, rehypeSanitize, [rehypeKatexMhchem, { errorColor: '#b91c1c', strict: 'ignore' }]],
    }, txt),
  );
}
function getText(pid, field, bag) {
  if (field === 'solutionMd') return bag[pid].solutionMd;
  const mid = field.slice('markPoints['.length, -'].textMd'.length);
  return bag[pid].mp[mid] ?? '';
}

let fails = 0, totalKatex = 0;
for (const [pid, field] of FIELDS) {
  const oldTxt = getText(pid, field, O), newTxt = getText(pid, field, N);
  if (oldTxt === newTxt) { console.log(`FAIL ${pid} [${field}]: unchanged`); fails++; continue; }
  let oldHtml = '', newHtml = '', oldErr = false, newErr = false;
  try { oldHtml = render(oldTxt); } catch { oldErr = true; }
  try { newHtml = render(newTxt); } catch { newErr = true; }
  const oldK = (oldHtml.match(/katex-error/g) || []).length;
  const newK = (newHtml.match(/katex-error/g) || []).length;
  const oldCount = (oldHtml.match(/class="katex"/g) || []).length;
  const newCount = (newHtml.match(/class="katex"/g) || []).length;
  totalKatex += newCount;
  const problems = [];
  if (oldErr || newErr) problems.push('render exception');
  if (oldK > 0) problems.push(`OLD has ${oldK} katex-error`);
  if (newK > 0) problems.push(`NEW has ${newK} katex-error`);
  if (newCount < oldCount) problems.push(`katex count dropped ${oldCount} -> ${newCount}`);
  if (problems.length) { fails++; console.log(`FAIL ${pid} [${field}]: ${problems.join('; ')}`); }
  else console.log(`ok   ${pid} [${field}]: katex ${oldCount} -> ${newCount}`);
}
console.log(`render gate: ${FIELDS.length - fails}/${FIELDS.length} projected fields GREEN, total .katex ${totalKatex}`);
process.exit(fails ? 5 : 0);
