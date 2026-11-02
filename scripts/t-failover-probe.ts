/**
 * T-TEACHME-001 — chain FAILOVER probe over REAL provider HTTP (no bridge).
 *
 * Composition: member 1 = OpenRouter member with a syntactically valid but
 * unauthorized key (64 zeros) -> 401 AUTHENTICATION_FAILURE on first call;
 * member 2 = OpenRouter member with the operator's live key.
 *
 * Law under test (FailoverLlmChain, frozen SpringAiChatModelAdapter parity):
 * a member that fails classifies the failure, records it in its health
 * bookkeeping, and the chain falls through to the next healthy member in
 * insertion order — the caller sees ONE response, never the failure.
 *
 * Output: FAILOVER_GREEN / FAILOVER_RED + member health snapshots.
 * Never prints or stores key values (env-only in, masked labels out).
 */
import { FailoverLlmChain } from "/home/z/my-project/work/v2work/apps/api/src/services/llmchain/index";
import { OpenAiCompatibleChainMember } from "/home/z/my-project/work/v2work/apps/api/src/services/llmchain/adapters";

const LIVE_KEY = process.env.SYLLABAI_OPENROUTER_API_KEY ?? "";
if (!LIVE_KEY.startsWith("sk-or-v1-")) {
  console.error("FAILOVER_RED: SYLLABAI_OPENROUTER_API_KEY missing/malformed");
  process.exit(1);
}
const DEAD_KEY = "sk-or-v1-" + "0".repeat(64);
const MODEL = process.env.SYLLABAI_LLM_OPENROUTER_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free";

const opts = { failureThreshold: 3, cooldownSeconds: 60, dailyBudget: 1000, timeoutSeconds: 120 };
const chain = new FailoverLlmChain([
  new OpenAiCompatibleChainMember("openrouter-dead", { apiKey: DEAD_KEY, baseUrl: "https://openrouter.ai/api/v1", model: MODEL }, opts),
  new OpenAiCompatibleChainMember("openrouter-live", { apiKey: LIVE_KEY, baseUrl: "https://openrouter.ai/api/v1", model: MODEL }, opts),
]);

const t0 = Date.now();
const res = await chain.generate({
  system: "You are a probe. Reply with exactly this token and nothing else: FAILOVER_OK",
  user: "ping",
  maxTokens: 2000, // reasoning models burn budget in the thinking channel first (r8 lesson)
});
const ms = Date.now() - t0;

const health = chain.memberHealth();
const dead = health["openrouter-dead"];
const live = health["openrouter-live"];

const nowUtcDay = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (law: cooldownUntil = utcDay + 24h at T00:00:00.000Z)
const nextUtcMidnight = new Date(`${nowUtcDay}T00:00:00.000Z`).getTime() + 24 * 3600 * 1000;
const checks: Array<[string, boolean, string]> = [
  ["reply.delivered", (res.text ?? "").trim().length > 0, `text=${JSON.stringify((res.text ?? "").slice(0, 40))} finish=${res.finishReason ?? "?"} ${ms}ms`],
  ["failover.happened", res.providerName === "openrouter-live", `served by "${res.providerName}" (model=${res.model}) — member 1 must NOT serve`],
  ["dead.authFailureClassified", dead.lastFailureClass === "AUTHENTICATION_FAILURE", `lastFailureClass=${dead.lastFailureClass} msg=${(dead.lastErrorMessage ?? "").slice(0, 80)}`],
  ["dead.skippedUntilDayRoll", dead.coolingDown === true && !!dead.cooldownUntil && new Date(dead.cooldownUntil as string).getTime() === nextUtcMidnight, `coolingDown=${dead.coolingDown} cooldownUntil=${String(dead.cooldownUntil)} expected=${new Date(nextUtcMidnight).toISOString()} (AUTHENTICATION_FAILURE = configuration failure → skip until UTC day rolls, ADR-023)`],
  ["live.healthy", live.healthy === true && live.requestsToday === 1, `healthy=${live.healthy} requestsToday=${live.requestsToday}`],
  ["dead.attemptCounted", dead.requestsToday === 1, `requestsToday=${dead.requestsToday} (law: recordFailure counts the attempt against the daily budget — conservative spend protection)`],
];

let pass = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(28)} ${detail}`);
  if (ok) pass++;
}
console.log(`\nverdict: ${pass === checks.length ? "FAILOVER_GREEN" : "FAILOVER_RED"} (${pass}/${checks.length})`);
process.exit(pass === checks.length ? 0 : 1);
