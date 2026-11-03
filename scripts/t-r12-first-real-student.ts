/**
 * T-TEACHME-001 · r12 · FIRST REAL STUDENT SESSION THROUGH THE DEPLOYED API
 *
 * The one leg the smoke series never ran: the full Teach-Me flow over REAL
 * HTTPS against the deployed production API (https://syllabai-v2.vercel.app)
 * with a REAL registered student account — register → JWT → create → nudge →
 * 2 judged turns → end (review) → permalink → history → typed negatives →
 * quota. This exercises the production runtime path end-to-end: Vercel
 * lambda + CORS shell + JWT auth middleware + THE ONE CHAIN OF RECORD
 * (groq gpt-oss-20b head, live since the vercel-activation leg) + prod DB.
 *
 * Safety/laws:
 *   - access tokens and passwords stay in process memory — NEVER printed,
 *     logged or written to the receipt (receipt carries ids + masked emails)
 *   - endSession is crash-safe by law (review_pending persisted first,
 *     idempotent re-call) — the driver polls end honestly if the lambda
 *     times out mid-review; a stuck review_pending is filed as a REAL
 *     production finding, not papered over
 *   - test identities: smoke.tteachme001.r12-firstreal.u0/u1@smoke.invalid
 *     (throwaway password, not of record)
 *
 * Run:
 *   PROD_API_BASE=https://syllabai-v2.vercel.app \
 *   bun run scripts/t-r12-first-real-student.ts --receipt <path.json>
 */
import { randomUUID } from "node:crypto";

const BASE = process.env.PROD_API_BASE ?? "https://syllabai-v2.vercel.app";
const RECEIPT = (() => {
  const i = process.argv.indexOf("--receipt");
  return i > -1 ? process.argv[i + 1]! : ".syllabai/receipts/T-TEACHME-001/prod-smoke-receipt-r12-first-real-student.json";
})();
const RUN = "r12-first-real-student";
const PW = process.env.SMOKE_PW ?? "smoke-r12-Passw0rd-001";
// smoke-user identity law = (run, suffix) — the uq_users_email + D4 quota
// lessons from the r10 series: a fresh suffix gives fresh accounts AND a
// fresh 3-sessions/day quota; without it the earlier red runs' sessions
// consume this run's quota and create 409s (the app working correctly).
const SUFFIX = (() => {
  const i = process.argv.indexOf("--suffix");
  return i > -1 ? process.argv[i + 1]! : new Date().toISOString().slice(11, 19).replace(/:/g, "");
})();
const EMAIL_A = `smoke.tteachme001.${RUN}.${SUFFIX}.u0@smoke.invalid`;
const EMAIL_B = `smoke.tteachme001.${RUN}.${SUFFIX}.u1@smoke.invalid`;
const PICK = ["4CH1-1.1", "4CH1-1.10", "4CH1-1.11"];
const COURSE = "igcse-chemistry-19";

// ── tiny assert harness ──────────────────────────────────────────────────
const assertions: Array<{ name: string; pass: boolean; detail: string }> = [];
const observations: Record<string, unknown> = {};
const latencies: Record<string, number> = {};
function assertOk(name: string, pass: boolean, detail: string) {
  assertions.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}
function record(key: string, value: unknown) {
  observations[key] = value;
}

// ── HTTP helpers (token never leaves this module) ────────────────────────
let tokenA: string | null = null;
let tokenB: string | null = null;

async function http(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  tok?: string | null,
  timeoutMs = 90_000,
): Promise<{ status: number; json: any; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const ms = Date.now() - t0;
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = { raw: (await res.text().catch(() => "")).slice(0, 300) };
  }
  return { status: res.status, json, ms };
}

