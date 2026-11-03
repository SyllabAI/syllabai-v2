// run-018 render gate: q27-b problemMd OLD vs NEW through the ACTUAL hub
// pipeline engine (react-markdown 10.1.0 + remark-gfm 4.0.1 + remark-math 6.0.0
// + rehype-raw 7 + rehype-sanitize 6, react 19.3) — same plugin list as
// markdown.tsx (of-record t3_render_gate.mjs standard).
// Asserts: NEW cell renders a KaTeX .katex node (x^2 + 2x - 80 = 0 as math);
// OLD cell (bare caret) renders NO .katex node (documents the defect class).
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';

const OLD = 'Show that x^2 + 2x \u2212 80 = 0';
const NEW = 'Show that $x^2 + 2x - 80 = 0$';

function render(txt) {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeRaw, rehypeSanitize, rehypeKatex],
    }, txt),
  );
}

const oldHtml = render(OLD);
const newHtml = render(NEW);
const oldKatex = /class="katex"/.test(oldHtml);
const newKatex = /class="katex"/.test(newHtml);
const newX2 = /x<sup class="katex"|katex/.test(newHtml) && /80/.test(newHtml);
console.log('OLD renders .katex:', oldKatex, '(expected false — bare-caret defect class)');
console.log('NEW renders .katex:', newKatex, '(expected true — law-26 KaTeX)');
console.log('NEW html:', newHtml.replace(/\n/g, ' ').slice(0, 240));
const ok = !oldKatex && newKatex;
console.log('RENDER_GATE:', ok ? 'GREEN' : 'RED');
process.exit(ok ? 0 : 3);
