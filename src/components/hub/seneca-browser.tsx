"use client";

/**
 * SenecaBrowser (T-SENECA-001 Task 42) — read-only browsing of harvested
 * Seneca course content, mirroring how the material presented in Seneca:
 *
 *   - Lessons: the course sections (illustration + notes) with a linear
 *     prev/next flow, like stepping through a Seneca lesson list;
 *   - Exam questions: grouped by their original Seneca topic path
 *     ("Chemistry: Edexcel iGCSE > Bonding > Covalent Bonding"), question
 *     stem rendered from the harvested markdown (with $var instantiation via
 *     the generationScript sandbox) and a revealable mark scheme;
 *   - Quizzes: the harvested quiz summaries (only present on some courses).
 *
 * The full resource list for a course bundle is fetched once from the
 * committed static bundle (/seneca-bundles/<slug>.json) — no API, no DB.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { instantiate } from "@/lib/seneca-instantiate";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  FileQuestion,
  ImageOff,
  ListChecks,
  Search,
} from "lucide-react";

export interface SenecaBundleRef {
  slug: string;
  label: string;
  sections: number;
  questions: number;
}

interface SenecaResource {
  id: string;
  kind: "courseSection" | "examQuestion" | "quiz";
  title: string | null;
  topicPath: string | null;
  marksTotal: number | null;
  questionType: string | null;
  content: {
    imageUrl?: string | null;
    topicNotes?: string | null;
    description?: string | null;
    questionTitleMd?: string | null;
    markScheme?: string | null;
    generationScript?: string | null;
    quizSummary?: string | null;
  };
}

interface SenecaBundle {
  senecaSlug: string;
  label: string;
  counts: { sections: number; examQuestions: number; quizzes: number; resources: number };
  resources: SenecaResource[];
}

type Mode = "lessons" | "questions" | "quizzes";

const TOPIC_SEP = /\s*>\s*/;

/** Seneca <mark> highlighting → markdown bold (the sanitizer drops <mark>). */
function senecaMd(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<mark>/gi, "**").replace(/<\/mark>/gi, "**");
}

