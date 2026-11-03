/**
 * T-MIG-037 (r8-hub) live harness — POSTURE B: ROLLBACK (MIGRATION_PLAN §7).
 * The ONE env var (NEXT_PUBLIC_API_V2_BASE_URL) is UNSET in this process —
 * a fresh process means the hub module's env-bound constants re-read
 * reality. Every constructed URL — INCLUDING the newly flipped surfaces —
 * must revert to the legacy core form. This is the entire rollback plan:
 * no code change, no redeploy of the api, one env unset.
 * The core is deliberately absent from this sandbox (zero production
 * contact), so the evidence is the constructed URL itself: relative
 * path + XTransformPort=8080 (the documented core convention) — and in a
 * production posture (NEXT_PUBLIC_API_BASE_URL set) the same decision
 * layer returns the core's absolute base, which we additionally pin here
 * via a second module load is not possible in-process, so the absolute
 * variant is covered by the committed pins + posture A's negative probes.
 */
delete process.env.NEXT_PUBLIC_API_V2_BASE_URL;

const { apiPath, v2SurfaceBase } = await import("/home/z/my-project/syllabai-v2/apps/hub/src/lib/api.ts");

const PROBES: readonly string[] = [
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/me",
  "/api/v1/content/documents",
  "/api/v1/content/documents/abc-123",
  "/api/v1/content/question-assets/a.pdf",
  "/api/v1/curriculum/subjects",
  "/api/v1/attempts",
  "/api/v1/attempts/structured",
  "/api/v1/learners/me/attempts?limit=5",
  "/api/v1/learners/me/attempts/att-1/self-mark",
  "/api/v1/subjects",
  "/api/v1/teacher/content/glm-ocr/papers/p-1/findings",
];

let fails = 0;
for (const p of PROBES) {
  const url = apiPath(p);
  const ok = url.startsWith("/api/") && url.includes("XTransformPort=8080") && !url.startsWith("http");
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} rollback ${p} -> ${url}`);
  const decision = v2SurfaceBase(p, process.env.NEXT_PUBLIC_API_V2_BASE_URL);
  if (decision !== null) {
    fails++;
    console.log(`FAIL rollback decision-layer leak for ${p}: ${decision}`);
  }
}
console.log(`\nPOSTURE B (rollback, env unset): ${PROBES.length - fails}/${PROBES.length} probes reverted to core`);
process.exit(fails === 0 ? 0 : 1);
