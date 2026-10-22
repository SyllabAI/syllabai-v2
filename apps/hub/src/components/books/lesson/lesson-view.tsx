/**
 * T-BOOK-033 — the Lesson renderer (server component).
 *
 * One substrate, two renderers (operator "both", trace 1a1611a346d9725d):
 * the rail stays the page-true PDF companion; THIS is the student's
 * primary year-round learning surface. It renders a lessonPackV1 pack's
 * authored sections (CourseLessons grammar: prose + :::boxes +
 * glossary chips) and derives every cross-link server-side from
 * specRefs via lib/books-lesson-links.ts — a pack NEVER authors a link
 * (the books-notes.ts exact-intersection law, re-qualified grammar).
 *
 * Prose runs through the shared <Markdown> client component (sanitize
 * law s144 inherited); chips are rewritten to bold and the section's
 * glossary renders as a data-driven strip from the pack's glossarySlugs.
 */
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  BookOpen,
  Calculator,
  FileQuestion,
  HelpCircle,
  Layers,
  Lightbulb,
  Link2,
  ListChecks,
  PencilRuler,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Target,
  SquareCheckBig,
} from "lucide-react";

import type { CourseMeta } from "@/lib/courses";
import type { ExamQuestionTopic, Flashcard, RevisionNote } from "@/lib/contracts";
import {
  flashcardsForSpecRefs,
  questionTopicsForSpecRefs,
  requalifySpecRefs,
  relatedNotesForSpecRefs,
} from "@/lib/books-lesson-links";
import type { ChapterLesson, LessonGlossaryEntry, LessonSectionServed } from "@/lib/books-lesson";
import { parseLessonSegments, rewriteGlossaryChips } from "@/lib/lesson-markdown";
import { Markdown } from "@/components/markdown";

