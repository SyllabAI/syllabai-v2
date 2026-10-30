"use client";

/**
 * Test Builder — teacher workspace (TEACHER-2, builder pass).
 *
 * Demo implementation of TEACHER_ARCHITECTURE.md §6, now functionally
 * aligned with the Save My Exams Test Builder (the 6 saved /TestBuilder
 * pages in the SME corpus repo):
 *
 *   ── two-zone builder layout ──────────────────────────────────────────
 *   LEFT  · question bank: topic filter tree, difficulty chips, question
 *           cards with preview + marks/difficulty badges and an explicit
 *           "Add" affordance (SME: bank rows + "Add question to test");
 *           "Load more" pagination.
 *   RIGHT · "Your test": editable test name (SME: AssessmentNameInput),
 *           "N questions · M marks" summary with a progress ring toward
 *           the marks target (SME: ProgressRing), Questions / Mark scheme
 *           tabs (SME parity), per-question move up/down/remove (SME
 *           context menu), and an empty state ("Select questions to
 *           start building your test").
 *   Download modal (SME: Download flow): pick the copy — student handout
 *   (Questions) or teacher copy (Questions + mark scheme) — plus PDF
 *   settings: include cover page, answer space lines for open-response
 *   parts, "don't split over a page break"; a running Total.
 *
 *   ── syllabai additions kept from the previous passes ─────────────────
 *   - auto-build from the class's weak areas with the stale-preview banner
 *     ("update preview" instead of silently destroying the paper).
 *     CD-A-hub (trace 1a18c3130e0a29f5): the weak-area lane is now
 *     SOURCE-AWARE — the law-pinned server view
 *     (/api/v1/teacher/tests/weakness-options, policy
 *     test-builder-weakness/v1, resolved through the explicit
 *     curriculumCode→knowledgeNodeId bridge) when it resolves, the
 *     committed-bundle SAMPLE cohort as the LABELED fallback (the demo-era
 *     thresholds live verbatim in lib/teacher/weakness-lane.ts). Live
 *     targeting assembles on the SERVER (validated-only, deterministic —
 *     the testBuilderPreview contract); the demo assembler keeps the
 *     sample plane. The two vocabularies never mix;
 *   - provenance on every part (subtopic, spec points, source paper);
 *   - saved tests persist the EXPLICIT question list (fixes the old
 *     controls-only save semantics); legacy saves fall back to controls;
 *   - corpus choice-text repair at render (camel-boundary space);
 *   - drag-to-reorder in the paper (@dnd-kit, grip handle with pointer/
 *     touch sensor) alongside ↑/↓ arrows and a type-the-position "move to
 *     position" input for long papers;
 *   - the WHOLE builder state (course, filters, auto-build controls,
 *     name, paper, pdf settings, hand-added ids) persists as a versioned
 *     localStorage draft and survives a refresh; the landing offers
 *     Resume / Discard, an explicit save commits (clears) the draft.
 * Export = browser print (print CSS hides the app chrome).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ClipboardList,
  Download,
  Eye,
  FileText,
  GripVertical,
  Loader2,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Markdown } from "@/components/markdown";
import { TeacherNav } from "@/components/teacher/teacher-nav";
import { api, ApiError } from "@/lib/api";
import type { SubjectView, TestPreviewView } from "@/lib/types";
import {
  liveWeakLane,
  resolveRootIdForCourse,
  sampleWeakTargets,
  type WeakLaneGap,
  type WeakLaneLive,
  type WeakLaneTarget,
} from "@/lib/teacher/weakness-lane";
import { WeaknessLaneRows } from "./weakness-lane-view";
import { useSavedTests } from "@/lib/teacher/stores";
import {
  filterTaughtCourses,
  readBuilderDraft as readStoredDraft,
  resolveInitialCourse,
  writeBuilderDraft as writeStoredDraft,
} from "@/lib/teacher/test-builder-access";
import type { TeacherCourseData } from "@/lib/teacher/types";
import type { AssembledQuestion, AssembledTest } from "@/lib/teacher/test-assembly";
import type { SwitchableCourse } from "@/lib/teacher/types";

const WEAK_LANE_CAP = 6;
const BANK_PAGE = 40;

/** Builder draft (whole builder state across refreshes) — persisted PER
 *  COURSE since T-TEACH-008 (one slot per class, lib/teacher/
 *  test-builder-access.ts): switching classes never clobbers another
 *  class's work-in-progress. An explicit Save commits the work and clears
 *  the draft; Discard on the landing clears it too. */
interface BuilderDraft {
  v: 1;
  course: string;
  view: "tests" | "builder";
  selected: string[];
  mode: "marks" | "count";
  targetMarks: string;
  maxQuestions: string;
  difficulty: DifficultyFilter;
  testName: string;
  stale: boolean;
  pdf: PdfSettings;
  /** hand-added/restored question ids — survive auto-build rebuilds */
  manualIds: string[];
  test: AssembledTest | null;
  savedAt: string;
}

/** Shallow-shape guard for a restored draft of ONE (taught) course: the
 *  stored draft must belong to the requested slug (membership in the taught
 *  set is guaranteed by the render gate) and a persisted paper must belong
 *  to the same course. Anything else degrades to "no draft". Storage, the
 *  v+course identity law and the legacy-v1 migration live in
 *  lib/teacher/test-builder-access.ts; this wrapper owns the builder's
 *  shape law. */
function readBuilderDraft(slug: string): BuilderDraft | null {
  const d = readStoredDraft(slug) as BuilderDraft | null;
  if (!d) return null;
  if (!Array.isArray(d.selected) || !Array.isArray(d.manualIds)) return null;
  const test = d.test;
  if (
    test !== null &&
    test !== undefined &&
    (!test || !Array.isArray(test.questions) || test.course?.slug !== slug)
  )
    return null;
  return d;
}

type DifficultyFilter = "all" | "easy" | "medium" | "hard";

type BankQuestion = AssembledQuestion & { preview: string };

interface BankState {
  course: AssembledTest["course"];
  questions: BankQuestion[];
  total: number;
  nextOffset: number | null;
}

interface PdfSettings {
  copy: "student" | "teacher";
  coverPage: boolean;
  answerSpace: boolean;
  answerLines: number;
  noSplit: boolean;
}

/** Corpus choice strings sometimes glue two "Label: value" segments together
 *  ("…: copperPositive electrode: …") — a camel-boundary space is a strict,
 *  conservative repair (choices only; prose is untouched). */
function normalizeChoiceText(s: string): string {
  return s.replace(/([a-z])([A-Z][a-z])/g, "$1 $2");
}

const INLINE_TAG_RE = /<(\/?)(sub|sup)>/gi;

/** Corpus choices carry light inline markup — chemical formulae like
 *  "C<sub>4</sub>H<sub>6</sub>O<sub>4</sub>" and "10<sup>6</sup>" are the ONLY
 *  tags present (195 sub + 56 sup occurrences bank-wide). Choices render as
 *  plain list text (unlike problemMd, which goes through rehype-raw), so the
 *  tags must be converted HERE or they print literally on the paper.
 *  Stray/unclosed tags degrade to literal text. */
function RichChoiceText({ text }: { text: string }) {
  const src = normalizeChoiceText(text);
  const out: React.ReactNode[] = [];
  const frames: { tag: "sub" | "sup"; items: React.ReactNode[] }[] = [];
  let key = 0;
  const emit = (node: React.ReactNode) => {
    (frames.length > 0 ? frames[frames.length - 1].items : out).push(node);
  };
  let last = 0;
  for (const m of src.matchAll(INLINE_TAG_RE)) {
    if (m.index > last) emit(<span key={key++}>{src.slice(last, m.index)}</span>);
    last = m.index + m[0].length;
    const tag = m[2].toLowerCase() as "sub" | "sup";
    if (m[1]) {
      const openIdx = frames.map((f) => f.tag).lastIndexOf(tag);
      if (openIdx === -1) emit(<span key={key++}>{m[0]}</span>);
      else {
        const frame = frames.splice(openIdx)[0];
        emit(
          tag === "sub" ? (
            <sub key={key++}>{frame.items}</sub>
          ) : (
            <sup key={key++}>{frame.items}</sup>
          ),
        );
      }
    } else {
      frames.push({ tag, items: [] });
    }
  }
  if (last < src.length) emit(<span key={key++}>{src.slice(last)}</span>);
  while (frames.length > 0) {
    const frame = frames.pop()!;
    emit(<span key={key++}>{frame.items}</span>);
  }
  return <>{out}</>;
}

/** A/B/C/D choice list — shared by the paper, the view modal (and print). */
function ChoiceList({ choices }: { choices: { label: string; textMd: string }[] }) {
  return (
    <ul className="mt-1.5 list-none space-y-1 pl-1">
      {choices.map((choice) => (
        <li key={choice.label} className="text-[13px] [overflow-wrap:anywhere]">
          <span className="font-medium">{choice.label})</span>{" "}
          <RichChoiceText text={choice.textMd} />
        </li>
      ))}
    </ul>
  );
}

function capDifficulty(d: string | null): string | null {
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : null;
}

/** Student handouts drop the tier note ("Separate: Chemistry Only") —
 *  it is captured as a markdown heading ("#### Separate: …"). */
