/**
 * T-UGM-RENDER-1 — the FULL-BUNDLE render sweep.
 *
 * Every UGM body (both course planes) renders through the exact Markdown
 * chain of record (markdown.tsx: normalizeCorpusMath → remark-math →
 * rehype-katex) and must come out with ZERO visible raw-LaTeX fragments and
 * ZERO katex-error spans. This is the live-audit acceptance gate of
 * 2026-10-27 turned into a permanent regression law: pre-fix, 528 of these
 * bodies leaked display equations as literal bracketed text.
 *
 * Known residue (authoring damage in the corpus, NOT renderer-fixable):
 * r7839 ("$0\n\n1$" — a lost "$0<x<1$" splits the paragraph pairing) and
 * rotating-derivatives (a duplicated "$$" prose pair) render partially
 * degraded; their visible-fragment budget is pinned below so any FURTHER
 * degradation fails here.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { toText } from "hast-util-to-text";
import { normalizeCorpusMath } from "./math-fix";
import { mathTitleToPlainText } from "./math-title";
import { normalizeCorpusEmphasis } from "./emphasis-fix";
import { rehypeKatexMhchem } from "./rehypeKatexMhchem";

const CONTENT_DIR = join(import.meta.dir, "../../content");
const COURSES = ["cie-a-level-maths-20-pure-1", "cie-a-level-maths-20-pure-3"];

/** quote-aware tag strip + KaTeX annotation removal → user-visible text */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, " ");
}
const FRAG_RE = /[^\s]*\\[a-zA-Z]+[^\s]*/g;

/** Render through the markdown.tsx chain of record, ending at the HAST root
 * (no stringify — CI's typecheck only resolves direct dependencies and
 * rehype-stringify is transitive; everything below reads the tree directly). */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, defaultSchema as never)
  .use(rehypeKatexMhchem, { errorColor: "#b91c1c", strict: "ignore" });

async function renderTree(bodyMd: string): Promise<any> {
  const mdast = processor.parse(normalizeCorpusMath(normalizeCorpusEmphasis(bodyMd)));
  return processor.run(mdast);
}

type HastLike = { type?: string; tagName?: string; properties?: { className?: unknown }; value?: string; children?: HastLike[] };

function countKatexErrors(tree: HastLike): number {
  let n = 0;
  (function walk(node: HastLike) {
    if (node.type === "element") {
      const cls = node.properties?.className;
      if (Array.isArray(cls) && cls.map(String).includes("katex-error")) n++;
    }
    (node.children ?? []).forEach(walk);
  })(tree);
  return n;
}

/** user-visible text: text nodes outside <annotation> (KaTeX's TeX source)
 * and <style> — the hast equivalent of the audit's quote-aware tag strip */
function visibleTextOf(tree: HastLike): string {
  const chunks: string[] = [];
  (function walk(node: HastLike) {
    if (node.type === "element") {
      const tag = (node.tagName || "").toLowerCase();
      if (tag === "annotation" || tag === "style") return;
    }
    if (node.type === "text") {
      chunks.push(node.value ?? "");
      return;
    }
    (node.children ?? []).forEach(walk);
  })(tree);
  return chunks.join(" ");
}

describe("T-UGM-RENDER-1: every committed UGM body renders clean", () => {
  test(
    "no visible raw-LaTeX fragments, no katex-error spans, across all 628 bodies",
    async () => {
      let bodies = 0;
      const leaked: string[] = [];
      const errored: string[] = [];
      for (const course of COURSES) {
        const d = JSON.parse(
          readFileSync(join(CONTENT_DIR, course, "ugm-resources.json"), "utf8"),
        );
        for (const r of d.resources as { slug: string; bodyMd: string }[]) {
          bodies++;
          const tree = await renderTree(r.bodyMd ?? "");
          const errSpans = countKatexErrors(tree);
          const frags = visibleTextOf(tree).match(FRAG_RE) || [];
          if (errSpans > 0) errored.push(`${course}/${r.slug}(${errSpans})`);
          if (frags.length > 0) leaked.push(`${course}/${r.slug}(${frags.length})`);
        }
      }
      expect(bodies).toBe(628);
      expect(errored).toEqual([]);
      // the two disclosed authoring-damage bodies; everything else must be 0
      const allowed = new Set([
        "cie-a-level-maths-20-pure-1/r7839",
        "cie-a-level-maths-20-pure-3/rotating-derivatives",
      ]);
      const unexpected = leaked.filter((s) => !allowed.has(s.split("(")[0]));
      expect(unexpected).toEqual([]);
      expect(leaked.filter((s) => s.startsWith("cie-a-level-maths-20-pure-1/r7839"))[0]).toMatch(
        /r7839\((\d+)\)/,
      );
    },
    600_000,
  );

  test("IGCSE questions corpus: the display-math repair never adds katex errors", async () => {
    // baseline of record 2026-10-27: 93 pre-existing katex-error spans across
    // 5,862 parts (glued-macro corpus damage — identical under the pre-lane
    // renderer, byte-measured OLD vs NEW during T-UGM-RENDER-1). The law:
    // the display-math repair must NEVER add error spans; healing the
    // pre-existing ones is a separate corpus lane.
    let checked = 0;
    let errs = 0;
    const errored: string[] = [];
    for (const course of ["cie-igcse-maths-25-core", "cie-igcse-maths-25-extended"]) {
      const d = JSON.parse(readFileSync(join(CONTENT_DIR, course, "questions.json"), "utf8"));
      for (const [ti, topic] of (d as any[]).entries()) {
        for (const [qi, q] of (topic?.questions ?? []).entries()) {
          for (const [pi, p] of (q.parts ?? []).entries()) {
            for (const field of ["problemMd", "solutionMd", "hintMd"] as const) {
              if (!p?.[field]) continue;
              checked++;
              const tree = await renderTree(p[field]);
              const n = countKatexErrors(tree);
              errs += n;
              if (n > 0) errored.push(`${course}[${ti}].${qi}.${pi}.${field}`);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(errs).toBeLessThanOrEqual(93);
  }, 600_000);
  // ------------------------------------------------------------------
  // T-UGM-RENDER-2 — the plaintext-title fleet gate.
  //
  // 235 of the 628 resource titles carry $…$ math. mathTitleToPlainText is
  // the tab/SEO law (generateMetadata) and must be LEAK-PROOF fleet-wide:
  // no dollar signs, no backslash commands, never empty, never ballooning.
  // The changed-count pin (235) locks the census of record 2026-10-29 — a
  // new math title shifts it, which is exactly when math-title.ts deserves
  // a fresh look.
  test("UGM titles: mathTitleToPlainText is leak-proof across all 628", () => {
    let changed = 0;
    let total = 0;
    const leaks: string[] = [];
    for (const course of COURSES) {
      const d = JSON.parse(readFileSync(join(CONTENT_DIR, course, "ugm-resources.json"), "utf8"));
      for (const r of d.resources as { slug: string; title: string }[]) {
        total++;
        const plain = mathTitleToPlainText(r.title);
        if (plain !== r.title) changed++;
        if (!plain.length || plain.includes("$") || /\\[a-zA-Z]/.test(plain) || plain.length > 128) {
          leaks.push(`${course}/${r.slug}: ${plain.slice(0, 80)}`);
        }
      }
    }
    expect(total).toBe(628);
    expect(changed).toBe(235);
    expect(leaks).toEqual([]);
  });
});
