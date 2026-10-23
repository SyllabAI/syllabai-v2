"use client";

/**
 * Teaching Toolkit hub (T-TEACH-013) — the class picker + per-class history
 * over /teacher/toolkit. THE OPERATOR DIRECTIVE made visible: no subject
 * picker exists anywhere on this surface — picking a class renders the
 * server-resolved Subject · Board · Level · Curriculum chips instead, and
 * every tool deep-link carries just ?class=<id>.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardCheck,
  GraduationCap,
  Loader2,
  Map,
  Sparkles,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TeacherNav } from "@/components/teacher/teacher-nav";
import { TOOLKIT_TOOLS, toolkitToolMeta } from "@/components/teaching-toolkit/presets";
import { api, ApiError } from "@/lib/api";
import type {
  ToolkitClassContextView,
  ToolkitQuotaView,
  ToolkitResourceSummaryView,
} from "@/lib/types";

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** the history row's one-line label: the topic the tool ran on */
function resourceLabel(row: ToolkitResourceSummaryView): string {
  const data = (row.input?.data ?? {}) as Record<string, unknown>;
  const topic = typeof data.topic === "string" ? data.topic : null;
  if (topic) return topic;
  const text = typeof data.inputText === "string" ? data.inputText : null;
  if (text) return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  return "(no topic recorded)";
}

const toolIcon = (id: string) =>
  id === "lesson-plan" ? BookOpenCheck : id === "rubric" ? ClipboardCheck : id === "sow" ? Map : GraduationCap;

function ContextChips({ context }: { context: ToolkitClassContextView }) {
  const chips: Array<[string, string | null]> = [
    ["Class", context.classLabel],
    ["Subject", context.subject],
    ["Board", context.board],
    ["Level", context.level],
    ["Curriculum", context.curriculumCode],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips
        .filter(([, v]) => v !== null && v !== "")
        .map(([label, v]) => (
          <Badge key={label} variant="secondary" className="gap-1 font-normal">
            <span className="text-muted-foreground">{label}:</span>
            <span className="font-medium">{v}</span>
          </Badge>
        ))}
    </div>
  );
}

function QuotaBadge({ quota }: { quota: ToolkitQuotaView | null }) {
  if (!quota) return null;
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Sparkles className="size-3" aria-hidden />
      {quota.used} / {quota.limit} today
    </Badge>
  );
}

