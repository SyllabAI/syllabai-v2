"use client";

/**
 * QuestionHistoryPanel — the editor-gated half of the ADR-044 Phase 1
 * per-question edit-history view. Read-only end to end:
 *
 *  - visibility rides identity.capabilities.editor (the additive capability
 *    field the /editor/me bootstrap feeds) — students and signed-out
 *    sessions see the honest "editors only" notice and NEVER fetch;
 *  - data comes exclusively from the capability-gated /api/editor/history
 *    hub route (which re-verifies the forwarded token against the v2 api's
 *    /editor/me of record — the client capability claim is never trusted);
 *  - every verdict renders honestly: typed upstream failures (rate limit /
 *    unreachable / not found), the "unavailable" attribution disclosure,
 *    and the touched/not-touched marking per commit.
 */

import { useCallback, useEffect, useState } from "react";
import { useIdentity, type Identity } from "@/lib/identity";
import { getToken } from "@/lib/api";
import type { QuestionHistoryPayload, BankCommit } from "@/lib/editor-history";

interface PanelQuestion {
  id: string;
  order: number;
  totalMarks: number;
  label: string;
}

interface HistoryErrorBody {
  error?: string;
  detail?: string;
}

type FetchState =
  | { kind: "idle" }
  | { kind: "error"; code: string; detail: string }
  | { kind: "ok"; payload: QuestionHistoryPayload };

function editorCapabilityOf(identity: Identity | null): boolean {
  return identity?.capabilities?.editor != null;
}

function sha7(sha: string): string {
  return sha.slice(0, 7);
}

function dateOf(commit: BankCommit): string {
  if (!commit.date) return "—";
  try {
    return new Date(commit.date).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export function QuestionHistoryPanel({
  course,
  topicSlug,
  questions,
}: {
  course: string;
  topicSlug: string;
  questions: PanelQuestion[];
}) {
  const identity = useIdentity();
  const isEditor = editorCapabilityOf(identity);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<FetchState>({ kind: "idle" });

  const fetchHistory = useCallback(
    async (questionId: string | null) => {
      // every setState happens AFTER an await boundary (the set-state-in-
      // effect law) — the "loading" verdict is the idle kind until settle
      const params = new URLSearchParams({ course, topic: topicSlug });
      if (questionId) params.set("q", questionId);
      try {
        const token = getToken();
        const res = await fetch(`/api/editor/history?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const payload = (await res.json()) as QuestionHistoryPayload;
          setState({ kind: "ok", payload });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as HistoryErrorBody;
        setState({
          kind: "error",
          code: body.error ?? `status_${res.status}`,
          detail: body.detail ?? `the history route returned ${res.status}`,
        });
      } catch (e) {
        setState({
          kind: "error",
          code: "network_error",
          detail: e instanceof Error ? e.message : "the history fetch failed",
        });
      }
    },
    [course, topicSlug],
  );

  // the identity-gated law: no fetch at all without the capability
  useEffect(() => {
    if (!isEditor) return;
    // every fetchHistory setState lands in an async continuation after the
    // first await — the rule cannot see through the useCallback boundary
    // (same class as the learner client's course-switch reset disable)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchHistory(selectedId);
  }, [isEditor, selectedId, fetchHistory]);

  if (!isEditor) {
    return (
      <section className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Editors only</p>
        <p className="mt-1">
          The per-question edit history is the editor plane&apos;s provenance surface (ADR-044).
          Signed-in accounts hold it through an editor grant issued by the operator; ask the
          operator if you need one.
        </p>
      </section>
    );
  }

  const selected = questions.find((q) => q.id === selectedId) ?? null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className={`rounded-lg border px-3 py-1.5 ${
            selectedId === null ? "bg-primary text-primary-foreground" : "bg-muted/40"
          }`}
        >
          Whole set
        </button>
        {questions.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => setSelectedId(q.id)}
            className={`rounded-lg border px-3 py-1.5 ${
              selectedId === q.id ? "bg-primary text-primary-foreground" : "bg-muted/40"
            }`}
            title={q.label}
          >
            Q{q.order + 1} · {q.totalMarks} marks
          </button>
        ))}
      </div>

      {state.kind === "idle" && (
        <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          Reading the corpus git history…
        </p>
      )}

      {state.kind === "error" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">
            History unavailable — {state.code}
          </p>
          <p className="mt-1 text-muted-foreground">{state.detail}</p>
        </div>
      )}

      {state.kind === "ok" && <HistoryResult payload={state.payload} selected={selected} />}
    </section>
  );
}

function HistoryResult({
  payload,
  selected,
}: {
  payload: QuestionHistoryPayload;
  selected: PanelQuestion | null;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-4 text-sm">
        <p>
          <span className="font-medium">Bank path of record:</span>{" "}
          <code className="break-all text-xs">{payload.bank.path}</code>{" "}
          <span className="text-muted-foreground">({payload.bank.kind} bank)</span>
        </p>
        {payload.anchor && (
          <p className="mt-1 text-muted-foreground">
            Anchored at lines {payload.anchor.startLine}–{payload.anchor.endLine} (
            {payload.anchor.heading})
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{payload.disclosure}</p>
      </div>

      {payload.commits.length === 0 && (
        <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          No commits of record for this bank path.
        </p>
      )}

      <ul className="space-y-2">
        {payload.commits.map((c) => (
          <li key={c.sha} className="rounded-xl border p-4 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs underline decoration-dotted"
              >
                {sha7(c.sha)}
              </a>
              <span className="text-muted-foreground">{dateOf(c)}</span>
              <span className="text-muted-foreground">{c.author ?? "unknown author"}</span>
              {payload.questionId !== null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    c.touched
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {c.touched
                    ? c.patchUnavailable
                      ? `whole-file event${c.fileStatus ? ` (${c.fileStatus})` : ""} — per-hunk attribution unavailable`
                      : "touched this question"
                    : "other region"}
                </span>
              )}
            </div>
            <p className="mt-1 break-words">{c.message}</p>
            {c.touched && c.hunks.length > 0 && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                hunks:{" "}
                {c.hunks.map((h) => `+${h.newStart}${h.newLines ? `,${h.newLines}` : ""}`).join("  ")}
              </p>
            )}
          </li>
        ))}
      </ul>

      {selected && (
        <p className="text-xs text-muted-foreground">
          Viewing per-question history for Q{selected.order + 1}. Nothing here is editable —
          edits arrive through the ADR-044 proposal pipeline (Phase 2), never directly.
        </p>
      )}
    </div>
  );
}
