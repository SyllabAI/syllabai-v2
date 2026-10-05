/*
 * PROVENANCE (T-MIG-023): copied verbatim from
 * .syllabai/receipts/T-MIG-022/tools/deep-diff-case.ts (branch t-mig-022/r3a) — the
 * R0-credited replay-tooling lineage (#20 disposition credit -> T-MIG-022
 * run-001 -> T-MIG-023 re-run). Nothing below this block was modified.
 */
/*
 * T-MIG-022 deep-diff helper — path-aware comparison of a golden case's
 * expected body against a LIVE response, for 200-vs-200 mismatches the
 * runner's 220-char truncation cannot localize. Harness-side diagnostic
 * only; the verdict authority stays the runner's diff engine.
 *
 * Usage: TARGET=... SYLLABAI_TEACHER_JOIN_CODE=... CASE=<case-name> \
 *        bun deep-diff-case.ts
 */
import { readFileSync } from "node:fs";

const TARGET = process.env.TARGET ?? "http://localhost:3000";
const JOIN_CODE = process.env.SYLLABAI_TEACHER_JOIN_CODE ?? "";
const CASE_NAME = process.env.CASE ?? "";
if (!CASE_NAME) { console.error("CASE env required"); process.exit(2); }

const kase = JSON.parse(
  readFileSync(new URL(`../../../../golden/cases/${CASE_NAME}.json`, import.meta.url), "utf8"),
);

const PASSWORD = "Replay-Only-2026-x7k2";
async function tokenFor(email: string, role: "STUDENT" | "TEACHER"): Promise<string> {
  const reg = await fetch(new URL("/api/v1/auth/register", TARGET), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, displayName: "User 20", role, ...(role === "TEACHER" ? { joinCode: JOIN_CODE } : {}) }),
  });
  const login = await fetch(new URL("/api/v1/auth/login", TARGET), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return ((await login.json()) as { accessToken: string }).accessToken;
}

const teacherToken = await tokenFor("diff_user_20@example.invalid", "TEACHER");
const bearer = kase.name.includes("unauthed")
  ? "scrubbed-fixed-dummy-jwt-token"
  : kase.path.includes("/api/v1/teacher/")
    ? teacherToken
    : teacherToken; // diagnostic script: teacher passes both route classes

const res = await fetch(new URL(kase.path, TARGET), {
  method: kase.method,
  headers: { "content-type": "application/json", ...(kase.request?.headers ?? {}), Authorization: `Bearer ${bearer}` },
  body: kase.request?.body != null ? JSON.stringify(kase.request.body) : undefined,
});
const actual = await res.json().catch(() => "<non-json>");

// tolerate-aware deep diff with paths
const tolerate = new Set<string>(kase.tolerate ?? []);
const diffs: Array<{ path: string; expected: string; actual: string }> = [];
function walk(exp: unknown, act: unknown, path: string): void {
  const key = path.split(".").pop() ?? "";
  if (tolerate.has(key)) return;
  if (exp === null || act === null || typeof exp !== "object" || typeof act !== "object") {
    if (JSON.stringify(exp) !== JSON.stringify(act)) {
      diffs.push({ path: path || "<root>", expected: JSON.stringify(exp)?.slice(0, 160) ?? "undefined", actual: JSON.stringify(act)?.slice(0, 160) ?? "undefined" });
    }
    return;
  }
  if (Array.isArray(exp) !== Array.isArray(act)) {
    diffs.push({ path, expected: Array.isArray(exp) ? "array" : "object", actual: Array.isArray(act) ? "array" : "object" });
    return;
  }
  const eo = exp as Record<string, unknown>;
  const ao = act as Record<string, unknown>;
  const keys = new Set([...Object.keys(eo), ...Object.keys(ao)]);
  for (const k of keys) {
    if (!(k in eo)) diffs.push({ path: `${path}.${k}`, expected: "<absent>", actual: JSON.stringify(ao[k])?.slice(0, 120) ?? "undefined" });
    else if (!(k in ao)) diffs.push({ path: `${path}.${k}`, expected: JSON.stringify(eo[k])?.slice(0, 120) ?? "undefined", actual: "<absent>" });
    else walk(eo[k], ao[k], `${path}.${k}`);
  }
}
walk(kase.expect.body, actual, "");

console.log(`case: ${CASE_NAME} | status ${res.status} vs expected ${kase.expect.status}`);
console.log(`tolerate fields: ${[...tolerate].join(", ") || "(none)"}`);
console.log(`divergence count: ${diffs.length}`);
for (const d of diffs.slice(0, 8)) {
  console.log(`\n  @ ${d.path}\n    expected: ${d.expected}\n    actual:   ${d.actual}`);
}
