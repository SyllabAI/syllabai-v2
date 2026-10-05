/*
 * PROVENANCE (T-MIG-023): copied verbatim from
 * .syllabai/receipts/T-MIG-022/tools/setcheck.ts (branch t-mig-022/r3a) — the
 * R0-credited replay-tooling lineage (#20 disposition credit -> T-MIG-022
 * run-001 -> T-MIG-023 re-run). Nothing below this block was modified.
 */
import { readFileSync } from "node:fs";
const TARGET = "http://localhost:3000";
const kase = JSON.parse(readFileSync(new URL("../../../../golden/cases/teacher-content-paper-review-realdata-200.json", import.meta.url), "utf8"));
const reg = await fetch(new URL("/api/v1/auth/login", TARGET), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "user_20@example.invalid", password: "Replay-Only-2026-x7k2" }) });
const { accessToken } = await reg.json() as { accessToken: string };
const res = await fetch(new URL(kase.path, TARGET), { headers: { authorization: `Bearer ${accessToken}` } });
const actual = await res.json();
const eVers = (kase.expect.body as any).versions, aVers = (actual as any).versions;
console.log("versions len: expected", eVers.length, "actual", aVers.length);
const eIds = new Set(eVers.map((v: any) => v.versionId));
const aIds = new Set(aVers.map((v: any) => v.versionId));
const inter = [...aIds].filter((x) => eIds.has(x));
console.log("versionId set: expected", eIds.size, "actual", aIds.size, "intersection", inter.length);
console.log("only-in-expected (first 3):", [...eIds].filter((x) => !aIds.has(x)).slice(0, 3));
console.log("only-in-actual   (first 3):", [...aIds].filter((x) => !eIds.has(x)).slice(0, 3));
// ordering check: same multiset?
console.log("same order?", JSON.stringify(eVers.map((v: any) => v.versionId)) === JSON.stringify(aVers.map((v: any) => v.versionId)));
// paper meta equal?
console.log("paper.id equal?", (kase.expect.body as any).paper.id === (actual as any).paper.id);
// questionIds across both
const eQ = new Set(eVers.map((v: any) => v.questionId)), aQ = new Set(aVers.map((v: any) => v.questionId));
console.log("questionId set: expected", eQ.size, "actual", aQ.size, "intersection", [...aQ].filter((x) => eQ.has(x)).length);
