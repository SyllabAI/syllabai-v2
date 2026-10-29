"use client";

/**
 * Teaching Toolkit tool page (T-TEACH-014) — one client family,
 * tool-differentiated: the form body swaps per tool, everything else (context
 * chips, staged progress, result renderers, history strip) is shared.
 *
 * The no-subject law, again: the header renders the server-resolved
 * Subject · Board · Level · Curriculum chips — there is no subject input on
 * this page. The topic picker + the tool's own fields are the only inputs.
 *
 * Generation is SYNCHRONOUS (the smart-mark posture: LLM-in-request) and
 * takes ~10–25 s for a document — the staged progress strings keep the wait
 * honest (ZNotes' pending → processing → success UX, without the polling).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TeacherNav } from "@/components/teacher/teacher-nav";
import {
  CoachForm,
  LessonPlanForm,
  RubricForm,
  SowForm,
  TopicPicker,
} from "@/components/teaching-toolkit/forms";
import { ExportBar } from "@/components/teaching-toolkit/exports";
import {
  CoachView,
  LessonPlanView,
  RubricView,
  SowView,
} from "@/components/teaching-toolkit/renderers";
import {
  toolkitToolMeta,
  type CoachFormData,
  type LessonPlanFormData,
  type RubricFormData,
  type SowFormData,
  type ToolkitToolId,
} from "@/components/teaching-toolkit/presets";
import { api, ApiError } from "@/lib/api";
import type {
  ToolkitContextView,
  ToolkitGenerateResultView,
  ToolkitOutcomeView,
  ToolkitPassageView,
  ToolkitQuotaView,
  ToolkitResourceSummaryView,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const DEFAULT_LESSON_PLAN: LessonPlanFormData = {
  topic: "",
  duration: 45,
  learningObjectives: [],
  homework: "Yes",
  teachingStyle: null,
  studentAbility: null,
};
const DEFAULT_RUBRIC: RubricFormData = {
  topic: "",
  assignmentType: "Essay",
  assessmentType: "Summative Assessment",
  taskDescription: "",
  marksPerCriterion: 8,
  criteria: ["Knowledge & Understanding", "Accuracy"],
};
const DEFAULT_SOW: SowFormData = {
  topic: "",
  totalLessons: 2,
  lessonDuration: 60,
  difficultyLevel: "Intermediate",
  emphasisAreas: [],
  userPreferences: null,
};
const DEFAULT_COACH: CoachFormData = { mode: "clarify", audience: "Beginner", inputText: "" };

const STAGES = [
  "Submitting the brief…",
  "Generating the document — typically 10–25 s…",
  "Still working — long documents take a moment more…",
  "Almost there — validating the structure…",
];

function stageFor(elapsedS: number): string {
  if (elapsedS < 3) return STAGES[0]!;
  if (elapsedS < 12) return STAGES[1]!;
  if (elapsedS < 20) return STAGES[2]!;
  return STAGES[3]!;
}

export function ToolkitToolClient({
  tool,
  initialClassId,
  initialResourceId,
}: {
  tool: ToolkitToolId;
  initialClassId: string | null;
  initialResourceId: string | null;
}) {
  const meta = toolkitToolMeta(tool)!;
  const needsTopic = tool !== "coach";

  // ── class + context ────────────────────────────────────────────────────────
  const [classId, setClassId] = useState<string | null>(initialClassId);
  const [classOptions, setClassOptions] = useState<
    Array<{ id: string; name: string; courseLabel: string; status: string }> | null
  >(null);
  const [ctx, setCtx] = useState<ToolkitContextView | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);

  // ── topic + grounding ──────────────────────────────────────────────────────
  const [topicId, setTopicId] = useState<string | null>(null);
  const [freeTopic, setFreeTopic] = useState("");
  const [outcomes, setOutcomes] = useState<ToolkitOutcomeView[] | null>(null);
  const [outcomeSel, setOutcomeSel] = useState<Set<string>>(new Set());
  const [freeObjectives, setFreeObjectives] = useState("");
  // T-TEACH-015 coach note card — the attached passage's label; the textarea
  // stays the single source of truth (the label detaches on edit)
  const [coachPassage, setCoachPassage] = useState<ToolkitPassageView | null>(null);

  // ── forms ──────────────────────────────────────────────────────────────────
  const [lessonPlan, setLessonPlan] = useState<LessonPlanFormData>(DEFAULT_LESSON_PLAN);
  const [rubric, setRubric] = useState<RubricFormData>(DEFAULT_RUBRIC);
  const [sow, setSow] = useState<SowFormData>(DEFAULT_SOW);
  const [coach, setCoach] = useState<CoachFormData>(DEFAULT_COACH);
  const [formError, setFormError] = useState<string | null>(null);

  // ── generation + result ────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<ToolkitGenerateResultView | null>(null);
  const [quota, setQuota] = useState<ToolkitQuotaView | null>(null);
  const [history, setHistory] = useState<ToolkitResourceSummaryView[] | null>(null);
  const detailNote = useRef(initialResourceId);

  // the class options (mini picker when deep-linked without ?class=)
  useEffect(() => {
    if (classId) return;
    let cancelled = false;
    api
      .teacherClasses()
      .then((rows) => {
        if (!cancelled) setClassOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setClassOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  // context (chips + quota + topics); for lesson-plan a picked topic also
  // resolves its auto-attachable outcomes — the verbatim grounding law
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    setCtxError(null);
    api
      .teacherToolkitContext(classId, needsTopic && topicId ? topicId : undefined)
      .then((payload) => {
        if (cancelled) return;
        setCtx(payload);
        setQuota(payload.quota);
        if (payload.outcomes) {
          setOutcomes(payload.outcomes);
          setOutcomeSel(new Set(payload.outcomes.map((o) => o.title)));
        } else if (needsTopic && tool === "lesson-plan" && !topicId) {
          setOutcomes(null);
          setOutcomeSel(new Set());
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setCtxError(apiMessage(err, "The class context is unavailable right now."));
      });
    return () => {
      cancelled = true;
    };
  }, [classId, topicId, needsTopic, tool]);

  // a class switch invalidates the grounding surfaces (passages are
  // course-scoped) — the attached label goes with them
  useEffect(() => {
    setCoachPassage(null);
  }, [classId]);

  // per-class history strip (same tool only)
  const loadHistory = useCallback(async () => {
    if (!classId) return;
    try {
      const rows = await api.teacherToolkitResources({ limit: 20, classId });
      setHistory(rows.filter((r) => r.toolType === tool).slice(0, 8));
    } catch {
      setHistory([]); // the strip is decorative — never blocks the form
    }
  }, [classId, tool]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // ?resourceId= deep link → load the stored document into the result view
  useEffect(() => {
    const rid = detailNote.current;
    if (!rid) return;
    detailNote.current = null;
    let cancelled = false;
    api
      .teacherToolkitResource(rid)
      .then((detail) => {
        if (cancelled) return;
        if (detail.toolType !== tool) return;
        setResult({
          resource: detail,
          output: detail.output ?? {},
          elapsedMs: detail.elapsedMs ?? 0,
          model: detail.model ?? "",
          providerName: detail.providerName ?? "",
          quota: quota ?? { used: 0, limit: 0, resetsAt: "" },
        });
      })
      .catch(() => {
        /* a stale/deleted id: the form simply stays empty */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // staged progress clock
  useEffect(() => {
    if (!generating) return;
    setElapsedS(0);
    const started = Date.now();
    const t = setInterval(() => setElapsedS(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [generating]);

  const topics = ctx?.topics ?? [];
  const pickedTopic = topicId ? (topics.find((t) => t.topicId === topicId)?.title ?? "") : freeTopic;

  // T-TEACH-015 — the SOW resume banner: where the class actually IS in the
  // syllabus (teaching_coverage, read-only). "Plan this topic" prefills the
  // free-topic lane — the resume topic is a spec-tree node, and the picker's
  // chapter list is a different lane, so the prefill rides the free text.
  const grounding = ctx?.grounding ?? null;
  const resume = grounding?.sowResume ?? null;
  const sowGroundingBlock = tool === "sow" && grounding ? (
    <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-3">
      <p className="text-xs font-medium">
        Class coverage: {grounding.specPointsTaught} of {grounding.specPointsTotal} spec points marked taught
      </p>
      {resume && (
        <>
          <p className="text-xs text-muted-foreground">
            Next up in the syllabus:{" "}
            <span className="font-medium text-foreground">{resume.specCode}</span> — {resume.specTitle}
            {resume.topicTitle ? ` (in ${resume.topicTitle})` : ""}
          </p>
          {resume.topicTitle && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setTopicId(null);
                setFreeTopic(resume.topicTitle ?? "");
              }}
            >
              Plan this topic
            </Button>
          )}
        </>
      )}
      {grounding.coverageGaps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {grounding.coverageGaps.map((g) => (
            <button
              key={g.topicNodeId}
              onClick={() => {
                setTopicId(null);
                setFreeTopic(g.topicTitle);
              }}
              title={`${g.untaughtCount} of ${g.totalCount} spec points not yet taught`}
              className="rounded-full border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              {g.topicTitle} · {g.untaughtCount}/{g.totalCount} not taught
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const topicBlock = needsTopic ? (
    <TopicPicker
      topics={topics}
      topicId={topicId}
      onTopicId={(id) => setTopicId(id)}
      freeTopic={freeTopic}
      onFreeTopic={setFreeTopic}
    />
  ) : null;

  const effectiveTopic = pickedTopic.trim();

  const validate = (): string | null => {
    if (needsTopic && !effectiveTopic) return "Pick or type a topic first.";
    if (tool === "lesson-plan") {
      const objectives = outcomes
        ? [...outcomeSel]
        : freeObjectives
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
      if (objectives.length === 0) return "Attach or type at least one learning objective.";
      if (objectives.length > 12) return "At most 12 learning objectives.";
    }
    if (tool === "rubric") {
      if (!rubric.taskDescription.trim()) return "Describe the task the rubric assesses.";
      if (rubric.criteria.length === 0) return "Select at least one criterion.";
    }
    if (tool === "coach" && !coach.inputText.trim()) return "Paste the passage for the coach.";
    return null;
  };

  const buildData = (): unknown => {
    if (tool === "lesson-plan") {
      return {
        topic: effectiveTopic,
        duration: lessonPlan.duration,
        learningObjectives: outcomes
          ? outcomeSel.size > 0
            ? outcomes.filter((o) => outcomeSel.has(o.title)).map((o) => o.title)
            : outcomes.map((o) => o.title)
          : freeObjectives
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
        homework: lessonPlan.homework,
        teachingStyle: lessonPlan.teachingStyle,
        studentAbility: lessonPlan.studentAbility,
      };
    }
    if (tool === "rubric") {
      return { ...rubric, topic: effectiveTopic };
    }
    if (tool === "sow") {
      return { ...sow, topic: effectiveTopic };
    }
    return coach;
  };

  const generate = async () => {
    const problem = validate();
    setFormError(problem);
    if (problem || !classId) return;
    setGenerating(true);
    setGenError(null);
    try {
      const payload = await api.teacherToolkitGenerate({
        toolType: tool,
        classId,
        data: buildData(),
      });
      setResult(payload);
      setQuota(payload.quota);
      void loadHistory();
      window.history.replaceState(
        null,
        "",
        `/teacher/toolkit/${tool}?class=${classId}&resourceId=${payload.resource.id}`,
      );
    } catch (err: unknown) {
      setGenError(apiMessage(err, "Generation failed — please try again."));
    } finally {
      setGenerating(false);
    }
  };

  const outputDoc = useMemo(() => result?.output ?? null, [result]);
  const failedResult = result?.resource.status === "FAILED";

  return (
    <div className="space-y-6">
      <TeacherNav />

      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={classId ? `/teacher/toolkit?class=${classId}` : "/teacher/toolkit"}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            ← Toolkit
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {meta.title}
          </h1>
          {quota && (
            <Badge variant="outline" className="gap-1 font-normal">
              {quota.used} / {quota.limit} today
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
        {ctx && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              ["Class", ctx.context.classLabel],
              ["Subject", ctx.context.subject],
              ["Board", ctx.context.board],
              ["Level", ctx.context.level],
              ["Curriculum", ctx.context.curriculumCode],
            ]
              .filter(([, v]) => v !== null && v !== "")
              .map(([label, v]) => (
                <Badge key={label} variant="secondary" className="gap-1 font-normal">
                  <span className="text-muted-foreground">{label}:</span>
                  <span className="font-medium">{v}</span>
                </Badge>
              ))}
          </div>
        )}
      </header>

      {/* class resolution when deep-linked without ?class= */}
      {!classId && (
        <Card>
          <CardContent className="pt-5">
            {classOptions === null ? (
              <Skeleton className="h-10 w-full max-w-sm" />
            ) : classOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No classes yet —{" "}
                <Link href="/teacher/classes" className="underline underline-offset-2">
                  create one
                </Link>{" "}
                to use the toolkit.
              </p>
            ) : (
              <div className="max-w-sm space-y-1.5">
                <Label>Pick the class to ground this document in</Label>
                <Select onValueChange={(v) => setClassId(v)}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Pick a class…" />
                  </SelectTrigger>
                  <SelectContent>
                    {classOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} — {c.courseLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {ctxError && (
        <Alert variant="destructive">
          <AlertTitle>Context failed to load</AlertTitle>
          <AlertDescription>{ctxError}</AlertDescription>
        </Alert>
      )}

      {classId && (
        <Card>
          <CardContent className="pt-5">
            {tool === "lesson-plan" ? (
              <LessonPlanForm
                value={lessonPlan}
                onChange={(patch) => setLessonPlan((v) => ({ ...v, ...patch }))}
                topicId={topicId}
                outcomes={outcomes}
                outcomeSel={outcomeSel}
                onToggleOutcome={(title) =>
                  setOutcomeSel((prev) => {
                    const next = new Set(prev);
                    if (next.has(title)) next.delete(title);
                    else next.add(title);
                    return next;
                  })
                }
                freeObjectives={freeObjectives}
                onFreeObjectives={setFreeObjectives}
              >
                {topicBlock}
              </LessonPlanForm>
            ) : tool === "rubric" ? (
              <RubricForm value={rubric} onChange={(patch) => setRubric((v) => ({ ...v, ...patch }))}>
                {topicBlock}
              </RubricForm>
            ) : tool === "sow" ? (
              <SowForm value={sow} onChange={(patch) => setSow((v) => ({ ...v, ...patch }))}>
                {sowGroundingBlock}
                {topicBlock}
              </SowForm>
            ) : (
              <CoachForm
                value={coach}
                onChange={(patch) => setCoach((v) => ({ ...v, ...patch }))}
                passages={grounding?.passages ?? []}
                attachedTitle={coachPassage?.title ?? null}
                onAttach={(p) => {
                  setCoach((v) => ({ ...v, inputText: p.body }));
                  setCoachPassage(p);
                  setFormError(null);
                }}
                onDetach={() => setCoachPassage(null)}
              />
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={generate} disabled={generating} className="gap-2">
                {generating && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
                {generating ? "Generating…" : result ? "Generate again" : `Generate ${meta.title.split(" ")[0]}`}
              </Button>
              {formError && (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              )}
            </div>
            {generating && (
              <div className="mt-4 rounded-lg border border-dashed p-4" aria-live="polite">
                <p className="text-sm font-medium">{stageFor(elapsedS)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {elapsedS}s elapsed — the document is written in one pass; the page stays open.
                </p>
              </div>
            )}
            {genError && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Generation failed</AlertTitle>
                <AlertDescription>{genError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* the document — data-print-root is the print/PDF plane (T-TEACH-016) */}
      {result && outputDoc && Object.keys(outputDoc).length > 0 && (
        <section aria-label="Generated document" data-print-root className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Generated document</h2>
            <Badge variant="outline" className="text-[10px] font-normal">
              {result.model}
              {result.providerName ? ` · ${result.providerName}` : ""}
            </Badge>
            {result.elapsedMs > 0 && (
              <Badge variant="outline" className="text-[10px] font-normal">
                {(result.elapsedMs / 1000).toFixed(1)}s
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] font-normal">
              AI draft — review before use
            </Badge>
          </div>
          <ExportBar tool={tool} output={outputDoc} />
          {tool === "lesson-plan" && <LessonPlanView out={outputDoc as never} />}
          {tool === "rubric" && <RubricView out={outputDoc as never} />}
          {tool === "sow" && <SowView out={outputDoc as never} />}
          {tool === "coach" && <CoachView out={outputDoc as never} />}
        </section>
      )}

      {result && failedResult && (
        <Alert variant="destructive">
          <AlertTitle>The stored generation failed</AlertTitle>
          <AlertDescription>
            {result.resource.status === "FAILED" && (result as { failureReason?: string }).failureReason
              ? (result as unknown as { failureReason: string }).failureReason
              : "The model output failed validation — generate again."}
          </AlertDescription>
        </Alert>
      )}

      {/* history strip */}
      {classId && history && history.length > 0 && (
        <section aria-labelledby="tool-history" className="space-y-2">
          <h2 id="tool-history" className="text-sm font-semibold">
            Recent {meta.title}s for this class
          </h2>
          <div className="overflow-hidden rounded-lg border">
            {history.map((row, i) => (
              <button
                key={row.id}
                onClick={() => {
                  window.history.replaceState(
                    null,
                    "",
                    `/teacher/toolkit/${tool}?class=${classId}&resourceId=${row.id}`,
                  );
                  void api
                    .teacherToolkitResource(row.id)
                    .then((detail) => {
                      setResult({
                        resource: detail,
                        output: detail.output ?? {},
                        elapsedMs: detail.elapsedMs ?? 0,
                        model: detail.model ?? "",
                        providerName: detail.providerName ?? "",
                        quota: quota ?? { used: 0, limit: 0, resetsAt: "" },
                      });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    })
                    .catch(() => undefined);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/60",
                  i > 0 && "border-t",
                  result?.resource.id === row.id && "bg-muted/40",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {typeof (row.input?.data as Record<string, unknown>)?.topic === "string"
                    ? String((row.input?.data as Record<string, unknown>).topic)
                    : "(stored document)"}
                </span>
                {row.status === "FAILED" && (
                  <Badge variant="destructive" className="shrink-0 text-[10px] font-normal">
                    failed
                  </Badge>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
