/**
 * T-MIG-044 — Neon COW branch lifecycle for the CI-side golden replay runner.
 *
 * STRICT READ-ONLY POSTURE (operator directive, IM trace 1a10ca697e382335
 * item 2): this tool performs exactly TWO operations against the Neon API —
 * CREATE of per-run disposable copy-on-write branches (production-shaped,
 * zero production risk) and DROP of those same branches + 404 verification
 * (T-MIG-035 discipline: "Neon COW branch dropped + 404-verified"). It never
 * reads, writes, resets, or migrates the production branch; it never holds a
 * production connection string; the connection URIs it receives at create
 * time belong to the new disposable endpoints only and are masked, never
 * logged.
 *
 * Usage:
 *   bun golden/tools/neon-branch.ts create     # creates seed+prod branches,
 *                                              # ::add-mask:: + GITHUB_ENV
 *   bun golden/tools/neon-branch.ts drop       # drops + 404-verifies
 *
 * Required env:
 *   NEON_API_KEY           — Neon API token (GitHub secret)
 *   NEON_PROJECT_ID        — Neon project id (GitHub variable)
 *   NEON_PARENT_BRANCH_ID  — the PRODUCTION branch id to branch FROM
 *                            (GitHub variable; e.g. br-… for the `production`
 *                            branch per docs/BASELINE_DB.md §2)
 * Optional env:
 *   GITHUB_RUN_ID / GITHUB_RUN_ATTEMPT — unique branch-name salt
 *   GITHUB_ENV             — env-file path (create mode writes
 *                            NEON_SEED_BRANCH_ID / NEON_PROD_BRANCH_ID)
 *
 * BASELINE_DB.md §2 doctrine: Neon branches are copy-on-write — every agent
 * (and now every CI run) gets production-shaped state without production
 * risk. This tool is the CI mechanization of exactly that doctrine.
 */

const API = "https://api.neon.tech/v2";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    console.error(
      `[neon-branch] fail-fast: ${name} is blank — refusing to act. ` +
        (name === "NEON_API_KEY"
          ? "Configure it as a GitHub ACTIONS_SECRET (PAT-adjacent register item: rotate independently of the GitHub PAT)."
          : "Configure it as a GitHub ACTIONS_VARIABLE (project id / production branch id per docs/BASELINE_DB.md §2)."),
    );
    process.exit(2);
  }
  return v.trim();
}

const neonFetch = async (path: string, init?: RequestInit): Promise<Response> => {
  const key = requiredEnv("NEON_API_KEY");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
  });
  return res;
};

interface BranchResp {
  branch?: { id?: string; name?: string };
  endpoints?: Array<{ id?: string; host?: string; status?: string }>;
  connection_uris?: Array<{ connection_uri?: string }>;
  operations?: Array<{ id?: string }>;
}

/** Extract the endpoint connection URI defensively across API response shapes. */
function connectionUri(resp: BranchResp): string {
  const direct = resp.connection_uris?.[0]?.connection_uri;
  if (direct) return direct;
  const ep = resp.endpoints?.[0];
  if (ep?.id) {
    // Fallback shape: connection string delivered under the endpoint resource.
    throw new Error(
      "[neon-branch] create response carried no connection_uris — inspect the API payload shape for this project (endpoint id recorded, not printed).",
    );
  }
  throw new Error("[neon-branch] create response carried neither connection_uris nor endpoints");
}

async function createOne(role: string, runSalt: string): Promise<{ id: string; url: string }> {
  const projectId = requiredEnv("NEON_PROJECT_ID");
  const parentId = requiredEnv("NEON_PARENT_BRANCH_ID");
  const name = `ci-replay-${runSalt}-${role}`;
  const res = await neonFetch(`/projects/${projectId}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name, parent_id: parentId },
      endpoints: [{ type: "read_write" }],
    }),
  });
  if (res.status !== 201) {
    console.error(`[neon-branch] create ${name} failed: HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
    process.exit(1);
  }
  const body = (await res.json()) as BranchResp;
  const id = body.branch?.id;
  if (!id) {
    console.error("[neon-branch] create response missing branch.id");
    process.exit(1);
  }
  // Wait for the endpoint to be ready (Neon computes cold endpoints async;
  // the api-side health-wait loop in the workflow absorbs residual latency).
  for (let i = 0; i < 30; i++) {
    const poll = await neonFetch(`/projects/${projectId}/branches/${id}`);
    if (poll.ok) {
      const pb = (await poll.json()) as { endpoints?: Array<{ host?: string }> };
      if (pb.endpoints?.[0]?.host) break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { id, url: connectionUri(body) };
}

async function create(): Promise<void> {
  const salt = `${process.env.GITHUB_RUN_ID ?? Math.floor(Date.now() / 1000)}${process.env.GITHUB_RUN_ATTEMPT ? `-a${process.env.GITHUB_RUN_ATTEMPT}` : ""}`;
  const seed = await createOne("seed", salt);
  const prod = await createOne("prod", salt);
  // Mask the credential-bearing URIs in the job log, then hand them to the
  // workflow through $GITHUB_ENV (values are never echoed).
  console.log(`::add-mask::${seed.url}`);
  console.log(`::add-mask::${prod.url}`);
  if (process.env.GITHUB_ENV) {
    const fs = await import("node:fs");
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `NEON_SEED_BRANCH_ID=${seed.id}\nNEON_PROD_BRANCH_ID=${prod.id}\nNEON_SEED_URL=${seed.url}\nNEON_PROD_URL=${prod.url}\n`,
    );
  }
  console.log(`branches created: seed=${seed.id} prod=${prod.id} (connection URIs masked, not logged)`);
}

async function dropOne(projectId: string, id: string, role: string): Promise<void> {
  const del = await neonFetch(`/projects/${projectId}/branches/${id}`, { method: "DELETE" });
  if (del.status !== 204 && del.status !== 200) {
    console.error(`[neon-branch] DROP FAILED for ${role} ${id}: HTTP ${del.status} — RESIDUE, escalate to the operator`);
    process.exitCode = 1;
    return;
  }
  // T-MIG-035 discipline: drop + 404-verify (zero residue, zero production contact).
  const verify = await neonFetch(`/projects/${projectId}/branches/${id}`);
  if (verify.status === 404) {
    console.log(`dropped + 404-verified: ${role} ${id}`);
  } else {
    console.error(`[neon-branch] 404-verify FAILED for ${role} ${id}: HTTP ${verify.status} — RESIDUE, escalate`);
    process.exitCode = 1;
  }
}

async function drop(): Promise<void> {
  const projectId = requiredEnv("NEON_PROJECT_ID");
  const seedId = process.env.NEON_SEED_BRANCH_ID ?? "";
  const prodId = process.env.NEON_PROD_BRANCH_ID ?? "";
  if (!seedId && !prodId) {
    console.error("[neon-branch] nothing to drop (NEON_SEED_BRANCH_ID/NEON_PROD_BRANCH_ID both blank) — was create run in a previous step?");
    process.exit(2);
  }
  if (seedId) await dropOne(projectId, seedId, "seed");
  if (prodId) await dropOne(projectId, prodId, "prod");
}

const cmd = process.argv[2];
if (cmd === "create") await create();
else if (cmd === "drop") await drop();
else {
  console.log("usage: bun golden/tools/neon-branch.ts (create | drop)");
  process.exit(1);
}