async function registerOrLogin(email: string): Promise<{ token: string; userId: string }> {
  const reg = await http("POST", "/api/v1/auth/register", {
    email,
    password: PW,
    displayName: `Smoke ${RUN} ${email.includes("u0") ? "A" : "B"}`,
  }, null, 60_000);
  if (reg.status === 201 || reg.status === 200) {
    return { token: reg.json.accessToken, userId: reg.json.user?.id ?? "?" };
  }
  // 409 → already registered (retry) → login
  const log = await http("POST", "/api/v1/auth/login", { email, password: PW }, null, 60_000);
  if (log.status !== 200) throw new Error(`register+login failed for ${email}: ${reg.status}/${log.status}`);
  return { token: log.json.accessToken, userId: log.json.user?.id ?? "?" };
}

const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

// ── pupil messages (proven judge-compliant texts from the r10d leg) ─────
const turn1Text =
  `Let me start with the first one. There are three states of matter. In a solid the particles are arranged ` +
  `in a tight, regular pattern — they cannot swap places, they only vibrate on the spot, so a solid keeps its own shape. ` +
  `In a liquid the particles are still close together but the arrangement is random and they can slide past each other, ` +
  `which is why a liquid flows and takes the shape of its container. In a gas the particles are far apart, they move ` +
  `quickly in all directions, and they have the most energy — that is why a gas spreads out to fill all the space it can. ` +
  `Moving from solid to liquid to gas the particles gain energy: heating gives them the energy needed to break one ` +
  `arrangement and form another, like ice melting into water and then boiling into steam.`;
const turn2Text =
  `Right, let me take the separation techniques. If I had a mixture I'd pick the tool by what's in it: ` +
  `filtration for an insoluble solid caught in a liquid — the solid stays on the paper as residue and the liquid passes through as filtrate. ` +
  `Simple distillation for getting the solvent back out of a solution — I'd evaporate it and condense the vapour on a cold surface, ` +
  `so saltwater gives me pure water and leaves the salt behind. Fractional distillation when two liquids are mixed — they separate ` +
  `because their boiling points differ, and the fractionating column lets the lower-boiling liquid escape first, like splitting ethanol from water. ` +
  `Crystallisation is how I'd keep the dissolved solid: warm the solution so the solvent evaporates slowly, it saturates, and ordered crystals drop out. ` +
  `And paper chromatography splits dissolved dyes: the solvent spreads along the paper and each substance moves depending on how strongly it ` +
  `sticks to the paper versus how well it dissolves in the solvent. Reading the chromatogram, every spot is one substance, so the number of ` +
  `spots tells you how many things were in the mixture; measuring each spot's distance against the solvent front gives the Rf value, and ` +
  `matching those against pure reference samples run on the same sheet identifies what's present — the further it travelled, the more soluble ` +
  `and less strongly attracted to the paper it was.`;

