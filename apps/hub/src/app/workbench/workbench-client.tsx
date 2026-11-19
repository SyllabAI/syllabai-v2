"use client";

/**
 * The Editor Workbench — ADR-044 §9 (run-011, Phase 2 MVP, Tier 1 only).
 *
 * Identity-gated end to end (the teacher-store client law): the app shell's
 * capability probe (useEditorCapabilitySync) is the ONE /editor-plane
 * contact a signed-in session makes; this surface renders ONLY when the
 * settled capability carries the "workbench" scope. Students and signed-out
 * sessions get an honest closed notice — they never contact the plane.
 *
 * The golden path of record (the acceptance script, ADR §9): act as an
 * editor → open a bank → repair a field → watch pre-flight type the gates
 * (the SHARED engine, client-side — the single-module law) → propose → see
 * Tier 1 advance with a receipt in the journal. A content-bearing edit
 * lands in the disclosed queued_review state (the Tier 2 queue is Phase 3
 * negative space); a structural edit is refused with G-SCOPE's hand-off.
 *
 * THE PHASE 2 DISCLOSURE (pinned verbatim in the contracts module): the
 * merge transport is SIMULATED — a "merged" proposal is recorded in the
 * journal, no corpus byte moves, and nothing user-visible changes until
 * Phase 3 wires the real GitHub PR path + census-guard serve. The banner
 * below is that disclosure, in the product, always visible.
 *
 * Rendering law: the served artifact renders through the production
 * Markdown primitive — never a re-implementation (ADR §9). The structured
 * edit mode operates over canonical fields only; the delta's "before" is
 * always the served value (the served artifact is the base of record).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiPath, getToken } from "@/lib/api";
import { useIdentity } from "@/lib/identity";
import { Markdown } from "@/components/markdown";
import { runPreflight, type FieldDelta, type PreflightVerdict } from "@syllabai/editor-gates";
import { EDITOR_PHASE2_MERGE_DISCLOSURE } from "@syllabai/shared";
import type { ExamQuestion } from "@/lib/contracts";
import { baseCtxOf, deltaFromEdits, editableFields, hasEdits, type WorkbenchField } from "@/lib/workbench/fields";

// ── the wire types (mirrors of the contracts schemas the api serves) ─────────

interface BankInventory {
  headSha: string;
  fetchedAt: string;
  truncated?: boolean;
  disclosure: string;
  courses: Array<{ slug: string; counts: { questions: number; notes: number; flashcards: number } }>;
}

interface SetList {
  course: string;
  sets: Array<{ slug: string; name: string; section: string; count: number }>;
}

interface SetQuestions {
  course: string;
  topic: string;
  setName: string;
  bankPath: string | null;
  bankKind: string | null;
  questions: Array<{ id: string; order: number; marks: number; style: string | null; parts: number }>;
}

interface QuestionArtifact {
  course: string;
  topic: string;
  setName: string;
  bankPath: string | null;
  bankKind: string | null;
  /** the served question of record (the zod-parsed ExamQuestion the hub
   * serves — the render/edit base, ADR §6 step 1) */
  question: ExamQuestion;
  baseCtx: { partCount: number; choiceLabels: Record<string, string[]> };
  disclosure: string;
}

