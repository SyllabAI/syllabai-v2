"use client";

/**
 * GuidedLessonFlow — the adaptive confidence-gate engine, replicating the
 * SaveMyExams guided-study mechanic as dissected in the of-record research
 * (SME-Guided-Study-and-Guided-Practice-Analysis §3, adoption law §8.2) and
 * governed by the adapter spec §6 gate semantics:
 *
 *   ┌ gate ──────────────────────────────────────────────────────────┐
 *   │ "Tell us your confidence level against the key points"         │
 *   │ "What you know already" primer — module 1: the authored lesson │
 *   │ primer; later modules: the R-4 prerequisite bridge from the    │
 *   │ PREVIOUS lesson's authored key points (SME L1-bridge parity)   │
 *   │ "Key points of understanding" bullets                          │
 *   │ Low / Medium / High radio — Continue DISABLED until a choice   │
 *   │ (gatePolicy.continueDisabledUntilChoice — import-blocking)     │
 *   └────────────────────────────────────────────────────────────────┘
 *   → authored depth layers revealed ONE Continue at a time; the rating
 *     selects the band (low → low.*, medium → medium.*, high → none) —
 *     the self-rating is a cheap adaptivity proxy: it changes pacing,
 *     never content (§3.3 branch uniformity). High keeps every layer
 *     reachable as an optional refresher.
 *   → "Helpful terms" glossary (authored firstLesson places each term)
 *   → "An example" worked example (first module; one per note of record)
 *   → the check: per-question Submit answer → verdict + explanation →
 *     Next question (§3.4 presentation grammar)
 *   → post-check recalibration (§6.4 + §8.2 deliberate extension): offer
 *     exactly one "re-rate for next time" that pre-selects the NEXT
 *     module's gate default — never a re-rate of the current module
 *     (resumeWithoutReRate law). The recalibration writes an R-6
 *     trajectory chip ("started X → next time Y") echoed on the
 *     set-complete recap, next to a browser-local helpfulness ask
 *     (thumbs) — never scored, never exported (zero-DB law).
 *   → R-2 per-lesson-end handoffs (SME parity): every lesson's last
 *     stage offers the same "Keep going" practice links the set-complete
 *     recap shows — the subtopic's exam-questions set + flashcard deck,
 *     resolved server-side (always-live fallback law). The block renders
 *     only when another lesson follows; the final lesson ends straight
 *     into the recap, which already carries it.
 *
 * WRITE-ONCE LAW: a rating is chosen once per module; a resumed session
 * restores it and must not re-prompt (the gate radio locks once written;
 * completed modules reopen as a re-walk with the rating locked).
 *
 * PERSISTENCE: browser-local only (hub progress law — no accounts; and the
 * integration channel's zero-DB law), localStorage keyed per lesson id,
 * refresh-safe. Progress never writes to canonical content.
 */
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  PenLine,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { figuresForModule } from "@/lib/guided-figures";
import { checkMode, gradeWritten } from "@/lib/guided-written";
import type {
  GuidedDepthLayer,
  GuidedFigure,
  GuidedLessonImport,
  GuidedModule,
  GuidedQuestion,
  GuidedQuestionPackage,
} from "@/lib/guided-lessons";

type Rating = "low" | "medium" | "high";

interface FlowState {
  v: 1;
  /** module currently being walked */
  moduleIndex: number;
  /** index into the module's computed stage list */
  stage: number;
  /** write-once gate rating per module id */
  ratings: Record<string, Rating>;
  /** post-check recalibration ("re-rate for next time") per module id */
  recalibrated: Record<string, Rating>;
  /** R-6 helpfulness ask at set end — browser-local only, never scored */
  feedback?: "up" | "down";
  /** answers keyed by question id */
  answers: Record<string, { picked: string; correct: boolean }>;
  /** the whole lesson set is finished */
  finished: boolean;
}

interface Props {
  lesson: GuidedLessonImport;
  pkg: GuidedQuestionPackage;
  noteTitle: string;
  noteHref: string;
  base: string;
  /** R-2 deep links (resolved server-side, see the flow's call site): the
   *  exam-questions set / flashcard deck anchored to this note's subtopic,
   *  or the course-level page when no per-topic target resolves. */
  examQuestionsHref: string;
  flashcardsHref: string;
}

const STORAGE_PREFIX = "syllabai.guided-flow.v1.";

const RATING_LABEL: Record<Rating, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const RATING_HELP: Record<Rating, string> = {
  low: "New to this — walk me through it from the start.",
  medium: "I've seen this — remind me how it fits together.",
  high: "Solid on this — take me straight to the checks.",
};

function freshState(): FlowState {
  return { v: 1, moduleIndex: 0, stage: 0, ratings: {}, recalibrated: {}, answers: {}, finished: false };
}

/** The server snapshot: SSR/prerender always renders the fresh gate. */
const SERVER_STATE = freshState();

/** Restore from localStorage; client-only, tolerant of bad records. */
function loadState(lessonId: string): FlowState {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + lessonId);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw) as FlowState;
    if (parsed?.v !== 1) return freshState();
    return parsed;
  } catch {
    return freshState();
  }
}

interface FlowStore {
  subscribe: (fn: () => void) => () => void;
  get: () => FlowState;
  set: (updater: (s: FlowState) => FlowState) => void;
}

/**
 * One browser-local store per lesson id (module-level cache). Mutations are
 * plain store updates that persist synchronously — no setState-in-effect;
 * hydration renders the server snapshot and re-renders to the restored
 * state after mount (the hub progress.ts useSyncExternalStore pattern).
 */
const flowStores = new Map<string, FlowStore>();

function getFlowStore(lessonId: string): FlowStore {
  const existing = flowStores.get(lessonId);
  if (existing) return existing;
  let current = loadState(lessonId);
  const listeners = new Set<() => void>();
  const store: FlowStore = {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    get() {
      return current;
    },
    set(updater) {
      const next = updater(current);
      if (next === current) return;
      current = next;
      try {
        window.localStorage.setItem(STORAGE_PREFIX + lessonId, JSON.stringify(current));
      } catch {
        // storage unavailable — the flow still works, it just won't resume
      }
      listeners.forEach((fn) => fn());
    },
  };
  flowStores.set(lessonId, store);
  return store;
}

