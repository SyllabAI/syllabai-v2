/**
 * T-TEACHME-001 · PROD REAL-SESSION SMOKE driver
 *
 * Runs a REAL Teach-Me session against PRODUCTION through the app's own code
 * path — the exact composition-root shape of apps/api/src/index.ts:159:
 *   store = createTeachMeStore(createSql(<db uri>))   ← real seam, real transport
 *   service = createTeachMeService({ store, chain, clock, idgen })
 * The ONLY injected fake is the LLM chain port (scripted, port-faithful, the
 * same posture the run-002 behavioural suite uses): the sandbox holds no
 * provider keys, so buildLlmChain() would boot dormant and every route would
 * honestly 503. Everything else — store SQL, service law (D1–D4), quota,
 * gates G1/G2, grounding laws, prod DDL, append-only triggers — is real.
 *
 * Modes:
 *   --probe            read-only: transport + gate-census + pick 3 spec codes
 *   (default)          r1: smoke user → createSession → DIRECT store.updateSession
 *                      seam probe → receipt (honest-red if the seam defect fires)
 *   --full             r2: the full session flow (nudge → 2 judged turns →
 *                      end → review → read-backs → negatives → D1 probe)
 *
 * Smoke evidence policy: teach_* evidence is append-only by law, so smoke
 * rows PERSIST by design under a dedicated disabled smoke user
 * (smoke.tteachme001.*@smoke.invalid) — self-labeled, never deleted.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import postgres from "postgres";
import { createSql } from "../apps/api/src/services/identity/users";
import {
  createTeachMeService,
  TeachMeFailClosed,
  TeachMeNotFound,
} from "../apps/api/src/teach-me/service";
import { createTeachMeStore } from "../apps/api/src/teach-me/sql";
import type { TeachMeChain } from "../apps/api/src/teach-me/types";

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const DB = arg("db") ?? "";
const RECEIPT = arg("receipt") ?? "";
const RUN = arg("run") ?? "r1";
const USER_SUFFIX = arg("user-suffix") ?? (hasFlag("full") ? "2" : "1");
const PROBE_ONLY = hasFlag("probe");
const FULL = hasFlag("full");
const PICK_OVERRIDE = arg("pick");

if (!DB || !RECEIPT) {
  console.error("usage: t-teachme-1-smoke.ts --db <uri> --receipt <file> [--run rN] [--user-suffix N] [--probe] [--full] [--pick c1,c2,c3]");
  process.exit(64);
}

const T0 = Date.now();
const targetHost = new URL(DB).hostname;

/* ------------------------------------------------------------------ */
/* Receipt                                                             */
/* ------------------------------------------------------------------ */

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
  console.log(`  · ${name}: ${JSON.stringify(value)}`);
}

class SmokeAbort extends Error {}

/* ------------------------------------------------------------------ */
/* Scripted chain (port-faithful; the ONE injected fake)               */
/* ------------------------------------------------------------------ */

interface ChainState {
  studentText: string;
  coverNext: number[];
}
const chainState: ChainState = { studentText: "", coverNext: [] };

const PUPIL_LINE =
  "Okay… so what I'm hearing is that the arrangement and energy of the particles explain what you described — but then what happens at the boundaries between the states? Can you walk me through one example?";

