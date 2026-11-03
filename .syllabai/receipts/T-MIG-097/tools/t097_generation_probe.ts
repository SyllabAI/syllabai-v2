/**
 * T-MIG-097 post-enablement generation rider probe (stage 5 of the operator
 * chain order 1a119df7d930b609) — ONE generation-reaching ask per wire.
 *
 * Per wire: register a fresh probe learner -> fetch the learner's own
 * knowledge-graph (the learner-scoped anchor source) -> POST cla/ask
 * KG_TOPIC/EXPLAIN with the learner's real rootId + topicNodeId.
 *
 * VERDICT LAW: LLM-dependent surfaces are NEVER golden-gated (nondeterministic
 * bodies) — the rider compares STATUS + envelope SHAPE, never body text.
 * The anchors differ per wire by design (separate databases, separate probe
 * identities). 200 on both wires with a well-formed answer envelope on v2 =
 * the section-3 enablement is LIVE on the deployed v2.
 *
 * Run: bun t097_generation_probe.ts [--out FILE]
 */
const CORE = process.env.T097_CORE ?? "https://syllabai-core.onrender.com";
const V2 = process.env.T097_V2 ?? "https://syllabai-v2.vercel.app";

function argFlag(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT = argFlag("--out", "/tmp/t097/generation-probe.json");

async function call(base: string, method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    "content-type": body !== undefined ? "application/json" : undefined,
    signal: AbortSignal.timeout(90000), // generation is slow — 90s envelope
  } as RequestInit);
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text.length ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 400); }
  return { status: res.status, body: parsed };
}

async function registerProbe(base: string, label: string): Promise<string> {
  const email = `t097-gen-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`;
  const res = await fetch(`${base}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: `T097gen#${Date.now().toString(36)}x`, displayName: `T-MIG-097 gen ${label}` }),
    signal: AbortSignal.timeout(50000),
  });
  if (res.status !== 201 && res.status !== 200) throw new Error(`register ${label} failed: ${res.status} ${await res.text()}`);
  const b = (await res.json()) as { accessToken?: string; token?: string };
  if (!b.accessToken && !b.token) throw new Error(`register ${label}: no token`);
  return (b.accessToken ?? b.token)!;
}

async function probeWire(base: string, label: string) {
  const token = await registerProbe(base, label);
  // anchor discovery: curriculum subjects -> the subject root node, then the
  // learner knowledge-graph scoped to that root -> a topic node id
  const subs = await call(base, "GET", "/api/v1/curriculum/subjects", token);
  const subList = (subs.body as Array<{ knowledgeNodeId?: string | null }> | null) ?? [];
  const rootId = subList.find((s) => s.knowledgeNodeId)?.knowledgeNodeId ?? null;
  if (!rootId) {
    return { wire: label, register: "ok", subjects_status: subs.status, verdict: "NO-ANCHOR (no subject root on the wire)", rootId: null, topic: null };
  }
  const kg = await call(base, "GET", `/api/v1/learners/me/knowledge-graph?rootId=${rootId}`, token);
  const kgBody = kg.body as { nodes?: Array<{ id?: string; type?: string; childIds?: string[] }> } | null;
  const topic = kgBody?.nodes?.find((n) => n.type === "TOPIC")?.id
    ?? kgBody?.nodes?.flatMap((n) => n.childIds ?? []).find(Boolean);
  if (!topic) {
    return { wire: label, kg_status: kg.status, rootId, verdict: "NO-ANCHOR (no topic node)", topic: null };
  }
  const ask = await call(base, "POST", "/api/v1/learners/me/cla/ask", token, {
    kind: "KG_TOPIC", rootId, topicNodeId: topic, mode: "EXPLAIN", question: "Explain this topic in one short paragraph.",
  });
  const ab = ask.body as { answer?: unknown; error?: string; message?: string } | null;
  return {
    wire: label, kg_status: kg.status, ask_status: ask.status, rootId, topic,
    shape: typeof ab?.answer === "string" ? "answer-envelope" : (ab?.error ?? "unknown"),
    answer_chars: typeof ab?.answer === "string" ? (ab.answer as string).length : 0,
    error_message: ab?.error ? ab.message : null,
  };
}

const core = await probeWire(CORE, "core");
const v2 = await probeWire(V2, "v2");
const generationLive =
  core.ask_status === 200 && v2.ask_status === 200 &&
  (v2 as { shape?: string }).shape === "answer-envelope";
const receipt = {
  card: "T-MIG-097", receipt: "run-004-generation-probe", lane: "r7a",
  created_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  operator_trace: "1a119df7d930b609 (stage 5: post-enablement generation rider probe)",
  law: "LLM-dependent surfaces are NEVER golden-gated — status + envelope shape only; anchors are learner-scoped and differ per wire by design",
  core, v2, generation_live: generationLive,
  verdict: generationLive ? "GENERATION LIVE ON BOTH WIRES" : "NOT-LIVE (see statuses — 503 = dormant seam still served; 400/404 = anchor resolution issue; filed, never auto-fixed)",
};
await Bun.write(OUT, JSON.stringify(receipt, null, 1) + "\n");
console.log(JSON.stringify(receipt, null, 1));
