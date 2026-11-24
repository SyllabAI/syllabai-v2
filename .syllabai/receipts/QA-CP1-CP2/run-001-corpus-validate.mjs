#!/usr/bin/env node
/**
 * Corpus validation for the new pipeline: tables-fix → emphasis-fix.
 * Metrics: raw vs fixed leak pages/hits (learner-visible detector),
 * fidelity (strong/table tags must not decrease), no-harm (clean files must
 * render byte-identical), residual contexts for clustering.
 *
 * usage: node validate.mjs <md_files.txt> <label> [sample_files.txt]
 */
import fs from 'node:fs';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { math, mathHtml } from 'micromark-extension-math';
import { normalizeCorpusEmphasis } from './emphasis-fix.ts';
import { normalizeCorpusTables } from './table-fix.ts';

const LIST = process.argv[2];
const LABEL = process.argv[3] || 'validate';
const SAMPLE = process.argv[4];
const OPTS = {
  extensions: [gfm(), math()],
  htmlExtensions: [gfmHtml(), mathHtml({ throwOnError: false, strict: 'ignore' })],
};

function visibleText(html) {
  let out = ''; let skipDepth = 0; let skipTag = null;
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    if (m[3] !== undefined) { if (skipDepth === 0) out += m[3]; continue; }
    const tok = m[0]; if (tok.startsWith('<!--')) continue;
    const tag = m[1].toLowerCase(); const isClose = tok[1] === '/';
    const selfClose = /\/\s*>$/.test(tok);
    if (skipDepth > 0) {
      if (!isClose && !selfClose && tag === skipTag) skipDepth++;
      else if (isClose && tag === skipTag) { skipDepth--; if (skipDepth === 0) skipTag = null; }
      continue;
    }
    if (!isClose && (tag === 'code' || tag === 'pre' || (tag === 'span' && /class="katex/.test(m[2])))) {
      if (!selfClose) { skipTag = tag; skipDepth = 1; }
      continue;
    }
    out += ' ';
  }
  return out;
}

const files = fs.readFileSync(LIST, 'utf8').split('\n').filter(Boolean);
const sampleSet = SAMPLE ? new Set(fs.readFileSync(SAMPLE, 'utf8').split('\n').filter(Boolean)) : null;

const m = {
  raw: { boldPages: 0, boldHits: 0, tablePages: 0, tableHits: 0 },
  fix: { boldPages: 0, boldHits: 0, tablePages: 0, tableHits: 0 },
  threw: 0,
  strongRaw: 0, strongFix: 0, tblRaw: 0, tblFix: 0, katexErr: 0,
  noHarmViolations: 0,
};
const leakFiles = [], harmFiles = [], ctxs = [];
const t0 = Date.now();

for (let n = 0; n < files.length; n++) {
  const f = files[n];
  let src;
  try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const fixedSrc = normalizeCorpusEmphasis(normalizeCorpusTables(src));
  let rawH, fixH;
  try { rawH = micromark(src, OPTS); } catch (e) { m.threw++; console.error('RAW THROW', f, e.message); continue; }
  try { fixH = micromark(fixedSrc, OPTS); } catch (e) { m.threw++; console.error('FIX THROW', f, e.message); continue; }

  const rawVis = visibleText(rawH);
  const fixVis = visibleText(fixH);
  const rawB = (rawVis.match(/\*\*/g) || []).length;
  const fixB = (fixVis.match(/\*\*/g) || []).length;
  const rawT = (rawVis.match(/\|\s*-{2,}/g) || []).length;
  const fixT = (fixVis.match(/\|\s*-{2,}/g) || []).length;
  m.raw.boldHits += rawB; m.fix.boldHits += fixB;
  m.raw.tableHits += rawT; m.fix.tableHits += fixT;
  if (rawB) m.raw.boldPages++; if (fixB) m.fix.boldPages++;
  if (rawT) m.raw.tablePages++; if (fixT) m.fix.tablePages++;
  m.strongRaw += (rawH.match(/<strong>/g) || []).length;
  m.strongFix += (fixH.match(/<strong>/g) || []).length;
  m.tblRaw += (rawH.match(/<table>/g) || []).length;
  m.tblFix += (fixH.match(/<table>/g) || []).length;
  m.katexErr += (fixH.match(/katex-error/g) || []).length;

  if (fixB + fixT > 0) {
    leakFiles.push(f);
    const mi = fixVis.search(/\*\*|\|\s*-{2,}/);
    if (mi >= 0) ctxs.push({ f: f.replace('/home/z/my-project/work/syllabai-resources/SME-RevisionNotes/', ''), ctx: fixVis.slice(Math.max(0, mi - 80), mi + 50).replace(/\s+/g, ' ').trim() });
  }

  // no-harm: a file with zero raw leaks must not lose/alter content.
  // Benign exception: repairs only ever REMOVE unrendered `*` markers and
  // re-flow broken tables — compare visible text with markers stripped.
  // Manufacturing a NEW leak (fixB/fixT > 0) is always a violation.
  if (rawB + rawT === 0 && fixH !== rawH) {
    const strip = (t) => t.replace(/[*|]/g, '').replace(/\s+/g, ' ').trim();
    if (fixB + fixT > 0 || strip(rawVis) !== strip(fixVis)) {
      m.noHarmViolations++;
      if (harmFiles.length < 8) harmFiles.push(f);
    }
  }
  if (n % 1500 === 0) console.error(`  ...${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

console.log(JSON.stringify({
  files: files.length, secs: ((Date.now() - t0) / 1000).toFixed(0), ...m,
  harmSample: harmFiles,
}, null, 1));
fs.writeFileSync(`/home/z/my-project/work/${LABEL}_leak_files.txt`, leakFiles.sort().join('\n'));
fs.writeFileSync(`/home/z/my-project/work/${LABEL}_ctx.json`, JSON.stringify(ctxs, null, 1));
if (sampleSet) {
  // dump before/after for a few sample files
  for (const f of sampleSet) {
    const src = fs.readFileSync(f, 'utf8');
    const fixedSrc = normalizeCorpusEmphasis(normalizeCorpusTables(src));
    console.log(`\n##### ${f.split('SME-RevisionNotes/')[1]}`);
    console.log('--- FIXED SOURCE (first 40 lines)');
    console.log(fixedSrc.split('\n').slice(0, 40).join('\n'));
  }
}
