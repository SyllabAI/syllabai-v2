/**
 * T-DBPROBE-TOOLKIT-1 run-001 — the REAL chain composition (buildLlmChain boot
 * law, groq -> gemini -> openrouter) firing the EXACT toolkit rubric/sow
 * requests (byte-same prompt templates — prod prompt_versions v1.0 verified
 * byte-identical to the 0008 seed — and the exact post-#918 wire shape:
 * temperature 0.5, maxTokens 8000 (+4096 adapter allowance), effort low) from
 * the runner vantage. Per-member DIRECT calls bisect the failover assembly.
 *
 * READ-ONLY: no DB access, no writes; keys are never printed; spend = one
 * generation per leg.
 */
import { buildLlmChain } from "../../apps/api/src/services/llmchain/index";
import { GeminiChainMember, OpenAiCompatibleChainMember } from "../../apps/api/src/services/llmchain/adapters";

const GO_LINE =
  "Generate the document now. Respond with ONLY the JSON object — no markdown fences, no commentary.";

const RUBRIC_PROD = `You are an expert assessment designer. You write analytical rubrics for school assessment.
Respond with a single valid JSON object and nothing else. No markdown fences, no commentary.
Rubric for a Essay in Chemistry on "The three states of matter".
Task description: Explain, using the particle model, why solids keep their shape, liquids flow, and gases fill their container. Refer to arrangement, separation and energy of particles.
Assessment type: Summative Assessment. Each criterion is worth 8 marks.
Criteria to assess (one rubric row each, EXACT names): ["Knowledge & Understanding", "Application", "Use of Evidence"]
Required JSON shape (all keys mandatory, exact casing):
{
  "metadata": { "subject": string, "topic": string, "assignmentType": string, "taskDescription": string (reuse, ~130 chars), "assessmentType": string, "assessor": "Teacher", "marksPerCriterion": 8 },
  "overview": { "assignmentPurpose": string (~95 chars), "submissionFormat": string (~85 chars, concrete format of what students hand in), "criteriaAssessed": 3, "performanceScale": "Emerging -> Basic -> Proficient -> Advanced" },
  "rubric": { "criteria": [ one per criterion: { "name": string (exact criterion name), "criterionIntent": string (~110 chars, what this criterion measures), "levels": { "advanced": { "description": string (~300-380 chars), "feedback": string (~100 chars, feedback a teacher would write) }, "proficient": { same fields, description ~300 chars }, "basic": { same, ~330 chars }, "emerging": { same, ~280 chars } } } ] },
  "moderationGuidance": string[2] (how two markers should align, ~150-190 chars each)
}
Do NOT include "score" fields; they are computed by the app.
Level ladder: advanced = excellent command, proficient = secure, basic = adequate with gaps, emerging = limited/starting. Descriptions must be observable and specific to essay work, not generic.`;

const OPTS = { failureThreshold: 3, cooldownSeconds: 60, dailyBudget: 1000, timeoutSeconds: 60 };

function describe(name: string, dt: number, r: any, err: any) {
  if (err) {
    console.log(`[${name}] ERROR dt=${dt}s ${(err?.message ?? String(err)).slice(0, 220)} (class=${err?.failureClass ?? "?"})`);
    return;
  }
  const text = r?.text ?? "";
  const braces = text.includes("{") && text.includes("}");
  let parse = "n/a";
  if (braces) {
    try {
      const s = text.indexOf("{"), e = text.lastIndexOf("}");
      JSON.parse(text.slice(s, e + 1));
      parse = "OK";
    } catch (e) {
      parse = "FAIL: " + String(e).slice(0, 80);
    }
  }
  console.log(`[${name}] dt=${dt}s provider=${r?.providerName} model=${r?.model} finish=${r?.finishReason} len=${text.length} braces=${braces} parse=${parse} head=${JSON.stringify(text.slice(0, 120))}`);
}

async function leg(name: string, fn: () => Promise<any>) {
  const t0 = Date.now();
  try {
    const r = await fn();
    describe(name, Math.round((Date.now() - t0) / 10) / 100, r, null);
  } catch (e: any) {
    describe(name, Math.round((Date.now() - t0) / 10) / 100, null, e);
  }
}

