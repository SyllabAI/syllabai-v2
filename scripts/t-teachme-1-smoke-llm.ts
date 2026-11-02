/**
 * T-TEACHME-001 · PROD REAL-SESSION SMOKE — REAL-LLM leg (r6)
 *
 * Companion to t-teachme-1-smoke.ts (r5, frozen). Same app code path — the
 * exact composition-root shape of apps/api/src/index.ts:159:
 *   store = createTeachMeStore(createSql(<db uri>))
 *   service = createTeachMeService({ store, chain, clock, idgen })
 * DIFFERENCE: the LLM chain port is the REAL chain of record —
 * FailoverLlmChain + OpenAiCompatibleChainMember (adapters.ts request/
 * response/health law) — with ONE disclosed substitution: the member's
 * fetchImpl is bridged to z-ai-web-dev-sdk (GLM) because this sandbox holds
 * no Groq/Gemini/OpenRouter provider keys. No provider HTTP is exercised;
 * the chain, adapter law, service law (D1-D4), grounding laws, store SQL,
 * prod DDL and append-only triggers are all real.
 *
 * Assertions are LAW-CONFORMANCE (not scripted outcomes): the real model
 * decides coverage verdicts; the smoke asserts the app's laws (extractive
 * evidence, canon-grounded objectives/verdicts, counters, ceilings, typed
 * negatives, D1 append-only, quota).
 *
 * Evidence policy: same as r5 — smoke rows persist by design under a
 * dedicated disabled smoke user (smoke.tteachme001.*@smoke.invalid).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import postgres from "postgres";
import { createSql } from "../apps/api/src/services/identity/users";
import { createTeachMeService, TeachMeFailClosed, TeachMeNotFound } from "../apps/api/src/teach-me/service";
import { createTeachMeStore } from "../apps/api/src/teach-me/sql";
import type { TeachMeChain } from "../apps/api/src/teach-me/types";
import { buildLlmChain, FailoverLlmChain } from "../apps/api/src/services/llmchain/index";
import { OpenAiCompatibleChainMember } from "../apps/api/src/services/llmchain/adapters";

/* ---------------- CLI ---------------- */
function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const DB = arg("db") ?? "";
const RECEIPT = arg("receipt") ?? "";
const RUN = arg("run") ?? "r6-llm";
const USER_SUFFIX = arg("user-suffix") ?? "6";
const PICK_OVERRIDE = arg("pick");
const hasFlag = (name: string) => process.argv.includes(`--${name}`);
const REAL_PROVIDERS = hasFlag("real-providers");
if (!DB || !RECEIPT) {
  console.error("usage: t-teachme-1-smoke-llm.ts --db <uri> --receipt <file> [--run rN] [--user-suffix N] [--pick c1,c2,c3] [--real-providers]");
  process.exit(64);
}
const T0 = Date.now();
const targetHost = new URL(DB).hostname;
let stage = "boot";
const step = (s: string) => { stage = s; console.log(`── ${s}`); };