const BOX_STYLES: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  "key-point": { label: "Key point", icon: Lightbulb, cls: "border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" },
  "exam-hint": { label: "Exam hint", icon: Target, cls: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30" },
  misconception: { label: "Common misconception", icon: AlertTriangle, cls: "border-l-red-500 bg-red-50 dark:bg-red-950/30" },
  safety: { label: "Safety", icon: ShieldAlert, cls: "border-l-rose-600 bg-rose-50 dark:bg-rose-950/30" },
  "did-you-know": { label: "Did you know?", icon: Sparkles, cls: "border-l-violet-500 bg-violet-50 dark:bg-violet-950/30" },
  "maths-skills": { label: "Maths skills", icon: Calculator, cls: "border-l-teal-500 bg-teal-50 dark:bg-teal-950/30" },
  "prior-knowledge": { label: "Prior knowledge", icon: BookMarked, cls: "border-l-slate-400 bg-slate-50 dark:bg-slate-900/40" },
  "cross-curricular": { label: "Cross-curricular links", icon: Link2, cls: "border-l-cyan-500 bg-cyan-50 dark:bg-cyan-950/30" },
  "worked-example": { label: "Worked example", icon: PencilRuler, cls: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" },
  "quick-check": { label: "Quick check", icon: ListChecks, cls: "border-l-green-500 bg-green-50 dark:bg-green-950/30" },
  summary: { label: "Summary", icon: ScrollText, cls: "border-l-primary bg-muted" },
  "can-you": { label: "Can you…?", icon: SquareCheckBig, cls: "border-l-primary bg-muted" },
};

function Box({ type, md }: { type: string; md: string }) {
  const style = BOX_STYLES[type] ?? { label: type, icon: HelpCircle, cls: "border-l-muted-foreground bg-muted" };
  const Icon = style.icon;
  return (
    <div className={`my-4 rounded-r-md border border-l-4 p-3 sm:p-4 ${style.cls}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
        <Icon className="h-4 w-4" aria-hidden />
        {style.label}
      </div>
      <div className="text-[15px] leading-relaxed [&_p]:my-1.5">
        <Markdown>{md}</Markdown>
      </div>
    </div>
  );
}

function GlossaryStrip({ slugs, glossary }: { slugs: string[]; glossary: LessonGlossaryEntry[] }) {
  if (slugs.length === 0) return null;
  const bySlug = new Map(glossary.map((g) => [g.slug, g]));
  const entries = slugs.map((s) => bySlug.get(s)).filter((g): g is LessonGlossaryEntry => g != null);
  if (entries.length === 0) return null;
  return (
    <div className="mt-4 rounded-md border bg-card p-3 text-[13px]">
      <div className="mb-1.5 font-semibold">Key terms in this section</div>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        {entries.map((g) => (
          <div key={g.slug}>
            <dt className="inline font-medium">{g.term}</dt>
            <dd className="ml-1.5 inline text-muted-foreground">— {g.definition}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Derived, spec-anchored cross-links (server-side; never authored). */
function DerivedLinks({
  section,
  courseCode,
  courseSlug,
  notes,
  questionTopics,
  flashcards,
}: {
  section: LessonSectionServed;
  courseCode: string;
  courseSlug: string;
  notes: readonly RevisionNote[];
  questionTopics: readonly ExamQuestionTopic[];
  flashcards: readonly Flashcard[];
}) {
  const codes = requalifySpecRefs(section.specRefs, courseCode);
  const relNotes = relatedNotesForSpecRefs(codes, notes);
  const topics = questionTopicsForSpecRefs(codes, questionTopics);
  const cards = flashcardsForSpecRefs(codes, flashcards);
  if (relNotes.length === 0 && topics.length === 0 && cards.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-dashed p-2.5 text-[13px]">
      <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
        <Layers className="h-3.5 w-3.5" aria-hidden />
        Keep going
      </span>
      {relNotes.map((n) => (
        <Link
          key={n.noteId}
          href={`/courses/${courseSlug}/revision-notes/${n.noteId}`}
          className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 hover:text-primary"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          {n.title}
        </Link>
      ))}
      {topics.map((t) => (
        <Link
          key={t.topicSlug}
          href={`/courses/${courseSlug}/exam-questions/${t.topicSlug}`}
          className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 hover:text-primary"
        >
          <FileQuestion className="h-3.5 w-3.5" aria-hidden />
          {(t as { topicName?: string }).topicName ?? t.topicSlug}
        </Link>
      ))}
      {cards.length > 0 && (
        <Link
          href={`/courses/${courseSlug}/flashcards`}
          className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 hover:text-primary"
        >
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          Flashcards ({cards.length})
        </Link>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  glossary,
  courseCode,
  courseSlug,
  notes,
  questionTopics,
  flashcards,
}: {
  section: LessonSectionServed;
  glossary: LessonGlossaryEntry[];
  courseCode: string;
  courseSlug: string;
  notes: readonly RevisionNote[];
  questionTopics: readonly ExamQuestionTopic[];
  flashcards: readonly Flashcard[];
}) {
  const md = section.markdown ?? "";
  const segments = md ? parseLessonSegments(md) : [];
  return (
    <section id={section.id.replace(/:/g, "-")} className="scroll-mt-16 border-t py-6 first:border-t-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
        {section.bookPage != null && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            SB p.{section.bookPage}
          </span>
        )}
      </div>
      {segments.map((seg, i) =>
        seg.kind === "box" ? (
          <Box key={i} type={seg.boxType ?? ""} md={rewriteGlossaryChips(seg.md)} />
        ) : (
          <div key={i} className="text-[15px] leading-relaxed [&_p]:my-2.5 [&_ul]:my-2.5 [&_ol]:my-2.5">
            <Markdown>{rewriteGlossaryChips(seg.md)}</Markdown>
          </div>
        ),
      )}
      <GlossaryStrip slugs={section.glossarySlugs} glossary={glossary} />
      <DerivedLinks
        section={section}
        courseCode={courseCode}
        courseSlug={courseSlug}
        notes={notes}
        questionTopics={questionTopics}
        flashcards={flashcards}
      />
    </section>
  );
}

export function LessonView({
  courseSlug,
  docId,
  chapterKey,
  lesson,
  meta,
  notes,
  questionTopics,
  flashcards,
  preview,
}: {
  courseSlug: string;
  docId: string;
  chapterKey: string;
  lesson: ChapterLesson;
  meta: CourseMeta;
  notes: readonly RevisionNote[];
  questionTopics: readonly ExamQuestionTopic[];
  flashcards: readonly Flashcard[];
  preview: boolean;
}) {
  const { pack, glossary } = lesson;
  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-16 pt-4">
      <aside className="sticky top-14 hidden h-[calc(100dvh-5rem)] w-56 shrink-0 overflow-y-auto lg:block">
        <div className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {pack.title}
        </div>
        <nav aria-label="Lesson sections" className="flex flex-col gap-0.5 text-[13px]">
          {pack.sections.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id.replace(/:/g, "-")}`}
              className="rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {i + 1}. {s.title}
            </a>
          ))}
        </nav>
      </aside>
      <article className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <Link
            href={`/courses/${courseSlug}/books/${docId}?chapter=${encodeURIComponent(chapterKey)}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Rail
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link href={`/courses/${courseSlug}/books`} className="text-muted-foreground hover:text-foreground">
            Book shelf
          </Link>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {pack.paperRoute === "chemistry-only" ? "Chemistry only (Paper 2)" : "Core (Papers 1C & 2C)"}
          </span>
          {preview && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              DRAFT PREVIEW — not published
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{pack.title}</h1>
        {pack.learningObjective && (
          <div className="mt-2 rounded-md border p-3 text-[14px] leading-relaxed">
            <span className="font-semibold">Learning objectives · </span>
            {pack.learningObjective}
          </div>
        )}
        <div className="mt-2">
          {pack.sections.map((s) => (
            <SectionBlock
              key={s.id}
              section={s}
              glossary={glossary}
              courseCode={meta.code}
              courseSlug={courseSlug}
              notes={notes}
              questionTopics={questionTopics}
              flashcards={flashcards}
            />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/courses/${courseSlug}/books/${docId}?chapter=${encodeURIComponent(chapterKey)}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Open this chapter in the Rail
          </Link>
          <Link
            href={`/courses/${courseSlug}/books`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 hover:bg-muted"
          >
            All chapters
          </Link>
        </div>
      </article>
    </div>
  );
}