async function main() {
  const groqKey = process.env.SYLLABAI_GROQ_API_KEY ?? process.env.SYLLABAI_LLM_GROQ_API_KEY ?? "";
  const gemKey = process.env.SYLLABAI_GEMINI_API_KEY ?? process.env.SYLLABAI_LLM_GEMINI_API_KEY ?? "";
  const orKey = process.env.SYLLABAI_OPENROUTER_API_KEY ?? process.env.SYLLABAI_LLM_OPENROUTER_API_KEY ?? "";
  console.log(`keys: groq=${groqKey ? "present(len " + groqKey.length + ")" : "MISSING"} gemini=${gemKey ? "present(len " + gemKey.length + ")" : "MISSING"} openrouter=${orKey ? "present(len " + orKey.length + ")" : "MISSING"}`);
  console.log(`models: groq=${process.env.SYLLABAI_LLM_GROQ_MODEL ?? "(yml default 120b!)"} gemini=${process.env.SYLLABAI_LLM_GEMINI_MODEL ?? "(yml default 3.6-flash!)"} openrouter=${process.env.SYLLABAI_LLM_OPENROUTER_MODEL ?? "(yml default)"}`);

  const opts = OPTS as any;
  const rubricReq = {
    system: RUBRIC_PROD,
    user: GO_LINE,
    temperature: 0.5,
    maxTokens: 8000,
    reasoningEffort: "low" as const,
  };

  await leg("groq-direct", async () => {
    const m = new OpenAiCompatibleChainMember(
      "groq-direct",
      { apiKey: groqKey, baseUrl: "https://api.groq.com/openai/v1", model: process.env.SYLLABAI_LLM_GROQ_MODEL ?? "openai/gpt-oss-20b" },
      opts,
    );
    return await m.generate(rubricReq as any);
  });

  await leg("gemini-direct", async () => {
    const m = new GeminiChainMember(
      "gemini-direct",
      { apiKey: gemKey, model: process.env.SYLLABAI_LLM_GEMINI_MODEL ?? "gemini-3.8-flash" },
      opts,
    );
    return await m.generate(rubricReq as any);
  });

  await leg("openrouter-direct", async () => {
    const m = new OpenAiCompatibleChainMember(
      "openrouter-direct",
      { apiKey: orKey, baseUrl: "https://openrouter.ai/api/v1", model: process.env.SYLLABAI_LLM_OPENROUTER_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free" },
      opts,
    );
    return await m.generate(rubricReq as any);
  });

  const chain = buildLlmChain(process.env);
  console.log(`chain.available=${chain.available?.() ?? "?"}`);
  await leg("CHAIN.generate rubric", async () => {
    return await (chain as any).generate(rubricReq as any);
  });
}

main().catch((e) => { console.error("fatal:", e?.message ?? e); process.exit(1); });

// T-DBPROBE-TOOLKIT-1 run-002 additions: the effort hypothesis —
// gpt-oss-20b lazily truncates big JSON contracts at effort LOW; medium
// should complete. Direct groq legs at both efforts, rubric + sow.
const SOW_PROD = `You are an expert head of department writing a scheme of work.
Respond with a single valid JSON object and nothing else. No markdown fences, no commentary.
Scheme of work: 3 lesson(s) of 60 minutes each for IGCSE Chemistry (unspecified board), topic "States of matter and changes of state". Difficulty: Intermediate.
Emphasis areas to weave in: Scientific Thinking, Practical Skills.
Required JSON shape (all keys mandatory, exact casing):
{
  "subject": string, "topic": string,
  "overarchingObjectives": string[3-4] (course-level goals, ~70 chars each),
  "lessons": [ exactly 3 items: {
    "lessonNumber": int (1-based), "title": string (~55 chars), "duration": 60,
    "learningObjectives": string[3-4] (measurable, "By the end... students can..." style, ~70 chars),
    "activities": [3-5 items: { "title": string (~40 chars), "description": string (~200-270 chars), "duration": int, "resources": string[3-4] } ]  // activity durations must sum to 60
    ,
    "assessment": string[3-4] (~70 chars each, concrete checks for understanding),
    "differentiation": { "support": string[3-4], "core": string[3], "extension": string[3] },
    "scaffoldingStrategies": string[3-4] (~70 chars),
    "reflectionPrompts": string[3] (~75 chars, questions the teacher asks students),
    "crossCurricularLinks": string[3] (~60-80 chars, name the other subject),
    "stretchTasks": string[3] (~85 chars, beyond-spec challenge)
  } ],
  "metadata": { "author": "Curriculum Planning Expert", "createdAt": "YYYY-MM-DD", "version": "1.0" }
}
Lessons must build progressively (later lessons assume earlier ones).`;

async function main2() {
  const groqKey = process.env.SYLLABAI_GROQ_API_KEY ?? process.env.SYLLABAI_LLM_GROQ_API_KEY ?? "";
  const opts = OPTS as any;
  const mk = (system: string, effort: "low" | "medium") => ({
    system, user: GO_LINE, temperature: 0.5, maxTokens: 8000, reasoningEffort: effort,
  });
  const groq = () => new OpenAiCompatibleChainMember(
    "groq-effort-probe",
    { apiKey: groqKey, baseUrl: "https://api.groq.com/openai/v1", model: process.env.SYLLABAI_LLM_GROQ_MODEL ?? "openai/gpt-oss-20b" },
    opts,
  );
  await leg("groq rubric effort=LOW  (contrast)", async () => groq().generate(mk(RUBRIC_PROD, "low") as any));
  await leg("groq rubric effort=MEDIUM (fix?)", async () => groq().generate(mk(RUBRIC_PROD, "medium") as any));
  await leg("groq sow    effort=LOW   (contrast)", async () => groq().generate(mk(SOW_PROD, "low") as any));
  await leg("groq sow    effort=MEDIUM (fix?)", async () => groq().generate(mk(SOW_PROD, "medium") as any));
}

main2().catch((e) => { console.error("fatal2:", e?.message ?? e); });

