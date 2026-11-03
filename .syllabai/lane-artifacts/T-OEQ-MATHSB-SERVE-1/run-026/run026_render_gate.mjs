// run-025 render gate: every projected field (run024_projection.json) through
// the ACTUAL hub pipeline engine — markdown.tsx of-record plugin list
// (react-markdown + remark-gfm + remark-math + rehype-raw + rehype-sanitize +
// the hub's LOCAL rehypeKatexMhchem). run-020 gate clone, run-025 paths.
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { rehypeKatexMhchem } from '../../../../apps/hub/src/lib/rehypeKatexMhchem.ts';
const proj = JSON.parse(readFileSync('/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-026/run026_projection.json', 'utf8'));
function render(txt) {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeRaw, rehypeSanitize, [rehypeKatexMhchem, { errorColor: '#b91c1c', strict: 'ignore' }]],
    }, txt),
  );
}
let fails = 0;
let totalKatex = 0;
for (const { pid, set, field, old, new: nw } of proj) {
  let oldHtml = '', newHtml = '';
  let oldErr = false, newErr = false;
  try { oldHtml = render(old); } catch (e) { oldErr = true; }
  try { newHtml = render(nw); } catch (e) { newErr = true; }
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
  if (problems.length) {
    fails++;
    console.log(`FAIL ${pid} [${set}] ${field}: ${problems.join('; ')}`);
  } else {
    console.log(`ok   ${pid} [${set}] ${field}: katex ${oldCount} -> ${newCount}`);
  }
}
console.log(`render gate: ${proj.length - fails}/${proj.length} projected fields GREEN, total .katex ${totalKatex}`);
process.exit(fails ? 5 : 0);
