"use client";

/**
 * Seneca resource pack player (T-SENECA-001) — the learner side of the
 * assignment creator's "Seneca resources" option. Renders the pack's
 * ordered tasks inline in the Assignments tab:
 *   - notes (courseSection)  → markdown + "Mark as studied"
 *   - exam questions         → the instantiated question, marks entry
 *                              against the revealable mark scheme
 *   - quizzes                → the quiz summary + "Mark as done"
 *
 * LAWS:
 *   - Completion is SERVER-scored (exam questions clamp marks into
 *     0..marksTotal; sections/quizzes complete at full credit) — the same
 *     deliberate contrast to Seneca's client-computed mastery the corpus
 *     recon pinned. Re-completion allowed; latest wins.
 *   - $var templates instantiate CLIENT-side (D8 of the plan of record):
 *     the API never evals corpus generation scripts; this browser does,
 *     exactly like Seneca's own player.
 *   - The hand-in itself stays the EXISTING submissions endpoint — the tab
 *     derives (questionsCompleted, score) from myStates and hands in; a
 *     hand-in is completion evidence only, never mastery.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { api, ApiError } from "@/lib/api";
import type {
  AssignmentPackLearnerView,
  AssignmentPackTask,
  AssignmentPackTaskState,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Seneca's $var templating: run the corpus generationScript (a tiny random-
 * value program), then substitute $name placeholders. The names are the
 * script's assigned identifiers; a failure degrades to the bare template
 * with the $names visible (honest, never fabricated numbers).
 */
export function instantiatePackQuestion(
  questionMd: string | null,
  generationScript: string | null,
): string {
  const md = questionMd ?? "";
  if (!generationScript) return md.replace(/\$(\w+)/g, "$1");
  const names = [
    ...new Set([...generationScript.matchAll(/([A-Za-z_]\w*)\s*=(?!=)/g)].map((m) => m[1])),
  ];
  const pick = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
  try {
    const fn = new Function("pick", `"use strict";${generationScript}; return {${names.join(",")}};`);
    const vars = fn(pick) as Record<string, unknown>;
    return md.replace(/\$(\w+)/g, (m, name: string) =>
      name in vars ? String(vars[name]) : m,
    );
  } catch {
    return md.replace(/\$(\w+)/g, "$1");
  }
}

function stateOf(states: AssignmentPackTaskState[], resourceId: string) {
  return states.find((s) => s.resourceId === resourceId) ?? null;
}

function TaskCard({
  task,
  state,
  busy,
  closed,
  onComplete,
}: {
  task: AssignmentPackTask;
  state: AssignmentPackTaskState | null;
  busy: boolean;
  closed: boolean;
  onComplete: (task: AssignmentPackTask, marksAwarded: number | null) => void;
}) {
  const [open, setOpen] = useState(state?.status === "complete");
  const [marks, setMarks] = useState<string>(state?.marksAwarded != null ? String(state.marksAwarded) : "");
  const [showScheme, setShowScheme] = useState(false);
  const questionMd = useMemo(
    () => instantiatePackQuestion(task.questionMd, task.generationScript),
    [task.questionMd, task.generationScript],
  );
  const done = state?.status === "complete";

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        done && "border-primary/40 bg-primary/5",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
            done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {done ? "✓" : task.position}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {task.title ?? (task.kind === "examQuestion" ? "Exam question" : task.kind === "quiz" ? "Quiz" : "Study notes")}
          </span>
          {task.topicPath && (
            <span className="block truncate text-[11px] text-muted-foreground">{task.topicPath}</span>
          )}
        </span>
        <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
          {task.kind === "courseSection" ? "notes" : task.kind === "quiz" ? "quiz" : "exam q"}
        </Badge>
        {task.kind === "examQuestion" && task.marksTotal != null && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {task.marksTotal} mk
          </span>
        )}
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {task.kind === "courseSection" && task.notesMd && (
            <div className="text-sm leading-relaxed">
              <Markdown>{task.notesMd}</Markdown>
            </div>
          )}
          {task.kind === "quiz" && task.quizSummaryMd && (
            <div className="text-sm leading-relaxed">
              <Markdown>{task.quizSummaryMd}</Markdown>
            </div>
          )}
          {task.kind === "examQuestion" && (
            <>
              {questionMd ? (
                <div className="text-sm leading-relaxed">
                  <Markdown>{questionMd}</Markdown>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This question has no rendered body — the teacher preview shows the same honest gap.
                </p>
              )}
              {task.markSchemeMd && (
                <div className="space-y-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setShowScheme((v) => !v)}
                  >
                    {showScheme ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                    {showScheme ? "Hide mark scheme" : "Reveal mark scheme"}
                  </Button>
                  {showScheme && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
                      <Markdown>{task.markSchemeMd}</Markdown>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {task.kind === "examQuestion" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={task.marksTotal ?? 0}
                value={marks}
                disabled={closed}
                onChange={(e) => setMarks(e.target.value)}
                aria-label={`Your marks out of ${task.marksTotal ?? 0}`}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">
                / {task.marksTotal ?? 0} marks
              </span>
              <Button
                size="sm"
                disabled={busy || closed || marks === ""}
                onClick={() => onComplete(task, Math.max(0, Math.round(Number(marks) || 0)))}
                className="gap-1.5"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
                {done ? "Update marks" : "Submit marks"}
              </Button>
              {done && state?.marksAwarded != null && (
                <span className="text-xs text-muted-foreground">
                  recorded {state.marksAwarded}/{task.marksTotal ?? 0}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={done ? "outline" : "default"}
                disabled={busy || closed}
                onClick={() => onComplete(task, null)}
                className="gap-1.5"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
                {done ? "Done — update" : "Mark as done"}
              </Button>
              {done && <span className="text-xs text-muted-foreground">recorded complete</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PackPlayer({
  pack,
  busyTaskId,
  error,
  onTaskComplete,
}: {
  pack: AssignmentPackLearnerView;
  busyTaskId: string | null;
  error: string | null;
  onTaskComplete: (task: AssignmentPackTask, marksAwarded: number | null) => void;
}) {
  const doneCount = pack.myStates.filter((s) => s.status === "complete").length;
  const marksRecorded = pack.myStates.reduce((a, s) => a + (s.marksAwarded ?? 0), 0);
  const closed = pack.status === "closed";

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">
          Resource pack — {doneCount}/{pack.tasks.length} tasks done
          {marksRecorded > 0 && ` · ${marksRecorded}/${pack.marksTotal} marks recorded`}
        </p>
        <Badge variant="secondary" className="text-[10px] font-normal">
          Seneca resources · {pack.courseLabel}
        </Badge>
      </div>
      {closed && (
        <p className="text-[11px] text-muted-foreground">
          This assignment is closed — no new completions. Your recorded work stays on your account.
        </p>
      )}
      {error && (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {pack.tasks.map((task) => (
          <TaskCard
            key={task.resourceId}
            task={task}
            state={stateOf(pack.myStates, task.resourceId)}
            busy={busyTaskId === task.resourceId}
            closed={closed}
            onComplete={onTaskComplete}
          />
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Completion is recorded on your SyllabAI account (server-side scored — exam-question marks
        are clamped into the question's mark band). Hand in from the button below; it is completion
        evidence only and never writes mastery.
      </p>
    </div>
  );
}