interface ProposalRow {
  id: string;
  courseSlug: string;
  bank: string;
  targetPath: string;
  tier: number;
  state: string;
  baseSha: string;
  proposalPr: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReceiptRow {
  id: string;
  action: string;
  beforeHash: string | null;
  afterHash: string | null;
  gateRunId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

type View = "banks" | "sets" | "question" | "journal";

// ── the typed fetch helper (Bearer always attached; errors surface) ──────────

async function apiGet<T>(path: string, base?: string): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("signed out");
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const token = getToken();
  if (!token) throw new Error("signed out");
  const res = await fetch(apiPath(path), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T & { message?: string } | null;
  return { status: res.status, data: data as T };
}

const STATE_STYLES: Record<string, string> = {
  merged: "bg-emerald-100 text-emerald-800",
  queued_review: "bg-amber-100 text-amber-800",
  preflight_failed: "bg-rose-100 text-rose-800",
  draft: "bg-slate-200 text-slate-700",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  superseded: "bg-slate-200 text-slate-500",
};

export function WorkbenchClient() {
  const identity = useIdentity();
  const scopes = identity?.capabilities?.editor?.scopes ?? null;
  const gated = !identity || !scopes || !scopes.includes("workbench");

  const [view, setView] = useState<View>("banks");
  const [banks, setBanks] = useState<BankInventory | null>(null);
  const [course, setCourse] = useState<string | null>(null);
  const [sets, setSets] = useState<SetList | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [setQs, setSetQs] = useState<SetQuestions | null>(null);
  const [artifact, setArtifact] = useState<QuestionArtifact | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [verdict, setVerdict] = useState<PreflightVerdict | null>(null);
  const [outcome, setOutcome] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [proposals, setProposals] = useState<ProposalRow[] | null>(null);
  const [openReceipts, setOpenReceipts] = useState<Record<string, ReceiptRow[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── data loads ─────────────────────────────────────────────────────────────
  const loadBanks = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setBanks(await apiGet<BankInventory>("/api/v1/editor/banks", apiPath("")));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSets = useCallback(async (slug: string) => {
    setBusy(true);
    setError(null);
    try {
      setSets(await apiGet<SetList>(`/api/editor/bank?course=${slug}`));
      setView("sets");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSet = useCallback(async (slug: string, topicSlug: string) => {
    setBusy(true);
    setError(null);
    try {
      setSetQs(await apiGet<SetQuestions>(`/api/editor/bank?course=${slug}&topic=${topicSlug}`));
      setTopic(topicSlug);
      setView("question");
      setArtifact(null);
      setEdits({});
      setVerdict(null);
      setOutcome(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadArtifact = useCallback(async (slug: string, topicSlug: string, qid: string) => {
    setBusy(true);
    setError(null);
    try {
      setArtifact(await apiGet<QuestionArtifact>(`/api/editor/bank?course=${slug}&topic=${topicSlug}&q=${qid}`));
      setEdits({});
      setVerdict(null);
      setOutcome(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadJournal = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const body = await apiGet<{ proposals: ProposalRow[] }>(apiPath("/api/v1/editor/proposals"));
      setProposals(body.proposals);
      setView("journal");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!gated && view === "banks" && !banks) void loadBanks();
  }, [gated, view, banks, loadBanks]);

  // ── the edit surface ───────────────────────────────────────────────────────
  const fields: WorkbenchField[] = useMemo(() => (artifact ? editableFields(artifact.question) : []), [artifact]);
  const delta: FieldDelta[] = useMemo(() => (artifact ? deltaFromEdits(artifact.question, edits) : []), [artifact, edits]);

  const runClientPreflight = useCallback(() => {
    if (!artifact) return;
    setOutcome(null);
    setVerdict(
      runPreflight({
        bank: "questions",
        targetPath: artifact.bankPath ?? `${artifact.course}/questions.md`,
        fields: delta,
        baseCtx: artifact.baseCtx,
      }),
    );
  }, [artifact, delta]);

  const propose = useCallback(async () => {
    if (!artifact || delta.length === 0) return;
    setBusy(true);
    setOutcome(null);
    try {
      const headSha = banks?.headSha;
      const { status, data } = await apiPost<
        { proposal?: ProposalRow; disclosure?: string; message?: string } & { verdict?: PreflightVerdict }
      >("/api/v1/editor/proposals", {
        bank: "questions",
        targetPath: artifact.bankPath ?? `${artifact.course}/questions.md`,
        fields: delta,
        baseCtx: baseCtxOf(artifact.question),
        baseSha: headSha ?? "unknown-head",
      });
      if (status === 201 && data.proposal) {
        setOutcome({
          kind: "ok",
          text: `Proposal carried as "${data.proposal.state}" (tier ${data.proposal.tier}). ${data.disclosure ?? ""}`,
        });
        setVerdict(data.verdict ?? null);
      } else if (status === 422 && data.message?.includes("tier 3")) {
        setOutcome({ kind: "err", text: `Refused (Tier 3, structural): ${data.message}` });
        setVerdict(null);
      } else {
        setOutcome({ kind: "err", text: data.message ?? `The proposal was refused (HTTP ${status}).` });
      }
      setEdits({});
    } catch (e) {
      setOutcome({ kind: "err", text: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(false);
    }
  }, [artifact, delta, banks]);

  const loadReceipts = useCallback(async (id: string) => {
    if (openReceipts[id]) {
      setOpenReceipts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const body = await apiGet<{ receipts: ReceiptRow[] }>(apiPath(`/api/v1/editor/proposals/${id}/receipts`));
      setOpenReceipts((prev) => ({ ...prev, [id]: body.receipts }));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, [openReceipts]);

  // ── the gate renders ───────────────────────────────────────────────────────
  if (!identity) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Editor Workbench</h1>
        <p className="mt-3 text-slate-600">
          This surface is identity-gated. <Link className="text-indigo-600 underline" href="/login">Sign in</Link> to
          continue — the editor plane is never contacted from a signed-out session.
        </p>
      </main>
    );
  }
  if (gated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Editor Workbench</h1>
        <p className="mt-3 text-slate-600">
          Your account does not hold an editor grant, so the Workbench stays closed (fail-closed, ADR-044 §3 — the
          grant row IS the role). If you believe you should hold one, contact the operator.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Editor Workbench</h1>
        <nav className="flex gap-2 text-sm">
          <button className="rounded-lg border px-3 py-1.5 hover:bg-slate-50" onClick={() => { setView("banks"); void loadBanks(); }}>
            Banks
          </button>
          <button className="rounded-lg border px-3 py-1.5 hover:bg-slate-50" onClick={() => void loadJournal()}>
            Journal
          </button>
        </nav>
      </div>

      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Phase 2 disclosure:</strong> {EDITOR_PHASE2_MERGE_DISCLOSURE}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>
      )}
      {busy && <p className="mt-3 text-sm text-slate-500">Working…</p>}

      {/* ── banks ─────────────────────────────────────────────────────────── */}
      {view === "banks" && banks && (
        <section className="mt-6">
          <p className="text-sm text-slate-600">
            Corpus of record at HEAD <code className="rounded bg-slate-100 px-1">{banks.headSha.slice(0, 12)}</code>
            {" · "}fetched {new Date(banks.fetchedAt).toLocaleString()}
            {banks.truncated ? " · tree truncated (counts partial)" : ""}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {banks.courses.map((c) => (
              <button
                key={c.slug}
                className="rounded-xl border p-4 text-left hover:border-indigo-400 hover:bg-indigo-50/40"
                onClick={() => { setCourse(c.slug); void loadSets(c.slug); }}
              >
                <p className="font-medium">{c.slug}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {c.counts.questions} question sets · {c.counts.notes} notes · {c.counts.flashcards} decks
                </p>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">{banks.disclosure}</p>
        </section>
      )}

      {/* ── sets ──────────────────────────────────────────────────────────── */}
      {view === "sets" && sets && (
        <section className="mt-6">
          <p className="text-sm text-slate-600">
            Course <strong>{sets.course}</strong> · {sets.sets.length} question sets
          </p>
          <ul className="mt-4 space-y-2">
            {sets.sets.map((s) => (
              <li key={s.slug}>
                <button
                  className="w-full rounded-xl border p-3 text-left hover:border-indigo-400 hover:bg-indigo-50/40"
                  onClick={() => void loadSet(sets.course, s.slug)}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-sm text-slate-500">{s.section} · {s.count} questions</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── question view + structured edit ───────────────────────────────── */}
      {view === "question" && (
        <section className="mt-6">
          {!artifact && setQs && (
            <>
              <p className="text-sm text-slate-600">
                Set <strong>{setQs.setName}</strong>
                {setQs.bankPath && (
                  <>
                    {" · "}bank path <code className="rounded bg-slate-100 px-1">{setQs.bankPath}</code>
                  </>
                )}
              </p>
              <ul className="mt-4 space-y-2">
                {setQs.questions.map((q) => (
                  <li key={q.id}>
                    <button
                      className="w-full rounded-xl border p-3 text-left hover:border-indigo-400 hover:bg-indigo-50/40"
                      onClick={() => void loadArtifact(setQs.course, setQs.topic, q.id)}
                    >
                      <span className="font-medium">Q{q.order}</span>
                      <span className="ml-2 text-sm text-slate-500">
                        {q.parts} part{q.parts === 1 ? "" : "s"} · {q.marks} marks{q.style ? ` · ${q.style}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {artifact && (
            <div className="mt-2">
              <button className="text-sm text-indigo-600 underline" onClick={() => setArtifact(null)}>
                ← back to the question list
              </button>
              <p className="mt-2 text-sm text-slate-600">
                {artifact.setName}
                {artifact.bankPath && (
                  <>
                    {" · "}
                    <code className="rounded bg-slate-100 px-1">{artifact.bankPath}</code>
                  </>
                )}
              </p>

              <div className="mt-4 space-y-6">
                {artifact.question.parts.map((p, i) => (
                  <div key={p.id} className="rounded-xl border p-4">
                    <p className="text-sm font-medium text-slate-700">
                      Part {String.fromCharCode(97 + i)} · {p.marks} marks
                      {p.commandWord ? ` · ${p.commandWord}` : ""}
                    </p>
                    <div className="prose prose-sm mt-2 max-w-none">
                      <Markdown>{p.problemMd}</Markdown>
                    </div>
                    {p.choices && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {p.choices.map((c) => (
                          <li key={c.label} className={c.isCorrect ? "font-medium text-emerald-700" : ""}>
                            <span className="mr-1 font-semibold">{c.label}.</span>
                            <Markdown>{c.textMd}</Markdown>
                          </li>
                        ))}
                      </ul>
                    )}
                    {p.solutionMd && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-slate-500">worked answer</summary>
                        <div className="prose prose-sm mt-1 max-w-none">
                          <Markdown>{p.solutionMd}</Markdown>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>

              {/* the structured-edit surface (canonical fields only) */}
              <div className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
                <h2 className="font-medium">Structured edit</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Canonical fields of record; the served value is always the delta&apos;s &quot;before&quot;. Tier 1
                  (typography) auto-advances; token changes go to the Tier 2 queue; structural shapes are refused.
                </p>
                <div className="mt-4 space-y-4">
                  {fields
                    .filter((f) => f.kind === "prose")
                    .map((f) => (
                      <label key={f.path} className="block">
                        <span className="text-sm font-medium text-slate-700">{f.label}</span>
                        <span className="ml-2 font-mono text-xs text-slate-400">{f.path}</span>
                        <textarea
                          className="mt-1 w-full rounded-lg border p-2 font-mono text-xs"
                          rows={3}
                          value={edits[f.path] ?? f.current}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [f.path]: e.target.value }))}
                        />
                      </label>
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    onClick={runClientPreflight}
                    disabled={!hasEdits(artifact.question, edits)}
                  >
                    Pre-flight ({delta.length})
                  </button>
                  <button
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    onClick={() => void propose()}
                    disabled={!hasEdits(artifact.question, edits) || busy}
                  >
                    Propose
                  </button>
                  <button
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-white"
                    onClick={() => { setEdits({}); setVerdict(null); setOutcome(null); }}
                  >
                    Reset
                  </button>
                </div>

                {verdict && (
                  <div className="mt-4 rounded-lg border bg-white p-3 text-sm">
                    <p className="font-medium">
                      Pre-flight verdict:{" "}
                      <span className={verdict.ok ? "text-emerald-700" : "text-rose-700"}>
                        {verdict.ok ? "green" : "refused"}
                      </span>{" "}
                      · tier {verdict.tier ?? "—"}
                    </p>
                    <ul className="mt-1 list-disc text-slate-600">
                      {verdict.tierReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    {verdict.refusals.length > 0 && (
                      <ul className="mt-2 space-y-2">
                        {verdict.refusals.map((r, i) => (
                          <li key={i} className="rounded border border-rose-200 bg-rose-50 p-2">
                            <p className="font-mono text-xs font-semibold text-rose-800">
                              {r.code}{r.field ? ` · ${r.field}` : ""}
                            </p>
                            <p className="text-slate-700">{r.message}</p>
                            <p className="text-slate-500">{r.hint}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    {verdict.warnings.length > 0 && (
                      <ul className="mt-2 list-disc text-amber-800">
                        {verdict.warnings.map((w, i) => (
                          <li key={i}>{w.message}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-xs text-slate-400">{verdict.disclosure}</p>
                  </div>
                )}

                {outcome && (
                  <div
                    className={`mt-4 rounded-lg border p-3 text-sm ${
                      outcome.kind === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-rose-300 bg-rose-50 text-rose-900"
                    }`}
                  >
                    {outcome.text}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── the journal (the user's own proposals + receipts) ─────────────── */}
      {view === "journal" && (
        <section className="mt-6">
          <h2 className="font-medium">Your proposals</h2>
          {!proposals && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
          {proposals && proposals.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">No proposals yet — open a bank and repair a field.</p>
          )}
          <ul className="mt-3 space-y-3">
            {(proposals ?? []).map((p) => (
              <li key={p.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[p.state] ?? "bg-slate-100"}`}>
                    {p.state}
                  </span>
                  <span className="text-xs text-slate-500">tier {p.tier}</span>
                  <code className="text-xs text-slate-400">{p.targetPath}</code>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  base {p.baseSha.slice(0, 12)} · {p.proposalPr ? p.proposalPr : "no PR (simulated transport, Phase 2)"} ·
                  updated {new Date(p.updatedAt).toLocaleString()}
                </p>
                <button className="mt-2 text-sm text-indigo-600 underline" onClick={() => void loadReceipts(p.id)}>
                  {openReceipts[p.id] ? "hide receipts" : "receipts"}
                </button>
                {openReceipts[p.id] && (
                  <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
                    {openReceipts[p.id]!.map((r) => (
                      <li key={r.id} className="text-slate-600">
                        <span className="font-mono font-semibold">{r.action}</span> · gate {r.gateRunId ?? "—"} ·{" "}
                        {r.afterHash ? `after ${r.afterHash.slice(0, 12)}` : "no hash"} ·{" "}
                        {new Date(r.createdAt).toLocaleString()}
                        {r.detail?.["simulatedTransport"] ? " · simulated transport" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
