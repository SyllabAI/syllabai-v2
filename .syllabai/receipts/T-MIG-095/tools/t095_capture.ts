/**
 * T-MIG-095 combo-law capture tool (run-001).
 * Captures the FIRST-FIELD-ERROR precedence law from the live frozen core
 * (and the current v2 posture for the delta table) on the two learner-me
 * write surfaces: POST /learners/me/flashcard-ratings + /note-votes.
 *
 * ZERO-WRITE SAFETY: every leg guarantees >=1 violated constraint
 * (blank / absent / null / size / pattern) -> both planes answer
 * 400 validation_failed BEFORE any service/DB write. No 201 path exists
 * in this matrix by construction.
 *
 * Auth: v2-minted learner bearer (the R-JWT seam of record, closed and
 * live-verified 2026-10-08 trace 1a1177d16bbd0a49); token held in memory
 * only, scrubbed at exit.
 */
const CORE = "https://syllabai-core.onrender.com";
const V2 = "https://syllabai-v2.vercel.app";
const EMAIL = "r0-seam-probe-20261008a@example.invalid";
const PASS = "R0-Seam-Probe#20261008x";
const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6"; // shape-only, never bound

type Leg = { name: string; body: Record<string, unknown> };

function legsFor(f1: string, f2Valid: string, label1: string): Leg[] {
  const V1 = "abc"; // shape-valid cardId/noteId (>=3, [A-Za-z0-9_-]+)
  const V3 = "S1"; // shape-valid subtopicCode
  const f2v = f2Valid === "rating" ? "GOOD" : "UPVOTE";
  return [
    { name: "01-all-absent", body: {} },
    { name: "02-all-blank", body: { [f1]: "", [f2Valid]: "", subtopicCode: "" } },
    { name: `03-${label1}-absent-others-valid`, body: { [f2Valid]: f2v, subtopicCode: V3 } },
    { name: "04-f2-absent-others-valid", body: { [f1]: V1, subtopicCode: V3 } },
    { name: "05-f3-absent-others-valid", body: { [f1]: V1, [f2Valid]: f2v } },
    { name: `06-${label1}-blank-only`, body: { [f1]: "", [f2Valid]: f2v, subtopicCode: V3 } },
    { name: "07-f2-blank-only", body: { [f1]: V1, [f2Valid]: "", subtopicCode: V3 } },
    { name: "08-f3-blank-only", body: { [f1]: V1, [f2Valid]: f2v, subtopicCode: "" } },
    { name: `09-${label1}-and-f2-blank`, body: { [f1]: "", [f2Valid]: "", subtopicCode: V3 } },
    { name: `10-${label1}-and-f3-blank`, body: { [f1]: "", [f2Valid]: f2v, subtopicCode: "" } },
    { name: "11-f2-and-f3-blank", body: { [f1]: V1, [f2Valid]: "", subtopicCode: "" } },
    { name: "12-all-null", body: { [f1]: null, [f2Valid]: null, subtopicCode: null } },
    { name: "14-f1-size-only", body: { [f1]: "ab", [f2Valid]: f2v, subtopicCode: V3 } },
    { name: "15-f3-size-only", body: { [f1]: V1, [f2Valid]: f2v, subtopicCode: "S" } },
    { name: "16-f3-pattern-only", body: { [f1]: V1, [f2Valid]: f2v, subtopicCode: "S!" } },
  ];
}

const RATINGS_LEGS: Leg[] = [
  ...legsFor("cardId", "rating", "cardId"),
  { name: "13-unknown-prop-flashcardId", body: { flashcardId: UUID, rating: "GOOD" } }, // L09 exact reproduction
];

const VOTES_LEGS: Leg[] = legsFor("noteId", "vote", "noteId");

async function login(): Promise<string> {
  const r = await fetch(`${V2}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (r.status !== 200) throw new Error(`login ${r.status}: ${await r.text()}`);
  const d = (await r.json()) as Record<string, unknown>;
  const tok = (d.accessToken ?? (d.data as Record<string, unknown> | undefined)?.accessToken) as
    | string
    | undefined;
  if (!tok) throw new Error("no token in login body");
  return tok;
}

async function probe(base: string, path: string, body: unknown, tok: string) {
  const t0 = Date.now();
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let slim: unknown = text;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    slim = { status: j.status, error: j.error, message: j.message };
  } catch {
    /* non-json body kept raw */
  }
  return { http: r.status, ms: Date.now() - t0, body: slim };
}

async function main() {
  const tok = await login();
  const out: Record<string, unknown> = {
    captured_at: new Date().toISOString(),
    core_base: CORE,
    v2_base: V2,
    surfaces: {} as Record<string, unknown>,
  };
  const surfaces = out.surfaces as Record<string, unknown>;
  for (const [path, legs] of [
    ["/api/v1/learners/me/flashcard-ratings", RATINGS_LEGS],
    ["/api/v1/learners/me/note-votes", VOTES_LEGS],
  ] as const) {
    const rows: unknown[] = [];
    for (const leg of legs) {
      const core = await probe(CORE, path, leg.body, tok);
      const v2 = await probe(V2, path, leg.body, tok);
      const agree =
        core.http === v2.http && JSON.stringify(core.body) === JSON.stringify(v2.body);
      rows.push({ name: leg.name, request_body: leg.body, core, v2, agree });
      console.log(
        `${path.split("/").pop()} ${leg.name}: core ${core.http} ${JSON.stringify(core.body)} | v2 ${v2.http} ${JSON.stringify(v2.body)} | agree=${agree}`,
      );
    }
    surfaces[path] = rows;
  }
  console.log("=== FINAL JSON ===");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("CAPTURE FAILED:", e);
  process.exit(1);
});
