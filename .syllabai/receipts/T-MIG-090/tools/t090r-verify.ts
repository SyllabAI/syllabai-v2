/**
 * T-MIG-090 rider golden-verify — leg replay harness (evidence-only, nothing committed).
 *
 * Serves apps/api/src/index.ts (merged main bd4eaeb — the branch carries ZERO code
 * deltas, only .syllabai claim artifacts) with the T-MIG-022 harness-owned envelope,
 * in the CAPTURE posture + ZERO-KEY law (ruling4 §3):
 *   SYLLABAI_LLM_MODE=test, three DISABLE bridges, NO LLM credentials in env.
 * Substrate: disposable Neon COW branch (verify-t090-rider-r0-*) for the bearer-leg
 * revocation lookups (users.findById). Branch dies after the verify.
 *
 * Legs (GET /api/v1/admin/llm/chain-health):
 *   leg-01 no-token -> 401 Boot envelope    leg-02 STUDENT bearer -> 403
 *   leg-03 TEACHER bearer -> 403            leg-04 ADMIN bearer -> 200 byte-parity
 * Diffs vs golden-captures/t-mig-090/*.json: status + body deep-equal + leg-04 RAW
 * BYTE parity (capture-order emission law); envelope timestamp normalized (type-only,
 * the 082 run-003 method); header deltas disclosed per-leg (the api-wide default
 * cache-posture class is a KNOWN finding of record, not a new divergence).
 */
import app from "./apps/api/src/index.ts";
import { JwtService } from "./apps/api/src/services/identity/jwt";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 8899);

// ── ZERO-KEY boot law (ruling4 §3): assert the boot env carries NO LLM credentials ──
const FORBIDDEN = Object.keys(process.env).filter((k) =>
  /^(GROQ|OPENROUTER|GEMINI).*API_KEY|SYLLABAI_(GROQ|GEMINI|OPENROUTER)_API_KEY$/i.test(k),
);
if (FORBIDDEN.length) {
  console.error("harness: ZERO-KEY law violated — LLM credentials present in env:", FORBIDDEN);
  process.exit(4);
}
console.log("harness: ZERO-KEY boot law asserted (no LLM credentials in env)");

Bun.serve({
  port: PORT,
  idleTimeout: 60,
  fetch: app.fetch,
});
console.log(`harness: serving merged-main api on :${PORT}`);

// ── tokens (harness secret, same value the boot env carries; HS256 44+ byte law) ──
const SECRET = process.env.SYLLABAI_JWT_SECRET!;
const jwt = new JwtService(SECRET, "PT15M");
const tok = (id: string, email: string, roles: string[]) =>
  jwt.issueAccessToken({ id, email, tokenVersion: 1, roles });

const LEARNER = tok(
  "09000000-0000-4000-8000-000000000001",
  "t090r-learner@verify.local",
  ["STUDENT"],
);
const TEACHER = tok(
  "09000000-0000-4000-8000-000000000002",
  "t090r-teacher@verify.local",
  ["TEACHER"],
);
const ADMIN = tok(
  "09000000-0000-4000-8000-000000000003",
  "t090r-admin@verify.local",
  ["ADMIN"],
);

const URL_ = "http://127.0.0.1:" + PORT + "/api/v1/admin/llm/chain-health";

// wait for boot (health check)
let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch("http://127.0.0.1:" + PORT + "/actuator/health");
    if (r.ok) { up = true; break; }
  } catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) { console.error("harness: api never came up"); process.exit(3); }

type Leg = { leg: string; status: number; body: unknown; response_headers: Record<string, string> };
function legFile(n: number): string {
  return ["no-token-401", "learner-403", "teacher-403", "admin-200"][n - 1];
}
const legs: Leg[] = [1, 2, 3, 4].map((n) =>
  JSON.parse(
    readFileSync(`./golden-captures/t-mig-090/leg-0${n}-chain-${legFile(n)}.json`, "utf8"),
  ),
);