function parseCanonCodes(user: string): string[] {
  return [...user.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1]!.trim());
}
function parseOrdinals(user: string): number[] {
  return [...user.matchAll(/^\((\d+)\) \[/gm)].map((m) => Number(m[1])).sort((a, b) => a - b);
}
function parseStudentTranscript(user: string): Array<{ seq: number; text: string }> {
  return [...user.matchAll(/^#(\d+) STUDENT: (.*)$/gm)].map((m) => ({ seq: Number(m[1]), text: m[2]! }));
}
function parseAnchors(user: string): Array<{ specPointId: string; paperRef: string; questionRef: string }> {
  const out: Array<{ specPointId: string; paperRef: string; questionRef: string }> = [];
  for (const line of user.split("\n")) {
    const m = /^- specPointId=(\S+) paperRef=(\".*\") questionRef=(\".*\")$/.exec(line.trim());
    if (!m) continue;
    try {
      out.push({ specPointId: m[1]!, paperRef: JSON.parse(m[2]!), questionRef: JSON.parse(m[3]!) });
    } catch {
      /* unparsable line — the grounding law would refuse an invented echo, so skip */
    }
  }
  return out;
}
function parsePractice(user: string): Array<{ label: string; resourceType: "question_bank" | "revision_notes" | "past_paper"; href: string }> {
  const out: Array<{ label: string; resourceType: "question_bank" | "revision_notes" | "past_paper"; href: string }> = [];
  for (const line of user.split("\n")) {
    const m = /^- \[(question_bank|revision_notes|past_paper)\] (.*) -> (.*)$/.exec(line.trim());
    if (!m) continue;
    out.push({ label: m[2]!, resourceType: m[1] as "question_bank" | "revision_notes" | "past_paper", href: m[3]! });
  }
  return out;
}

function scriptedChain(): TeachMeChain {
  return {
    available: () => true,
    async generate({ system, user }) {
      if (system.startsWith("# Pinned prompt `teachme.objectives.v1`")) {
        const codes = parseCanonCodes(user);
        if (codes.length === 0) throw new Error("scripted chain: no canon codes in objectives prompt");
        const picked = codes.slice(0, 3);
        const objectives = [0, 1, 2].map((i) => ({
          text: `Explain ${picked[Math.min(i, picked.length - 1)]!} in your own words, with one everyday example.`,
          specPointIds: [picked[Math.min(i, picked.length - 1)]!],
        }));
        return {
          text: JSON.stringify({ objectives }),
          model: "scripted-smoke-v1",
          providerName: "scripted",
          finishReason: "stop",
        };
      }
      if (system.includes("teachme.turn.v1")) {
        const ordinals = parseOrdinals(user);
        if (ordinals.length === 0) throw new Error("scripted chain: no objectives in turn prompt");
        const coverage = ordinals.map((o) =>
          chainState.coverNext.includes(o)
            ? { objectiveOrdinal: o, covered: true, evidenceQuote: chainState.studentText }
            : { objectiveOrdinal: o, covered: false, evidenceQuote: null },
        );
        return {
          text: JSON.stringify({
            verdict: { label: "Solid", feedbackLine: "You put the core idea into your own words with a concrete example." },
            coverage,
            contradictionDetected: false,
            pupilMessage: PUPIL_LINE,
          }),
          model: "scripted-smoke-v1",
          providerName: "scripted",
          finishReason: "stop",
        };
      }
      if (system.includes("teachme.review.v1")) {
        const codes = parseCanonCodes(user);
        const students = parseStudentTranscript(user);
        const longest = students.reduce<{ seq: number; text: string } | null>(
          (acc, s) => (!acc || s.text.length > acc.text.length ? s : acc),
          null,
        );
        const anchors = parseAnchors(user).slice(0, 2);
        const practice = parsePractice(user).slice(0, 2);
        return {
          text: JSON.stringify({
            strengths: longest ? [{ quote: longest.text, messageSeq: longest.seq }] : [],
            improvements: [],
            specPointVerdicts: codes.map((c) => ({ specPointId: c, verdict: "covered", evidenceQuote: null })),
            misconceptionNotes: [
              {
                statement: "smoke-probe: misconception-candidate pipeline exercised by the scripted smoke chain (no registry match claimed)",
                matchedMisconceptionId: null,
                confidence: 0.35,
              },
            ],
            examAnchors: anchors,
            prereqWarnings: [],
            suggestedPractice: practice,
          }),
          model: "scripted-smoke-v1",
          providerName: "scripted",
          finishReason: "stop",
        };
      }
      throw new Error("scripted chain: unrecognized system prompt — pin drift?");
    },
  };
}

/* ------------------------------------------------------------------ */
/* Smoke user (dedicated, disabled, self-labeled)                      */
/* ------------------------------------------------------------------ */

const SMOKE_USER_ID = `00000000-0000-0000-0000-00000000aa0${USER_SUFFIX}`;
const SMOKE_EMAIL = `smoke.tteachme001.${RUN}@smoke.invalid`;

async function ensureSmokeUser(sql: ReturnType<typeof createSql>): Promise<{ roleRow: boolean }> {
  await sql`
    INSERT INTO users (id, email, password_hash, display_name, enabled, created_at)
    VALUES (${SMOKE_USER_ID}::uuid, ${SMOKE_EMAIL},
            '{smoke}no-login-placeholder-not-a-hash', '[SMOKE] T-TEACHME-001 prod session smoke',
            false, ${new Date().toISOString()}::timestamptz)
    ON CONFLICT DO NOTHING`;
  const roles = await sql`SELECT 1 AS ok FROM roles WHERE name = 'STUDENT' LIMIT 1`;
  let roleRow = false;
  if (roles.length > 0) {
    await sql`
      INSERT INTO user_roles (user_id, role) VALUES (${SMOKE_USER_ID}::uuid, 'STUDENT')
      ON CONFLICT DO NOTHING`;
    roleRow = true;
  }
  const back = await sql`SELECT email, display_name, enabled FROM users WHERE id = ${SMOKE_USER_ID}::uuid`;
  if (back.length !== 1) throw new Error("smoke user insert/read failed");
  return { roleRow };
}

/* ------------------------------------------------------------------ */
/* Spec-point pick (first 3 canon codes with note-corpus coverage)     */
/* ------------------------------------------------------------------ */

async function pickSpecCodes(sql: ReturnType<typeof createSql>): Promise<string[]> {
  if (PICK_OVERRIDE) return PICK_OVERRIDE.split(",").map((s) => s.trim()).filter(Boolean);
  const canonRows = await sql`
    SELECT code FROM knowledge_nodes
    WHERE node_type = 'SPEC_POINT' AND code LIKE '4CH1-%'
    ORDER BY code ASC`;
  const noteCells = await sql`SELECT spec_point_codes FROM revision_note`;
  const tokens = new Set<string>();
  for (const r of noteCells) {
    const cell = String((r as Record<string, unknown>).spec_point_codes ?? "");
    for (const t of cell.toLowerCase().split(/[^a-z0-9._/-]+/).filter(Boolean)) tokens.add(t);
  }
  const pick = canonRows
    .map((r) => String((r as Record<string, unknown>).code))
    .filter((c) => tokens.has(c.toLowerCase()))
    .slice(0, 3);
  return pick;
}

/* ------------------------------------------------------------------ */
/* D1 bite probe (harness-level raw connection, ROLLBACK-ed)           */
/* ------------------------------------------------------------------ */

async function d1Probe(uri: string, sessionId: string): Promise<Record<string, unknown>> {
  const raw = postgres(uri, { max: 1, prepare: false });
  const conn = await raw.reserve();
  const out: Record<string, unknown> = {};
  const attempt = async (label: string, stmt: string, params: unknown[], expect: "blocked" | "allowed") => {
    await conn.unsafe("begin");
    let blocked: boolean;
    try {
      await conn.unsafe(stmt, params as never[]);
      blocked = false;
    } catch {
      blocked = true;
    }
    await conn.unsafe("rollback");
    out[label] = blocked ? "blocked" : "allowed";
    if (expect === "blocked" && !blocked) throw new Error(`D1 probe: ${label} was ALLOWED (law violation)`);
    if (expect === "allowed" && blocked) throw new Error(`D1 probe: ${label} was BLOCKED (expected mutable)`);
  };
  await attempt("messages_update", "UPDATE teach_messages SET text = text WHERE session_id = $1", [sessionId], "blocked");
  await attempt("messages_delete", "DELETE FROM teach_messages WHERE session_id = $1", [sessionId], "blocked");
  await attempt("coverages_update", "UPDATE teach_objective_coverages SET covered = covered WHERE session_id = $1", [sessionId], "blocked");
  await attempt("review_cards_update", "UPDATE teach_review_cards SET card = card WHERE session_id = $1", [sessionId], "blocked");
  await attempt("candidates_delete", "DELETE FROM teach_misconception_candidates WHERE session_id = $1", [sessionId], "blocked");
  await attempt("sessions_update", "UPDATE teach_sessions SET status = status WHERE id = $1", [sessionId], "allowed");
  conn.release();
  await raw.end();
  return out;
}

/* ------------------------------------------------------------------ */
/* Receipt writer + scrub                                              */
/* ------------------------------------------------------------------ */

function writeReceipt(receipt: Record<string, unknown>): void {
  const scrubbed = { ...receipt, target_host: targetHost };
  let body = JSON.stringify(scrubbed, null, 2);
  for (const bad of ["postgres://", "postgresql://", "napi_", "ghp_", "vcp_"]) {
    if (body.includes(bad)) throw new Error(`receipt scrub failure: contains ${bad}`);
  }
  mkdirSync(dirname(RECEIPT), { recursive: true });
  writeFileSync(RECEIPT, body + "\n");
  console.log(`receipt → ${RECEIPT}`);
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

try {
  const sql = createSql(DB);
  const smoke = await sql`SELECT 1 AS ok, version() AS v`;
  console.log(`transport: createSql OK (${(smoke[0] as Row).v ? "neon ws client" : "?"})`);
  record("transport", "createSql → NeonWsClient (@neondatabase/serverless 0.10.2), select 1 OK");

  const pick = await pickSpecCodes(sql);
  assertOk("pick.specCodes", pick.length === 3, pick.join(", "));

  const store = createTeachMeStore(sql);
  const service = createTeachMeService({
    store,
    chain: scriptedChain(),
    clock: { now: () => new Date() },
    idgen: { uuid: () => crypto.randomUUID() },
  });

  // G1/G2 pre-read through the store's own loaders (the real gate inputs)
  const canon = await store.loadSpecPointCanon(pick);
  const undescribed = canon.filter((c) => c.description == null || c.description.trim() === "");
  assertOk("g1.canonDescribed", canon.length === 3 && undescribed.length === 0, `${canon.length} rows, ${undescribed.length} undescribed`);
  const notes = await store.loadNoteCorpus(pick);
  assertOk("g2.noteCorpus", notes.length >= 1, `${notes.length} note rows`);
  const canonNodeIds = canon.map((c) => c.id);
  const reviewInputs = await store.loadReviewInputs({
    specPointCodes: pick,
    specPointNodeIds: canonNodeIds,
    courseHrefBase: "/courses/igcse-chemistry-19",
  });
  record("g3.reviewInputs", { registry: reviewInputs.registry.length, anchors: reviewInputs.anchors.length, practice: reviewInputs.practice.length });

  if (PROBE_ONLY) {
    writeReceipt({
      task: "T-TEACHME-001",
      what: "prod smoke PROBE (read-only): transport + gate census + spec-code pick",
      run: RUN,
      mode: "probe",
      pick_codes: pick,
      gates: {
        canon_rows: canon.length,
        undescribed: undescribed.length,
        note_corpus_rows: notes.length,
        registry: reviewInputs.registry.length,
        anchors: reviewInputs.anchors.length,
        practice: reviewInputs.practice.length,
      },
      transport: "createSql → NeonWsClient",
      chain: "n/a (probe only)",
      verdict: "PROBE_OK",
      elapsed_ms: Date.now() - T0,
    });
    process.exit(0);
  }

  await ensureSmokeUser(sql);
  record("smoke_user", { id: SMOKE_USER_ID, email: SMOKE_EMAIL, enabled: false });

  // ── createSession (LLM call 1: objectives) ──────────────────────────
  const created = await service.createSession(SMOKE_USER_ID, {
    courseId: "igcse-chemistry-19",
    specPointIds: pick,
    difficulty: "easy",
    length: "quick",
    mode: "chat",
  });
  const sid = created.session.id;
  assertOk("create.sessionDto", created.session.status === "active" && created.session.objectives.length === 3, sid);
  assertOk("create.opening", created.opening.kind === "opening", created.opening.text.slice(0, 40));
  const rawAfterCreate = await store.findSession(sid);
  assertOk("create.dbRows", rawAfterCreate !== null && rawAfterCreate!.objectives.length === 3, "session + 3 objectives in prod");
  const msgs0 = await store.listMessages(sid);
  assertOk("create.openingMessage", msgs0.length === 1 && msgs0[0]!.role === "pupil" && msgs0[0]!.seq === 1, `seq=${msgs0[0]?.seq}`);

  // ── DIRECT store.updateSession seam probe (toQuery interleave law) ──
  let seamProbeOk = false;
  let seamProbeError: string | null = null;
  try {
    await store.updateSession(sid, { flags: { ...(rawAfterCreate!.session.flags), smokeSeamProbe: RUN } });
    seamProbeOk = true;
  } catch (e) {
    seamProbeError = `${(e as Error).name ?? "Error"}: ${(e as Error).message}${(e as { code?: string }).code ? ` (pg ${(e as { code?: string }).code})` : ""}`;
  }
  record("updateSessionSeamProbe", seamProbeOk ? "OK" : `FAILED — ${seamProbeError}`);

  if (!seamProbeOk) {
    // honest-red: abandon the probe session via harness-level SQL, then stop
    const raw = postgres(DB, { max: 1, prepare: false });
    await raw`
      UPDATE teach_sessions SET status = 'abandoned',
        flags = flags || ${JSON.stringify({ smokeAbandonReason: `${RUN} updateSession toQuery seam defect (see receipt)` })}::jsonb
      WHERE id = ${sid}::uuid`;
    await raw.end();
    assertions.push({
      name: "seamProbe.expectation",
      pass: false,
      detail: `store.updateSession failed on the real seam: ${seamProbeError}`,
    });
    console.log(`  ✗ seamProbe.expectation — store.updateSession failed on the real seam: ${seamProbeError}`);
    if (!FULL) {
      writeReceipt({
        task: "T-TEACHME-001",
        what: "prod smoke r1: createSession OK (session + 3 objectives + opening message through the real service+store+DDL) but DIRECT store.updateSession FAILED on the real seam — the toQuery interleave defect (sql.ts updateSession fakes a template array via sql([stmt], ...vals, id); toQuery then appends $1..$n AFTER the statement's own $n literals → pg 42601 syntax error). Latent since run-002: the behavioural suite uses in-memory fakes that never touch the seam. Probe session abandoned in place (status=abandoned, flags.smokeAbandonReason set) — evidence rows persist by design under the disabled smoke user.",
        run: RUN,
        mode: "seam-probe",
        pick_codes: pick,
        gates: { canon_rows: canon.length, note_corpus_rows: notes.length, registry: reviewInputs.registry.length, anchors: reviewInputs.anchors.length, practice: reviewInputs.practice.length },
        session_id: sid,
        seam_probe: { ok: false, error: seamProbeError, pg_hint: "42601 syntax error at or near \"$1\"" },
        smoke_user: { id: SMOKE_USER_ID, email: SMOKE_EMAIL, enabled: false },
        transport: "createSql → NeonWsClient (@neondatabase/serverless 0.10.2) — the app's production transport",
        chain: { mode: "scripted-port-faithful", model: "scripted-smoke-v1", prompts_exercised: ["teachme.objectives.v1"] },
        assertions,
        verdict: "SMOKE_RED_SEAM_DEFECT",
        elapsed_ms: Date.now() - T0,
      });
      process.exit(2);
    }
  }
  if (!FULL) {
    writeReceipt({
      task: "T-TEACHME-001",
      what: seamProbeOk
        ? "prod smoke r1: createSession + DIRECT store.updateSession seam probe — probe PASSED (seam healthy)"
        : "prod smoke r1: createSession OK but DIRECT store.updateSession FAILED on the real seam (toQuery interleave defect — sql.ts fakes a template array; toQuery appends $1..$n after the statement's own $n literals; tests never caught it: the behavioural suite uses in-memory fakes that never touch the seam). Probe session abandoned in place (status=abandoned, flags.smokeAbandonReason set).",
      run: RUN,
      mode: "seam-probe",
      app_commit: "recorded by bookkeeping commit",
      pick_codes: pick,
      gates: { canon_rows: canon.length, note_corpus_rows: notes.length, registry: reviewInputs.registry.length, anchors: reviewInputs.anchors.length, practice: reviewInputs.practice.length },
      session_id: sid,
      seam_probe: { ok: seamProbeOk, error: seamProbeError },
      smoke_user: { id: SMOKE_USER_ID, email: SMOKE_EMAIL, enabled: false },
      assertions,
      verdict: seamProbeOk ? "SMOKE_GREEN_PROBE" : "SMOKE_RED_SEAM_DEFECT",
      elapsed_ms: Date.now() - T0,
    });
    process.exit(seamProbeOk ? 0 : 2);
  }

  assertOk("seamProbe.ok", seamProbeOk, "updateSession works on the real seam (post-fix)");

  // ── sub-floor turn (D4 word floor → clarify nudge, no judge call) ───
  const nudge = await service.postMessage(SMOKE_USER_ID, sid, { text: "dunno, it just dissolves I guess lol" });
  assertOk("nudge.chipNull", nudge.chip === null, "no judge ran");
  assertOk("nudge.kind", nudge.pupilMessage?.kind === "clarify_nudge", nudge.pupilMessage?.text.slice(0, 40) ?? "");
  assertOk("nudge.noCounters", nudge.session.messageCount === 0 && nudge.session.llmCallCount === 1, `mc=${nudge.session.messageCount} llm=${nudge.session.llmCallCount}`);
  const flagsAfterNudge = (await store.findSession(sid))!.session.flags as Record<string, unknown>;
  assertOk("nudge.subFloorFlag", flagsAfterNudge.subFloorNudges === 1, JSON.stringify(flagsAfterNudge.subFloorNudges));

  // ── judged turn 1 (covers objective 1) ──────────────────────────────
  const canonForText = canon.map((c) => `[${c.code}] ${c.title}`).join("; ");
  const turn1Text =
    `Alright, here is how I understand it. ${canonForText}. ` +
    `The way I'd put it in my own words: the particles are arranged one way in one state and differently in another, ` +
    `adding energy makes them move more until the arrangement changes, and the strength of the forces between them ` +
    `explains the properties the notes describe. That is the whole idea I'd teach you, and the example I'd use is ` +
    `heating a pan of water and watching the state change happen at the surface first.`;
  chainState.studentText = turn1Text;
  chainState.coverNext = [1];
  const t1 = await service.postMessage(SMOKE_USER_ID, sid, { text: turn1Text });
  assertOk("turn1.chip", t1.chip !== null && t1.chip.coveredObjectiveIds.length === 1, `covered=${t1.chip?.coveredObjectiveIds.length}`);
  assertOk("turn1.pupilKind", t1.pupilMessage?.kind === "paraphrase_probe", t1.pupilMessage?.kind ?? "");
  assertOk("turn1.counters", t1.session.messageCount === 1 && t1.session.llmCallCount === 2, `mc=${t1.session.messageCount} llm=${t1.session.llmCallCount}`);
  assertOk("turn1.objectiveStatus", t1.session.objectives.filter((o) => o.status === "covered").length === 1, "objective 1 covered");

  // ── judged turn 2 (covers objectives 2 + 3) ─────────────────────────
  const turn2Text =
    `Let me take the next parts. For the remaining spec points my understanding is this: ` +
    `${canonForText}. Concretely, I'd explain the differences in arrangement and movement ` +
    `between the states, how energy input drives the change from one state to another, and why the forces involved ` +
    `account for the properties we observe. To teach it properly I'd draw the three arrangements side by side, ` +
    `label the forces, then narrate what happens as you keep adding energy until the state flips.`;
  chainState.studentText = turn2Text;
  chainState.coverNext = [2, 3];
  const t2 = await service.postMessage(SMOKE_USER_ID, sid, { text: turn2Text });
  assertOk("turn2.chip", t2.chip !== null && t2.chip.coveredObjectiveIds.length === 2, `covered=${t2.chip?.coveredObjectiveIds.length}`);
  assertOk("turn2.counters", t2.session.messageCount === 2 && t2.session.llmCallCount === 3, `mc=${t2.session.messageCount} llm=${t2.session.llmCallCount}`);
  assertOk("turn2.allCovered", t2.session.objectives.every((o) => o.status === "covered"), "3/3 covered");

  const coverageRows = await store.listCoverage(sid);
  assertOk("coverage.rows", coverageRows.length === 3, `${coverageRows.length} rows`);
  assertOk("coverage.extractive", coverageRows.every((r) => r.covered && (turn1Text.includes(r.evidenceQuote) || turn2Text.includes(r.evidenceQuote))), "evidence quotes are extractive");

  // ── endSession (async review → review card + candidate queue) ───────
  const end = await service.endSession(SMOKE_USER_ID, sid);
  assertOk("end.status", end.status === "completed", end.status);
  assertOk("end.reviewCard", end.review !== null && Array.isArray(end.review.specPointVerdicts) && end.review.specPointVerdicts.length === 3, "3 spec-point verdicts");
  const cardRow = await store.findReviewCard(sid);
  assertOk("end.reviewCardRow", cardRow !== null, "teach_review_cards row present");
  const flagsEnd = (await store.findSession(sid))!.session.flags as Record<string, unknown>;
  assertOk("end.candidatesInserted", flagsEnd.candidatesInserted === 1, JSON.stringify(flagsEnd.candidatesInserted));
  const credits = flagsEnd.evidenceCredits as Array<Record<string, unknown>>;
  assertOk("end.evidenceCredits", Array.isArray(credits) && credits.length === 3 && credits.every((c) => c.credited === true && c.kind === "TEACH_SESSION" && c.tier === "AI_SUGGESTED"), `${credits?.length ?? 0} credits`);
  const sessFinal = (await store.findSession(sid))!.session;
  assertOk("end.ceilingLaw", sessFinal.llmCallCount === 4 && sessFinal.tokensUsed > 0, `llm=${sessFinal.llmCallCount} tokens=${sessFinal.tokensUsed}`);
  assertOk("end.endedAt", sessFinal.endedAt !== null && sessFinal.status === "completed", String(sessFinal.endedAt));
  const cands = await sql`SELECT COUNT(*)::int AS n FROM teach_misconception_candidates WHERE session_id = ${sid}::uuid`;
  assertOk("end.candidateRow", Number((cands[0] as Row).n) === 1, `${(cands[0] as Row).n} candidate row(s)`);

  // ── permalink + history ─────────────────────────────────────────────
  const permalink = await service.getSession(SMOKE_USER_ID, sid);
  assertOk("permalink.transcript", permalink.transcript.length === 7, `${permalink.transcript.length} messages (opening + nudge pair + 2 judged turns)`);
  assertOk("permalink.review", permalink.review !== null, "review attached");
  const history = await service.listSessions(SMOKE_USER_ID, "igcse-chemistry-19");
  assertOk("history.listed", history.items.some((i) => i.sessionId === sid && i.status === "completed"), "session in history");

  // ── negatives (typed fail-closed, pre-write) ────────────────────────
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

  // ── D1 bite probe at smoke time (fresh dated evidence) ──────────────
  const d1 = await d1Probe(DB, sid);
  record("d1_probe", d1);

  // ── quota read ──────────────────────────────────────────────────────
  const quota = await store.countSessionsToday(SMOKE_USER_ID, (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; })());
  assertOk("quota.today", quota === 1, `${quota} session(s) today for the smoke user`);

  writeReceipt({
    task: "T-TEACHME-001",
    what: "prod REAL-SESSION smoke: the full Teach-Me flow ran through the app's own service+store code path against production (create → sub-floor nudge → 2 judged turns → end → review card + misconception candidate → permalink/history read-backs → typed negatives → D1 bite probe). The ONLY injected fake is the LLM chain port (scripted, port-faithful — no provider keys in the sandbox; buildLlmChain() boots dormant on zero-key envs). Store SQL, service law D1–D4, gates G1/G2, grounding laws, prod DDL and the append-only triggers are all real.",
    run: RUN,
    mode: "full",
    app_commit: "fix(updateSession seam) — hash recorded by the bookkeeping commit",
    target_host: targetHost,
    transport: "createSql → NeonWsClient (@neondatabase/serverless 0.10.2) — the app's production transport",
    chain: { mode: "scripted-port-faithful", model: "scripted-smoke-v1", prompts_exercised: ["teachme.objectives.v1", "teachme.turn.v1", "teachme.review.v1"] },
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
      candidates: 1,
      review_card: true,
      transcript_messages: 7,
    },
    assertions,
    d1_probe: d1,
    quota_sessions_today: quota,
    verdict: "SMOKE_GREEN",
    elapsed_ms: Date.now() - T0,
    applied_at_utc: new Date().toISOString(),
  });
  console.log(`\nVERDICT: SMOKE_GREEN — session ${sid}`);
  process.exit(0);
} catch (e) {
  const msg = (e as Error).message ?? String(e);
  console.error(`\nSMOKE FAILED: ${msg}`);
  try {
    writeReceipt({
      task: "T-TEACHME-001",
      what: "prod real-session smoke — FAILED (honest-red; see assertions and error)",
      run: RUN,
      mode: FULL ? "full" : "seam-probe",
      smoke_user: { id: SMOKE_USER_ID, email: SMOKE_EMAIL },
      assertions,
      error: msg.slice(0, 800),
      verdict: "SMOKE_RED",
      elapsed_ms: Date.now() - T0,
    });
  } catch (se) {
    console.error(`(receipt write also failed: ${(se as Error).message})`);
  }
  process.exit(1);
}
