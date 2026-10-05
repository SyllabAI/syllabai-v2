// Selftest entrypoint — the anti-tautology device (GOLDEN_MASTER §5: a parity gate with a
// broken comparator is worse than no gate). Usage: bun run selftest.ts --selftest
// Fixed vectors only: no fixtures, no model, no network. Deterministic.
import { compareFeedbackProse, compareTranscription, resolveAnchors, envelopeShapeViolations } from "./lib/shadow-compare.ts";
import { ShadowFeedbackLlm, ShadowRefusal, promptKey } from "./lib/feedback-llm-proxy.ts";
import type { FeedbackProseArtifact, ShadowFixture, TranscriptArtifact } from "./lib/types.ts";

const results: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean) => results.push([name, ok]);

// --- prose seam fixed vectors -------------------------------------------------

const proseFixture: ShadowFixture = {
  schema: "llm-shadow/v1",
  seam: "smart-mark-prose",
  view: "feedback-explanation",
  surface: "selftest",
  case: "fixed-vector",
  recordedAt: "1970-01-01T00:00:00Z",
  provenance: { modelId: "selftest", promptHash: "0", sampling: { temperature: 0.2 }, posture: "RECORDED" },
  artifact: {
    view: "feedback-explanation",
    partId: "part-1",
    text: "You stated that light energy is absorbed by the pigment. The remaining 1 mark sits on the storage step.",
    modelId: "selftest",
    generatedAt: "1970-01-01T00:00:00Z",
  },
  anchors: ["light energy is absorbed by the pigment", "storage step"],
  forbidden: ["scheme rubric line that must never leak"],
};
const proseArt = (text: string): FeedbackProseArtifact => ({
  view: "feedback-explanation", partId: "part-1", text, modelId: "selftest", generatedAt: "1970-01-01T00:00:00Z",
});
const prose = (t: string) => compareFeedbackProse(proseFixture, proseArt(t));
const proseBase = (proseFixture.artifact as FeedbackProseArtifact).text;

check("prose: identical PASS", prose(proseBase).verdict === "PASS");
check("prose: numeric drift T3", prose(proseBase.replace("1 mark", "2 marks")).hardFails.some((h) => h.includes("numeric token")).valueOf());
check("prose: leak vector T3", prose(proseBase + " scheme rubric line that must never leak").hardFails.some((h) => h.startsWith("T3: leak vector")));
check("prose: anchor loss T3", prose("Nothing relevant here.").hardFails.filter((h) => h.includes("grounding anchor unresolvable")).length === 2);
check("prose: within-T2 variance PASS", prose(proseBase.replace("remaining", "outstanding")).verdict === "PASS");
check("prose: envelope T1 on missing field", envelopeShapeViolations({ ...proseArt(proseBase), modelId: undefined } as unknown as FeedbackProseArtifact).some((v) => v.includes('"modelId" missing')));
check("prose: envelope T1 on undefined-valued field", envelopeShapeViolations({ ...proseArt(proseBase), partId: undefined } as unknown as FeedbackProseArtifact).some((v) => v.includes('"partId" missing')));
check("anchors: reworded chunk still resolves", resolveAnchors(["light energy is absorbed by the pigment"], "Light energy was absorbed by the pigment today.").every((r) => r.resolved));

// --- transcription fixed vectors ----------------------------------------------

const tFixture: ShadowFixture = {
  ...proseFixture,
  seam: "transcription",
  case: "fixed-vector-t",
  artifact: {
    segments: [
      { index: 0, startMs: 0, endMs: 3200, speaker: "host", text: "The reaction peaks at 45 degrees." },
      { index: 1, startMs: 3200, endMs: 6400, speaker: "guest", text: "Correct, then it cools." },
    ],
  },
  anchors: ["reaction peaks 45 degrees"],
  forbidden: [],
};
const tOk: TranscriptArtifact = JSON.parse(JSON.stringify(tFixture.artifact));
check("transcript: identical PASS", compareTranscription(tFixture, tOk).verdict === "PASS");

const tGap = JSON.parse(JSON.stringify(tOk)) as TranscriptArtifact;
tGap.segments[1]!.startMs = 4000;
check("transcript: gap invariant", compareTranscription(tFixture, tGap).hardFails.some((h) => h.includes("gap/overlap")));

const tNum = JSON.parse(JSON.stringify(tOk)) as TranscriptArtifact;
tNum.segments[0]!.text = "The reaction peaks at degrees.";
check("transcript: numeric drop T3", compareTranscription(tFixture, tNum).hardFails.some((h) => h.includes('numeric token dropped (seg0): "45"')));

const tCount = JSON.parse(JSON.stringify(tOk)) as TranscriptArtifact;
tCount.segments = tCount.segments.slice(0, 1);
check("transcript: count T1", compareTranscription(tFixture, tCount).verdict === "FAIL");

// --- proxy fixed vectors (ADR-MIG-0001 Option A) -------------------------------

const sys = "s", usr = "u", temp = 0.2;
const key = promptKey(sys, usr, temp);
const records = new Map([[key, { promptHash: key, temperature: temp, output: "shadow", recordedAt: "" }]]);
const proxy = new ShadowFeedbackLlm(records);
check("proxy: replay byte-stable", (await proxy.generate(sys, usr, temp)) === (await proxy.generate(sys, usr, temp)));
check("proxy: available with records", proxy.available() === true);
try {
  await new ShadowFeedbackLlm(new Map()).generate("x", "y", 0.2);
  check("proxy: honest refusal on no shadow", false);
} catch (e) {
  check("proxy: honest refusal on no shadow", e instanceof ShadowRefusal);
}

// --- report ---------------------------------------------------------------------

const failed = results.filter(([, ok]) => !ok);
for (const [name, ok] of results) console.log(`${ok ? "ok" : "FAIL"} - ${name}`);
console.log(`\nselftest: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0 || !process.argv.includes("--selftest")) {
  if (!process.argv.includes("--selftest")) console.error("error: run with --selftest flag");
  process.exit(1);
}
