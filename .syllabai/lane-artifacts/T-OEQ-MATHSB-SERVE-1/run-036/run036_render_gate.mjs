// run-035 render gate: every projected field through the ACTUAL hub pipeline
// engine — markdown.tsx of-record plugin list (react-markdown + remark-gfm +
// remark-math + rehype-raw + rehype-sanitize + the hub's LOCAL rehypeKatexMhchem).
// run-033 clone, extended for the table wave:
//   + NEW must render a real <table> for every row with an md table
//   + zero raw pipe-delimiter artifacts in NEW rendered HTML
//   + <img> count: drops exactly the dropped table refs (kept refs/relabeled ref preserved)
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { rehypeKatexMhchem } from '/home/z/my-project/repos/syllabai-v2/apps/hub/src/lib/rehypeKatexMhchem.ts';

const proj = JSON.parse(readFileSync('/home/z/my-project/scratch/toeq_state/fmt/run036_projection.json', 'utf8'));

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
let totalTables = 0;
for (const row of proj) {
  const { pid, set, field, old, new: nw } = row;
  // exact per-line img accounting: expected new imgs =
  //   old img lines − old img lines whose URL is a dropped path + NEWLY wired img lines
  // (a newly wired line = a NEW img line whose URL appears in no OLD img line)
  const imgLineUrls = (txt) => [...txt.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]);
  const oldUrls = imgLineUrls(old);
  const newUrls = imgLineUrls(nw);
  const droppedPaths = row.assets_old && row.assets_new
    ? row.assets_old.filter(p => !row.assets_new.includes(p))
    : [];
  const droppedImgLines = oldUrls.filter(u => droppedPaths.some(p => u.includes(p))).length;
  const addedImgLines = newUrls.filter(u => !oldUrls.some(o => o === u)).length;
  const expectedNewImgs = oldUrls.length - droppedImgLines + addedImgLines;
  let oldHtml = '', newHtml = '';
  let oldErr = false, newErr = false;
  try { oldHtml = render(old); } catch (e) { oldErr = true; }
  try { newHtml = render(nw); } catch (e) { newErr = true; }
  const oldK = (oldHtml.match(/katex-error/g) || []).length;
  const newK = (newHtml.match(/katex-error/g) || []).length;
  const oldCount = (oldHtml.match(/class="katex"/g) || []).length;
  const newCount = (newHtml.match(/class="katex"/g) || []).length;
  const oldImgs = (oldHtml.match(/<img/g) || []).length;
  const newImgs = (newHtml.match(/<img/g) || []).length;
  const newTables = (newHtml.match(/<table/g) || []).length;
  const oldTables = (oldHtml.match(/<table/g) || []).length;
  totalKatex += newCount;
  totalTables += newTables;
  const rawPipeArtifact = /\|[^\n<>]*-{2,}/.test(newHtml.replace(/<[^>]*>/g, ' ')) && /\|/.test(newHtml.replace(/<[^>]*>/g, ' '));
  const problems = [];
  if (oldErr || newErr) problems.push('render exception');
  if (oldK > 0) problems.push(`OLD has ${oldK} katex-error`);
  if (newK > 0) problems.push(`NEW has ${newK} katex-error`);
  if (newCount < oldCount) problems.push(`katex count dropped ${oldCount} -> ${newCount}`);
  if (newImgs !== expectedNewImgs) problems.push(`img count ${oldImgs}->${newImgs}, expected ${expectedNewImgs} (dropped lines ${droppedImgLines}, added lines ${addedImgLines})`);
  if (newTables <= oldTables && /\n\s*\|/.test(nw)) problems.push('md table in source but no <table> rendered');
  if (rawPipeArtifact) problems.push('raw pipe/delimiter artifact in rendered text');
  if (problems.length) {
    fails++;
    console.log(`FAIL ${pid} [${set}] ${field}: ${problems.join('; ')}`);
  } else {
    console.log(`ok   ${pid} [${set}]: katex ${oldCount}->${newCount}, img ${oldImgs}->${newImgs}, table ${oldTables}->${newTables}`);
  }
}
console.log(`render gate: ${proj.length - fails}/${proj.length} projected fields GREEN, total .katex ${totalKatex}, total <table> ${totalTables}`);
process.exit(fails ? 5 : 0);
