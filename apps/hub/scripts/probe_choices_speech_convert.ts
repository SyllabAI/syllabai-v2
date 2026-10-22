/**
 * Probe: can the runtime speech-math chain convert every speech-polluted
 * backfilled choice textMd? (mathml-cache page dicts are gone — this is the
 * 23a chain's step-5 fallback, KaTeX-validated the same way.)
 * Run: bun scripts/probe_choices_speech_convert.ts
 */
import { readFileSync } from "fs";
import katex from "katex";
import { looksLikeSpeechText, speechToTexSafe } from "../src/lib/speech-math";
import { genericChain } from "../src/lib/speech-extras";

const CONTENT = process.cwd() + "/content";
const MARK =
  /\b(fraction numerator|over denominator|end fraction|open parentheses|close parentheses|to the power|end exponent|cross times|presubscript|presuperscript|square root|end root|plus-or-minus|begin mathsize|with bar on top|end table|end cell|end row)\b/i;

const katexOk = (tex: string): boolean => {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const courses = ["ial-physics-19"];
let dirty = 0, pass = 0, fail: string[] = [];

for (const course of courses) {
  const topics = JSON.parse(readFileSync(`${CONTENT}/${course}/questions.json`, "utf8"));
  for (const t of topics)
    for (const q of t.questions)
      for (const p of q.parts)
        for (const o of p.choices ?? []) {
          if (!MARK.test(o.textMd)) continue;
          dirty++;
          const inner = o.textMd.replace(/^`+|`+$/g, "");
          let tex = speechToTexSafe(inner);
          if (tex === null) tex = speechToTexSafe(genericChain(inner) ?? inner);
          if (tex !== null && katexOk(tex)) {
            pass++;
            console.log(`OK   ${o.textMd.slice(0, 60)}\n  -> $${tex.slice(0, 80)}$`);
          } else {
            fail.push(o.textMd);
            console.log(`FAIL ${o.textMd.slice(0, 90)}`);
          }
        }
}
console.log(`\ndirty=${dirty} pass=${pass} fail=${fail.length}`);