function stripTierLines(md: string): string {
  return md
    .split("\n")
    .filter((line) => !/^#{0,6}\s*separate\b/i.test(line.trim()))
    .join("\n");
}

function pluralMarks(n: number): string {
  return `${n} mark${n === 1 ? "" : "s"}`;
}

/** Stable fingerprint of the committed paper: saved name + explicit question
 *  order. Same name+ids ⟺ the builder state is already in "Your tests". */
function paperKey(name: string, ids: string[]): string {
  return `${name}::${ids.join(",")}`;
}

/* Difficulty + status chips ride the semantic slots as outline pills
   (border + slot text — slot voices pass on card in every theme-mode,
   while slot-on-self-wash fails for mid-tone voices; slots flip per
   mode, no dark: overrides). Design-audit second pass (m5). */
function difficultyBadgeClass(d: string | null): string {
  switch ((d ?? "").toLowerCase()) {
    case "easy":
      return "border-success/40 text-success";
    case "medium":
      return "border-warn/40 text-warn";
    case "hard":
      return "border-destructive/40 text-destructive";
    default:
      return "";
  }
}

/** Progress ring toward the marks target (SME: ProgressRing). */
function ProgressRing({ value, max }: { value: number; max: number | null }) {
  const pct = max && max > 0 ? Math.min(1, value / max) : 0;
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex size-9 shrink-0 items-center justify-center"
      role="img"
      aria-label={
        max && max > 0 ? `${value} of ${max} marks (${Math.round(pct * 100)}%)` : `${value} marks`
      }
    >
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={
            max && value >= max ? "stroke-success" : "stroke-primary transition-[stroke-dashoffset] duration-500"
          }
        />
      </svg>
      <span className="absolute text-[9px] font-bold">{max && max > 0 ? `${Math.round(pct * 100)}%` : value}</span>
    </span>
  );
}

/** Cover page block (SME: "Include cover page") — screen preview + print. */
function CoverPage({
  title,
  course,
  totalMarks,
  questionCount,
}: {
  title: string;
  course: AssembledTest["course"];
  totalMarks: number;
  questionCount: number;
}) {
  return (
    <section
      aria-label="Cover page"
      className="mb-6 rounded-lg border-2 border-foreground/20 p-6 text-center print:rounded-none print:border-0 print:break-after-page"
    >
      <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        {course.level} · {course.code}
      </p>
      <h2 className="mt-3 font-display text-3xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {course.subject} — class test
      </p>
      <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-sm" aria-hidden>
        <span className="text-left text-muted-foreground">Total marks</span>
        <span className="text-right font-medium">{totalMarks}</span>
        <span className="text-left text-muted-foreground">Questions</span>
        <span className="text-right font-medium">{questionCount}</span>
        <span className="text-left text-muted-foreground">Suggested time</span>
        <span className="text-right font-medium">≈ {totalMarks} min</span>
      </div>
      <div className="mx-auto mt-8 max-w-sm space-y-5 text-left text-sm">
        <p>
          Name: <span className="ml-1 inline-block w-56 border-b border-foreground/40" aria-hidden />
        </p>
        <p>
          Class: <span className="ml-1 inline-block w-56 border-b border-foreground/40" aria-hidden />
        </p>
        <p>
          Date: <span className="ml-1 inline-block w-56 border-b border-foreground/40" aria-hidden />
        </p>
      </div>
      <p className="mx-auto mt-8 max-w-sm text-left text-xs leading-relaxed text-muted-foreground">
        Answer <span className="font-medium text-foreground">all</span> questions. Show all
        working — marks are awarded for method as well as the final answer.
      </p>
    </section>
  );
}