// ═════════════════════════════════════════════════════════════════════════
async function main() {
  const t0 = Date.now();
  console.log(`r12 — deployed API: ${BASE}`);

  // ── 0. actuator + unauthenticated negative ─────────────────────────────
  const health = await http("GET", "/actuator/health");
  assertOk("platform.actuatorUp", health.status === 200 && health.json?.status === "UP", `HTTP ${health.status} ${JSON.stringify(health.json)}`);
  const noauth = await http("POST", "/api/v1/learners/me/teach-me/sessions", { courseId: COURSE, specPointIds: PICK });
  assertOk("neg.unauthenticated", noauth.status === 401, `HTTP ${noauth.status} ${JSON.stringify(noauth.json).slice(0, 80)}`);

  // ── 1. REAL student registers (A) + partner (B) ────────────────────────
  console.log("registering students…");
  const a = await registerOrLogin(EMAIL_A);
  tokenA = a.token;
  const b = await registerOrLogin(EMAIL_B);
  tokenB = b.token;
  assertOk("auth.registerStudent", !!tokenA && a.userId.length === 36, `student A id=${a.userId} (real account, real JWT)`);
  record("student_a", { id: a.userId, email: maskEmail(EMAIL_A) });
  record("student_b", { id: b.userId, email: maskEmail(EMAIL_B) });

  // ── 2. create (REAL LLM call 1 — objectives, groq head) ────────────────
  console.log("create session (objectives LLM call)…");
  const created = await http("POST", "/api/v1/learners/me/teach-me/sessions",
    { courseId: COURSE, specPointIds: PICK, difficulty: "easy", length: "quick", mode: "chat" },
    tokenA, 120_000);
  latencies.createMs = created.ms;
  const sid: string = created.json?.session?.id ?? created.json?.session?.sessionId;
  const objectives = created.json?.session?.objectives ?? [];
  assertOk("create.http200", created.status === 200 && !!sid, `HTTP ${created.status} session=${sid ?? "?"}`);
  assertOk("create.objectives3", objectives.length === 3, `${objectives.length} objectives, ${created.ms}ms`);
  const pickSet = new Set(PICK);
  assertOk("create.objectivesGrounded", objectives.length === 3 && objectives.every((o: any) => (o.specPointIds ?? []).every((s: string) => pickSet.has(s))),
    "all objective specPointIds ∈ pick (REAL model grounded to canon)");
  assertOk("create.opening", !!created.json?.opening?.text, `${(created.json?.opening?.text ?? "").slice(0, 60)}`);
  assertOk("create.statusActive", created.json?.session?.status === "active", `${created.json?.session?.status}`);
  record("create", { objectives, opening: created.json?.opening, llmCallCount: created.json?.session?.llmCallCount });
  if (!sid) {
    // no cascade: write the honest receipt and stop (the create body says why —
    // e.g. 409 QUOTA_EXCEEDED is the D4 law biting, not a defect)
    record("create.error", created.json);
    const passCount0 = assertions.filter((x) => x.pass).length;
    const { writeFileSync: wf, mkdirSync: mk } = await import("node:fs");
    const { dirname: dn } = await import("node:path");
    mk(dn(RECEIPT), { recursive: true });
    wf(RECEIPT, JSON.stringify({ task: "T-TEACHME-001", run: RUN + "-aborted", verdict: "SMOKE_RED_DEPLOYED_API_ABORTED", assertions, observations, counts: { pass: passCount0, total: assertions.length } }, null, 2));
    console.log(`\nABORTED after create (no session id) — ${passCount0}/${assertions.length} — receipt: ${RECEIPT}`);
    process.exitCode = 1;
    return;
  }

  // ── 3. sub-floor nudge (no judge call) ─────────────────────────────────
  const nudge = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/message`, { text: "dunno, it just dissolves I guess lol" }, tokenA);
  assertOk("nudge.chipNull", nudge.json?.chip === null || nudge.json?.chip === undefined, "no judge ran");
  assertOk("nudge.kind", nudge.json?.pupilMessage?.kind === "clarify_nudge", `${nudge.json?.pupilMessage?.text?.slice(0, 40)}`);
  assertOk("nudge.noCounters", nudge.json?.session?.messageCount === 0 && nudge.json?.session?.llmCallCount === 1,
    `mc=${nudge.json?.session?.messageCount} llm=${nudge.json?.session?.llmCallCount}`);
  record("nudge.pupilReply", nudge.json?.pupilMessage?.text?.slice(0, 220));

  // ── 4. judged turn 1 (REAL judge call) ─────────────────────────────────
  console.log("turn 1 (judge LLM call)…");
  const t1 = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/message`, { text: turn1Text }, tokenA, 150_000);
  latencies.turn1Ms = t1.ms;
  assertOk("turn1.chip", !!t1.json?.chip && t1.json.chip.coveredObjectiveIds.length >= 1, `covered=${t1.json?.chip?.coveredObjectiveIds?.length} ${t1.ms}ms`);
  assertOk("turn1.pupilReply", !!t1.json?.pupilMessage?.text && t1.json.pupilMessage.text.length > 0, `${t1.json?.pupilMessage?.text?.length ?? 0} chars — REAL pupil reply`);
  record("turn1.pupilReply", t1.json?.pupilMessage?.text?.slice(0, 220));
  record("turn1.chip", t1.json?.chip);

  // ── 5. judged turn 2 (REAL judge call) ─────────────────────────────────
  console.log("turn 2 (judge LLM call)…");
  const t2 = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/message`, { text: turn2Text }, tokenA, 150_000);
  latencies.turn2Ms = t2.ms;
  assertOk("turn2.chip", !!t2.json?.chip, `covered=${t2.json?.chip?.coveredObjectiveIds?.length} ${t2.ms}ms`);
  const covered = (t2.json?.session?.objectives ?? []).filter((o: any) => o.status === "covered").length;
  assertOk("turn2.allCovered", covered === 3, `${covered}/3 covered`);
  record("turn2.pupilReply", t2.json?.pupilMessage?.text?.slice(0, 220));

  // ── 6. endSession — review (REAL review call; crash-safe polling) ─────
  console.log("end session (review LLM call — may take 90s+ through the lambda)…");
  let end = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/end`, undefined, tokenA, 300_000);
  latencies.endMs = end.ms;
  let endAttempts = [{ status: end.status, body: end.json?.status ?? end.json?.error ?? "?", ms: end.ms }];
  let reviewCard = end.json?.review ?? null;
  let finalStatus: string | null = end.json?.status ?? null;
  // crash-safe: on 5xx/timeout/review_pending, re-call end — the law says it
  // returns the persisted state honestly (review_pending → not regenerated)
  while (finalStatus !== "completed" && endAttempts.length < 3) {
    console.log(`  end attempt ${endAttempts.length}: status=${finalStatus ?? `HTTP ${end.status}`} — polling again (idempotent)…`);
    await new Promise((r) => setTimeout(r, 15_000));
    end = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/end`, undefined, tokenA, 300_000);
    endAttempts.push({ status: end.status, body: end.json?.status ?? end.json?.error ?? "?", ms: end.ms });
    reviewCard = end.json?.review ?? reviewCard;
    finalStatus = end.json?.status ?? finalStatus;
    if (end.status >= 500 && finalStatus === null) continue;
    if (finalStatus === "review_pending") continue; // lambda died mid-review — honest persisted state
    break;
  }
  record("end.attempts", endAttempts);
  assertOk("end.status", finalStatus === "completed", `final=${finalStatus} attempts=${JSON.stringify(endAttempts)}`);
  assertOk("end.reviewCard", !!reviewCard, reviewCard ? "review card attached" : "REVIEW MISSING — production finding (lambda function timeout?)");
  if (reviewCard) {
    const verdicts = reviewCard.specPointVerdicts ?? reviewCard.verdicts ?? [];
    record("end.review", { keys: Object.keys(reviewCard), verdictCount: Array.isArray(verdicts) ? verdicts.length : "?", sample: JSON.stringify(reviewCard).slice(0, 600) });
    assertOk("end.reviewVerdicts3", Array.isArray(verdicts) && verdicts.length === 3, `${verdicts.length} spec-point verdicts (REAL review, canon-grounded)`);
  }

  // ── 7. permalink ────────────────────────────────────────────────────────
  const perm = await http("GET", `/api/v1/learners/me/teach-me/sessions/${sid}`, undefined, tokenA);
  const transcriptLen = Array.isArray(perm.json?.transcript) ? perm.json.transcript.length : -1;
  assertOk("permalink.transcript", perm.status === 200 && transcriptLen >= 7, `${transcriptLen} messages (r10d observed 7)`);
  assertOk("permalink.review", !!perm.json?.review, "review attached to permalink");
  record("permalink", { messageCount: transcriptLen, status: perm.json?.session?.status, tokens: perm.json?.session?.tokensUsed ?? perm.json?.session?.tokenCount });
  record("permalink.messages", (perm.json?.transcript ?? []).map((m: any) => ({ seq: m.seq, role: m.role, kind: m.kind, chars: (m.text ?? "").length })));

  // ── 8. history ──────────────────────────────────────────────────────────
  const hist = await http("GET", `/api/v1/learners/me/teach-me/sessions?course=${COURSE}`, undefined, tokenA);
  const list = Array.isArray(hist.json?.items) ? hist.json.items : [];
  const mine = list.filter((s: any) => s.sessionId === sid);
  assertOk("history.listed", hist.status === 200 && mine.length === 1, `HTTP ${hist.status}, ${list.length} in history, session listed`);
  const today = new Date().toISOString().slice(0, 10);
  const todays = list.filter((s: any) => String(s.createdAt ?? "").slice(0, 10) === today).length;
  assertOk("quota.today", todays === 1, `${todays} session(s) today for the smoke student (quota 3/day)`);

  // ── 9. typed negatives ──────────────────────────────────────────────────
  const notOwner = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/message`, { text: "hello" }, tokenB);
  assertOk("neg.notOwner", notOwner.status === 403 && notOwner.json?.error === "NOT_OWNER", `HTTP ${notOwner.status} ${notOwner.json?.error}`);
  const notFound = await http("POST", `/api/v1/learners/me/teach-me/sessions/${randomUUID()}/message`, { text: "hello" }, tokenA);
  assertOk("neg.notFound", notFound.status === 404, `HTTP ${notFound.status}`);
  const notActive = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/message`, { text: "hello again" }, tokenA);
  assertOk("neg.sessionNotActive", notActive.status === 409 && notActive.json?.error === "SESSION_NOT_ACTIVE", `HTTP ${notActive.status} ${notActive.json?.error}`);
  const permAfter = await http("GET", `/api/v1/learners/me/teach-me/sessions/${sid}`, undefined, tokenA);
  const afterLen = Array.isArray(permAfter.json?.transcript) ? permAfter.json.transcript.length : -1;
  assertOk("neg.noWrites", afterLen === transcriptLen, `${afterLen} messages unchanged (fail-closed negatives wrote nothing)`);

  // ── verdict ─────────────────────────────────────────────────────────────
  const passCount = assertions.filter((x) => x.pass).length;
  const verdict = passCount === assertions.length ? "SMOKE_GREEN_DEPLOYED_API" : "SMOKE_RED_DEPLOYED_API";
  const receipt = {
    task: "T-TEACHME-001",
    what: "FIRST REAL STUDENT SESSION THROUGH THE DEPLOYED API — full Teach-Me flow over real HTTPS (register → JWT → create → nudge → 2 judged turns → end/review → permalink → history → typed negatives → quota) against the production runtime: Vercel lambda + JWT middleware + THE ONE CHAIN OF RECORD (groq gpt-oss-20b head since the vercel-activation leg) + prod DB.",
    run: RUN,
    mode: "deployed-api-http",
    target: { base: BASE, platform: "vercel-lambda", actuator: health.json },
    students: { a: record ? observations["student_a"] : null, b: observations["student_b"], evidence_policy: "real registered accounts (throwaway password not of record; identities persist in prod per the append-only lane)" },
    pick_codes: PICK,
    latencies_ms: latencies,
    observations,
    assertions,
    verdict,
    counts: { pass: passCount, total: assertions.length },
    elapsed_ms: Date.now() - t0,
    applied_at_utc: new Date().toISOString(),
  };
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(RECEIPT), { recursive: true });
  writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2));
  console.log(`\n${verdict} — ${passCount}/${assertions.length} — receipt: ${RECEIPT}`);
  if (verdict !== "SMOKE_GREEN_DEPLOYED_API") process.exitCode = 1;
}

main().catch((e) => {
  console.error("driver error:", e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(2);
});
