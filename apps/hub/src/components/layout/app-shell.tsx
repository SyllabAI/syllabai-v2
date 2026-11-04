"use client";

/**
 * AppShell — global chrome, SaveMyExams-style (research §4, flow crawl
 * 2026-09-19): a single header (logo · "Study tools" menu · data-mode
 * badges) and NO global sidebar. SME keeps all global navigation in the
 * header; course surfaces add exactly one course sidebar (course-shell) and
 * resource detail pages add the topic panel (resource-panel). Demo-discipline
 * disclosures and provider badges live in the footer, out of the learner's
 * reading path.
 *
 * s146 exception — the paper-viewer route: the header itself stands down
 * there (focus-routes.isViewerRoute). The paper PDF is the whole screen on
 * that route (user-reported: the PDF viewport was drowning in chrome), the
 * viewer row carries its own back link, and the footer is already omitted
 * via the immersive contract.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Atom,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronDown,
  Dumbbell,
  FileQuestion,
  FlaskConical,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Network,
  ScrollText,
  Sparkles,
  SquareStack,
  User,
  Waypoints,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { clearIdentity, useIdentity } from "@/lib/identity";
import { roleHome } from "@/lib/role-home";
import { signInHref, useCurrentSearch } from "@/lib/sign-in-link";
import { useLastOpenedSync } from "@/lib/last-opened";
import { useMockResultsSync } from "@/lib/mock-results";
import { useTeacherStoresSync } from "@/lib/teacher/stores";
import { useAccountDocsSync } from "@/lib/account-docs";
import { isImmersiveRoute, isViewerRoute } from "@/lib/focus-routes";
import { useLastOpened } from "@/lib/last-opened";
import { cn } from "@/lib/utils";
import type { PublicConfig } from "@/lib/config";
// run-015 (audit F7): the course-scoped href resolvers and the active-row
// law live in lib/tool-hrefs.ts now — pure, registry-backed and unit-tested
// (tool-hrefs.test.ts); the header only consumes them.
import {
  courseScopedToolHref,
  isToolActive,
  knowledgeGraphHref,
} from "@/lib/tool-hrefs";

// run-014 (audit F8): every row carries a desc — the three course-scoped rows
// were the bare ones. Their copy is trimmed from the course-hub resource cards'
// own descriptions (courses/[course]/page.tsx), not invented.
const TOOLS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "My subjects" },
  // run-015 (audit F3): the study-plan surface was an orphan — reachable only
  // through the dashboard cards, never from the menu that lists every other
  // tool. Label matches the page's own metadata title ("Study plan").
  { href: "/plan", label: "Study plan", icon: CalendarDays, desc: "Weekly goals & tasks" },
  { href: "/courses", label: "Courses", icon: GraduationCap, desc: "All Learning Hubs" },
  { href: "/revision-notes", label: "Revision Notes", icon: BookOpen, desc: "Concise notes by topic" },
  { href: "/exam-questions", label: "Exam Questions", icon: FileQuestion, desc: "Exam-style, by topic" },
  { href: "/flashcards", label: "Flashcards", icon: SquareStack, desc: "Facts & definitions" },
  { href: "/past-papers", label: "Past Papers", icon: ScrollText, desc: "Every past paper" },
] as const;

const MORE_TOOLS = [
  { href: "/tutor", label: "AI Tutor", icon: Sparkles },
  { href: "/assistant", label: "Assistant", icon: BookOpenCheck },
  // run-014 (audit F8): Dumbbell — Zap stays the header CTA's glyph; one icon
  // must not name two different actions in the same header.
  { href: "/practice", label: "Practice", icon: Dumbbell },
  { href: "/knowledge-graph", label: "Knowledge Graph", icon: Network },
  { href: "/graph-explorer", label: "Graph Explorer", icon: Waypoints },
  { href: "/learner", label: "My Progress", icon: User },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
] as const;

// The course-scoped resolvers and the active-row law live in lib/tool-hrefs.ts
// (run-015, audit F7 — extracted from this file and unit-tested); consumed via
// the @/lib/tool-hrefs import above.

// t-ui-polish run-001 — the MG/RD header signature: the most-used tools sit
// INLINE in the header as quiet links with the run-004b active pill
// (bg-accent-primary / text-accent-primary-foreground), exactly the course
// nav row's recipe. Both references keep a visible top nav and relegate the
// long tail to a menu — the dropdown stays for the full list at every width.
// Hover rides @media(hover:hover) per the run-005 tier-a capture law.
const QUICK_NAV_HREFS = ["/dashboard", "/courses", "/past-papers", "/plan"] as const;
const quickNavItems = QUICK_NAV_HREFS.map((href) =>
  TOOLS.find((t) => t.href === href),
).filter((t) => t !== undefined);

export function AppShell({
  children,
  // `config` stays part of the call contract (root layout still passes it);
  // the footer no longer renders the data-plane chip (UX review F-02), so
  // the shell itself no longer reads it.
}: {
  children: React.ReactNode;
  config: PublicConfig;
}) {
  const pathname = usePathname();
  const identity = useIdentity();
  const lastOpened = useLastOpened();
  // A-3 (frontend-flow audit): the header's sign-in links carry ?next so
  // the login page returns the user to the surface they left — RequireAuth's
  // prompt already did; now every entry point does.
  const currentSearch = useCurrentSearch();
  // T-TIER1 — the account-backed mirrors mount in the GLOBAL chrome (not the
  // dashboard): the last-opened tracker fires on course routes and the mock
  // player writes from past-papers, so the write-through listeners must live
  // everywhere the learner navigates, exactly like the identity store.
  useLastOpenedSync();
  useMockResultsSync();
  // T-TIER1 run-002 — the teacher stores (saved tests / coverage / verdicts)
  // mirror the account while a TEACHER is signed in; the hook is a no-op for
  // students and signed-out sessions (the surface is teacher-owned).
  useTeacherStoresSync();
  // T-AUDIT-TIER1 run-003 — the workspace-document plane's hydration hook
  // (ONE mount for the whole app): the account mirror for the remaining
  // localStorage-only pools (tutor / assistant / CLA this band).
  useAccountDocsSync();
  // course pages manage their own horizontal rhythm (course shell + resource
  // panel); the graph surfaces are full-bleed (the visualizer canvas wants
  // the whole viewport); the tutor workspace is an immersive app surface
  // (its own rail + header + composer, sized to the viewport); every other
  // page gets the centred content column
  const inCourse = pathname.startsWith("/courses/");
  const inExplorer =
    pathname.startsWith("/graph-explorer") || pathname.startsWith("/knowledge-graph");
  const inTutor = pathname.startsWith("/tutor");
  const viewerRoute = isViewerRoute(pathname);
  const bare = inCourse || inExplorer || inTutor;

  // UX audit 2026-10-02 #22: Experiments is the developer area — it sat next
  // to Tutor/Assistant for every signed-out visitor and student. Staff-only;
  // the route itself stays reachable by URL for those who need it.
  const moreTools =
    identity?.role === "teacher"
      ? MORE_TOOLS
      : MORE_TOOLS.filter((t) => t.href !== "/experiments");

  return (
    <div className="min-h-dvh bg-background">
      {/* solid header (SME parity): a translucent bar lets large H1 text bleed
          through on scroll and reads as a rendering glitch (UX audit 2026-09-19) */}
      {/* UX audit 2026-10-02 #10: keyboard users had to re-traverse the whole
          header on every page — one skip link, first in tab order, targeting
          the (focusable) main landmark below. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
      >
        Skip to content
      </a>
      {/* s146: the header stands down entirely on the paper-viewer route —
          the PDF is the screen there; the skip link below still targets the
          main landmark either way. */}
      {!viewerRoute && (
      <header className="sticky top-0 z-40 border-b bg-background print:hidden">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          {/* C-5 (frontend-flow audit): the logo means "home". For a
              signed-in user home is the role home — the marketing hero is
              where they were just redirected away from. */}
          <Link href={identity ? roleHome(identity) : "/"} className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Atom className="size-4" aria-hidden />
            </span>
            <span className="font-display font-semibold tracking-tight">
              SyllabAI
              {/* 375px fit (demo UI-fix wave): the " Hub" suffix returns at sm;
                below that the wordmark alone keeps room for the identity cluster */}
              <span className="hidden text-muted-foreground sm:inline"> Hub</span>
            </span>
          </Link>

          <DropdownMenu>
            {/* run-014 (audit F1, WCAG 2.5.3 Label-in-Name): the visible label
                is "Study tools" at every width that shows text (sm+); the old
                sm–lg "Menu" text contradicted the aria-label. Below sm the
                trigger is icon-only, where the aria-label is the sole name. */}
            <DropdownMenuTrigger
              aria-label="Study tools"
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Layers className="size-4 sm:hidden" aria-hidden />
              <span className="hidden sm:inline">Study tools</span>
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {/* run-014 (audit F8): the in-menu title only where the trigger
                  is icon-only (phones) — at sm+ the trigger already names the
                  menu and the label read as a duplicate. */}
              <DropdownMenuLabel className="sm:hidden">Study tools</DropdownMenuLabel>
              {TOOLS.map((t) => {
                // run-015 (audit F6): mark the surface the learner is already
                // on — aria-current="page" for assistive tech, check glyph +
                // muted ground for sight. Hover/focus keep the shared accent.
                const active = isToolActive(t.href, pathname);
                return (
                  <DropdownMenuItem key={t.href} asChild>
                    <Link
                      href={courseScopedToolHref(t.href, pathname, lastOpened?.slug ?? null)}
                      aria-current={active ? "page" : undefined}
                      className={cn("cursor-pointer", active && "bg-muted font-medium")}
                    >
                      <t.icon className="size-4" aria-hidden />
                      <span className="flex-1">{t.label}</span>
                      {"desc" in t && t.desc && (
                        <span className="text-[11px] text-muted-foreground">{t.desc}</span>
                      )}
                      {active && <Check className="size-3.5 text-primary" aria-hidden />}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>More tools</DropdownMenuLabel>
              {moreTools.map((t) => {
                // run-015 (audit F6): same active-row law as the primary rows.
                const active = isToolActive(t.href, pathname);
                return (
                  <DropdownMenuItem key={t.href} asChild>
                    <Link
                      href={
                        t.href === "/knowledge-graph"
                          ? knowledgeGraphHref(pathname)
                          : t.href
                      }
                      aria-current={active ? "page" : undefined}
                      className={cn("cursor-pointer", active && "bg-muted font-medium")}
                    >
                      <t.icon className="size-4" aria-hidden />
                      <span className="flex-1">{t.label}</span>
                      {active && <Check className="size-3.5 text-primary" aria-hidden />}
                    </Link>
                  </DropdownMenuItem>
                );
              })}

              {/* Mobile UX audit (2026-09-28) P1, hub-adapted: the header
                  "Sign in" button is `hidden sm:inline-flex`, so a signed-out
                  phone had NO path into the app. Signed-in users don't need a
                  mirror here — their identity dropdown (with Sign out) renders
                  at every width. So: one sm:hidden Sign-in item, signed-out
                  state only. */}
              {!identity && (
                <>
                  <DropdownMenuSeparator className="sm:hidden" />
                  <DropdownMenuItem asChild className="cursor-pointer sm:hidden">
                    <Link href={signInHref(pathname, currentSearch)}>
                      <LogIn className="size-4" aria-hidden />
                      <span className="flex-1">Sign in</span>
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* t-ui-polish run-001 — the MG/RD inline quick nav (lg+): quiet
              links, the run-004b filled pill marks the active tool. Icons
              ride inline at this width (the references' idiom); below lg
              the Study tools dropdown remains the only nav. */}
          <nav aria-label="Quick tools" className="hidden items-center gap-0.5 lg:flex">
            {quickNavItems.map((t) => {
              const active = isToolActive(t.href, pathname);
              return (
                <Link
                  key={t.href}
                  href={courseScopedToolHref(t.href, pathname, lastOpened?.slug ?? null)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-accent-primary text-accent-primary-foreground"
                      : "text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground",
                  )}
                >
                  <t.icon className="size-4 opacity-60 [@media(hover:hover)]:group-hover:opacity-100" aria-hidden />
                  <span>{t.label}</span>
                </Link>
              );
            })}
          </nav>

          <span className="ml-1 hidden text-xs text-muted-foreground xl:inline">
            IGCSE &amp; IAL revision
          </span>

          {/* SME header parity: persistent primary CTA + session identity
              (core-auth-backed) + dual-theme toggle */}
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {identity ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                    "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <User className="size-3.5" aria-hidden />
                  <span className="max-w-16 truncate sm:max-w-28">{identity.name}</span>
                  <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs">
                    {identity.email} · {identity.role === "teacher" ? "Teacher" : "Student"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/* B-1 (frontend-flow audit): the menu's primary item is
                      the role home — "My dashboard" for students, the
                      workspace for teachers. Teachers keep the student
                      dashboard one honest click away, labelled for what it
                      is (the demo-to-a-class use case). */}
                  <DropdownMenuItem asChild>
                    <Link href={roleHome(identity)} className="cursor-pointer">
                      {identity.role === "teacher" ? (
                        <GraduationCap className="size-4" aria-hidden />
                      ) : (
                        <LayoutDashboard className="size-4" aria-hidden />
                      )}
                      {identity.role === "teacher" ? "Teacher workspace" : "My dashboard"}
                    </Link>
                  </DropdownMenuItem>
                  {identity.role === "teacher" && (
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard" className="cursor-pointer">
                        <LayoutDashboard className="size-4" aria-hidden />
                        Preview student view
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => clearIdentity()} className="cursor-pointer">
                    <LogOut className="size-4" aria-hidden />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1.5 px-2 sm:px-3"
                aria-label="Sign in"
              >
                <Link href={signInHref(pathname, currentSearch)}>
                  <LogIn className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">Sign in</span>
                </Link>
              </Button>
            )}
            {/* B-1 (frontend-flow audit): a teacher's header button opens
                the workspace, never the student dashboard. Students and
                signed-out visitors get /practice (UX review 2026-11-04). */}
            <Button
              asChild
              size="sm"
              className="gap-1.5 px-2 sm:px-3"
              aria-label={identity?.role === "teacher" ? "Open workspace" : "Practise"}
            >
              {/* UX review 2026-11-04: the student CTA was "Start studying"
                  → the student's own home — a primary button that reloads the
                  page it sits on. /practice is the always-valid open surface
                  (index is ungated), and the verb family stays coherent:
                  Practise = questions here, Review = the due queue (strip),
                  Revise = course content (cards). Anonymous visitors get an
                  open destination instead of a login bounce. */}
              <Link href={identity?.role === "teacher" ? roleHome(identity) : "/practice"}>
                <Zap className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">
                  {identity?.role === "teacher" ? "Open workspace" : "Practise"}
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </header>
      )}

      {/* content */}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn("min-w-0 flex-1 focus-visible:outline-none", !bare && "px-4 py-6 sm:px-6 lg:px-8")}
      >
        {bare ? children : <div className="mx-auto w-full max-w-6xl">{children}</div>}
      </main>

      {/* footer — UX review 2026-10-31 F-02: the old footer spoke operator
          (repo names, attestation dates, the data-plane chip) in the one
          strip every page renders. Same honesty, student nouns. On
          document-focus routes (paper viewer / player) it is omitted
          entirely (the immersive contract). */}
      {!isImmersiveRoute(pathname) && (
      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-4">
          <ThemeToggle variant="row" />
          <span className="text-[11px] text-muted-foreground">
            Every note, question and flashcard here is real, committed content traced to its
            specification — and a resource that isn&apos;t ready yet is labelled, never faked.{" "}
            {/* F-1 (frontend-flow audit): the student-safe statement stays; the
                full tier register (RULE_DERIVED / AI_SUGGESTED / DEMO_DERIVED /
                SIMULATED) lives at /about/provenance, linked from its own room. */}
            <Link
              href="/about/provenance"
              className="underline underline-offset-2 hover:text-foreground"
            >
              How each kind of content is checked
            </Link>
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          SyllabAI Hub — revision for Edexcel IGCSE &amp; IAL and Cambridge International
          qualifications.
        </p>
      </footer>
      )}
    </div>
  );
}