export function ToolkitClient({
  initialClassId,
  initialResourceId,
}: {
  initialClassId: string | null;
  initialResourceId: string | null;
}) {
  const router = useRouter();
  const [classes, setClasses] = useState<{
    rows: Array<{ id: string; name: string; courseLabel: string; status: string }> | null;
    error?: string;
  }>({ rows: null });
  const [classId, setClassId] = useState<string | null>(initialClassId);
  const [context, setContext] = useState<ToolkitClassContextView | null>(null);
  const [quota, setQuota] = useState<ToolkitQuotaView | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [history, setHistory] = useState<ToolkitResourceSummaryView[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [detailNote, setDetailNote] = useState<string | null>(
    initialResourceId ? `Opening resource ${initialResourceId}…` : null,
  );

  // the live rosters — a failed load degrades to an honest error, never a
  // fake class list (the V51 law)
  useEffect(() => {
    let cancelled = false;
    api
      .teacherClasses()
      .then((rows) => {
        if (!cancelled) setClasses({ rows });
      })
      .catch((err: unknown) => {
        if (!cancelled) setClasses({ rows: null, error: apiMessage(err, "Classes are unavailable right now.") });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadClassData = useCallback(async (cid: string) => {
    setContextError(null);
    setHistoryError(null);
    setContext(null);
    setHistory(null);
    try {
      const ctx = await api.teacherToolkitContext(cid);
      setContext(ctx.context);
      setQuota(ctx.quota);
    } catch (err: unknown) {
      setContextError(apiMessage(err, "The class context is unavailable right now."));
    }
    try {
      setHistory(await api.teacherToolkitResources({ limit: 20, classId: cid }));
    } catch (err: unknown) {
      setHistoryError(apiMessage(err, "The generation history is unavailable right now."));
    }
  }, []);

  useEffect(() => {
    if (!classId) return;
    void loadClassData(classId);
  }, [classId, loadClassData]);

  // ?resourceId= deep link → route to the owning tool page
  useEffect(() => {
    if (!initialResourceId || !history || classes.rows === null) return;
    const row = history.find((r) => r.id === initialResourceId);
    if (row) {
      router.replace(
        `/teacher/toolkit/${row.toolType}?class=${row.classId ?? ""}&resourceId=${row.id}`,
      );
      return;
    }
    setDetailNote(null);
  }, [initialResourceId, history, classes.rows, router]);

  const pickClass = (id: string) => {
    setClassId(id);
    setDetailNote(null);
    window.history.replaceState(null, "", `/teacher/toolkit?class=${id}`);
  };

  const picked = classes.rows?.find((c) => c.id === classId) ?? null;

  return (
    <div className="space-y-6">
      <TeacherNav />

      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Teaching Toolkit
          </h1>
          <Badge variant="outline" className="text-[10px] font-normal">
            Phase 3
          </Badge>
          <QuotaBadge quota={quota} />
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Four AI generators that work <em>from your classes</em>: pick a class and its subject,
          board and level are resolved for you — every document is grounded in that course&apos;s
          curriculum. Generated drafts are a first pass: review before classroom use.
        </p>
      </header>

      {/* class picker — the subject picker's replacement */}
      <section aria-label="Class" className="space-y-2">
        {classes.rows === null && !classes.error ? (
          <Skeleton className="h-10 w-full max-w-sm" />
        ) : classes.error ? (
          <Alert variant="destructive">
            <AlertTitle>Classes unavailable</AlertTitle>
            <AlertDescription>{classes.error}</AlertDescription>
          </Alert>
        ) : (classes.rows?.length ?? 0) === 0 ? (
          <div className="max-w-3xl rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No classes yet — the toolkit resolves everything from a class you teach.{" "}
              <Link href="/teacher/classes" className="underline underline-offset-2">
                Create your first class
              </Link>{" "}
              to unlock it.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={classId ?? undefined} onValueChange={pickClass}>
              <SelectTrigger className="w-full max-w-xs bg-card">
                <SelectValue placeholder="Pick a class to work from…" />
              </SelectTrigger>
              <SelectContent>
                {classes.rows!.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.courseLabel}
                    {c.status !== "active" ? " (archived)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {picked && context && <ContextChips context={context} />}
          </div>
        )}
      </section>

      {contextError && (
        <Alert variant="destructive">
          <AlertTitle>Context failed to load</AlertTitle>
          <AlertDescription>{contextError}</AlertDescription>
        </Alert>
      )}

      {/* the four tools — gated on a picked class */}
      {classId && (
        <section aria-labelledby="toolkit-tools" className="space-y-3">
          <h2 id="toolkit-tools" className="text-sm font-semibold">
            Generate for {picked?.name ?? "this class"}
            {context?.subject ? ` · ${context.subject}` : ""}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLKIT_TOOLS.map((t) => {
              const Icon = toolIcon(t.id);
              return (
                <Card key={t.id} className="py-0 transition-shadow hover:shadow-md">
                  <CardContent className="p-5">
                    <span
                      className="flex size-9 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${t.color}1a` }}
                    >
                      <Icon className="size-4" style={{ color: t.color }} aria-hidden />
                    </span>
                    <h3 className="mt-3 text-sm font-semibold">{t.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {t.subtitle}
                    </p>
                    <Button asChild size="sm" variant="outline" className="mt-3 gap-1.5">
                      <Link href={`/teacher/toolkit/${t.id}?class=${classId}`}>
                        Open
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* per-class history */}
      {classId && (
        <section aria-labelledby="toolkit-history" className="space-y-3">
          <h2 id="toolkit-history" className="text-sm font-semibold">
            My generated resources
          </h2>
          {historyError ? (
            <Alert variant="destructive">
              <AlertTitle>History unavailable</AlertTitle>
              <AlertDescription>{historyError}</AlertDescription>
            </Alert>
          ) : history === null ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing generated for this class yet — open a tool above to make the first one.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              {history.map((row, i) => {
                const meta = toolkitToolMeta(row.toolType);
                const Icon = toolIcon(row.toolType);
                return (
                  <Link
                    key={row.id}
                    href={`/teacher/toolkit/${row.toolType}?class=${row.classId ?? ""}&resourceId=${row.id}`}
                    className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60 ${i > 0 ? "border-t" : ""}`}
                  >
                    <Icon className="size-4 shrink-0" style={{ color: meta?.color }} aria-hidden />
                    <span className="font-medium">{meta?.title ?? row.toolType}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {resourceLabel(row)}
                    </span>
                    {row.status === "FAILED" && (
                      <Badge variant="destructive" className="shrink-0 text-[10px] font-normal">
                        failed
                      </Badge>
                    )}
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {new Date(row.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {detailNote && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {detailNote}
        </div>
      )}
    </div>
  );
}