type Stage =
  | { kind: "gate" }
  | { kind: "layer"; band: "low" | "medium"; field: keyof GuidedDepthLayer; label: string; i: number; n: number }
  | { kind: "refresher" }
  | { kind: "glossary" }
  | { kind: "example" }
  | { kind: "check" }
  | { kind: "recalibrate" };

/** The authored layers of one band, served one Continue at a time. */
function layerStages(band: "low" | "medium"): Stage[] {
  return (["restatement", "analogy", "examPointer"] as const).map((field, i) => ({
    kind: "layer" as const,
    band,
    field,
    label: field === "restatement" ? "In plain words" : field === "analogy" ? "Think of it like this" : "Exam pointer",
    i,
    n: 3,
  }));
}

/** Glossary terms authored for a given 0-based module ordinal. */
function glossaryFor(lesson: GuidedLessonImport, moduleOrdinal: number) {
  const all = lesson.lesson.assets.glossary ?? [];
  const own = all.filter((g) => g.firstLesson === moduleOrdinal + 1);
  if (own.length > 0) return own;
  // defensive: terms pointing past the last module clamp onto it
  if (moduleOrdinal === lesson.lesson.modules.length - 1) {
    return all.filter((g) => g.firstLesson > lesson.lesson.modules.length);
  }
  return [];
}