/* ---------------- Receipt ---------------- */
type Assertion = { name: string; pass: boolean; detail: string };
const assertions: Assertion[] = [];
const soft: Record<string, unknown> = {};
function assertOk(name: string, pass: boolean, detail: string): void {
  assertions.push({ name, pass, detail });
  console.log(`${pass ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) throw new Error(`SMOKE_ASSERT_FAIL: ${name} — ${detail}`);
}
function record(name: string, value: unknown): void {
  soft[name] = value;
  const j = JSON.stringify(value);
  console.log(`  · ${name}: ${j && j.length > 300 ? j.slice(0, 300) + "…" : j}`);
}

/* ---------------- REAL chain (bridge mode | --real-providers mode) ---------------- */
interface LlmCallRecord {
  prompt: string; userChars: number; replyChars: number;
  model: string; provider: string; finish: string | null; latencyMs: number;
  reply: string;
}
const llmCalls: LlmCallRecord[] = [];
let CHAIN_MODE = "";
let MEMBER_HEALTH: Record<string, unknown> | null = null;

async function realChain(): Promise<TeachMeChain> {
  let chain: FailoverLlmChain;
  if (REAL_PROVIDERS) {
    // the REAL composition-root path: buildLlmChain(process.env) — the exact
    // config projection + member construction of apps/api/src/index.ts:142,
    // over REAL provider HTTP (no fetchImpl override). Keyless members boot
    // dormant and honestly visible (ADR-023 zero-key law).
    chain = buildLlmChain(process.env);
    CHAIN_MODE = "REAL chain of record over REAL provider HTTP (buildLlmChain(process.env))";
  } else {
    // bridge-mode ONLY: the z-ai SDK import is lazy (dynamic) so --real-providers
    // runs never resolve it (the SDK lives in the agent sandbox, not in CI).
    const { default: ZAI } = await import("/home/z/my-project/node_modules/z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const bridgeFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
      const msgs = body.messages ?? [];
      const r = await zai.chat.completions.create({
        messages: msgs as never,
        stream: false,
        thinking: { type: "disabled" },
      });
      const content = r.choices?.[0]?.message?.content ?? "";
      const model = (r as { model?: string }).model ?? "glm-zai-bridge";
      return new Response(
        JSON.stringify({ model, choices: [{ message: { content }, finish_reason: "stop" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const member = new OpenAiCompatibleChainMember(
      "zai-bridge",
      { apiKey: "bridge-local-no-provider-http", baseUrl: "http://zai-bridge.invalid/v1", model: "glm-zai-bridge" },
      { failureThreshold: 3, cooldownSeconds: 60, dailyBudget: 1000, timeoutSeconds: 120, fetchImpl: bridgeFetch },
    );
    chain = new FailoverLlmChain([member]);
    CHAIN_MODE = "REAL chain code; member fetchImpl bridged to z-ai-web-dev-sdk (GLM) — no provider HTTP";
  }
  MEMBER_HEALTH = chain.memberHealth();
  console.log(`  · members: ${JSON.stringify(MEMBER_HEALTH).slice(0, 400)}`);
  // call-recorder wrapper (harness-side; delegates to the REAL chain)
  const promptOf = (system: string): string =>
    system.startsWith("# Pinned prompt `") ? system.slice(17, system.indexOf("`", 17)) : system.slice(0, 40);
  return {
    available: () => chain.available(),
    async generate(req) {
      const t = Date.now();
      const res = await chain.generate({ system: req.system, user: req.user, maxTokens: req.maxTokens ?? null });
      const rec: LlmCallRecord = {
        prompt: promptOf(req.system),
        userChars: req.user.length,
        replyChars: res.text.length,
        model: res.model,
        provider: res.providerName,
        finish: res.finishReason ?? null,
        latencyMs: Date.now() - t,
        reply: res.text,
      };
      llmCalls.push(rec);
      console.log(`  ⚡ llm ${rec.prompt} → ${res.providerName}/${res.model} (${rec.latencyMs}ms, ${res.text.length} chars)`);
      return res;
    },
  };
}

/* ---------------- Smoke user ---------------- */
const SMOKE_USER_ID = `00000000-0000-0000-0000-00000000aa0${USER_SUFFIX}`;
// identity = (run, suffix): the email MUST carry the suffix too — uq_users_email
// is UNIQUE on lower(email), so same-label-different-suffix reruns collide on
// the email and the ON CONFLICT skip silently orphans the user_roles insert
// (r10c FK failure). Read-back verifies BOTH id and email (r10 landed on
// r6's row because the count-only read-back could not see the mismatch).
const SMOKE_EMAIL = `smoke.tteachme001.${RUN}.u${USER_SUFFIX}@smoke.invalid`;
async function ensureSmokeUser(sql: ReturnType<typeof createSql>): Promise<void> {
  await sql`
    INSERT INTO users (id, email, password_hash, display_name, enabled, created_at)
    VALUES (${SMOKE_USER_ID}::uuid, ${SMOKE_EMAIL},
            '{smoke}no-login-placeholder-not-a-hash', '[SMOKE] T-TEACHME-001 prod real-LLM smoke',
            false, ${new Date().toISOString()}::timestamptz)
    ON CONFLICT DO NOTHING`;
  const back = await sql`SELECT email FROM users WHERE id = ${SMOKE_USER_ID}::uuid`;
  if (back.length !== 1 || String((back[0] as Record<string, unknown>).email).toLowerCase() !== SMOKE_EMAIL.toLowerCase()) {
    throw new Error(`smoke user insert/read failed (id=${SMOKE_USER_ID} expected email=${SMOKE_EMAIL})`);
  }
  const roles = await sql`SELECT 1 AS ok FROM roles WHERE name = 'STUDENT' LIMIT 1`;
  if (roles.length > 0) {
    await sql`INSERT INTO user_roles (user_id, role) VALUES (${SMOKE_USER_ID}::uuid, 'STUDENT') ON CONFLICT DO NOTHING`;
  }
}

/* ---------------- Spec-point pick ---------------- */
async function pickSpecCodes(sql: ReturnType<typeof createSql>): Promise<string[]> {
  if (PICK_OVERRIDE) return PICK_OVERRIDE.split(",").map((s) => s.trim()).filter(Boolean);
  const canonRows = await sql`SELECT code FROM knowledge_nodes WHERE node_type = 'SPEC_POINT' AND code LIKE '4CH1-%' ORDER BY code ASC`;
  const noteCells = await sql`SELECT spec_point_codes FROM revision_note`;
  const tokens = new Set<string>();
  for (const r of noteCells) {
    const cell = String((r as Record<string, unknown>).spec_point_codes ?? "");
    for (const t of cell.toLowerCase().split(/[^a-z0-9._/-]+/).filter(Boolean)) tokens.add(t);
  }
  return canonRows.map((r) => String((r as Record<string, unknown>).code)).filter((c) => tokens.has(c.toLowerCase())).slice(0, 3);
}

/* ---------------- D1 bite probe (ROLLBACK-ed) ---------------- */
async function d1Probe(uri: string, sessionId: string): Promise<Record<string, unknown>> {
  const raw = postgres(uri, { max: 1, prepare: false });
  const conn = await raw.reserve();
  const out: Record<string, unknown> = {};
  const attempt = async (label: string, stmt: string, params: unknown[], expect: "blocked" | "allowed" | "record") => {
    await conn.unsafe("begin");
    let blocked = false;
    let detail = "";
    try {
      await conn.unsafe(stmt, params as never[]);
    } catch (e) {
      blocked = true;
      detail = `${(e as { code?: string }).code ?? ""} ${(e as Error).message ?? ""}`.trim().slice(0, 140);
    }
    await conn.unsafe("rollback");
    if (expect === "blocked") {
      const lawBite = blocked && detail.includes("P0001") && detail.includes("append-only");
      out[label] = lawBite ? "blocked (P0001 append-only)" : `UNEXPECTED (${blocked ? detail : "allowed"})`;
      if (!lawBite) throw new Error(`D1 probe: ${label} expected P0001 append-only block, got ${blocked ? detail : "allowed"}`);
    } else if (expect === "allowed") {
      out[label] = blocked ? `UNEXPECTED block (${detail})` : "allowed (mutable by law)";
      if (blocked) throw new Error(`D1 probe: ${label} was BLOCKED (expected mutable): ${detail}`);
    } else {
      out[label] = blocked ? `blocked (${detail})` : "allowed — app-law only (no DB trigger; no UPDATE/DELETE path in store code)";
    }
  };
  await attempt("coverages_update", "UPDATE teach_objective_coverages SET covered = covered WHERE session_id = $1", [sessionId], "blocked");
  await attempt("coverages_delete", "DELETE FROM teach_objective_coverages WHERE session_id = $1", [sessionId], "blocked");
  await attempt("sessions_update", "UPDATE teach_sessions SET status = status WHERE id = $1", [sessionId], "allowed");
  await attempt("messages_update", "UPDATE teach_messages SET text = text WHERE session_id = $1", [sessionId], "record");
  await attempt("messages_delete", "DELETE FROM teach_messages WHERE session_id = $1", [sessionId], "record");
  await attempt("review_cards_update", "UPDATE teach_review_cards SET card = card WHERE session_id = $1", [sessionId], "record");
  await attempt("candidates_delete", "DELETE FROM teach_misconception_candidates WHERE session_id = $1", [sessionId], "record");
  conn.release();
  await raw.end();
  return out;
}

/* ---------------- Receipt writer + scrub ---------------- */
function writeReceipt(receipt: Record<string, unknown>): void {
  const scrubbed = { ...receipt, target_host: targetHost };
  let body = JSON.stringify(scrubbed, null, 2);
  for (const bad of ["postgres://", "postgresql://", "napi_", "ghp_", "vcp_", "gsk_", "sk-or-v1", "AQ.Ab8RN6"]) {
    if (body.includes(bad)) throw new Error(`receipt scrub failure: contains ${bad}`);
  }
  mkdirSync(dirname(RECEIPT), { recursive: true });
  writeFileSync(RECEIPT, body + "\n");
  console.log(`receipt → ${RECEIPT}`);
}

/* ---------------- Main ---------------- */
type Row = Record<string, unknown>;
type ObjDto = { id: string; text: string; specPointIds: string[]; status: string };

try {
  step("transport");
  const sql = createSql(DB);
  const smoke = await sql`SELECT 1 AS ok, version() AS v`;
  console.log(`transport: createSql OK (neon ws client)`);
  record("transport", "createSql → NeonWsClient (@neondatabase/serverless 0.10.2), select 1 OK");

  const pick = await pickSpecCodes(sql);
  assertOk("pick.specCodes", pick.length === 3, pick.join(", "));

  step("real-chain-boot");
  const chain = await realChain();
  assertOk("chain.available", chain.available(), CHAIN_MODE);
  record("chain_disclosure", { mode: CHAIN_MODE, member_health: MEMBER_HEALTH });

  const store = createTeachMeStore(sql);
  const service = createTeachMeService({ store, chain, clock: { now: () => new Date() }, idgen: { uuid: () => crypto.randomUUID() } });

  const canon = await store.loadSpecPointCanon(pick);
  const undescribed = canon.filter((c) => c.description == null || c.description.trim() === "");
  assertOk("g1.canonDescribed", canon.length === 3 && undescribed.length === 0, `${canon.length} rows, ${undescribed.length} undescribed`);
  const notes = await store.loadNoteCorpus(pick);
  assertOk("g2.noteCorpus", notes.length >= 1, `${notes.length} note rows`);
  const reviewInputs = await store.loadReviewInputs({ specPointCodes: pick, specPointNodeIds: canon.map((c) => c.id), courseHrefBase: "/courses/igcse-chemistry-19" });
  record("g3.reviewInputs", { registry: reviewInputs.registry.length, anchors: reviewInputs.anchors.length, practice: reviewInputs.practice.length });

  step("smoke-user");
  await ensureSmokeUser(sql);
  record("smoke_user", { id: SMOKE_USER_ID, email: SMOKE_EMAIL, enabled: false });

  // ── createSession (REAL LLM call 1: objectives) ─────────────────
  step("createSession");
  const created = await service.createSession(SMOKE_USER_ID, {
    courseId: "igcse-chemistry-19", specPointIds: pick, difficulty: "easy", length: "quick", mode: "chat",
  });
  const sid = created.session.id;
  const pickSet = new Set(pick);
  assertOk("create.sessionDto", created.session.status === "active" && created.session.objectives.length === 3, sid);
  assertOk("create.objectivesGrounded", created.session.objectives.every((o: ObjDto) => o.specPointIds.every((s) => pickSet.has(s))), "all objective specPointIds ∈ pick (REAL model grounded to canon)");
  assertOk("create.opening", created.opening.kind === "opening", created.opening.text.slice(0, 40));
  const msgs0 = await store.listMessages(sid);
  assertOk("create.openingMessage", msgs0.length === 1 && msgs0[0]!.role === "pupil" && msgs0[0]!.seq === 1, `seq=${msgs0[0]?.seq}`);

  // ── DIRECT store.updateSession seam probe ────────────────────────
  step("seam-probe");
  const rawAfterCreate = await store.findSession(sid);
  await store.updateSession(sid, { flags: { ...(rawAfterCreate!.session.flags), smokeSeamProbe: RUN } });
  assertOk("seamProbe.ok", true, "updateSession works on the real seam");

  // ── sub-floor turn (deterministic: no judge call) ────────────────
  step("nudge-turn");
  const nudge = await service.postMessage(SMOKE_USER_ID, sid, { text: "dunno, it just dissolves I guess lol" });
  assertOk("nudge.chipNull", nudge.chip === null, "no judge ran");
  assertOk("nudge.kind", nudge.pupilMessage?.kind === "clarify_nudge", nudge.pupilMessage?.text.slice(0, 40) ?? "");
  assertOk("nudge.noCounters", nudge.session.messageCount === 0 && nudge.session.llmCallCount === 1, `mc=${nudge.session.messageCount} llm=${nudge.session.llmCallCount}`);
  const flagsAfterNudge = (await store.findSession(sid))!.session.flags as Record<string, unknown>;
  assertOk("nudge.subFloorFlag", flagsAfterNudge.subFloorNudges === 1, JSON.stringify(flagsAfterNudge.subFloorNudges));

  // ── judged turn 1 (REAL judge call 1) ────────────────────────────
  step("judged-turn-1");
  const canonForText = canon.map((c) => `[${c.code}] ${c.title}`).join("; ");
  const turn1Text =
    `Let me start with the first one. There are three states of matter. In a solid the particles are arranged ` +
    `in a tight, regular pattern — they cannot swap places, they only vibrate on the spot, so a solid keeps its own shape. ` +
    `In a liquid the particles are still close together but the arrangement is random and they can slide past each other, ` +
    `which is why a liquid flows and takes the shape of its container. In a gas the particles are far apart, they move ` +
    `quickly in all directions, and they have the most energy — that is why a gas spreads out to fill all the space it can. ` +
    `Moving from solid to liquid to gas the particles gain energy: heating gives them the energy needed to break one ` +
    `arrangement and form another, like ice melting into water and then boiling into steam.`;
  const t1 = await service.postMessage(SMOKE_USER_ID, sid, { text: turn1Text });
  assertOk("turn1.chip", t1.chip !== null && t1.chip.coveredObjectiveIds.length >= 1, `covered=${t1.chip?.coveredObjectiveIds.length}`);
  assertOk("turn1.pupilReply", t1.pupilMessage !== null && t1.pupilMessage.text.length > 0, `${t1.pupilMessage?.text.length ?? 0} chars — REAL pupil reply`);
  const t1Coverage = await store.listCoverage(sid);
  assertOk("turn1.extractive", t1Coverage.every((r) => r.covered && turn1Text.includes(r.evidenceQuote)), `${t1Coverage.filter((r) => r.covered).length} covered, evidence quotes extractive (grounding law, REAL model)`);
  record("turn1.verdicts", t1Coverage.map((r) => ({ objective: r.objectiveId, covered: r.covered, quote: r.evidenceQuote.slice(0, 60) })));
  record("turn1.pupilReply", t1.pupilMessage?.text.slice(0, 220));

  // ── judged turn 2 (REAL judge call 2) ────────────────────────────
  step("judged-turn-2");
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
  const t2 = await service.postMessage(SMOKE_USER_ID, sid, { text: turn2Text });
  assertOk("turn2.chip", t2.chip !== null, `covered=${t2.chip?.coveredObjectiveIds.length}`);
  assertOk("turn2.allCovered", t2.session.objectives.every((o: ObjDto) => o.status === "covered"), `${t2.session.objectives.filter((o: ObjDto) => o.status === "covered").length}/3 covered`);
  const coverageRows = await store.listCoverage(sid);
  const distinctObj = new Set(coverageRows.map((r: { objectiveId: string }) => r.objectiveId)).size;
  assertOk("coverage.rows", coverageRows.length >= 3 && distinctObj === 3, `${coverageRows.length} ledger rows across ${distinctObj} objectives (append-only ledger — a re-affirmed objective appends a lawful extra row)`);
  assertOk("coverage.extractive", coverageRows.every((r) => r.covered && (turn1Text.includes(r.evidenceQuote) || turn2Text.includes(r.evidenceQuote))), "evidence quotes extractive (REAL judge)");
  record("turn2.pupilReply", t2.pupilMessage?.text.slice(0, 220));

  // ── endSession (REAL review call) ────────────────────────────────
  step("endSession");
  const end = await service.endSession(SMOKE_USER_ID, sid);
  assertOk("end.status", end.status === "completed", end.status);
  assertOk("end.reviewCard", end.review !== null && Array.isArray(end.review.specPointVerdicts) && end.review.specPointVerdicts.length === 3, "3 spec-point verdicts (REAL review, canon-grounded)");
  const cardRow = await store.findReviewCard(sid);
  assertOk("end.reviewCardRow", cardRow !== null, "teach_review_cards row present");
  const flagsEnd = (await store.findSession(sid))!.session.flags as Record<string, unknown>;
  const candCount = Number(((await sql`SELECT COUNT(*)::int AS n FROM teach_misconception_candidates WHERE session_id = ${sid}::uuid`)[0] as Row).n);
  record("end.candidatesInserted", { flag: flagsEnd.candidatesInserted, rows: candCount });
  const credits = flagsEnd.evidenceCredits as Array<Record<string, unknown>>;
  assertOk("end.evidenceCredits", Array.isArray(credits) && credits.length === 3 && credits.every((c) => c.credited === true && c.kind === "TEACH_SESSION" && c.tier === "AI_SUGGESTED"), `${credits?.length ?? 0} credits`);
  const sessFinal = (await store.findSession(sid))!.session;
  record("end.llmCallCountSemantics", "review call is ceiling-pre-checked but not counter-posted (app semantics)");
  assertOk("end.ceilingLaw", sessFinal.llmCallCount === 3 && sessFinal.tokensUsed > 0, `llm=${sessFinal.llmCallCount} tokens=${sessFinal.tokensUsed}`);
  assertOk("end.endedAt", sessFinal.endedAt !== null && sessFinal.status === "completed", String(sessFinal.endedAt));
  record("end.reviewVerdicts", end.review?.specPointVerdicts);
  record("end.reviewExcerpt", {
    strengths: end.review?.strengths?.slice(0, 2).map((s: { quote: string }) => s.quote.slice(0, 80)),
    improvements: end.review?.improvements?.slice(0, 2),
    examAnchors: end.review?.examAnchors,
    suggestedPractice: end.review?.suggestedPractice,
  });

  // ── permalink + history ──────────────────────────────────────────
  step("read-backs");
  const permalink = await service.getSession(SMOKE_USER_ID, sid);
  assertOk("permalink.transcript", permalink.transcript.length === 7, `${permalink.transcript.length} messages`);
  assertOk("permalink.review", permalink.review !== null, "review attached");
  const history = await service.listSessions(SMOKE_USER_ID, "igcse-chemistry-19");
  assertOk("history.listed", history.items.some((i) => i.sessionId === sid && i.status === "completed"), "session in history");

  // ── negatives (typed fail-closed, pre-write) ─────────────────────
  step("negatives");
  const neg: Record<string, string> = {};
  const expectFail = async (label: string, fn: () => Promise<unknown>, want: "FailClosed" | "NotFound", code?: string) => {
    try {
      await fn();
      neg[label] = "NO-ERROR (BAD)";
      assertOk(`neg.${label}`, false, "expected typed failure, got success");
    } catch (e) {
      const got = e instanceof TeachMeFailClosed ? `FailClosed:${(e as TeachMeFailClosed).code}` : e instanceof TeachMeNotFound ? "NotFound" : `other:${(e as Error).name}`;
      neg[label] = got;
      const ok = want === "NotFound" ? e instanceof TeachMeNotFound : e instanceof TeachMeFailClosed && (!code || (e as TeachMeFailClosed).code === code);
      assertOk(`neg.${label}`, ok, got);
    }
  };
  await expectFail("notOwner", () => service.postMessage("00000000-0000-0000-0000-00000000ffff", sid, { text: "hello" }), "FailClosed", "NOT_OWNER");
  await expectFail("notFound", () => service.postMessage(SMOKE_USER_ID, crypto.randomUUID(), { text: "hello" }), "NotFound");
  await expectFail("sessionNotActive", () => service.postMessage(SMOKE_USER_ID, sid, { text: "hello again" }), "FailClosed", "SESSION_NOT_ACTIVE");
  record("negatives", neg);
  const msgsAfterNeg = await store.listMessages(sid);
  assertOk("neg.noWrites", msgsAfterNeg.length === 7, `${msgsAfterNeg.length} messages unchanged`);

  // ── D1 bite probe ────────────────────────────────────────────────
  step("d1-probe");
  const d1 = await d1Probe(DB, sid);
  record("d1_probe", d1);

  // ── quota ────────────────────────────────────────────────────────
  step("quota");
  const quota = await store.countSessionsToday(SMOKE_USER_ID, (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; })());
  assertOk("quota.today", quota === 1, `${quota} session(s) today for the smoke user`);

  const SMOKE_WHAT = REAL_PROVIDERS
    ? "prod REAL-SESSION smoke — REAL-PROVIDER leg: the full Teach-Me flow (create → nudge → 2 judged turns → end → review) ran through the app's service+store code path against production with the REAL chain of record built by the composition-root constructor buildLlmChain(process.env) over REAL provider HTTP (no fetchImpl override; keyless members boot dormant and honestly per ADR-023). Assertions are law-conformance: the real provider model decided coverage verdicts and review content."
    : "prod REAL-SESSION smoke — REAL-LLM leg: the full Teach-Me flow (create → nudge → 2 judged turns → end → review) ran through the app's service+store code path against production with the REAL chain of record (FailoverLlmChain + OpenAiCompatibleChainMember adapter law). One disclosed substitution: member fetchImpl bridged to z-ai-web-dev-sdk (GLM) — the sandbox holds no Groq/Gemini/OpenRouter keys, so no provider HTTP was exercised; the chain, adapter request/response law, health bookkeeping, service law D1–D4, grounding laws, prod DDL and append-only triggers are all real. Assertions are law-conformance: the real model decided coverage verdicts and review content.";
  writeReceipt({
    task: "T-TEACHME-001",
    what: SMOKE_WHAT,
    run: RUN,
    mode: "full-real-llm",
    target_host: targetHost,
    transport: "createSql → NeonWsClient (@neondatabase/serverless 0.10.2) — the app's production transport",
    chain: {
      mode: CHAIN_MODE,
      member_health: MEMBER_HEALTH,
      substitution: REAL_PROVIDERS ? "none — real provider HTTP" : "member fetchImpl bridged to z-ai-web-dev-sdk (GLM); no provider HTTP",
      calls: llmCalls.map((c) => ({ prompt: c.prompt, provider: c.provider, model: c.model, latencyMs: c.latencyMs, replyChars: c.replyChars, userChars: c.userChars, finish: c.finish })),
      prompts_exercised: ["teachme.objectives.v1", "teachme.turn.v1", "teachme.review.v1"],
    },
    smoke_user: { id: SMOKE_USER_ID, email: SMOKE_EMAIL, enabled: false, evidence_policy: "smoke evidence persists by design (append-only lane); user disabled, no-login password hash" },
    pick_codes: pick,
    gates: { canon_rows: canon.length, undescribed: undescribed.length, note_corpus_rows: notes.length, registry: reviewInputs.registry.length, anchors: reviewInputs.anchors.length, practice: reviewInputs.practice.length },
    flow: {
      session_id: sid,
      message_count: sessFinal.messageCount,
      llm_call_count: sessFinal.llmCallCount,
      tokens_used: sessFinal.tokensUsed,
      status: sessFinal.status,
      ended_at: sessFinal.endedAt,
      coverage_rows: coverageRows.length,
      misconception_candidates: candCount,
      review_card: true,
      transcript_messages: 7,
    },
    llm_replies: llmCalls.map((c) => ({ prompt: c.prompt, reply: c.reply.slice(0, 1200) })),
    assertions,
    d1_probe: d1,
    quota_sessions_today: quota,
    verdict: "SMOKE_GREEN_REAL_LLM",
    elapsed_ms: Date.now() - T0,
    applied_at_utc: new Date().toISOString(),
  });
  console.log(`\nVERDICT: SMOKE_GREEN_REAL_LLM — session ${sid}`);
  process.exit(0);
} catch (e) {
  const msg = (e as Error).message ?? String(e);
  console.error(`\nSMOKE FAILED: ${msg}`);
  try {
    writeReceipt({
      task: "T-TEACHME-001",
      what: "prod real-LLM smoke — FAILED (honest-red; see stage, llm calls, context, assertions and error)",
      run: RUN,
      mode: "full-real-llm",
      stage,
      chain: { mode: "REAL (bridged)", calls: llmCalls.map((c) => ({ prompt: c.prompt, model: c.model, latencyMs: c.latencyMs, replyChars: c.replyChars, reply: c.reply.slice(0, 1500) })) },
      context: soft,
      assertions,
      error: msg.slice(0, 800),
      verdict: "SMOKE_RED_REAL_LLM",
      elapsed_ms: Date.now() - T0,
    });
  } catch (se) {
    console.error(`(receipt write also failed: ${(se as Error).message})`);
  }
  process.exit(1);
}
