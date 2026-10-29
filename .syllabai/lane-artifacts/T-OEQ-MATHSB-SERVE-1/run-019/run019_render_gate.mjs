// run-019 render gate: every projected field (run019_projection.json, 38 writes)
// through the ACTUAL hub pipeline engine (react-markdown 10.1.0 + remark-gfm 4.0.1
// + remark-math 6.0.0 + rehype-raw 7 + rehype-sanitize 6 + rehype-katex, react 19)
// — same plugin list as markdown.tsx (of-record t3_render_gate.mjs standard).
// Asserts per projected field: NEW renders with .katex present, ZERO .katex-error
// in OLD and NEW, and .katex count NEW >= OLD.
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';

const proj = JSON.parse(readFileSync('/home/z/my-project/scripts/run019_projection.json', 'utf8'));

function render(txt) {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeRaw, rehypeSanitize, rehypeKatex],
    }, txt),
  );
}

let fails = 0;
let totalKatex = 0;
for (const { pid, set, field, old, new: nw } of proj) {
  let oldHtml = '', newHtml = '';
  try {
    oldHtml = render(old);
    newHtml = render(nw);
  } catch (e) {
    fails++;
    console.log(`THROW ${pid} ${field}: ${e.message?.slice(0, 120)}`);
    continue;
  }
  const oldK = (oldHtml.match(/class="katex"/g) || []).length;
  const newK = (newHtml.match(/class="katex"/g) || []).length;
  const errOld = /katex-error/.test(oldHtml);
  const errNew = /katex-error/.test(newHtml);
  totalKatex += newK;
  if (newK < 1 || errNew || errOld || newK < oldK) {
    fails++;
    console.log(`FAIL ${pid} ${field}: oldK=${oldK} newK=${newK} errOld=${errOld} errNew=${errNew}`);
  }
}
console.log(`render gate: ${proj.length - fails}/${proj.length} fields GREEN, total .katex nodes in NEW: ${totalKatex}`);
process.exit(fails ? 5 : 0);