const RESULTS: any[] = [];
function capFor(name: string): Leg {
  const n = Number(name.match(/^leg-(\d+)/)![1]);
  return legs[n - 1];
}
/** order-insensitive deep equality over parsed JSON (GOLDEN_MASTER diff semantics) */
function canon(v: unknown): string {
  return JSON.stringify(v, replacer);
}
function replacer(this: any, _k: string, v: any) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return v;
}
async function runLeg(name: string, token?: string) {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(URL_, { headers });
  const rawText = await res.text();
  const cap = capFor(name);
  // diff
  const body = JSON.parse(rawText);
  const norm = (b: any) => {
    if (b && typeof b === "object" && "timestamp" in b) {
      const { timestamp, ...rest } = b;
      return rest;
    }
    return b;
  };
  const expected = norm(cap.body);
  const actual = norm(body);
  const bodyMatch = canon(expected) === canon(actual);
  const statusMatch = res.status === cap.status;
  // byte parity (leg-04 only): the pinned wire-emission order is
  //   top-level [chainAvailable, providers] (frozen LinkedHashMap law),
  //   providers keyed in §26.1 chain order groq -> gemini -> openrouter
  //     (the unit-layer pin of record on merged main),
  //   per-provider snapshot fields alphabetical (the ruling4 §2 capture-order law).
  // The capture FILE lists provider keys alphabetically (non-semantic JSON key
  // order; GOLDEN_MASTER diffs parsed bodies) — disclosed, not a divergence.
  // Byte parity = the raw wire text equals the capture body re-serialized in
  // the pinned order.
  let byteParity: Record<string, unknown> | null = null;
  if (name.startsWith("leg-04")) {
    const parsed = JSON.parse(rawText);
    const topOrder = Object.keys(parsed);
    const provOrder = Object.keys(parsed.providers ?? {});
    const fieldOrder = Object.keys(parsed.providers?.groq ?? {});
    const FIELDS = [
      "configured", "consecutiveFailures", "cooldownUntil", "coolingDown", "dailyBudget",
      "effectiveModel", "enabled", "healthy", "lastErrorAt", "lastErrorMessage",
      "lastFailureClass", "remainingLocalBudget", "requestsToday",
    ];
    const CHAIN = ["groq", "gemini", "openrouter"];
    const capBody = cap.body as any;
    const ordered: any = {
      chainAvailable: capBody.chainAvailable,
      providers: Object.fromEntries(
        CHAIN.map((p) => [p, Object.fromEntries(FIELDS.map((f) => [f, capBody.providers[p][f]]))]),
      ),
    };
    byteParity = {
      top_level_order: topOrder.join(","),
      provider_order: provOrder.join(","),
      provider_order_matches_chain: JSON.stringify(provOrder) === JSON.stringify(CHAIN),
      field_order_capture_law: fieldOrder.join(",") === FIELDS.join(","),
      raw_text: rawText === JSON.stringify(ordered),
    };
  }
  // header deltas
  const hDiffs: string[] = [];
  const capHeaders = cap.response_headers ?? {};
  for (const [k, v] of Object.entries(capHeaders)) {
    const a = res.headers.get(k);
    if (a !== v) hDiffs.push(`${k}: capture=${v!} actual=${a ?? "<absent>"}`);
  }
  RESULTS.push({
    leg: name,
    expected_status: cap.status,
    actual_status: res.status,
    status_match: statusMatch,
    body_match: bodyMatch,
    byte_parity: byteParity,
    header_diffs: hDiffs,
    findings: hDiffs
      .filter((d) => d.startsWith("cache-control"))
      .map(() => "default cache posture missing on v2 (core: no-cache,no-store,max-age=0,must-revalidate) — api-wide class, filed of record at 082 run-003"),
  });
  console.log(
    `${name}: status ${res.status}/${cap.status} ${statusMatch ? "OK" : "MISMATCH"} | body ${bodyMatch ? "DEEP-EQUAL" : "DIFF"}` +
      (byteParity ? ` | raw own-order ${byteParity.raw_own_order ? "BYTE-PARITY" : "diff"}, canonical ${byteParity.raw_canonical ? "BYTE-PARITY" : "diff"}` : "") +
      (hDiffs.length ? ` | header-diffs: ${hDiffs.join("; ")}` : " | headers clean"),
  );
}

console.log("── replay ──");
await runLeg("leg-01-chain-no-token");
await runLeg("leg-02-chain-learner", LEARNER);
await runLeg("leg-03-chain-teacher", TEACHER);
await runLeg("leg-04-chain-admin", ADMIN);

const allPass =
  RESULTS.every((r) => r.status_match && r.body_match) &&
  (() => {
    const bp = RESULTS.find((r) => r.leg.startsWith("leg-04"))!.byte_parity as any;
    return bp.provider_order_matches_chain && bp.field_order_capture_law && bp.raw_text;
  })();

console.log(allPass ? "GOLDEN-VERIFY: 4/4 PASS" : "GOLDEN-VERIFY: FAIL");
await Bun.write("/tmp/t090r-verify-results.json", JSON.stringify({ results: RESULTS, verdict: allPass ? "PASS" : "FAIL" }, null, 1));
process.exit(allPass ? 0 : 1);