export function GuidedLessonFlow({
  lesson,
  pkg,
  noteTitle,
  noteHref,
  base,
  examQuestionsHref,
  flashcardsHref,
}: Props) {
  const lessonId = lesson.lesson.id;
  const store = useMemo(() => getFlowStore(lessonId), [lessonId]);
  const state = useSyncExternalStore(store.subscribe, store.get, () => SERVER_STATE);
  const [recalChoice, setRecalChoice] = useState<Record<string, Rating>>({});

  const questionsById = useMemo(
    () => new Map(pkg.questions.map((q) => [q.id, q])),
    [pkg],
  );

  const modules = lesson.lesson.modules;
  const moduleIndex = Math.min(state.moduleIndex, modules.length - 1);
  const m = modules[moduleIndex];
  const rating = state.ratings[m.id];

  // The module's stage list after the gate depends on the chosen band.
  const allStages: Stage[] = useMemo(() => {
    const stages: Stage[] = [{ kind: "gate" }];
    if (!rating) return stages;
    if (rating === "low") stages.push(...layerStages("low"));
    if (rating === "medium") stages.push(...layerStages("medium"));
    if (rating === "high") stages.push({ kind: "refresher" });
    if (glossaryFor(lesson, moduleIndex).length > 0) stages.push({ kind: "glossary" });
    if (moduleIndex === 0 && lesson.lesson.assets.workedExample) stages.push({ kind: "example" });
    stages.push({ kind: "check" });
    if (m.gatePolicy.postCheckRecalibration) stages.push({ kind: "recalibrate" });
    return stages;
  }, [rating, lesson, moduleIndex, m]);

  const stage = Math.min(state.stage, allStages.length - 1);

  /**
   * R-7c honesty fix (any-order companion): "complete" means the module was
   * actually walked — gate rated AND all its checks answered — not merely
   * positioned before the active module. For sequential walkers this yields
   * the same numbers as the old `mi < moduleIndex` rule (advancing past a
   * module implies its checks were answered); for any-order entry (the
   * R-7c "pick any lesson" affordance) skipped modules stay honestly
   * uncounted and show Start/Continue, never a false Review/complete.
   */
  const moduleDone = (mi: number) => {
    const mod = modules[mi];
    return (
      state.ratings[mod.id] !== undefined &&
      mod.checkRefs.every((r) => state.answers[r] !== undefined)
    );
  };

  /** Advance one stage; past the last stage of the module, advance module. */
  const handleNext = () => {
    if (stage + 1 < allStages.length) {
      store.set((s) => ({ ...s, stage: s.stage + 1 }));
      return;
    }
    if (moduleIndex + 1 >= modules.length) {
      store.set((s) => ({ ...s, finished: true }));
    } else {
      store.set((s) => ({ ...s, moduleIndex: s.moduleIndex + 1, stage: 0 }));
    }
  };

  /** Write-once: choosing a rating (re)computes the band tail from stage 0. */
  const chooseRating = (r: Rating) => {
    store.set((s) =>
      s.ratings[m.id] === r ? s : { ...s, ratings: { ...s.ratings, [m.id]: r }, stage: 0 },
    );
  };

  const recalibrate = (r: Rating) => {
    store.set((s) => ({ ...s, recalibrated: { ...s.recalibrated, [m.id]: r } }));
  };

  const answer = (qid: string, picked: string, correct: boolean) => {
    store.set((s) => ({ ...s, answers: { ...s.answers, [qid]: { picked, correct } } }));
  };

  const gotoModule = (mi: number) => store.set((s) => ({ ...s, moduleIndex: mi, stage: 0 }));

  const reset = () => {
    setPicked(false);
    setListOpen(null);
    store.set(() => freshState());
  };

  const totalChecks = modules.reduce((a, x) => a + x.checkRefs.length, 0);
  const totalCorrect = modules.reduce(
    (a, x) => a + x.checkRefs.filter((r) => state.answers[r]?.correct).length,
    0,
  );
  const doneCount = modules.filter((_, i) => moduleDone(i)).length;
  const prevRecalibrated =
    moduleIndex > 0 ? state.recalibrated[modules[moduleIndex - 1].id] : undefined;
  /** R-4 honesty input: did the learner actually walk the previous lesson?
   *  The bridge always shows the previous lesson's key points (they are the
   *  prerequisite), but the connective line only says "you covered this"
   *  when that is true — same honesty law as the R-7c moduleDone fix. */
  const prevDone = moduleIndex > 0 ? moduleDone(moduleIndex - 1) : false;

  // R-7c hybrid (SME concept-picker delta of record 2026-10-27): the set
  // card leads with gap-first copy on entry ("which concept don't you
  // understand yet?") and collapses to a slim header once a lesson is
  // being walked — SME's selection-first feel without giving up the
  // persistent progress anchor; the full list stays one click away (the
  // "Back to concepts" hop, hub pattern). Engagement is anything past the
  // pristine entry state — picking a concept, rating a gate, or resuming.
  // `picked` makes selection itself the trigger (SME parity: the picker
  // is replaced the moment a concept is chosen — even a first pick of
  // lesson 1, which leaves no progress footprint), so a jump back to the
  // first lesson from the expanded list still collapses the card.
  const [picked, setPicked] = useState(false);
  const engaged =
    picked ||
    state.moduleIndex !== 0 ||
    state.stage !== 0 ||
    Object.keys(state.ratings).length > 0 ||
    Object.keys(state.answers).length > 0 ||
    Object.keys(state.recalibrated).length > 0;
  const [listOpen, setListOpen] = useState<boolean | null>(null);
  const listExpanded = listOpen ?? !engaged;

  if (state.finished) {
    return (
      <FinishedView
        modules={modules}
        state={state}
        totalChecks={totalChecks}
        totalCorrect={totalCorrect}
        noteTitle={noteTitle}
        noteHref={noteHref}
        base={base}
        examQuestionsHref={examQuestionsHref}
        flashcardsHref={flashcardsHref}
        onReview={(mi) => store.set((s) => ({ ...s, moduleIndex: mi, stage: 0, finished: false }))}
        onFeedback={(fb) =>
          store.set((s) => (s.feedback === fb ? s : { ...s, feedback: fb }))
        }
        onReset={reset}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* lesson-set stepper — the numbered micro-lesson picker. R-7c hybrid
          (SME concept-picker delta of record): gap-first copy on entry, and
          once a lesson is being walked the card collapses to a slim header
          so the content leads — the full list stays one click away, and
          picking a concept from the expanded list re-collapses it. */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          {listExpanded ? (
            <div id="lesson-set-list" className="space-y-3">
              {engaged ? (
                <button
                  type="button"
                  onClick={() => setListOpen(false)}
                  aria-expanded="true"
                  aria-controls="lesson-set-list"
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md text-left transition-colors hover:text-foreground"
                >
                  <span className="text-sm font-semibold">Guided lessons for this note</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-live="polite">
                      {doneCount} of {modules.length} complete
                    </span>
                    <ChevronDown className="size-4" aria-hidden />
                    <span className="sr-only">Hide the lesson list</span>
                  </span>
                </button>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Guided lessons for this note
                  </p>
                  <p className="text-sm font-semibold">Which concept don&apos;t you understand yet?</p>
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll explain it simply and check your understanding. Pick any lesson —
                    any order works.
                  </p>
                </div>
              )}
              <Progress value={(doneCount / modules.length) * 100} aria-label="Lesson set progress" />
              <ol className="space-y-2">
                {modules.map((mod, mi) => {
                  const done = moduleDone(mi);
                  const active = mi === moduleIndex;
                  const started = state.ratings[mod.id] !== undefined;
                  return (
                    <li key={mod.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPicked(true);
                          setListOpen(null);
                          gotoModule(mi);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                          active ? "border-primary/50 bg-primary/5" : "hover:border-primary/40",
                        )}
                        aria-current={active ? "step" : undefined}
                      >
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                            done && "border-emerald-600/50 bg-emerald-600/10 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-400",
                            !done && active && "border-primary/60 text-primary",
                            !done && !active && "text-muted-foreground",
                          )}
                          aria-hidden
                        >
                          {done ? <Check className="size-3.5" /> : mi + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">{mod.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{mod.opening}</span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          {done ? "Review" : started ? "Continue" : "Start"}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="flex items-center justify-between border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  {totalCorrect} of {totalChecks} checks correct so far
                </p>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <RotateCcw className="size-3.5" aria-hidden />
                  Restart lesson set
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setListOpen(true)}
                aria-expanded="false"
                aria-controls="lesson-set-list"
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md text-left transition-colors hover:text-foreground"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">Guided lessons for this note</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Lesson {moduleIndex + 1} of {modules.length} — {m.title}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-live="polite">
                    {doneCount} of {modules.length} complete
                  </span>
                  <ChevronRight className="size-4" aria-hidden />
                  <span className="sr-only">Show the lesson list</span>
                </span>
              </button>
              <Progress
                value={(doneCount / modules.length) * 100}
                aria-label="Lesson set progress"
                className="h-1"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* the active module's current stage */}
      <StageView
        stage={allStages[stage]}
        module={m}
        moduleOrdinal={moduleIndex}
        moduleCount={modules.length}
        lesson={lesson}
        questionsById={questionsById}
        state={state}
        rating={rating}
        prevRecalibrated={prevRecalibrated}
        prevDone={prevDone}
        examQuestionsHref={examQuestionsHref}
        flashcardsHref={flashcardsHref}
        recalChoice={recalChoice[m.id]}
        onRecalChoice={(r) => setRecalChoice((c) => ({ ...c, [m.id]: r }))}
        onChooseRating={chooseRating}
        onRecalibrate={recalibrate}
        onAnswer={answer}
        onNext={handleNext}
      />
    </div>
  );
}

/* ───────────────────────────── stage views ───────────────────────────── */

interface StageProps {
  stage: Stage;
  module: GuidedModule;
  moduleOrdinal: number;
  moduleCount: number;
  lesson: GuidedLessonImport;
  questionsById: Map<string, GuidedQuestion>;
  state: FlowState;
  rating: Rating | undefined;
  /** the previous module's "re-rate for next time" — pre-selects this gate */
  prevRecalibrated: Rating | undefined;
  /** R-4: whether the learner actually walked the previous lesson */
  prevDone: boolean;
  /** R-2 per-lesson-end handoff targets (resolved server-side, see the
   *  flow's call site): rendered at each lesson's recalibration when
   *  another lesson follows in the set. */
  examQuestionsHref: string;
  flashcardsHref: string;
  /** the current module's post-check recalibration choice, pre-continue */
  recalChoice: Rating | undefined;
  onRecalChoice: (r: Rating) => void;
  onChooseRating: (r: Rating) => void;
  onRecalibrate: (r: Rating) => void;
  onAnswer: (qid: string, picked: string, correct: boolean) => void;
  onNext: () => void;
}

function StageView(p: StageProps) {
  switch (p.stage.kind) {
    case "gate":
      return <GateStage {...p} />;
    case "layer":
      return <LayerStage {...p} stage={p.stage} />;
    case "refresher":
      return <RefresherStage {...p} />;
    case "glossary":
      return <GlossaryStage {...p} />;
    case "example":
      return <ExampleStage {...p} />;
    case "check":
      return <CheckStage {...p} />;
    case "recalibrate":
      return <RecalibrateStage {...p} />;
  }
}

function GateStage(p: StageProps) {
  const { module: m, lesson, moduleOrdinal, state, rating, prevRecalibrated, prevDone, onChooseRating, onNext } = p;
  // pre-selection from the previous module's recalibration is visual only —
  // the write-once rating happens on the learner's explicit radio click
  const selected = rating ?? prevRecalibrated ?? null;
  const written = rating !== undefined;
  const disabled = m.gatePolicy.continueDisabledUntilChoice && rating === undefined;
  // R-4 prerequisite bridge (operator trace 1a17c31b18dcd8ad, SME L1-bridge
  // parity): module 1 keeps the authored lesson primer; later modules bridge
  // from the PREVIOUS lesson's authored key points — the prerequisite the
  // learner "knows already" — instead of announcing this lesson's own
  // opening twice. Nothing is synthesised: the bridge re-renders authored
  // strings from the same pinned artifact (capped at 3 to keep the gate
  // light), and the connective line stays honest about whether the learner
  // actually walked that lesson (any-order entry, R-7c honesty law).
  const prev = moduleOrdinal > 0 ? lesson.lesson.modules[moduleOrdinal - 1] : null;
  const prevKeyPoints = prev ? prev.keyPoints.slice(0, 3) : [];
  const prevRest = prev ? prev.keyPoints.length - prevKeyPoints.length : 0;
  const resumed = Object.keys(state.answers).length > 0;
  // Figures layer (hub/lesson-import/1.2, FIGURES-2.1 explain-dont-list — adapter spec
  // 0.3→1.2 §6, superseding the 1.1-era after-opening placement): the module's own
  // diagrams render AFTER the key points they illustrate, caption-first (operator trace
  // 1a188a15ac19ed05 — SME explains with its diagrams, it does not list them); a module
  // without figures renders nothing (fail-closed, identical to earlier generations).
  const moduleFigures = figuresForModule(lesson, moduleOrdinal);
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lesson {moduleOrdinal + 1} of {p.moduleCount}
          </p>
          <h2 className="text-lg font-semibold tracking-tight">{m.title}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{m.opening}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">What you know already</p>
          {moduleOrdinal === 0 ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {lesson.lesson.primer.text}
            </p>
          ) : (
            prev && (
              <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2.5">
                <p className="text-xs font-semibold text-muted-foreground">
                  From Lesson {moduleOrdinal}: {prev.title}
                </p>
                <ul className="space-y-1.5">
                  {prevKeyPoints.map((kp, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                      <span>{kp}</span>
                    </li>
                  ))}
                </ul>
                {prevRest > 0 && (
                  <p className="text-xs text-muted-foreground">
                    …and {prevRest} more key point{prevRest === 1 ? "" : "s"} from that lesson.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {prevDone
                    ? `You covered this in the last lesson — ${m.title} builds on it.`
                    : `This lesson builds on Lesson ${moduleOrdinal} — if any of that feels unfamiliar, it is a quick fill-in first.`}
                </p>
              </div>
            )
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Key points of understanding</p>
          <ul className="space-y-1.5">
            {m.keyPoints.map((kp, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                <span>{kp}</span>
              </li>
            ))}
          </ul>
        </div>

        {moduleFigures.length > 0 && <ModuleFigures figures={moduleFigures} />}

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Tell us your confidence level against the key points</legend>
          {(["low", "medium", "high"] as const).map((r) => {
            const isSelected = selected === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={written}
                onClick={() => onChooseRating(r)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                  isSelected ? "border-primary/60 bg-primary/5" : "hover:border-primary/40",
                  written && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    isSelected ? "border-primary" : "border-muted-foreground/40",
                  )}
                  aria-hidden
                >
                  {isSelected && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className="block text-[13px] font-medium">
                    {RATING_LABEL[r]}
                    {written && isSelected && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({resumed ? "your saved rating — resumed" : "your rating — locked for this lesson"})
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">{RATING_HELP[r]}</span>
                </span>
              </button>
            );
          })}
        </fieldset>

        <Button onClick={onNext} disabled={disabled} className="w-full sm:w-auto">
          Continue
          <ArrowRight className="size-4" aria-hidden />
        </Button>
        {disabled && (
          <p className="text-xs text-muted-foreground">Choose a confidence level to continue.</p>
        )}
        {!written && prevRecalibrated !== undefined && (
          <p className="text-xs text-muted-foreground">
            Pre-selected from your last check — change it here if that no longer feels right.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Figures layer (hub/lesson-import/1.2, FIGURES-2.1 explain-dont-list): the parent
 *  revision note's own diagrams — zero new hosting, the same hotlink path the notes
 *  reader serves. Same CLS-guarded markup as the notes reader (UX audit 2026-10-02 #21):
 *  fixed 16:9 box with object-contain reserves the layout, nothing shifts; alt is
 *  mandatory upstream. Presentation law of record (adapter spec 0.3→1.2 §6, operator
 *  trace 1a188a15ac19ed05, amended FIGURES-2.1B trace 1a18983337102e19): caption-first —
 *  the note's own explanatory line when the source has one, and nothing else; the
 *  "sourceHeading — from the revision note" provenance line is dropped (the diagrams are
 *  part of the lesson, not a provenance gallery). Fail-closed: a module without figures
 *  renders nothing. */
function ModuleFigures({ figures }: { figures: GuidedFigure[] }) {
  return (
    <div className="space-y-3">
      {figures.map((f) => (
        <figure key={f.id} className="space-y-1.5">
          <span className="block aspect-video w-full overflow-hidden rounded-md border bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element -- corpus hotlink law, identical to the notes reader img: branch */}
            <img src={f.url} alt={f.alt} loading="lazy" className="size-full object-contain" />
          </span>
          {f.caption && (
            <figcaption className="space-y-0.5">
              <p className="text-[13px] leading-relaxed">{f.caption}</p>
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function LayerStage(p: StageProps & { stage: Extract<Stage, { kind: "layer" }> }) {
  const { module: m, stage, onNext } = p;
  const layer = m.depthLayers[stage.band][stage.field];
  const isLast = stage.i === stage.n - 1;
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stage.label}</p>
          <Badge variant="secondary" className="text-[11px]">
            Layer {stage.i + 1} of {stage.n}
          </Badge>
        </div>
        <p className="text-[15px] leading-relaxed">{layer}</p>
        <Button onClick={onNext} className="w-full sm:w-auto">
          {isLast ? "Continue" : "Continue — reveal the next layer"}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function RefresherStage(p: StageProps) {
  const { module: m, onNext } = p;
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Straight to the checks</p>
          <p className="text-[13px] text-muted-foreground">
            You rated yourself confident — so no walkthrough layers. If anything feels shaky, the
            refresher below unpacks it in plain words first.
          </p>
        </div>
        <details className="rounded-md border px-3 py-2.5">
          <summary className="cursor-pointer text-[13px] font-medium">Refresher — the plain-words layers</summary>
          <div className="mt-3 space-y-3">
            <LayerBlock label="In plain words" text={m.depthLayers.low.restatement} />
            <LayerBlock label="Think of it like this" text={m.depthLayers.low.analogy} />
            <LayerBlock label="Exam pointer" text={m.depthLayers.low.examPointer} />
            <LayerBlock label="Going deeper" text={m.depthLayers.medium.restatement} />
          </div>
        </details>
        <Button onClick={onNext} className="w-full sm:w-auto">
          Continue
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function LayerBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-[13px] leading-relaxed">{text}</p>
    </div>
  );
}

function GlossaryStage(p: StageProps) {
  const { lesson, moduleOrdinal, onNext } = p;
  const terms = glossaryFor(lesson, moduleOrdinal);
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Helpful terms</p>
          <p className="text-[13px] text-muted-foreground">The vocabulary this lesson leans on.</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {terms.map((g) => (
            <div key={g.term} className="rounded-md border p-3">
              <dt className="text-[13px] font-semibold">{g.term}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{g.definition}</dd>
            </div>
          ))}
        </dl>
        <Button onClick={onNext} className="w-full sm:w-auto">
          Continue
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function ExampleStage(p: StageProps) {
  const { lesson, onNext } = p;
  const we = lesson.lesson.assets.workedExample;
  if (!we) return null;
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-primary" aria-hidden />
          An example
        </p>
        <p className="text-[13px] font-medium leading-relaxed">{we.prompt}</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted-foreground">
          {we.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <p className="rounded-md bg-muted px-3 py-2 text-[13px] font-medium">{we.finalAnswer}</p>
        <Button onClick={onNext} className="w-full sm:w-auto">
          Continue to the checks
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function CheckStage(p: StageProps) {
  const { module: m, lesson, moduleOrdinal, questionsById, state, onAnswer, onNext } = p;
  const questions = m.checkRefs
    .map((ref) => questionsById.get(ref))
    .filter((q): q is GuidedQuestion => q !== undefined);
  // resume at the first unanswered question of this module
  const firstUnanswered = Math.max(
    questions.findIndex((q) => state.answers[q.id] === undefined),
    0,
  );
  const [qi, setQi] = useState(firstUnanswered);
  const clampedQi = Math.min(qi, questions.length - 1);
  const q = questions[clampedQi];
  const answered = state.answers[q.id] ?? null;
  const score = questions.filter((x) => state.answers[x.id]?.correct).length;

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4 text-primary" aria-hidden />
            Understanding check
          </p>
          <Badge variant="secondary" className="text-[11px]">
            Question {clampedQi + 1} of {questions.length}
          </Badge>
        </div>
        <Progress
          value={((clampedQi + (answered ? 1 : 0)) / questions.length) * 100}
          aria-label="Check progress"
        />
        <CheckQuestion
          key={q.id}
          question={q}
          index={clampedQi + 1}
          answered={answered}
          onAnswer={onAnswer}
        />

        {answered && clampedQi < questions.length - 1 && (
          <Button onClick={() => setQi(clampedQi + 1)} className="w-full sm:w-auto">
            Next question
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
        {answered && clampedQi === questions.length - 1 && (
          <div className="space-y-3 rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-semibold">
              Check complete — {score} of {questions.length} correct.
            </p>
            <Button onClick={onNext} className="w-full sm:w-auto">
              Continue
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            {/* R-3 (operator trace 1a179c6b53bff529): optional mixed-type
                practice — derived from the same pinned artifact, never
                scored, never persisted; the authored MCQ checks above stay
                the only record (moduleDone untouched). */}
            <MixedPractice
              lesson={lesson}
              module={m}
              moduleOrdinal={moduleOrdinal}
              questions={questions}
              answers={state.answers}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecalibrateStage(p: StageProps) {
  const { module: m, rating, recalChoice, onRecalChoice, onRecalibrate, onNext } = p;
  const choice = recalChoice ?? rating ?? "medium";
  const answered = m.checkRefs.filter((r) => p.state.answers[r]?.correct).length;
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold">How confident do you feel now?</p>
          <p className="text-[13px] text-muted-foreground">
            You got {answered} of {m.checkRefs.length} checks correct. Re-rate for next time —
            we&apos;ll pre-select this as your starting confidence for the next lesson. You can
            always change it there.
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className="sr-only">Re-rate your confidence for next time</legend>
          {(["low", "medium", "high"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={choice === r}
              onClick={() => {
                onRecalChoice(r);
                onRecalibrate(r);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                choice === r ? "border-primary/60 bg-primary/5" : "hover:border-primary/40",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  choice === r ? "border-primary" : "border-muted-foreground/40",
                )}
                aria-hidden
              >
                {choice === r && <span className="size-2 rounded-full bg-primary" />}
              </span>
              <span className="text-[13px] font-medium">{RATING_LABEL[r]}</span>
            </button>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onNext} className="w-full sm:w-auto">
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Button>
          <p className="text-xs text-muted-foreground">
            Your rating for this lesson stays as it was — recalibration only sets the default for
            next time.
          </p>
        </div>
        {p.state.recalibrated[m.id] && rating && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">Your trajectory for this lesson:</p>
            <TrajectoryChip from={rating} to={p.state.recalibrated[m.id]} />
          </div>
        )}
        {/* R-2 per-lesson-end handoffs (SME parity — the of-record walk has
            Exam Questions / Flashcards at EACH lesson end, not only the set
            end): the same resolved hrefs the set-complete recap ships, so
            no new resolution and no new 404 surface. Rendered only when
            another lesson follows — the final lesson ends straight into the
            FinishedView recap, which already carries the block. */}
        {p.moduleOrdinal + 1 < p.moduleCount && (
          <div className="space-y-1.5 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Keep going
            </p>
            <p className="text-[13px] text-muted-foreground">
              Done with this guided lesson? Try this topic&apos;s practice before the next one.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a href={p.examQuestionsHref}>Exam questions</a>
              </Button>
              <Button asChild variant="outline">
                <a href={p.flashcardsHref}>Flashcards</a>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * R-6 confidence-trajectory chip (operator trace 1a17c31b18dcd8ad, SME
 * "Review your progress" trajectory parity): the rating the learner walked
 * in with, and — when they recalibrated — the default they set for next
 * time. Honest by construction: the recalibration-only law means the
 * walked-in rating never changes, so the chip narrates "started → next
 * time", never "before → after".
 */
function TrajectoryChip({ from, to }: { from: Rating; to?: Rating }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Started {RATING_LABEL[from]}
      {to && (
        <>
          <ArrowRight className="size-3" aria-hidden />
          Next time {RATING_LABEL[to]}
        </>
      )}
    </span>
  );
}

/* ─────────────────────────── check question ─────────────────────────── */

function CheckQuestion({
  question,
  index,
  answered,
  onAnswer,
}: {
  question: GuidedQuestion;
  index: number;
  answered: { picked: string; correct: boolean } | null;
  onAnswer: (qid: string, picked: string, correct: boolean) => void;
}) {
  const mode = checkMode(question);
  // R3 written kinds: gradable == known written kind WITH keywords; otherwise the
  // flow offers reveal-only settle (model answer shown, no verdict, never graded)
  const gradable = mode === "written" && !!question.keywords && question.keywords.length > 0;
  const [text, setText] = useState(answered?.picked ?? "");
  const [picked, setPicked] = useState<string | null>(answered?.picked ?? null);
  const settled = answered !== null;

  if (mode !== "mcq") {
    const modelAnswer = question.modelAnswer;
    return (
      <fieldset className="space-y-2.5">
        <legend className="text-sm font-medium leading-snug">
          <span className="mr-2 text-muted-foreground">{index}.</span>
          {question.stem}
        </legend>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Written response{question.kind ? ` · ${question.kind.replace("-", " ")}` : ""}
        </p>
        {gradable && (
          <div className="grid gap-1.5">
            <label htmlFor={`flow-written-${index}`} className="text-[13px] font-medium">
              Your answer
            </label>
            <textarea
              id={`flow-written-${index}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={settled}
              rows={2}
              className={cn(
                "min-h-[56px] w-full rounded-md border bg-transparent px-3 py-2 text-[13px] leading-relaxed",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                "disabled:cursor-default disabled:opacity-70",
              )}
              placeholder="Write your answer in your own words…"
            />
          </div>
        )}
        {!settled && (
          gradable ? (
            <Button
              size="sm"
              disabled={text.trim() === ""}
              onClick={() => {
                const verdict = gradeWritten(question, text);
                // the keyword-hit boolean rides the existing onAnswer signature —
                // tallies/gating/recalibration are unchanged (adapter spec 0.5 §6)
                onAnswer(question.id, text.trim(), verdict === "correct");
              }}
            >
              Submit answer
            </Button>
          ) : (
            <Button size="sm" onClick={() => onAnswer(question.id, "", false)}>
              Reveal model answer
            </Button>
          )
        )}
        {settled && answered && (
          <div className="space-y-2" role="status">
            {gradable &&
              (answered.correct ? (
                <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <ThumbsUp className="size-4" aria-hidden />
                  Great job!
                </p>
              ) : (
                <p className="text-[13px] font-semibold text-red-700 dark:text-red-400">Not quite.</p>
              ))}
            {modelAnswer ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Model answer: <span className="font-medium text-foreground">{modelAnswer}</span>
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">Model answer unavailable for this item.</p>
            )}
          </div>
        )}
      </fieldset>
    );
  }

  const correctOption = question.options.find((o) => o.correct);
  const pickedOption = question.options.find((o) => o.key === picked);

  return (
    <fieldset className="space-y-2.5">
      <legend className="text-sm font-medium leading-snug">
        <span className="mr-2 text-muted-foreground">{index}.</span>
        {question.stem}
      </legend>
      <div className="grid gap-2" role="radiogroup" aria-label={`Options for question ${index}`}>
        {question.options.map((o) => {
          const isPicked = picked === o.key;
          const state = !settled
            ? isPicked
              ? "picked"
              : "idle"
            : o.correct
              ? "correct"
              : isPicked
                ? "wrong"
                : "idle";
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={isPicked}
              disabled={settled}
              onClick={() => setPicked(o.key)}
              className={cn(
                "flex items-start gap-3 rounded-md border px-3 py-2.5 text-left text-[13px] transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                state === "idle" && "hover:border-primary/40",
                state === "picked" && "border-primary/60 bg-primary/5",
                state === "correct" && "border-emerald-600/50 bg-emerald-600/10 dark:border-emerald-500/40 dark:bg-emerald-500/10",
                state === "wrong" && "border-red-600/50 bg-red-600/10 dark:border-red-500/40 dark:bg-red-500/10",
                settled && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                  state === "correct" && "border-emerald-600/60 text-emerald-700 dark:text-emerald-400",
                  state === "wrong" && "border-red-600/60 text-red-700 dark:text-red-400",
                  (state === "idle" || state === "picked") && "text-muted-foreground",
                )}
                aria-hidden
              >
                {state === "correct" ? <Check className="size-3" /> : state === "wrong" ? <Check className="size-3" /> : o.key}
              </span>
              <span className="min-w-0">{o.text}</span>
            </button>
          );
        })}
      </div>

      {!settled && (
        <Button
          size="sm"
          disabled={picked === null}
          onClick={() => {
            if (picked === null || !pickedOption || !correctOption) return;
            onAnswer(question.id, picked, pickedOption.correct);
          }}
        >
          Submit answer
        </Button>
      )}

      {settled && answered && (
        <div className="space-y-2" role="status">
          {answered.correct ? (
            <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
              <ThumbsUp className="size-4" aria-hidden />
              Great job!
            </p>
          ) : (
            <p className="text-[13px] font-semibold text-red-700 dark:text-red-400">
              Not quite — the answer is {correctOption?.key}.
            </p>
          )}
          <p className="text-[13px] leading-relaxed text-muted-foreground">{correctOption?.explanation}</p>
          {!answered.correct && pickedOption?.misconception && (
            <p className="text-xs text-muted-foreground">Misconception flagged: {pickedOption.misconception}</p>
          )}
        </div>
      )}
    </fieldset>
  );
}

/* ─────────────────────────── finished summary ─────────────────────────── */

function FinishedView({
  modules,
  state,
  totalChecks,
  totalCorrect,
  noteTitle,
  noteHref,
  base,
  examQuestionsHref,
  flashcardsHref,
  onReview,
  onFeedback,
  onReset,
}: {
  modules: GuidedModule[];
  state: FlowState;
  totalChecks: number;
  totalCorrect: number;
  noteTitle: string;
  noteHref: string;
  base: string;
  examQuestionsHref: string;
  flashcardsHref: string;
  onReview: (mi: number) => void;
  onFeedback: (fb: "up" | "down") => void;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <BookOpenCheck className="size-4" aria-hidden />
            Lesson set complete
          </p>
          <h2 className="text-lg font-semibold tracking-tight">{noteTitle}</h2>
          <p className="text-[13px] text-muted-foreground">
            You worked through all {modules.length} lessons — {totalCorrect} of {totalChecks} checks
            correct across the set.
          </p>
        </div>
        <ol className="space-y-2">
          {modules.map((mod, mi) => {
            const correct = mod.checkRefs.filter((r) => state.answers[r]?.correct).length;
            const walkedIn = state.ratings[mod.id];
            const recal = state.recalibrated[mod.id];
            return (
              <li key={mod.id} className="flex items-center gap-3 rounded-md border px-3 py-2.5">
                <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{mod.title}</span>
                  {/* R-6: the confidence trajectory this lesson actually had */}
                  {walkedIn && (
                    <span className="mt-1 block">
                      <TrajectoryChip from={walkedIn} to={recal} />
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {correct}/{mod.checkRefs.length} checks
                </span>
                <Button variant="ghost" size="sm" onClick={() => onReview(mi)}>
                  Review
                </Button>
              </li>
            );
          })}
        </ol>
        {/* R-6 helpfulness ask (SME parity, operator trace 1a17c31b18dcd8ad):
            browser-local only — the zero-DB law means there is no server to
            receive it; the answer persists with the lesson's local flow
            state, is never scored (moduleDone untouched) and never leaves
            the device. */}
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">Was this guided lesson helpful?</p>
          {state.feedback ? (
            <p className="text-[13px] text-muted-foreground" role="status">
              {state.feedback === "up"
                ? "Thanks — glad it helped. Your answer stays on this device."
                : "Thanks — noted. Your answer stays on this device."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onFeedback("up")}>
                <ThumbsUp className="size-3.5" aria-hidden />
                Yes, helpful
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onFeedback("down")}>
                <ThumbsDown className="size-3.5" aria-hidden />
                Not really
              </Button>
            </div>
          )}
        </div>
        {/* R-2 lesson-end handoffs (SME parity, operator trace
            1a179c6b53bff529; per-topic deep links per operator trace
            1a179e73fc75e881): the set ends into the course's live practice
            surfaces. Hrefs resolve SERVER-SIDE from the hub.hrefs seam —
            the exam-questions set anchored to this note's subtopic (first
            in corpus order) and the subtopic's flashcard deck — with the
            course-level pages as the always-live fallback (never a 404
            handoff). */}
        <div className="space-y-1.5 border-t pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Keep going
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={examQuestionsHref}>Exam questions</a>
            </Button>
            <Button asChild variant="outline">
              <a href={flashcardsHref}>Flashcards</a>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={noteHref}>Back to the revision note</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${base}/revision-notes`}>All revision notes</a>
          </Button>
          <Button variant="ghost" onClick={onReset}>
            <RotateCcw className="size-4" aria-hidden />
            Restart
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────── R-3 mixed-type practice (derived · not scored) ─────────── */

type PracticeKind = "recall" | "explain" | "apply";

interface PracticeItem {
  kind: PracticeKind;
  kindLabel: string;
  prompt: string;
  model: string;
  /** recall items get the honest keyword auto-check hint on reveal */
  autoCheckModel?: string;
}

/** Content words for the recall auto-check — stopword-stripped, plural-trimmed. */
const PRACTICE_STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "was", "one",
  "our", "out", "get", "has", "him", "his", "how", "its", "new", "now", "old", "see",
  "two", "way", "who", "did", "that", "this", "with", "from", "they", "have", "will",
  "your", "what", "when", "where", "which", "into", "than", "then", "them", "these",
  "those", "there", "their", "been", "were", "also", "such", "each", "other", "more",
  "most", "some", "only", "same", "very", "just", "because", "about", "over", "under",
  "between", "both", "must", "like", "made", "make", "makes", "called", "call", "uses",
  "used", "use", "using",
]);

function practiceTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !PRACTICE_STOP_WORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/**
 * Honest keyword auto-check for recall items: the share of the model
 * answer's content words present in the learner's answer. A hint, never a
 * verdict — the self-confirm buttons make the final call (SME keyword
 * auto-grade parity without pretending to understand the sentence).
 */
function keywordAutoCheck(answer: string, model: string): boolean {
  const modelWords = practiceTokens(model);
  if (modelWords.length === 0) return false;
  const answerSet = new Set(practiceTokens(answer));
  const hits = modelWords.filter((w) => answerSet.has(w)).length;
  return hits / modelWords.length >= 0.4;
}

/**
 * Derives the practice items from the SAME pinned artifact the lesson rides
 * on — nothing is synthesised beyond recombination: authored glossary
 * placement, authored key points, authored misconceptions/explanations, the
 * authored worked example (first-module placement law, same as the example
 * stage). Explain-why is remediation-first: a misconception the learner
 * actually hit this session outranks the generic own-words prompt.
 */
function buildPracticeItems(
  lesson: GuidedLessonImport,
  module: GuidedModule,
  moduleOrdinal: number,
  questions: GuidedQuestion[],
  answers: FlowState["answers"],
): PracticeItem[] {
  const items: PracticeItem[] = [];
  const terms = glossaryFor(lesson, moduleOrdinal);
  if (terms.length > 0) {
    items.push({
      kind: "recall",
      kindLabel: "Quick recall",
      prompt: `Define: ${terms[0].term}`,
      model: terms[0].definition,
      autoCheckModel: terms[0].definition,
    });
  }
  let explained = false;
  for (const q of questions) {
    const a = answers[q.id];
    if (!a || a.correct) continue;
    const wrong = q.options.find((o) => o.key === a.picked);
    const misc =
      wrong?.misconception ??
      q.options.find((o) => !o.correct && o.misconception)?.misconception ??
      null;
    const correct = q.options.find((o) => o.correct);
    if (misc && correct) {
      items.push({
        kind: "explain",
        kindLabel: "Explain why",
        prompt: `Many learners think: ${misc} In your own words, explain why that's not right.`,
        model: correct.explanation,
      });
      explained = true;
      break;
    }
  }
  if (!explained && module.keyPoints.length > 0) {
    items.push({
      kind: "explain",
      kindLabel: "Explain why",
      prompt: `Put it into your own words: ${module.keyPoints[0]}`,
      model: `A strong explanation covers: ${module.keyPoints[0]}`,
    });
  }
  if (moduleOrdinal === 0 && lesson.lesson.assets.workedExample) {
    const we = lesson.lesson.assets.workedExample;
    items.push({
      kind: "apply",
      kindLabel: "Apply it",
      prompt: `Try this yourself before revealing the steps: ${we.prompt}`,
      model: `${we.steps
        .map((s, i) => `${i + 1}. ${s}`)
        .join(" ")} — Final answer: ${we.finalAnswer}`,
    });
  }
  return items;
}

const PRACTICE_ICON: Record<PracticeKind, typeof PenLine> = {
  recall: PenLine,
  explain: MessageCircleQuestion,
  apply: Calculator,
};

/**
 * R-3 mixed-type practice block (SME check-mix parity, operator trace
 * 1a179c6b53bff529): quick recall (keyword auto-check hint + self-confirm),
 * explain-why (self-grade against the model answer) and apply-it (the
 * authored worked example). Ephemeral by design — component state only,
 * never written to FlowState or localStorage, never counted in moduleDone;
 * the authored MCQ checks remain the only scored record, and the on-screen
 * copy says so.
 */
function MixedPractice({
  lesson,
  module,
  moduleOrdinal,
  questions,
  answers,
}: {
  lesson: GuidedLessonImport;
  module: GuidedModule;
  moduleOrdinal: number;
  questions: GuidedQuestion[];
  answers: FlowState["answers"];
}) {
  const items = useMemo(
    () => buildPracticeItems(lesson, module, moduleOrdinal, questions, answers),
    [lesson, module, moduleOrdinal, questions, answers],
  );
  const [pi, setPi] = useState(0);
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [marked, setMarked] = useState<null | "hit" | "miss">(null);

  if (items.length === 0) return null;
  const item = items[Math.min(pi, items.length - 1)];
  const Icon = PRACTICE_ICON[item.kind];
  const auto =
    item.autoCheckModel && revealed ? keywordAutoCheck(draft, item.autoCheckModel) : null;

  const reveal = () => setRevealed(true);
  const advance = () => {
    setPi((n) => n + 1);
    setDraft("");
    setRevealed(false);
    setMarked(null);
  };

  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Go further — mixed practice
        </p>
        <Badge variant="secondary" className="text-[11px]">
          Item {Math.min(pi + 1, items.length)} of {items.length}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Extra practice in the mixed format — not scored, and not recorded on your lesson
        progress. The check above stays as your record.
      </p>

      {marked ? (
        <div className="space-y-3" role="status">
          <p className="text-[13px] font-medium">
            {marked === "hit" ? "Nice — noted for you." : "Fair enough — the model answer is above."}
          </p>
          {pi < items.length - 1 ? (
            <Button size="sm" onClick={advance}>
              Next practice item
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
              Mixed practice done — nice work.
            </p>
          )}
        </div>
      ) : (
        <fieldset className="space-y-2.5">
          <legend className="text-sm font-medium leading-snug">
            <span className="mr-2 inline-flex items-center gap-1.5 text-muted-foreground">
              <Icon className="size-4" aria-hidden />
              {item.kindLabel}
            </span>
            {item.prompt}
          </legend>
          {item.kind !== "apply" && (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder={
                item.kind === "recall" ? "Type your definition…" : "Type your explanation…"
              }
              aria-label={`Your answer for the ${item.kindLabel} practice item`}
            />
          )}
          {!revealed ? (
            <Button size="sm" variant="outline" onClick={reveal}>
              Reveal model answer
            </Button>
          ) : (
            <div className="space-y-2" role="status">
              {auto !== null && (
                <p
                  className={cn(
                    "text-[13px] font-medium",
                    auto
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {auto
                    ? "Auto-check: key words from the model answer spotted in yours."
                    : "Auto-check: few of the model answer's key words appeared — compare them below."}
                  <span className="ml-1 font-normal text-muted-foreground">
                    A hint, not a verdict — you make the final call.
                  </span>
                </p>
              )}
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Model answer: </span>
                {item.model}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setMarked("hit")}>
                  <ThumbsUp className="size-3.5" aria-hidden />
                  I had it
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMarked("miss")}>
                  Not yet
                </Button>
              </div>
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
