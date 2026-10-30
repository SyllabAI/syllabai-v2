/**
 * Course header block — the course hero band + hub tab pair.
 *
 * Restyled to the MathsGenie course-page anatomy (hub-coursepage-mg-layout,
 * operator request via chat trace 1a18c3f754d0e421): a pastel gradient hero
 * card carrying the breadcrumb trail, bold qualification title, exam-code
 * pill and description, with the Course Resources / Strengths & Weaknesses
 * tab pair bottom-aligned on the band's edge. The band's gradient lives in
 * globals.css (.course-hero-gradient) — hub token hues, dark-mode aware.
 *
 * The prop API is UNCHANGED from the SME-anatomy version: every subpage
 * (exam-questions, past-papers, revision-notes, …) keeps its call site and
 * inherits the new hero without per-page edits. What was here before is all
 * still here — breadcrumbs, H1, exam-code pill, description, children slot
 * (the root page's "Edexcel | IGCSE | 4CH1" line + course switcher), tabs —
 * only the visual container changed.
 */
import Link from "next/link";
import { ChartColumn, LayoutGrid } from "lucide-react";
import { Breadcrumbs, ExamCodePill } from "@/components/hub/chrome";
import { cn } from "@/lib/utils";
import type { CourseMeta } from "@/lib/courses";

export function CourseHeader({
  meta,
  activeTab = "resources",
  title,
  description,
  crumb,
  showTabs = false,
  children,
}: {
  meta: Pick<CourseMeta, "level" | "subject" | "label" | "code" | "slug" | "board">;
  activeTab?: "resources" | "strengths";
  title: string;
  description?: string;
  /** Final breadcrumb label — the current page's name (SME trail, figure 14:
   *  "IGCSE / Chemistry / Edexcel / Exam Questions / {topic}"). Defaults to
   *  the row's board ("Edexcel" for the pre-CIE registry rows,
   *  "Cambridge International" for the CIE wave), matching the hub-root
   *  trail (G3 board-aware fix). */
  crumb?: string;
  /** SME anatomy: the Course Resources / Strengths & Weaknesses tab pair
   *  belongs to the course hub root only — resource pages render breadcrumb +
   *  title without hub tabs (flow crawl 2026-09-19). */
  showTabs?: boolean;
  children?: React.ReactNode;
}) {
  const base = `/courses/${meta.slug}`;
  const tabs = [
    { id: "resources", label: "Course Resources", href: base, icon: LayoutGrid },
    { id: "strengths", label: "Strengths & Weaknesses", href: `${base}/strengths`, icon: ChartColumn },
  ] as const;

  return (
    <header className="relative isolate overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* MG pastel wash — hub-token gradient, see globals.css */}
      <div aria-hidden className="course-hero-gradient absolute inset-0 -z-10" />
      <div className="space-y-3 p-5 sm:p-6">
        <Breadcrumbs
          items={[
            { label: meta.level, href: "/courses" },
            { label: meta.label, href: base },
            { label: crumb ?? (meta.board ?? "Edexcel") },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {title}
          </h1>
          <ExamCodePill code={meta.code} />
        </div>
        {description && (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            {description}
          </p>
        )}
        {children}
      </div>
      {showTabs && (
        <nav
          aria-label="Hub tabs"
          className="flex items-end gap-5 px-5 text-sm font-semibold sm:px-6"
        >
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              aria-current={activeTab === t.id ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 border-b-[3px] px-1 pb-2.5 pt-1 transition-colors",
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