export function TestBuilderClient({
  courses,
  initialCourse,
  initialSubtopics,
  initialView,
}: {
  courses: SwitchableCourse[];
  initialCourse: string | null;
  initialSubtopics: string[];
  initialView: "tests" | "builder";
}) {
  // T-TEACH-008: the course resolves ONLY after the taught set loads — the
  // builder offers the intersection of the committed registry with the
  // courseSlugs of the teacher's OWN classes (api.teacherClasses(),
  // ownership-scoped since T-TEACH-005/006), never the full registry.
  const [course, setCourse] = useState<string | null>(null);
  // null = the classes fetch is in flight; empty set = fail-closed (no
  // taught courses known → nothing offered); a fetch error lands in
  // taughtError (retryable) instead of silently widening the set.
  const [taughtSlugs, setTaughtSlugs] = useState<Set<string> | null>(null);
  const [taughtError, setTaughtError] = useState(false);
  const [taughtAttempt, setTaughtAttempt] = useState(0);
  // course payload lives in ONE course-tagged state; loading/error derive from
  // it (no synchronous setState in the fetch effect — react-hooks lint rules)
  const [state, setState] = useState<{
    course: string;
    data?: TeacherCourseData;
    error?: string;
  } | null>(null);
  const loading = course !== null && state?.course !== course;
  const data = state?.course === course ? state.data : undefined;
  const loadError = state?.course === course ? state.error : undefined;
  const preselectRef = useRef(initialSubtopics);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSubtopics));

  // ── bank browser state ──────────────────────────────────────────────────
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [bank, setBank] = useState<BankState | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [expandedBank, setExpandedBank] = useState<Set<string>>(new Set());
  const [showAllWeak, setShowAllWeak] = useState(false);

  // ── CD-A-hub: the weak-area lane's source state ─────────────────────
  // subjects once (api.subjects() is cachedGet — one fetch per session);
  // the per-course weakness fetch resolves rootId through the EXPLICIT
  // curriculumCode→knowledgeNodeId bridge (never derived, never guessed)
  // and consumes the law-pinned view. Any failure (dormant-port 501,
  // unmeasured-root 404, auth, network) fail-closes to the LABELED sample
  // lane — never a silent mix, never a fabricated live row.
  type WeaknessState =
    | { status: "loading" }
    | { status: "unresolvable" }
    | { status: "unavailable" }
    | { status: "live"; lane: WeakLaneLive };
  const [subjects, setSubjects] = useState<SubjectView[] | null>(null);
  const [weakness, setWeakness] = useState<WeaknessState | null>(null);
  // live targeting assembles on the SERVER (testBuilderPreview) — this is
  // the summary-card state (the Class-Intelligence remediation posture:
  // counts + topic codes + pointer, never a parallel paper renderer)
  const [preview, setPreview] = useState<
    | { status: "loading" }
    | { status: "ready"; view: TestPreviewView }
    | { status: "error"; message: string }
    | null
  >(null);
  const prevLaneSourceRef = useRef<"live" | "sample">("sample");

  // ── auto-build controls ─────────────────────────────────────────────────
  const [mode, setMode] = useState<"marks" | "count">("marks");
  const [targetMarks, setTargetMarks] = useState<string>("40");
  const [maxQuestions, setMaxQuestions] = useState<string>("20");

  // ── your-test state ─────────────────────────────────────────────────────
  const [test, setTest] = useState<AssembledTest | null>(null);
  const [stale, setStale] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [testName, setTestName] = useState("");
  const [tab, setTab] = useState<"questions" | "scheme">("questions");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [pdf, setPdf] = useState<PdfSettings>({
    copy: "teacher",
    coverPage: false,
    answerSpace: true,
    answerLines: 3,
    noSplit: true,
  });

  const [savedFlash, setSavedFlash] = useState(false);
  const { tests, save, remove } = useSavedTests();
  // T-TEACH-008: the landing is PER-CLASS — only the current course's saves
  // (every save has carried its course slug since stores.ts day one)
  const courseTests = useMemo(
    () => tests.filter((t) => t.course === course),
    [tests, course],
  );
  const resultRef = useRef<HTMLElement | null>(null);

  // ── tests-first landing / builder view ──────────────────────────────────
  // landing lists saved tests; "+ Create test" opens the builder
  const [view, setView] = useState<"tests" | "builder">(initialView);
  // bank keyword search (server-side via question-bank?q=…) + in-test filter
  const [search, setSearch] = useState("");
  const [hideInTest, setHideInTest] = useState(false);
  // full question view modal (SME: View — all parts + key before adding)
  const [viewing, setViewing] = useState<BankQuestion | null>(null);
  // hand-added (or restored) questions survive auto-build rebuilds
  const manualIdsRef = useRef<Set<string>>(new Set());
  // key of the paper content last committed to "Your tests" (save or open).
  // When the current builder state matches it, no draft is kept and the
  // landing hides the "unsaved draft" chip — the draft can never claim a
  // saved paper is unsaved. State (not a ref) so render can read it.
  const [committedKey, setCommittedKey] = useState<string | null>(null);
  // undo for removing a question from the paper (8 s window)
  const [undoState, setUndoState] = useState<{ q: AssembledQuestion; index: number } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  // floating test summary while browsing the bank
  const [showFloat, setShowFloat] = useState(false);
  // ── draft persistence (whole builder state across refresh) ──────────────
  const hydratedRef = useRef(false);

  function goBuilder() {
    setView("builder");
    window.history.replaceState(null, "", "/teacher/test-builder?view=builder");
  }
  function goTests() {
    setView("tests");
    window.history.replaceState(null, "", "/teacher/test-builder");
  }

  /** T-TEACH-008 — the ONE class-switch path (builder select + landing
   *  switcher share it): reset the in-memory build; the per-course draft
   *  restores the target class's work on arrival, so the switch is
   *  non-destructive and needs no confirm. `next` is taught by
   *  construction — both selects render only taughtCourses. */
  function switchCourse(next: string | null) {
    setCourse(next);
    setSelected(new Set());
    setTest(null);
    setStale(false);
    setBank(null);
    setBankError(null);
    setDifficulty("all");
    manualIdsRef.current = new Set();
    setUndoState(null);
    setWeakness(null);
    setPreview(null);
  }

  // T-TEACH-008 escape hatch: a saved test opened across courses sets the
  // builder state itself — the NEXT restore-on-arrival effect run (that
  // course change) must not clobber it with the stored draft.
  const suppressRestoreRef = useRef(false);
  // floating bar visibility while scrolling the (long) bank
  useEffect(() => {
    const onScroll = () => setShowFloat(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  }, []);

  // ── the taught set (T-TEACH-008): the teacher's own classes decide which
  // courses the builder offers — fail-closed on fetch error (an empty set,
  // with a retry), never the full registry ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    api
      .teacherClasses()
      .then((classes) => {
        if (!cancelled) {
          setTaughtSlugs(new Set(classes.map((c) => c.courseSlug)));
          setTaughtError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTaughtSlugs(new Set());
          setTaughtError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [taughtAttempt]);

  const taughtCourses = useMemo(
    () => (taughtSlugs === null ? null : filterTaughtCourses(courses, taughtSlugs)),
    [courses, taughtSlugs],
  );

  // ── CD-A-hub: subject rows for the slug→rootId bridge (once per session) ─
  useEffect(() => {
    let cancelled = false;
    api
      .subjects()
      .then((list) => {
        if (!cancelled) setSubjects(list);
      })
      .catch(() => {
        if (!cancelled) setSubjects([]); // unresolvable → labeled sample lane
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── CD-A-hub: the per-course weakness lane fetch ─────────────────────
  useEffect(() => {
    if (!course || subjects === null) return;
    const meta = (taughtCourses ?? []).find((c) => c.slug === course);
    const rootId = resolveRootIdForCourse(meta?.curriculumCode, subjects);
    if (!rootId) {
      setWeakness({ status: "unresolvable" });
      return;
    }
    let cancelled = false;
    setWeakness({ status: "loading" });
    api
      .testBuilderWeaknessOptions(rootId)
      .then((v) => {
        if (!cancelled) setWeakness({ status: "live", lane: liveWeakLane(v) });
      })
      .catch(() => {
        if (!cancelled) setWeakness({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [course, subjects, taughtCourses]);

  // the lane renders ONE source at a time and the two vocabularies never
  // mix (sample selections are bundle subtopic codes, live selections are
  // knowledge topicNodeIds) — a source flip invalidates every prior
  // selection, including a ?subtopics= deep-link preselect (honest: those
  // codes are demo-plane and the live server assembly cannot use them)
  const laneSource: "live" | "sample" = weakness?.status === "live" ? "live" : "sample";
  useEffect(() => {
    if (prevLaneSourceRef.current === laneSource) return;
    prevLaneSourceRef.current = laneSource;
    queueMicrotask(() => {
      setSelected(new Set());
      setPreview(null);
    });
  }, [laneSource]);

  // resolve the landing course once the taught set is known: an untaught
  // deep-link slug degrades to the first taught course (never opens the
  // untaught builder); no taught courses → null (the honest empty state)
  useEffect(() => {
    if (taughtCourses === null || course !== null) return;
    const resolved = resolveInitialCourse(initialCourse, taughtCourses);
    if (resolved !== null) {
      // microtask, not synchronous — react-hooks/set-state-in-effect
      queueMicrotask(() => setCourse(resolved));
    }
  }, [taughtCourses, course, initialCourse]);

  // ── restore THIS course's draft on arrival — the initial mount AND every
  // class switch (the per-course draft is what makes switching classes
  // non-destructive, so the old "switch subject?" confirm is gone). The
  // microtask defers the setState out of the effect body; the course-fetch
  // effect's `cancelled` guard absorbs the ordering (default fetch starts,
  // is cancelled, re-runs against the restored course). One escape: a saved
  // test opened across courses sets the state itself — suppressRestoreRef
  // hands this arrival to that flow. ─────────────────────────────────────
  useEffect(() => {
    if (!course) return;
    queueMicrotask(() => {
      if (suppressRestoreRef.current) {
        suppressRestoreRef.current = false;
        hydratedRef.current = true;
        return;
      }
      const d = readBuilderDraft(course);
      if (d) {
        setSelected(new Set(d.selected));
        setMode(d.mode === "count" ? "count" : "marks");
        setTargetMarks(typeof d.targetMarks === "string" && d.targetMarks ? d.targetMarks : "40");
        setMaxQuestions(typeof d.maxQuestions === "string" && d.maxQuestions ? d.maxQuestions : "20");
        setDifficulty(
          d.difficulty === "easy" || d.difficulty === "medium" || d.difficulty === "hard"
            ? d.difficulty
            : "all",
        );
        setTestName(typeof d.testName === "string" ? d.testName : "");
        setTest(d.test ?? null);
        setStale(Boolean(d.stale));
        if (d.pdf) {
          setPdf((p) => ({
            ...p,
            copy: d.pdf!.copy === "student" ? "student" : "teacher",
            coverPage: Boolean(d.pdf!.coverPage),
            answerSpace: Boolean(d.pdf!.answerSpace),
            answerLines:
              typeof d.pdf!.answerLines === "number"
                ? Math.min(8, Math.max(1, Math.round(d.pdf!.answerLines)))
                : 3,
            noSplit: Boolean(d.pdf!.noSplit),
          }));
        }
        manualIdsRef.current = new Set(d.manualIds);
      }
      hydratedRef.current = true;
    });
  }, [course]);

  // ── persist the whole builder state as a PER-COURSE draft (debounced);
  // manual ids are only ever mutated alongside a persisted dep, so the ref
  // read at write time is safe ─────────────────────────────────────────
  useEffect(() => {
    if (!hydratedRef.current || !course) return;
    const timer = window.setTimeout(() => {
      try {
        if (
          test &&
          paperKey(testName, test.questions.map((q) => q.id)) === committedKey
        ) {
          // the paper is already committed to "Your tests" — no draft
          writeStoredDraft(course, null);
          return;
        }
        if (!test && selected.size === 0 && testName.trim() === "") {
          // nothing worth resuming (e.g. right after Discard) — no draft
          writeStoredDraft(course, null);
          return;
        }
        const draft: BuilderDraft = {
          v: 1,
          course,
          view,
          selected: [...selected],
          mode,
          targetMarks,
          maxQuestions,
          difficulty,
          testName,
          stale,
          pdf,
          manualIds: [...manualIdsRef.current],
          test,
          savedAt: new Date().toISOString(),
        };
        writeStoredDraft(course, draft);
      } catch {
        // private mode / quota — the draft just won't persist
      }
    }, 250);
    return () => window.clearTimeout(timer);
    // draft autosave: re-arms only when the ASSEMBLY inputs change; omitting
    // the debounce internals is deliberate (they are stable locals)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, view, selected, mode, targetMarks, maxQuestions, difficulty, testName, stale, pdf, test]);

  // load the course payload (bank stats + class evidence) per course switch;
  // state updates happen only in async callbacks, never synchronously
  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    fetch(`/api/teacher/course-data?slug=${encodeURIComponent(course)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`course data unavailable (${res.status})`);
        return (await res.json()) as TeacherCourseData;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({ course, data: payload });
        // deep-linked subtopic codes (class-graph remediation) preselect once
        const codes = preselectRef.current;
        if (codes.length > 0) {
          preselectRef.current = [];
          const valid = new Set(
            payload.class.sections.flatMap((s) => s.subtopics.map((t) => t.code)),
          );
          setSelected((prev) => {
            const next = new Set(prev);
            for (const code of codes) if (valid.has(code)) next.add(code);
            return next;
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({ course, error: err instanceof Error ? err.message : "failed to load course" });
      });
    return () => {
      cancelled = true;
    };
  }, [course]);

  // ── bank listing (debounced filter → fetch page 0; loadMore appends) ────
  const bankKey = useMemo(
    () => `${course ?? ""}|${[...selected].sort().join(",")}|${difficulty}|${search.trim().toLowerCase()}`,
    [course, selected, difficulty, search],
  );
  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ slug: course, limit: String(BANK_PAGE) });
      if (selected.size > 0) params.set("subtopics", [...selected].join(","));
      if (difficulty !== "all") params.set("difficulty", difficulty);
      if (search.trim()) params.set("q", search.trim());
      fetch(`/api/teacher/question-bank?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`question bank unavailable (${res.status})`);
          return (await res.json()) as BankState;
        })
        .then((payload) => {
          if (!cancelled) {
            setBank(payload);
            setBankError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled)
            setBankError(err instanceof Error ? err.message : "failed to load questions");
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // bankKey is the canonical filter signature (course | topics | difficulty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankKey]);

  function loadMoreBank() {
    if (!course || !bank || bank.nextOffset === null || bankLoading) return;
    setBankLoading(true);
    const params = new URLSearchParams({
      slug: course,
      limit: String(BANK_PAGE),
      offset: String(bank.nextOffset),
    });
    if (selected.size > 0) params.set("subtopics", [...selected].join(","));
    if (difficulty !== "all") params.set("difficulty", difficulty);
    if (search.trim()) params.set("q", search.trim());
    fetch(`/api/teacher/question-bank?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`question bank unavailable (${res.status})`);
        return (await res.json()) as BankState;
      })
      .then((payload) => {
        setBank((prev) =>
          prev
            ? {
                ...prev,
                questions: [...prev.questions, ...payload.questions],
                nextOffset: payload.nextOffset,
              }
            : payload,
        );
      })
      .catch((err: unknown) => {
        setBankError(err instanceof Error ? err.message : "failed to load questions");
      })
      .finally(() => setBankLoading(false));
  }

  // ── derived state ───────────────────────────────────────────────────────

  // class-weakness lane (TEACHER_ARCHITECTURE §6.3) — CD-A-hub: live rows
  // come from the law-pinned view (SERVER ORDER preserved, honest nulls);
  // the sample rows are the demo derivation moved VERBATIM into
  // lib/teacher/weakness-lane.ts and rendered under an explicit demo-data
  // label. Coverage gaps are informational — never selectable, never weak.
  const laneLive = weakness?.status === "live" ? weakness.lane : null;
  const laneGaps: WeakLaneGap[] = laneLive ? laneLive.gaps : [];
  const weakTargets: WeakLaneTarget[] = useMemo(() => {
    if (weakness?.status === "live") return weakness.lane.targets;
    if (!data) return [];
    return sampleWeakTargets(data.class);
  }, [weakness, data]);

  const allSubtopics = useMemo(
    () => data?.class.sections.flatMap((s) => s.subtopics) ?? [],
    [data],
  );

  const selectedMarks = useMemo(
    () =>
      allSubtopics
        .filter((s) => selected.has(s.code))
        .reduce((acc, s) => acc + s.totalMarks, 0),
    [allSubtopics, selected],
  );

  const inTestIds = useMemo(
    () => new Set(test?.questions.map((q) => q.id) ?? []),
    [test],
  );

  // "hide questions already in the test" — client-side over the loaded pages
  const visibleBank = useMemo(
    () =>
      hideInTest && bank
        ? bank.questions.filter((x) => !inTestIds.has(x.id))
        : (bank?.questions ?? []),
    [bank, hideInTest, inTestIds],
  );

  // selected subtopics the current fill left unrepresented (marks mode)
  const unrepresented = useMemo(() => {
    if (!test) return [];
    const covered = new Set(test.subtopics.map((s) => s.code));
    return [...selected]
      .filter((c) => !covered.has(c))
      .map((c) => allSubtopics.find((s) => s.code === c))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
  }, [test, selected, allSubtopics]);

  // subject dropdown: dedupe identical label+code pairs, group by
  // qualification, sort inside groups; "Ict" casing fix at display level.
  // T-TEACH-008: derived from the TAUGHT intersection, not the registry.
  const courseGroups = useMemo(() => {
    const seen = new Set<string>();
    const deduped: SwitchableCourse[] = [];
    for (const c of [...(taughtCourses ?? [])].sort(
      (a, b) =>
        (a.level + a.label).localeCompare(b.level + b.label) ||
        a.slug.localeCompare(b.slug),
    )) {
      const key = `${c.label}|${c.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(c.label === "Ict" ? { ...c, label: "ICT" } : c);
    }
    const groups = new Map<string, SwitchableCourse[]>();
    for (const c of deduped) {
      const list = groups.get(c.level) ?? [];
      list.push(c);
      groups.set(c.level, list);
    }
    return [...groups.entries()];
  }, [taughtCourses]);

  const current = (taughtCourses ?? []).find((c) => c.slug === course);
  const paperTitle = testName.trim() || `${test?.course.subject ?? current?.label ?? ""} — class test`;
  // progress-ring target: the current marks input, clamped to the API range
  const ringMax =
    mode === "marks" ? Math.min(300, Math.max(1, Number(targetMarks) || 0)) || null : null;

  // ── actions ─────────────────────────────────────────────────────────────

  /** auto-build setting edits make the assembled preview stale — never
   *  destroy it; manual paper edits (add/move/remove) never do. A settings
   *  or selection change also retires the live server-assembly summary. */
  function markStale() {
    setPreview(null);
    setStale((prev) => (test && !prev ? true : prev));
  }

  function toggle(code: string) {
    markStale();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleAllWeak() {
    if (weakTargets.length === 0) return;
    markStale();
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = weakTargets.every((w) => next.has(w.key));
      for (const w of weakTargets) {
        if (allIn) next.delete(w.key);
        else next.add(w.key);
      }
      return next;
    });
  }

  /** explicit question add (SME: "Add question to test") — edits the paper
   *  directly, no stale flag involved. Hand-added questions are remembered
   *  so an auto-build rebuild keeps them (banner promise). */
  function addQuestion(q: BankQuestion) {
    manualIdsRef.current.add(q.id);
    setTest((prev) => {
      if (!prev) {
        if (!bank) return prev;
        return {
          course: bank.course,
          title: `${bank.course.subject} test — ${bank.course.code}`,
          questions: [q],
          totalMarks: q.marks,
          targetMarks: null,
          subtopics: [q.subtopic],
          generatedAt: new Date().toISOString(),
        };
      }
      if (prev.questions.some((x) => x.id === q.id)) return prev;
      const questions = [...prev.questions, q];
      return {
        ...prev,
        questions,
        totalMarks: questions.reduce((a, x) => a + x.marks, 0),
        subtopics: [...new Map(questions.map((x) => [x.subtopic.code, x.subtopic])).values()].sort(
          (a, b) => a.code.localeCompare(b.code),
        ),
      };
    });
  }

  function moveQuestion(i: number, dir: -1 | 1) {
    setTest((prev) => {
      if (!prev) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.questions.length) return prev;
      const qs = [...prev.questions];
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...prev, questions: qs };
    });
  }

  /** jump a question to an explicit position (0-based target) — the
   *  long-paper alternative to repeated ↑/↓ presses. Manual paper edits
   *  never touch the stale flag. */
  function moveQuestionTo(i: number, pos: number) {
    setTest((prev) => {
      if (!prev) return prev;
      const j = Math.max(0, Math.min(prev.questions.length - 1, pos));
      if (j === i) return prev;
      return { ...prev, questions: arrayMove(prev.questions, i, j) };
    });
  }

  // drag-to-reorder sensor: pointer/touch on the grip handle. Keyboard users
  // reorder via the ↑/↓ buttons and the type-a-position box instead — the
  // dnd-kit keyboard sensor never resolves a new `over` in this tall-row
  // layout (verified in local E2E), so it would lift without moving.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setTest((prev) => {
      if (!prev) return prev;
      const from = prev.questions.findIndex((q) => q.id === active.id);
      const to = prev.questions.findIndex((q) => q.id === over.id);
      if (from === -1 || to === -1) return prev;
      return { ...prev, questions: arrayMove(prev.questions, from, to) };
    });
  }

  /** remove with undo — the question (and its position) is recoverable for
   *  8 s via the floating "Undo remove" affordance. */
  function removeQuestion(i: number) {
    const prev = test;
    if (!prev) return;
    const removed = prev.questions[i];
    if (!removed) return;
    manualIdsRef.current.delete(removed.id);
    setUndoState({ q: removed, index: i });
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => setUndoState(null), 8000);
    const qs = prev.questions.filter((_, k) => k !== i);
    setTest({
      ...prev,
      questions: qs,
      totalMarks: qs.reduce((a, q) => a + q.marks, 0),
      subtopics: [...new Map(qs.map((x) => [x.subtopic.code, x.subtopic])).values()].sort(
        (a, b) => a.code.localeCompare(b.code),
      ),
    });
  }

  function undoRemove() {
    const u = undoState;
    const prev = test;
    if (!u) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setUndoState(null);
    if (!prev || prev.questions.some((x) => x.id === u.q.id)) return;
    manualIdsRef.current.add(u.q.id);
    const qs = [...prev.questions];
    qs.splice(Math.min(u.index, qs.length), 0, u.q);
    setTest({
      ...prev,
      questions: qs,
      totalMarks: qs.reduce((a, q) => a + q.marks, 0),
      subtopics: [...new Map(qs.map((x) => [x.subtopic.code, x.subtopic])).values()].sort(
        (a, b) => a.code.localeCompare(b.code),
      ),
    });
  }

  /** clear the whole paper — explicit, confirmed (destructive). */
  function clearTest() {
    if (
      test &&
      test.questions.length > 0 &&
      !window.confirm("Clear the whole test? This can't be undone.")
    )
      return;
    setTest(null);
    setStale(false);
    setBuildError(null);
    setUndoState(null);
    manualIdsRef.current = new Set();
  }

  /** landing affordance: throw the draft away and reset the builder. */
  function discardDraft() {
    setTest(null);
    setTestName("");
    setSelected(new Set());
    setStale(false);
    setBuildError(null);
    setUndoState(null);
    manualIdsRef.current = new Set();
    try {
      if (course) writeStoredDraft(course, null);
    } catch {
      // ignore
    }
  }

  /** explicit Save commits the work — the draft is no longer needed. */
  function clearDraftAfterSave() {
    try {
      if (course) writeStoredDraft(course, null);
    } catch {
      // ignore
    }
  }

  /** auto-build — marks-aware deterministic fill over the selection.
   *  CD-A-hub: under the LIVE lane the assembly runs on the SERVER
   *  (testBuilderPreview: validated-only questions, marks-targeted,
   *  deterministic — the view's selectionHint contract); the topicNodeIds
   *  vocabulary never feeds the demo hub assembler. The summary card is
   *  the Class-Intelligence remediation posture (counts + codes + pointer). */
  const autoBuild = useCallback(async () => {
    if (!course || selected.size === 0) return;
    if (laneSource === "live") {
      const rootId = laneLive?.rootId;
      if (!rootId) return;
      setPreview({ status: "loading" });
      try {
        const view = await api.testBuilderPreview(
          rootId,
          weakTargets.filter((w) => selected.has(w.key)).map((w) => w.key),
          mode === "count" ? Math.min(50, Math.max(1, Number(maxQuestions) || 20)) : undefined,
          mode === "marks"
            ? Math.min(300, Math.max(1, Number(targetMarks) || 0)) || undefined
            : undefined,
          true,
        );
        setPreview({ status: "ready", view });
      } catch (err: unknown) {
        setPreview({
          status: "error",
          message:
            err instanceof ApiError ? err.message : "server assembly unavailable — try again",
        });
      }
      return;
    }
    setBuilding(true);
    setBuildError(null);
    try {
      const res = await fetch("/api/teacher/assemble", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: course,
          subtopics: [...selected],
          // clamp to the API's accepted ranges (marks ≤ 300, questions ≤ 50)
          // so an out-of-range keystroke degrades gracefully instead of a 400
          targetMarks:
            mode === "marks"
              ? Math.min(300, Math.max(1, Number(targetMarks) || 0)) || null
              : null,
          maxQuestions:
            mode === "count" ? Math.min(50, Math.max(1, Number(maxQuestions) || 20)) : null,
        }),
      });
      const payload = (await res.json()) as { test?: AssembledTest; error?: string };
      if (!res.ok || !payload.test) throw new Error(payload.error ?? "assembly failed");
      const built = payload.test;
      // rebuild semantics the banner promises: the fresh auto fill replaces
      // the previous fill, but questions added BY HAND (or restored from a
      // save) are KEPT — deduped against the new fill, appended after it.
      setTest((prev) => {
        if (!prev) return built;
        const keep = prev.questions.filter(
          (x) =>
            manualIdsRef.current.has(x.id) && !built.questions.some((bq) => bq.id === x.id),
        );
        if (keep.length === 0) return built;
        const questions = [...built.questions, ...keep];
        return {
          ...built,
          questions,
          totalMarks: questions.reduce((a, x) => a + x.marks, 0),
          subtopics: [...new Map(questions.map((x) => [x.subtopic.code, x.subtopic])).values()].sort(
            (a, b) => a.code.localeCompare(b.code),
          ),
        };
      });
      setStale(false);
      setTab("questions");
      setUndoState(null);
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "failed to assemble test";
      setBuildError(
        raw === "invalid payload"
          ? "The settings are out of range — use a marks target of 1–300 or up to 50 questions."
          : raw,
      );
    } finally {
      setBuilding(false);
    }
  }, [course, selected, mode, targetMarks, maxQuestions, laneSource, laneLive, weakTargets]);

  /** save the EXPLICIT test (question ids) — honest semantics; a selection
   *  without a test still saves its auto-build controls (legacy shape). */
  function onSaveTest() {
    if (!course) return;
    if (!test && selected.size === 0) return;
    const meta = (taughtCourses ?? []).find((c) => c.slug === course);
    const finalName =
      testName.trim() ||
      (test
        ? `${test.course.label} — ${test.questions.length}q · ${test.totalMarks} marks`
        : `${meta?.label ?? course} — ${selected.size} subtopic${selected.size === 1 ? "" : "s"}`);
    save({
      name: finalName,
      course,
      courseCode: meta?.code ?? test?.course.code ?? "",
      subtopics: [...selected],
      targetMarks: mode === "marks" ? Number(targetMarks) || null : null,
      maxQuestions: mode === "count" ? Number(maxQuestions) || null : null,
      questionIds: test ? test.questions.map((q) => q.id) : undefined,
    });
    // the name input reflects what was actually saved (single-name semantics)
    if (finalName !== testName) setTestName(finalName);
    setCommittedKey(paperKey(finalName, test ? test.questions.map((q) => q.id) : []));
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2200);
    clearDraftAfterSave();
  }

  function onLoadSaved(id: string) {
    const t = tests.find((x) => x.id === id);
    if (!t) return;
    // T-TEACH-008: the landing lists only the current course's tests, but a
    // stale id (or a save from another course) still routes honestly — the
    // course switch lands on a taught course or is refused. A cross-course
    // open sets the builder state itself, so the restore-on-arrival effect
    // is suppressed for exactly that arrival.
    if (t.course !== course && !(taughtCourses ?? []).some((c) => c.slug === t.course)) return;
    const crossing = t.course !== course;
    if (crossing) suppressRestoreRef.current = true;
    if (
      test &&
      test.questions.length > 0 &&
      !window.confirm("Open this saved test? Your current test will be replaced.")
    )
      return;
    setCourse(t.course);
    setSelected(new Set(t.subtopics));
    setMode(t.targetMarks !== null ? "marks" : "count");
    setTargetMarks(t.targetMarks !== null ? String(t.targetMarks) : "40");
    setMaxQuestions(t.maxQuestions !== null ? String(t.maxQuestions) : "20");
    // the saved name is the paper title (single-name semantics)
    setTestName(t.name);
    setBuildError(null);
    setUndoState(null);
    goBuilder();
    if (t.questionIds && t.questionIds.length > 0) {
      // builder-era save — restore the explicit paper (order preserved);
      // restored questions count as hand-placed for rebuild keeps
      setCommittedKey(paperKey(t.name, t.questionIds));
      manualIdsRef.current = new Set(t.questionIds);
      setBuilding(true);
      setBuildError(null);
      fetch(`/api/teacher/question-bank?slug=${encodeURIComponent(t.course)}&ids=${t.questionIds.join(",")}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`saved questions unavailable (${res.status})`);
          return (await res.json()) as BankState;
        })
        .then((payload) => {
          setTest((prev) => {
            const base =
              prev && prev.course.slug === payload.course.slug
                ? prev
                : {
                    course: payload.course,
                    title: `${payload.course.subject} test — ${payload.course.code}`,
                    questions: [],
                    totalMarks: 0,
                    targetMarks: null,
                    subtopics: [],
                    generatedAt: new Date().toISOString(),
                  };
            const questions = payload.questions;
            return {
              ...base,
              questions,
              totalMarks: questions.reduce((a, q) => a + q.marks, 0),
              subtopics: [
                ...new Map(questions.map((x) => [x.subtopic.code, x.subtopic])).values(),
              ].sort((a, b) => a.code.localeCompare(b.code)),
            };
          });
          setStale(false);
          setTab("questions");
        })
        .catch((err: unknown) => {
          setBuildError(err instanceof Error ? err.message : "failed to restore saved test");
        })
        .finally(() => setBuilding(false));
    } else {
      // legacy save — controls only; the teacher re-runs the build
      manualIdsRef.current = new Set();
      setTest(null);
      setStale(false);
    }
  }

  return (
    <div className="space-y-6">
      <TeacherNav />

      <header className="space-y-1.5 print:hidden">
        {view === "builder" && (
          <button
            type="button"
            onClick={goTests}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden />
            All tests
          </button>
        )}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-[10px] font-normal">
            <ClipboardList className="size-3" aria-hidden />
            Assessment · teacher
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-normal">
            TEACHER_ARCHITECTURE §6
          </Badge>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Test Builder</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Pick questions from the bank, arrange them, and print — or auto-build from the class&apos;s
          weakest areas. Every part keeps its corpus provenance; export a clean student handout or
          the full teacher copy with the mark scheme.
        </p>
      </header>

      {taughtCourses === null ? (
        /* ══ T-TEACH-008: the taught set is loading — the builder NEVER
           renders with the unscoped registry, not even for a frame ══ */
        <section
          aria-label="Loading your classes"
          aria-live="polite"
          className="mx-auto max-w-3xl rounded-lg border border-dashed p-10 text-center"
        >
          <p className="text-sm text-muted-foreground">Checking your classes…</p>
        </section>
      ) : taughtError && taughtCourses.length === 0 ? (
        /* fail-closed: a class-fetch error yields the EMPTY set — the retry
           re-runs the fetch; the full registry is never the fallback */
        <section
          aria-label="Class list unavailable"
          className="mx-auto max-w-3xl rounded-lg border border-dashed p-10 text-center"
        >
          <p className="font-medium">Couldn&apos;t load your classes</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            The Test Builder opens only the courses you teach, and the class list
            didn&apos;t load. Nothing was widened in the meantime — retry to load your
            classes.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => setTaughtAttempt((n) => n + 1)}>
            Retry
          </Button>
        </section>
      ) : taughtCourses.length === 0 ? (
        <section
          aria-label="No taught courses"
          className="mx-auto max-w-3xl rounded-lg border border-dashed p-10 text-center"
        >
          <ClipboardList className="mx-auto size-8 text-muted-foreground/60" aria-hidden />
          <p className="mt-3 font-medium">No classes with a question bank yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            The Test Builder opens from your classes — each class builds tests from its
            own course&apos;s bank. Create or open a class whose course carries the
            committed question bank, then build its tests here.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/teacher/classes">Go to your classes</Link>
          </Button>
        </section>
      ) : view === "tests" ? (
        /* ══ landing · THIS class's saved tests (per-course since T-TEACH-008) ══ */
        <section aria-label="Your tests" className="mx-auto max-w-3xl space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Your tests{current ? <> — {current.label}</> : null}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {current ? `${current.code} · ` : ""}Everything you&apos;ve built and saved
                for this class — open one to rearrange, print or assign it.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="relative">
                <select
                  aria-label="Switch class"
                  value={course ?? ""}
                  onChange={(e) => switchCourse(e.target.value || null)}
                  className="h-9 max-w-56 appearance-none rounded-md border bg-background pr-8 pl-3 text-sm"
                >
                  {courseGroups.map(([level, list]) => (
                    <optgroup key={level} label={level}>
                      {list.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.label} ({c.code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Button onClick={goBuilder}>
                <Plus className="size-4" aria-hidden />
                Create test
              </Button>
            </div>
          </div>
          {view === "tests" && test &&
            paperKey(testName, test.questions.map((q) => q.id)) !== committedKey && (
            /* builder holds uncommitted work — offer to finish it or throw it away */
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  Unsaved draft — {testName || test.title || "Untitled test"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {test.questions.length} question{test.questions.length === 1 ? "" : "s"} ·{" "}
                  {pluralMarks(test.totalMarks)} — kept in this browser; it is only in “Your
                  tests” once saved.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" className="h-8 text-xs" onClick={goBuilder}>
                  Resume
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={discardDraft}>
                  Discard
                </Button>
              </div>
            </div>
          )}
          {courseTests.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <ClipboardList className="mx-auto size-8 text-muted-foreground/60" aria-hidden />
              <p className="mt-3 font-medium">
                No tests for {current?.label ?? "this class"} yet
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Create the first test for this class — pick questions from the bank
                yourself or auto-build from the class&apos;s weakest areas, then save it
                here to reuse, print or assign. Each class keeps its own tests.
              </p>
              <Button className="mt-4" onClick={goBuilder}>
                <Plus className="size-4" aria-hidden />
                Create test
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {courseTests.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.courseCode} ·{" "}
                      {t.questionIds
                        ? `${t.questionIds.length} question${t.questionIds.length === 1 ? "" : "s"} saved`
                        : t.targetMarks !== null
                          ? `target ${t.targetMarks} marks`
                          : `max ${t.maxQuestions ?? 20} questions`}
                      {t.createdAt ? ` · saved ${new Date(t.createdAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => onLoadSaved(t.id)}
                  >
                    Open
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete saved test ${t.name}`}
                    onClick={() => remove(t.id)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] print:block">
        {/* ════ LEFT · question bank ══════════════════════════════════════ */}
        <section aria-label="Question bank" className="min-w-0 space-y-4 print:hidden">
          <Card className="py-0">
            <CardContent className="space-y-4 p-4">
              {loading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> loading course bank…
                </p>
              )}
              {loadError && (
                <Alert variant="destructive">
                  <AlertTitle>Course data unavailable</AlertTitle>
                  <AlertDescription>{loadError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tb-course">Subject</Label>
                  <div className="relative">
                    <select
                      id="tb-course"
                      value={course ?? ""}
                      onChange={(e) => {
                        const next = e.target.value || null;
                        switchCourse(next);
                      }}
                      className="h-9 w-full appearance-none rounded-md border bg-background pr-8 pl-3 text-sm"
                    >
                      {courseGroups.map(([level, list]) => (
                        <optgroup key={level} label={level}>
                          {list.map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.label} ({c.code})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Difficulty filter</Label>
                  <div
                    role="group"
                    aria-label="Difficulty filter"
                    className="flex h-9 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
                  >
                    {(["all", "easy", "medium", "hard"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={difficulty === d}
                        onClick={() => setDifficulty(d)}
                        className={`h-8 flex-1 rounded-[5px] px-1 text-xs font-medium capitalize transition-colors ${
                          difficulty === d
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* auto-build controls (SME gap: our weakness-driven shortcut) */}
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Sparkles className="size-4 text-primary" aria-hidden />
                    Auto-build from weak areas
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={toggleAllWeak}
                    disabled={weakTargets.length === 0}
                  >
                    {weakTargets.every((w) => selected.has(w.key))
                      ? "Clear weak areas"
                      : "Select all weak areas"}
                  </Button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
                  <div
                    role="group"
                    aria-label="Targeting mode"
                    className="flex h-8 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
                  >
                    <button
                      type="button"
                      aria-pressed={mode === "marks"}
                      onClick={() => {
                        if (mode !== "marks") {
                          setMode("marks");
                          markStale();
                        }
                      }}
                      className={`h-7 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                        mode === "marks"
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Marks
                    </button>
                    <button
                      type="button"
                      aria-pressed={mode === "count"}
                      onClick={() => {
                        if (mode !== "count") {
                          setMode("count");
                          markStale();
                        }
                      }}
                      className={`h-7 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                        mode === "count"
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Questions
                    </button>
                  </div>
                  <Input
                    id={mode === "marks" ? "tb-target" : "tb-max"}
                    type="number"
                    min={1}
                    max={mode === "marks" ? 300 : 50}
                    value={mode === "marks" ? targetMarks : maxQuestions}
                    onChange={(e) => {
                      markStale();
                      if (mode === "marks") setTargetMarks(e.target.value);
                      else setMaxQuestions(e.target.value);
                    }}
                    aria-label={mode === "marks" ? "Target marks" : "Max questions"}
                    className="h-8"
                  />
                  <Button
                    onClick={autoBuild}
                    disabled={building || preview?.status === "loading" || selected.size === 0}
                    size="sm"
                    className="h-8"
                  >
                    <FileText className="size-3.5" aria-hidden />
                    {building || preview?.status === "loading"
                      ? "Assembling…"
                      : laneSource === "live"
                        ? "Assemble (validated)"
                        : stale && test
                          ? "Update preview"
                          : "Auto-build"}
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {mode === "marks"
                    ? `fill up to ${targetMarks || "…"} marks — closest total just above if exact is impossible · `
                    : `at most ${maxQuestions || "…"} questions, smallest first · `}
                  {weakTargets.length} flagged weak area{weakTargets.length === 1 ? "" : "s"} (top{" "}
                  {WEAK_LANE_CAP} shown)
                  {laneGaps.length > 0 &&
                    ` · ${laneGaps.length} unmeasured area${laneGaps.length === 1 ? "" : "s"} with content (below)`}
                </p>
                <div className={`mt-2 ${showAllWeak ? "max-h-56 overflow-y-auto pr-1" : ""}`}>
                  <WeaknessLaneRows
                    source={laneSource}
                    targets={weakTargets}
                    gaps={laneGaps}
                    enrolledLearners={laneLive?.enrolledLearners}
                    learnersWithEvidence={laneLive?.learnersWithEvidence}
                    selected={selected}
                    onToggle={toggle}
                    cap={WEAK_LANE_CAP}
                    showAll={showAllWeak}
                  />
                </div>
                {preview?.status === "ready" && (
                  <div
                    className="mt-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                    data-testid="tb-preview-summary"
                  >
                    <p>
                      <strong>{preview.view.questionCount} questions</strong> ·{" "}
                      <strong>{preview.view.totalMarks} marks</strong> · answer key included
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {preview.view.questions.map((q) => q.topicCode).join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Assembled on the server from validated questions (deterministic,
                      marks-targeted). The printable bundle-paper lane keeps its own pipeline —
                      this card is the validated-assembly receipt.
                    </p>
                  </div>
                )}
                {preview?.status === "error" && (
                  <p className="mt-2 text-xs text-destructive" data-testid="tb-preview-error" role="alert">
                    {preview.message}
                  </p>
                )}
                {weakTargets.length > WEAK_LANE_CAP && (
                  <button
                    type="button"
                    onClick={() => setShowAllWeak((v) => !v)}
                    className="mt-2 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    {showAllWeak
                      ? "Show fewer"
                      : `Show all ${weakTargets.length} weak areas (top ${WEAK_LANE_CAP} shown)`}
                  </button>
                )}
              </div>

              {/* topic filter tree — the SAMPLE plane's selection surface.
                  CD-A-hub: under the live lane its bundle subtopic codes
                  cannot feed the server assembly, so its checkboxes are
                  disabled (the weak-area lane above is the targeting
                  surface; the two vocabularies never mix). */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <Target className="size-3.5 text-muted-foreground" aria-hidden />
                  Topic filter
                  <span className="font-normal text-muted-foreground">
                    {laneSource === "live"
                      ? `· ${selected.size} topic${selected.size === 1 ? "" : "s"} targeted (server assembly)`
                      : `· ${selected.size} of ${allSubtopics.length} · ${selectedMarks} marks in selection`}
                  </span>
                </p>
                {laneSource === "live" && (
                  <p className="mb-1.5 text-[11px] text-muted-foreground" data-testid="tb-tree-note">
                    Targeting is on class evidence — pick weak areas above; assembly runs on the
                    server's validated questions. Topic checkboxes resume with the sample lane.
                  </p>
                )}
                <div className="max-h-64 space-y-2.5 overflow-y-auto rounded-md border p-2.5">
                  {data?.class.sections.map((section) => (
                    <div key={section.code}>
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        <span className="font-mono">{section.code}</span> {section.title}
                      </p>
                      <div className="mt-0.5 space-y-0.5">
                        {section.subtopics.map((sub) => (
                          <label
                            key={sub.code}
                            className={`flex items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50 ${
                              laneSource === "live" ? "opacity-50" : "cursor-pointer"
                            }`}
                          >
                            <Checkbox
                              checked={selected.has(sub.code)}
                              onCheckedChange={() => toggle(sub.code)}
                              disabled={laneSource === "live"}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              {sub.title}{" "}
                              <span className="text-[10px] text-muted-foreground">
                                · {sub.questionCount}q · {sub.totalMarks} marks
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* bank question cards */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Question bank</p>
              {bank && (
                <span className="text-xs text-muted-foreground">
                  {bank.total} question{bank.total === 1 ? "" : "s"}
                  {selected.size > 0 ? " in filtered topics" : " in course"}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search this bank…"
                  aria-label="Search the question bank"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <button
                type="button"
                aria-pressed={hideInTest}
                onClick={() => setHideInTest((v) => !v)}
                className={`h-8 shrink-0 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                  hideInTest
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Hide in test
              </button>
            </div>
            {bankError && (
              <Alert variant="destructive">
                <AlertTitle>Question bank unavailable</AlertTitle>
                <AlertDescription>{bankError}</AlertDescription>
              </Alert>
            )}
            {bankLoading && bank === null && (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> loading questions…
              </div>
            )}
            {bank?.questions.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No questions match this filter or search — widen the topic selection, difficulty,
                or try a different keyword.
              </p>
            )}
            {hideInTest && bank && bank.questions.length > 0 && visibleBank.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Every question on this page is already in the test — load more, clear the filter,
                or search for something else.
              </p>
            )}
            {visibleBank.map((q) => {
              const inTest = inTestIds.has(q.id);
              const expanded = expandedBank.has(q.id);
              return (
                <article
                  key={q.id}
                  className="rounded-md border bg-card p-3 text-sm shadow-sm"
                  aria-label={`Bank question, ${pluralMarks(q.marks)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
                        [{q.marks}]
                      </Badge>
                      {q.difficulty && (
                        <Badge
                          variant="outline"
                          className={`h-5 px-1.5 text-[10px] ${difficultyBadgeClass(q.difficulty)}`}
                        >
                          {capDifficulty(q.difficulty)}
                        </Badge>
                      )}
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {q.subtopic.code} · {q.subtopic.title}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        aria-label={`View full question (${pluralMarks(q.marks)})`}
                        onClick={() => setViewing(q)}
                      >
                        <Eye className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant={inTest ? "secondary" : "default"}
                        className="h-7 gap-1 text-xs"
                        disabled={inTest}
                        onClick={() => addQuestion(q)}
                        aria-label={
                          inTest ? `Question already in test (${pluralMarks(q.marks)})` : `Add question to test (${pluralMarks(q.marks)})`
                        }
                      >
                        {inTest ? (
                          "In test"
                        ) : (
                          <>
                            <Plus className="size-3" aria-hidden /> Add
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className={expanded ? "mt-2" : "mt-2 line-clamp-3"}>
                    <Markdown className="text-[13px] [overflow-wrap:anywhere] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      {q.parts[0]?.problemMd ?? ""}
                    </Markdown>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedBank((prev) => {
                        const next = new Set(prev);
                        if (next.has(q.id)) next.delete(q.id);
                        else next.add(q.id);
                        return next;
                      })
                    }
                    className="mt-1 text-[11px] font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    {expanded ? "Show less" : "Show question"}
                  </button>
                  {q.parts.length > 1 && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {q.parts.length} part{q.parts.length === 1 ? "" : "s"}
                    </span>
                  )}
                </article>
              );
            })}
            {bank?.nextOffset !== null && bank && bank.nextOffset !== null && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={loadMoreBank}
                disabled={bankLoading}
              >
                {bankLoading ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
                Load more questions ({bank.total - bank.questions.length} remaining)
              </Button>
            )}
          </div>
        </section>

        {/* ════ RIGHT · your test ═════════════════════════════════════════ */}
        <section
          ref={resultRef}
          aria-label="Your test"
          className="min-w-0 space-y-3 scroll-mt-24"
        >
          <div aria-live="polite" className="sr-only">
            {test
              ? `Your test — ${test.questions.length} questions, ${test.totalMarks} marks`
              : "Your test is empty"}
          </div>

          {/* test header row (screen only) */}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Input
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="Test name"
              aria-label="Test name (printed on the paper)"
              className="h-9 w-48 font-medium"
            />
            {test && (
              <span className="flex items-center gap-2 text-sm">
                <ProgressRing value={test.totalMarks} max={ringMax} />
                <span className="text-sm font-medium">
                  {test.questions.length} question{test.questions.length === 1 ? "" : "s"} ·{" "}
                  {test.totalMarks} marks
                </span>
              </span>
            )}
            <span className="flex-1" />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onSaveTest}
                disabled={!test && selected.size === 0}
              >
                <Save className="size-3.5" aria-hidden />
                Save
              </Button>
              {savedFlash && (
                <span className="text-xs font-medium text-success" role="status">
                  Saved
                </span>
              )}
              {test && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-destructive"
                  onClick={clearTest}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Clear
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setDownloadOpen(true)}
                disabled={!test}
              >
                <Download className="size-3.5" aria-hidden />
                Download PDF
              </Button>
              {test && course && (
                <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                  <Link
                    href={`/teacher/assignments?course=${course}&subtopics=${test.subtopics
                      .map((s) => s.code)
                      .join(",")}`}
                  >
                    Assign
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {stale && test && (
            <Alert className="border-warn/40 bg-warn/5 print:hidden">
              <AlertTitle>Preview is out of date</AlertTitle>
              <AlertDescription>
                The weak-area selection or target changed since this test was auto-built — press
                “Update preview” to rebuild from the current settings. Questions you added by hand
                are kept and appended after the rebuilt set.
              </AlertDescription>
            </Alert>
          )}

          {buildError && (
            <Alert variant="destructive" className="print:hidden">
              <AlertTitle>Could not assemble the test</AlertTitle>
              <AlertDescription>{buildError}</AlertDescription>
            </Alert>
          )}

          {unrepresented.length > 0 && mode === "marks" && (
            <p className="text-xs text-muted-foreground print:hidden">
              With this target, {unrepresented.length} selected subtopic
              {unrepresented.length === 1 ? " didn’t" : "s didn’t"} make it into the auto fill (
              {unrepresented.map((s) => s.code).join(", ")}). Raise the target or switch to
              question count.
            </p>
          )}

          {/* Questions | Mark scheme tabs + copy switch (SME parity; print always prints the paper) */}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div role="tablist" aria-label="Test views" className="flex h-9 w-fit items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "questions"}
                onClick={() => setTab("questions")}
                className={`h-8 rounded-[5px] px-3 text-xs font-medium transition-colors ${
                  tab === "questions"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Questions
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "scheme"}
                onClick={() => setTab("scheme")}
                className={`h-8 rounded-[5px] px-3 text-xs font-medium transition-colors ${
                  tab === "scheme"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Mark scheme
              </button>
            </div>
            {test && (
              <div
                role="group"
                aria-label="Paper copy"
                className="flex h-9 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={pdf.copy === "student"}
                  onClick={() => setPdf((p) => ({ ...p, copy: "student" }))}
                  className={`h-8 rounded-[5px] px-2.5 text-xs font-medium transition-colors ${
                    pdf.copy === "student"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Student copy
                </button>
                <button
                  type="button"
                  aria-pressed={pdf.copy === "teacher"}
                  onClick={() => setPdf((p) => ({ ...p, copy: "teacher" }))}
                  className={`h-8 rounded-[5px] px-2.5 text-xs font-medium transition-colors ${
                    pdf.copy === "teacher"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Teacher copy
                </button>
              </div>
            )}
          </div>

          {/* ── the paper (screen preview + print sheet) ── */}
          <article
            aria-label="Test paper"
            className={`space-y-4 rounded-lg border bg-card p-5 sm:p-8 print:border-0 print:shadow-none ${
              tab === "questions" ? "" : "hidden print:block"
            }`}
          >
            {test && pdf.copy === "teacher" && (
              <p className="rounded bg-muted/50 px-3 py-1.5 text-[10px] text-muted-foreground print:hidden">
                Teacher copy — spec codes, sources and the mark scheme are on the paper. Switch to
                the student copy in “Download PDF” for the clean handout.
              </p>
            )}
            {test ? (
              <>
                {pdf.coverPage && (
                  <CoverPage
                    title={paperTitle}
                    course={test.course}
                    totalMarks={test.totalMarks}
                    questionCount={test.questions.length}
                  />
                )}
                <header className="border-b pb-3">
                  <h3 className="font-display text-xl font-semibold">{paperTitle}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {test.course.label} ({test.course.code}) · {test.course.level} · total{" "}
                    {pluralMarks(test.totalMarks)}
                    {pdf.copy === "teacher" && test.targetMarks
                      ? ` · target ${test.targetMarks}`
                      : ""}{" "}
                    · name: ______________
                  </p>
                </header>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={test.questions.map((q) => q.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {test.questions.map((q, qi) => (
                      <SortableTestQuestion
                        key={q.id}
                        q={q}
                        index={qi}
                        total={test.questions.length}
                        forStudent={pdf.copy === "student"}
                        noSplit={pdf.noSplit}
                        answerSpace={pdf.answerSpace}
                        answerLines={pdf.answerLines}
                        onMove={moveQuestion}
                        onMoveTo={moveQuestionTo}
                        onRemove={removeQuestion}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {pdf.copy === "teacher" && (
                  <footer className="border-t pt-2 text-[10px] leading-relaxed text-muted-foreground">
                    Assembled by the SyllabAI Hub Test Builder from the committed, validated
                    question corpus — every part cites its spec points and source paper. No
                    AI-generated content is included. Assembled{" "}
                    {new Date(test.generatedAt).toLocaleString()}.
                  </footer>
                )}
              </>
            ) : (
              <div className="py-10 text-center print:hidden">
                <p className="font-medium">Your test is empty</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Select questions to start building your test — add them from the bank on the
                  left, or auto-build from the class&apos;s weakest areas.
                </p>
              </div>
            )}
          </article>

          {/* ── mark scheme tab (screen reading; prints inline on the paper) ── */}
          <div
            role="tabpanel"
            aria-label="Mark scheme"
            className={tab === "scheme" ? "space-y-3" : "hidden"}
          >
            {test && test.questions.length > 0 ? (
              test.questions.map((q, qi) => (
                <Card key={`scheme-${q.id}`} className="py-0 print:hidden">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold">
                      Question {qi + 1}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {q.subtopic.code} · {pluralMarks(q.marks)}
                      </span>
                    </p>
                    <div className="mt-2 space-y-2 pl-3">
                      {q.parts.map((p) => (
                        <div key={`scheme-${p.id}`}>
                          <p className="text-[11px] font-medium text-muted-foreground">
                            ({String.fromCharCode(97 + p.order)}) [{p.marks}]
                            {p.sourcePaper &&
                              (p.sourcePaper.date || p.sourcePaper.number) &&
                              ` · scheme from ${[p.sourcePaper.date, p.sourcePaper.number]
                                .filter(Boolean)
                                .join(" ")}`}
                          </p>
                          {p.solutionMd ? (
                            <Markdown className="text-[13px] [&]:[overflow-wrap:anywhere]">
                              {p.solutionMd}
                            </Markdown>
                          ) : (
                            <p className="text-xs italic text-muted-foreground">
                              mark scheme not captured for this part
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground print:hidden">
                The mark scheme appears here once the test has questions.
              </p>
            )}
          </div>
        </section>
        </div>
      )}

      {/* ── floating test summary while browsing the bank ── */}
      {view === "builder" && test && showFloat && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden">
          {/* flex-wrap + rounded-2xl: children are shrink-0, so on phones the
              pill wraps into rows instead of spilling past the rounded edge */}
          <div className="flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border bg-background/95 py-1.5 pr-1.5 pl-4 shadow-lg backdrop-blur">
            <ProgressRing value={test.totalMarks} max={ringMax} />
            <span
              key={test.questions.length}
              className="animate-[pulse_0.7s_ease-in-out_1] text-sm font-medium whitespace-nowrap"
            >
              {test.questions.length} q · {test.totalMarks} marks
            </span>
            {undoState && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                aria-label="Undo remove"
                onClick={undoRemove}
              >
                <RotateCcw className="size-3" aria-hidden />
                <span className="hidden sm:inline">Undo remove</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              View test
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => setDownloadOpen(true)}
            >
              <Download className="size-3" aria-hidden />
              PDF
            </Button>
          </div>
        </div>
      )}

      {/* ── full question view (SME: View — every part before adding) ── */}
      <Dialog
        open={viewing !== null}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Question preview</DialogTitle>
            <DialogDescription>
              {viewing
                ? `Every part of this ${pluralMarks(viewing.marks)} question, with its mark scheme — check it before adding it to the test.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
                  [{viewing.marks}]
                </Badge>
                {viewing.difficulty && (
                  <Badge
                    variant="outline"
                    className={`h-5 px-1.5 text-[10px] ${difficultyBadgeClass(viewing.difficulty)}`}
                  >
                    {capDifficulty(viewing.difficulty)}
                  </Badge>
                )}
                <span className="font-mono text-[10px] text-muted-foreground">
                  {viewing.subtopic.code} · {viewing.subtopic.title}
                </span>
              </div>
              <div className="max-h-[50dvh] space-y-4 overflow-y-auto pr-1">
                {viewing.parts.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground">
                        ({String.fromCharCode(97 + p.order)}) {p.commandWord}
                      </span>
                      <span className="text-xs text-muted-foreground">[{p.marks}]</span>
                    </div>
                    <Markdown className="mt-1 [overflow-wrap:anywhere]">{p.problemMd}</Markdown>
                    {p.choices &&
                      p.choices.length > 0 &&
                      p.choices.some((c) => c.label && c.textMd.trim()) && (
                        <ChoiceList choices={p.choices} />
                      )}
                    {p.solutionMd && (
                      <details className="mt-2 rounded bg-muted/40 p-2">
                        <summary className="cursor-pointer text-xs font-medium">
                          Mark scheme — part ({String.fromCharCode(97 + p.order)})
                        </summary>
                        <Markdown className="mt-1 text-xs [&]:[overflow-wrap:anywhere]">
                          {p.solutionMd}
                        </Markdown>
                      </details>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewing(null)}>
                  Close
                </Button>
                <Button
                  size="sm"
                  disabled={inTestIds.has(viewing.id)}
                  onClick={() => {
                    addQuestion(viewing);
                    setViewing(null);
                  }}
                >
                  {inTestIds.has(viewing.id) ? (
                    "Already in test"
                  ) : (
                    <>
                      <Plus className="size-3.5" aria-hidden />
                      Add to test
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Download PDF modal (SME: download flow + PDF settings) ── */}
      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="sm:max-w-md print:hidden">
          <DialogHeader>
            <DialogTitle>Download PDF</DialogTitle>
            <DialogDescription>
              Pick the copy and paper settings, then print to PDF from the browser dialog.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Copy</Label>
              <div
                role="group"
                aria-label="Copy type"
                className="flex h-9 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={pdf.copy === "student"}
                  onClick={() => setPdf((p) => ({ ...p, copy: "student" }))}
                  className={`h-8 flex-1 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                    pdf.copy === "student"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Questions (student)
                </button>
                <button
                  type="button"
                  aria-pressed={pdf.copy === "teacher"}
                  onClick={() => setPdf((p) => ({ ...p, copy: "teacher" }))}
                  className={`h-8 flex-1 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                    pdf.copy === "teacher"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  + Mark scheme (teacher)
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {pdf.copy === "student"
                  ? "Clean handout: no spec codes, sources, tier notes or answers; dotted answer space after open-response parts."
                  : "Full copy: provenance, spec codes, sources and the mark scheme printed under each question."}
              </p>
            </div>

            <fieldset className="space-y-2.5 rounded-md border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">PDF settings</legend>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={pdf.coverPage}
                  onCheckedChange={(v) => setPdf((p) => ({ ...p, coverPage: v === true }))}
                />
                Include cover page
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={pdf.noSplit}
                  onCheckedChange={(v) => setPdf((p) => ({ ...p, noSplit: v === true }))}
                />
                Don’t split questions over a page break
              </label>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={pdf.answerSpace}
                    onCheckedChange={(v) => setPdf((p) => ({ ...p, answerSpace: v === true }))}
                  />
                  Answer space (open response)
                </label>
                {pdf.answerSpace && (
                  <span className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6"
                      aria-label="Fewer answer lines"
                      disabled={pdf.answerLines <= 1}
                      onClick={() =>
                        setPdf((p) => ({ ...p, answerLines: Math.max(1, p.answerLines - 1) }))
                      }
                    >
                      <Minus className="size-3" aria-hidden />
                    </Button>
                    <span className="w-10 text-center text-xs" role="status">
                      {pdf.answerLines} lines
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6"
                      aria-label="More answer lines"
                      disabled={pdf.answerLines >= 8}
                      onClick={() =>
                        setPdf((p) => ({ ...p, answerLines: Math.min(8, p.answerLines + 1) }))
                      }
                    >
                      <Plus className="size-3" aria-hidden />
                    </Button>
                  </span>
                )}
              </div>
            </fieldset>

            {test && (
              <p className="flex items-center gap-2 text-sm">
                <ProgressRing value={test.totalMarks} max={ringMax} />
                <span>
                  Total: {test.questions.length} question
                  {test.questions.length === 1 ? "" : "s"} · {pluralMarks(test.totalMarks)}
                  {pdf.copy === "teacher" ? " · with mark scheme" : " · questions only"}
                </span>
              </p>
            )}

            <Button
              className="w-full"
              onClick={() => {
                setDownloadOpen(false);
                window.setTimeout(() => window.print(), 150);
              }}
              disabled={!test}
            >
              <Printer className="size-4" aria-hidden />
              Print {pdf.copy === "student" ? "student handout" : "teacher copy"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── paper question block (shared by screen preview and print) ──────────── */

/** Type-a-position jump box — the long-paper alternative to repeated ↑/↓
 *  presses (and to dragging across 20 questions). Uncontrolled on purpose:
 *  `key={index}` remounts it whenever the row's position changes, so the
 *  displayed number is always the fresh position with zero effect state. */
function PositionInput({
  index,
  total,
  onCommit,
}: {
  index: number;
  total: number;
  onCommit: (pos: number) => void;
}) {
  return (
    <input
      key={index}
      type="number"
      min={1}
      max={total}
      defaultValue={index + 1}
      aria-label={`Move question ${index + 1} to position (1–${total})`}
      title={`Type a position (1–${total}), press Enter to move this question there`}
      className="h-6 w-11 rounded-md border border-input bg-transparent px-1 text-center font-mono text-[11px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
      onBlur={(e) => {
        const n = Number.parseInt(e.currentTarget.value, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= total && n - 1 !== index) onCommit(n - 1);
        else e.currentTarget.value = String(index + 1);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** Drag-enabled shell around a paper question: a grip handle (pointer +
 *  touch sensor) that starts a dnd-kit sort, plus the position jump box.
 *  The student copy renders the plain TestQuestion — reordering is a
 *  teacher affordance, and the paper chrome must stay printable. */
function SortableTestQuestion(props: React.ComponentProps<typeof TestQuestion>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.q.id,
    disabled: props.forStudent,
  });
  if (props.forStudent) return <TestQuestion {...props} />;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 20 : undefined,
      }}
      className={isDragging ? "rounded-md bg-background opacity-90 shadow-lg ring-1 ring-border" : undefined}
    >
      <TestQuestion
        {...props}
        dragHandle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            aria-label={`Drag question ${props.index + 1} to reorder`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" aria-hidden />
          </button>
        }
        positionInput={
          <PositionInput
            index={props.index}
            total={props.total}
            onCommit={(pos) => props.onMoveTo(props.index, pos)}
          />
        }
      />
    </div>
  );
}

function TestQuestion({
  q,
  index,
  total,
  forStudent,
  noSplit,
  answerSpace,
  answerLines,
  onMove,
  onRemove,
  dragHandle,
  positionInput,
}: {
  q: AssembledQuestion;
  index: number;
  total: number;
  forStudent: boolean;
  noSplit: boolean;
  answerSpace: boolean;
  answerLines: number;
  onMove: (i: number, dir: -1 | 1) => void;
  onMoveTo: (i: number, pos: number) => void;
  onRemove: (i: number) => void;
  dragHandle?: React.ReactNode;
  positionInput?: React.ReactNode;
}) {
  return (
    <div className={noSplit ? "break-inside-avoid" : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold">
          Question {index + 1}
          <span className="ml-2 font-normal text-muted-foreground">
            ({pluralMarks(q.marks)}
            {!forStudent && q.difficulty ? ` · ${capDifficulty(q.difficulty)}` : ""})
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-0.5 print:hidden">
          {!forStudent && (
            <span className="mr-1 font-mono text-[10px] text-muted-foreground">
              {q.subtopic.code}
            </span>
          )}
          {dragHandle}
          {positionInput}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Move question ${index + 1} up`}
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
          >
            <ArrowUp className="size-3" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Move question ${index + 1} down`}
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
          >
            <ArrowDown className="size-3" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label={`Remove question ${index + 1}`}
            onClick={() => onRemove(index)}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </span>
      </div>
      {q.parts.map((p) => {
        const hasChoices =
          p.choices && p.choices.length > 0 && p.choices.some((c) => c.label && c.textMd.trim());
        return (
          <div key={p.id} className="mt-2 pl-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                ({String.fromCharCode(97 + p.order)}){" "}
                {p.commandWord && <span className="normal-case">{p.commandWord}</span>}
                {!forStudent && p.specPointCodes.length > 0 && (
                  <span className="ml-1 font-mono text-[10px]">
                    · {p.specPointCodes.join(", ")}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">[{p.marks}]</span>
            </div>
            <Markdown className="mt-1 [overflow-wrap:anywhere]">
              {forStudent ? stripTierLines(p.problemMd) : p.problemMd}
            </Markdown>
            {hasChoices && <ChoiceList choices={p.choices!} />}
            {!forStudent &&
              p.sourcePaper &&
              (p.sourcePaper.date ||
                p.sourcePaper.number ||
                p.sourcePaper.questionNumber !== null) && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  source:{" "}
                  {[p.sourcePaper.date, p.sourcePaper.number].filter(Boolean).join(" paper ")}
                  {p.sourcePaper.questionNumber !== null &&
                    ` · Q${p.sourcePaper.questionNumber}${p.sourcePaper.questionPart ?? ""}`}
                </p>
              )}
            {forStudent && answerSpace && !hasChoices && (
              <div className="mt-4 space-y-4" aria-hidden>
                {Array.from({ length: answerLines }).map((_, i) => (
                  <div key={i} className="border-b border-dotted border-muted-foreground/40" />
                ))}
              </div>
            )}
            {/* teacher print: mark scheme inline under each question */}
            {!forStudent && (
              <details className="mt-2 rounded bg-muted/40 p-2 print:open">
                <summary className="cursor-pointer text-xs font-medium">
                  Answer key — question {index + 1}
                </summary>
                <div className="mt-1 space-y-2 pl-3">
                  {q.parts.map((kp) => (
                    <div key={`key-${kp.id}`}>
                      <p className="text-[11px] font-medium text-muted-foreground">
                        ({String.fromCharCode(97 + kp.order)}) [{kp.marks}]
                        {kp.sourcePaper &&
                          (kp.sourcePaper.date || kp.sourcePaper.number) &&
                          ` · scheme from ${[kp.sourcePaper.date, kp.sourcePaper.number]
                            .filter(Boolean)
                            .join(" ")}`}
                      </p>
                      {kp.solutionMd ? (
                        <Markdown className="[& _p]:text-xs [&]:[overflow-wrap:anywhere]">
                          {kp.solutionMd}
                        </Markdown>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">
                          mark scheme not captured for this part
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