function plaintext(md: string | null | undefined): string {
  return (md ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------------------------- viewer --------------------------------- */

function LessonViewer({ resource }: { resource: SenecaResource }) {
  const img = resource.content.imageUrl ?? null;
  const notes = senecaMd(resource.content.topicNotes ?? resource.content.description);
  return (
    <div className="space-y-4">
      {img ? (
        <div className="overflow-hidden rounded-md border bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt={resource.title ?? "Lesson illustration"}
            className="mx-auto max-h-[420px] w-auto max-w-full object-contain"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <ImageOff className="size-3.5" aria-hidden /> No illustration for this lesson.
        </div>
      )}
      <h2 className="text-base font-semibold leading-snug">{resource.title ?? "(untitled lesson)"}</h2>
      <Markdown className="max-w-none">{notes || "_No notes available._"}</Markdown>
    </div>
  );
}

function QuestionViewer({ resource }: { resource: SenecaResource }) {
  const [showScheme, setShowScheme] = useState(false);
  const stem = useMemo(
    () => senecaMd(instantiate(resource.content.questionTitleMd, resource.content.generationScript)),
    [resource],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {resource.questionType && (
          <Badge variant="outline" className="text-[10px] uppercase">
            {resource.questionType}
          </Badge>
        )}
        {resource.marksTotal != null && (
          <Badge variant="secondary" className="text-[10px]">
            {resource.marksTotal} {resource.marksTotal === 1 ? "mark" : "marks"}
          </Badge>
        )}
        {resource.topicPath && (
          <span className="text-[11px] text-muted-foreground">{resource.topicPath}</span>
        )}
      </div>
      <Markdown className="max-w-none text-sm">{stem || plaintext(resource.title) || "(question unavailable)"}</Markdown>
      {resource.content.markScheme && (
        <Collapsible open={showScheme} onOpenChange={setShowScheme}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              {showScheme ? (
                <>
                  <EyeOff className="mr-2 size-4" aria-hidden /> Hide mark scheme
                </>
              ) : (
                <>
                  <Eye className="mr-2 size-4" aria-hidden /> Show mark scheme
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 rounded-md border bg-muted/40 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Mark scheme
              </p>
              <Markdown className="max-w-none">{senecaMd(resource.content.markScheme)}</Markdown>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function QuizViewer({ resource }: { resource: SenecaResource }) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold leading-snug">{resource.title ?? "(untitled quiz)"}</h2>
      <Markdown className="max-w-none">
        {senecaMd(resource.content.quizSummary) || "_Quiz summary unavailable._"}
      </Markdown>
    </div>
  );
}

/* --------------------------------- browser --------------------------------- */

export function SenecaBrowser({
  courseLabel,
  bundles,
}: {
  courseLabel: string;
  bundles: SenecaBundleRef[];
}) {
  const [bundleSlug, setBundleSlug] = useState(bundles[0]?.slug ?? "");
  const [cache, setCache] = useState<Record<string, SenecaBundle>>({});
  const [mode, setMode] = useState<Mode>("lessons");
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const bundle = cache[bundleSlug];
  const ref = bundles.find((b) => b.slug === bundleSlug);

  useEffect(() => {
    if (!bundleSlug || cache[bundleSlug]) return;
    let live = true;
    fetch(`/seneca-bundles/${encodeURIComponent(bundleSlug)}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b: SenecaBundle) => {
        if (live) setCache((c) => ({ ...c, [bundleSlug]: b }));
      })
      .catch(() => {
        if (live) setCache((c) => ({ ...c, [bundleSlug]: { senecaSlug: bundleSlug, label: bundleSlug, counts: { sections: 0, examQuestions: 0, quizzes: 0, resources: 0 }, resources: [] } }));
      });
    return () => {
      live = false;
    };
  }, [bundleSlug, cache]);

  // reset selection when the list context changes
  useEffect(() => {
    setSelectedId(null);
  }, [bundleSlug, mode, origin, topic]);

  const sections = useMemo(
    () => (bundle ? bundle.resources.filter((r) => r.kind === "courseSection") : []),
    [bundle],
  );
  const questions = useMemo(
    () => (bundle ? bundle.resources.filter((r) => r.kind === "examQuestion") : []),
    [bundle],
  );
  const quizzes = useMemo(
    () => (bundle ? bundle.resources.filter((r) => r.kind === "quiz") : []),
    [bundle],
  );

  // question grouping: origin course (first path segment) → topic (second segment)
  const origins = useMemo(() => {
    const map = new Map<string, Map<string, SenecaResource[]>>();
    for (const q of questions) {
      const parts = (q.topicPath ?? "(no topic)").split(TOPIC_SEP);
      const o = parts[0] || "(no topic)";
      const t = parts[1] || "(no topic)";
      if (!map.has(o)) map.set(o, new Map());
      const topics = map.get(o)!;
      topics.set(t, [...(topics.get(t) ?? []), q]);
    }
    return map;
  }, [questions]);

  const originName = origin ?? [...origins.keys()][0] ?? null;
  const topicsOfOrigin = originName ? origins.get(originName) ?? new Map() : new Map();
  const topicName = topic && topicsOfOrigin.has(topic) ? topic : [...topicsOfOrigin.keys()][0] ?? null;
  const topicQuestions = topicName ? topicsOfOrigin.get(topicName) ?? [] : [];

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (r) =>
        (r.title ?? "").toLowerCase().includes(q) ||
        plaintext(r.content.topicNotes ?? r.content.description).toLowerCase().includes(q),
    );
  }, [sections, query]);

  const list: SenecaResource[] =
    mode === "lessons" ? filteredSections : mode === "questions" ? topicQuestions : quizzes;

  const selected = useMemo(
    () => (selectedId ? bundle?.resources.find((r) => r.id === selectedId) ?? null : null),
    [bundle, selectedId],
  );
  const selectedIndex = selected ? list.findIndex((r) => r.id === selected.id) : -1;

  const goto = (delta: number) => {
    if (selectedIndex < 0) return;
    const next = list[selectedIndex + delta];
    if (next) {
      setSelectedId(next.id);
      viewerRef.current?.scrollTo({ top: 0 });
    }
  };

  const pick = (id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => viewerRef.current?.scrollTo({ top: 0 }));
  };

  const modeBtn = (m: Mode, label: string, icon: React.ReactNode, count: number) => (
    <Button
      variant={mode === m ? "secondary" : "ghost"}
      size="sm"
      className="h-8 justify-start gap-2 px-2.5"
      disabled={count === 0}
      onClick={() => setMode(m)}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span className="ml-auto text-[10.5px] tabular-nums text-muted-foreground">
        {count.toLocaleString()}
      </span>
    </Button>
  );

  const loading = !bundle;
  const empty =
    bundle &&
    bundle.resources.length === 0;

  return (
    <div className="space-y-3">
      {bundles.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Seneca source course">
          {bundles.map((b) => (
            <Button
              key={b.slug}
              variant={b.slug === bundleSlug ? "secondary" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setBundleSlug(b.slug)}
            >
              {b.label}
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* list pane */}
        <div
          className={cn(
            "rounded-lg border bg-card",
            selected && "hidden lg:block",
          )}
        >
          <div className="border-b p-2">
            {mode === "lessons" ? (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${ref?.label ?? "lessons"}…`}
                  className="h-8 pl-8 text-xs"
                  aria-label="Search lessons"
                />
              </div>
            ) : mode === "questions" ? (
              <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Source course & topic
              </p>
            ) : (
              <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Quizzes
              </p>
            )}
            <div className="mt-2 space-y-0.5">
              {modeBtn("lessons", "Lessons", <BookOpen className="size-3.5" aria-hidden />, ref?.sections ?? 0)}
              {modeBtn("questions", "Exam questions", <FileQuestion className="size-3.5" aria-hidden />, ref?.questions ?? 0)}
              {modeBtn("quizzes", "Quizzes", <ListChecks className="size-3.5" aria-hidden />, bundle?.counts.quizzes ?? 0)}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : mode === "questions" ? (
            <div className="max-h-[60vh] overflow-y-auto p-2 lg:max-h-[calc(100dvh-16rem)]">
              <div className="space-y-0.5">
                {[...origins.keys()].map((o) => (
                  <div key={o}>
                    {origins.size > 1 && (
                      <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {o}
                      </p>
                    )}
                    {[...origins.get(o)!.entries()].map(([t, qs]) => {
                      const active = o === originName && t === topicName;
                      return (
                        <button
                          key={`${o}›${t}`}
                          onClick={() => {
                            setOrigin(o);
                            setTopic(t);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                            active && "bg-muted font-medium",
                          )}
                        >
                          <CircleHelp className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{t}</span>
                          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {qs.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {origins.size === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">No exam questions in this bundle.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto p-2 lg:max-h-[calc(100dvh-16rem)]">
              <p className="px-2 pb-1.5 text-[10px] text-muted-foreground">
                Showing {list.length.toLocaleString()} of {(mode === "lessons" ? sections.length : quizzes.length).toLocaleString()}
              </p>
              <div className="space-y-0.5">
                {list.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => pick(r.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                      r.id === selectedId && "bg-muted font-medium",
                    )}
                  >
                    <span className="truncate">{r.title ?? "(untitled)"}</span>
                    {r.kind === "courseSection" && r.content.imageUrl && (
                      <span className="ml-auto shrink-0 rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
                        illus.
                      </span>
                    )}
                  </button>
                ))}
                {list.length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">
                    {query ? "No lessons match your search." : "Nothing available here yet."}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* viewer pane */}
        <div
          ref={viewerRef}
          className={cn(
            "rounded-lg border bg-card",
            !selected && "hidden lg:block",
          )}
        >
          {!bundle || empty ? (
            <div className="p-6 text-sm text-muted-foreground">
              {loading
                ? "Loading Seneca content…"
                : "This Seneca course mapping carries no browsable resources."}
            </div>
          ) : selected ? (
            <div>
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs lg:hidden"
                  onClick={() => setSelectedId(null)}
                >
                  <ChevronLeft className="size-4" aria-hidden /> Back
                </Button>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {selectedIndex + 1} / {list.length.toLocaleString()}
                </span>
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={selectedIndex <= 0}
                    onClick={() => goto(-1)}
                    aria-label="Previous item"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={selectedIndex < 0 || selectedIndex >= list.length - 1}
                    onClick={() => goto(1)}
                  >
                    Next <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="p-4">
                {selected.kind === "courseSection" && <LessonViewer resource={selected} />}
                {selected.kind === "examQuestion" && <QuestionViewer resource={selected} />}
                {selected.kind === "quiz" && <QuizViewer resource={selected} />}
              </div>
            </div>
          ) : mode === "questions" && topicQuestions.length > 0 ? (
            /* topic picked, no question yet — list the topic's questions here */
            <div className="max-h-[70vh] overflow-y-auto">
              <p className="border-b px-4 py-2.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{originName}</span>
                {" › "}
                <span className="font-medium text-foreground">{topicName}</span>
                {" — "}
                {topicQuestions.length.toLocaleString()} question{topicQuestions.length === 1 ? "" : "s"}
              </p>
              <div className="divide-y">
                {topicQuestions.map((r, i) => (
                  <button
                    key={r.id}
                    onClick={() => pick(r.id)}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-xs transition-colors hover:bg-muted"
                  >
                    <span className="w-8 shrink-0 pt-0.5 text-[10px] tabular-nums text-muted-foreground">
                      Q{i + 1}
                    </span>
                    <span className="line-clamp-2 flex-1 leading-relaxed">
                      {plaintext(
                        instantiate(r.content.questionTitleMd, r.content.generationScript) || r.title,
                      ) || "(question)"}
                    </span>
                    {r.marksTotal != null && (
                      <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-muted-foreground">
                        {r.marksTotal}m
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Card className="border-0 shadow-none">
              <CardHeader>
                <p className="text-sm text-muted-foreground">
                  {mode === "lessons" && `Pick a ${courseLabel} lesson from the list — each opens with its illustration and full notes, and the Next button walks the course in Seneca's order.`}
                  {mode === "questions" && "Pick a topic to list its exam questions, then open one to practise — the mark scheme stays hidden until you reveal it."}
                  {mode === "quizzes" && "Pick a quiz to read its summary content."}
                </p>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground" />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
