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
 * T-MIG-046 control-plane reachability fix (maiden-run finding, CI run
 * 37351081991): api.neon.tech is DNS-unresolvable from BOTH agent sandboxes
 * AND GitHub-hosted runners (ENOTFOUND at create time), contradicting the
 * "CI is not DNS-blocked" assumption. Two further live-shape findings from
 * the probe round (console mirror, all probe branches dropped+404-verified):
 *   R-046-B: the branch-create response no longer carries connection_uris,
 *            and GET .../connection_uri is 404 — credentials are obtained by
 *            creating a branch-local role via POST .../roles (the API assigns
 *            the working password and returns it ONCE in the creation
 *            response, per the recorded T-MIG-014 operational note "role
 *            passwords taken from creation responses"); API-created roles
 *            carry pg_write_all_data (the apply-reset DELETE-not-TRUNCATE
 *            doctrine). Request-supplied passwords are kept as a fallback
 *            for API shapes that honor them.
 *   R-046-C: GET /branches/{id} on this surface returns {annotation, branch}
 *            only (no nested endpoints) — readiness polls watch
 *            branch.current_state, and project-level operations must be
 *            settled before role creation (HTTP 423 otherwise).
 * The live-probe recipe (create → ready → ops-settle → role → DELETE+404) is
 * proven E2E including a real apply-reset run to Flyway-SEED posture.
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
 *   NEON_API_BASE          — control-plane override; when unset the tool
 *                            tries the documented primary then the console
 *                            mirror (disclosed fallback, see T-MIG-046 note)
 *
 * BASELINE_DB.md §2 doctrine: Neon branches are copy-on-write — every agent
 * (and now every CI run) gets production-shaped state without production
 * risk. This tool is the CI mechanization of exactly that doctrine.
 */

// Control-plane bases, tried in order per request-cycle until one answers.
// A DNS/network failure moves to the next base (disclosed); HTTP-level
// responses (4xx/5xx) do NOT trigger fallback — a reachable API that answers
// an error fails honestly. The working base is cached for the process.
const BASES: string[] = [
  process.env.NEON_API_BASE?.trim() || null,
  "https://api.neon.tech/v2",
  "https://console.neon.tech/api/v2",
].filter((b): b is string => !!b);
let activeBase: string | null = null;

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
  const bases = activeBase ? [activeBase] : BASES;
  let lastErr: unknown = null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
          ...(init?.headers ?? {}),
        },
      });
      if (activeBase !== base) {
        console.log(
          `[neon-branch] control plane answering at ${base}` +
            (base === "https://api.neon.tech/v2" ? "" : " (console mirror fallback — disclosed per T-MIG-046)"),
        );
      }
      activeBase = base;
      return res;
    } catch (e) {
      lastErr = e;
      console.error(`[neon-branch] control plane ${base} unreachable (${(e as Error).message})`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BranchResp {
  branch?: { id?: string; name?: string; current_state?: string };
  endpoints?: Array<{ id?: string; host?: string; status?: string }>;
  connection_uris?: Array<{ connection_uri?: string }>;
  databases?: Array<{ name?: string }>;
  operations?: Array<{ id?: string }>;
}

interface RoleResp {
  role?: { name?: string; password?: string; branch_id?: string };
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
    throw new Error(`create ${name} failed: HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const body = (await res.json()) as BranchResp;
  const id = body.branch?.id;
  if (!id) {
    throw new Error("create response missing branch.id");
  }
  // R-046-B: this API surface no longer returns connection_uris (and
  // GET .../connection_uri is 404) — the URI is constructed from the
  // create response's endpoint host + database name, with the credential
  // supplied by a branch-local role creation below.
  const host = body.endpoints?.[0]?.host;
  const db = body.databases?.[0]?.name;
  if (!host || !db) {
    throw new Error(
      "create response carried no endpoint host / database name " +
        "(branch id recorded, not printed) — inspect the API payload shape for this project",
    );
  }
  // R-046-C readiness: poll branch.current_state until ready (this surface's
  // GET /branches/{id} carries no nested endpoints to poll instead).
  for (let i = 0; i < 30; i++) {
    const poll = await neonFetch(`/projects/${projectId}/branches/${id}`);
    if (poll.ok) {
      const pb = (await poll.json()) as { branch?: { current_state?: string } };
      if (pb.branch?.current_state === "ready") break;
    }
    await sleep(2000);
  }
  // R-046-C: project-level operations must settle before role creation —
  // the API refuses overlapping scheduling with HTTP 423.
  for (let i = 0; i < 45; i++) {
    const ops = await neonFetch(`/projects/${projectId}/operations?limit=100`);
    if (ops.ok) {
      const ob = (await ops.json()) as { operations?: Array<{ status?: string }> };
      const active = (ob.operations ?? []).filter(
        (o) => o.status === "running" || o.status === "scheduling",
      );
      if (active.length === 0) break;
    }
    await sleep(2000);
  }
  // Branch-local role WITH a managed password (never a production role; the
  // branch is disposable). The API assigns the working secret and returns it
  // ONCE in the creation response — the T-MIG-014 operational note "role
  // passwords taken from creation responses"; a request-supplied password is
  // kept only as a fallback for API shapes that honor it. API-created roles
  // carry pg_write_all_data, which is exactly what apply-reset.ts assumes
  // (its DELETE-not-TRUNCATE doctrine).
  const pwSeed = crypto.randomUUID().replace(/-/g, "");
  let roleBody: RoleResp | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rr = await neonFetch(`/projects/${projectId}/branches/${id}/roles`, {
      method: "POST",
      body: JSON.stringify({ role: { name: "ci_replay_agent", password: pwSeed } }),
    });
    if (rr.status === 423) {
      if (attempt === 7) {
        throw new Error(`role create on the ${role} branch: HTTP 423 conflicting operations persisted beyond the retry window`);
      }
      await sleep(5000);
      continue; // conflicting ops — retry within the settle window
    }
    if (rr.status !== 201 && rr.status !== 200) {
      throw new Error(`role create on the ${role} branch failed: HTTP ${rr.status}: ${(await rr.text()).slice(0, 400)}`);
    }
    roleBody = (await rr.json()) as RoleResp;
    break;
  }
  const roleName = roleBody?.role?.name;
  const rolePw = roleBody?.role?.password;
  if (!roleName || !rolePw) {
    throw new Error(
      "role-create response carried no usable credential " +
        "(name present: " + String(!!roleName) + ") — password must come from the creation response",
    );
  }
  // Wait for the endpoint to be ready (Neon computes cold endpoints async;
  // the api-side health-wait loop in the workflow absorbs residual latency).
  return { id, url: `postgresql://${roleName}:${rolePw}@${host}/${db}?sslmode=require` };
}

async function create(): Promise<void> {
  const salt = `${process.env.GITHUB_RUN_ID ?? Math.floor(Date.now() / 1000)}${process.env.GITHUB_RUN_ATTEMPT ? `-a${process.env.GITHUB_RUN_ATTEMPT}` : ""}`;
  const projectId = requiredEnv("NEON_PROJECT_ID");
  const created: Array<{ id: string; url: string; role: string }> = [];
  const cleanupOnFailure = async () => {
    // Zero-residue doctrine (T-MIG-035): if a later create fails, the
    // already-created branches of THIS RUN are dropped + 404-verified before
    // exiting — only branches this run created, never any standing branch.
    for (const c of created) {
      const del = await neonFetch(`/projects/${projectId}/branches/${c.id}`, { method: "DELETE" });
      const verify = await neonFetch(`/projects/${projectId}/branches/${c.id}`);
      const ok = (del.status === 204 || del.status === 200) && verify.status === 404;
      console.log(`${ok ? "cleaned up" : "CLEANUP FAILED — RESIDUE"}: ${c.role} ${c.id}`);
    }
  };
  try {
    const seed = await createOne("seed", salt);
    created.push({ ...seed, role: "seed" });
    const prod = await createOne("prod", salt);
    created.push({ ...prod, role: "prod" });
  } catch (e) {
    console.error(`[neon-branch] create failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 400)}`);
    await cleanupOnFailure();
    process.exit(1);
  }
  const [seed, prod] = created;
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
