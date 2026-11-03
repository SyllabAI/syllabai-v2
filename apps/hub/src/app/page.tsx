import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  FileQuestion,
  GraduationCap,
  LayoutDashboard,
  Network,
  ScrollText,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDataProvider } from "@/lib/data";
import { listCourses, pilotCourseSlug } from "@/lib/courses";
import { publicConfig } from "@/lib/config";

export default async function HubPage() {
  const provider = getDataProvider();
  const cfg = publicConfig();
  const pilotSlug = await pilotCourseSlug();
  const courses = await listCourses();
  const courseCount = courses.length;
  const courseLevels = [...new Set(courses.map((c) => c.level))].sort().join(" + ");
  const [manifest, graph, notes, topics] = await Promise.all([
    provider.manifest(),
    provider.conceptGraph(),
    provider.revisionNotes(),
    provider.examQuestionTopics(),
  ]);
  const questionCount = topics.reduce((a, t) => a + t.questions.length, 0);

  const surfaces = [
    {
      href: "/courses",
      icon: GraduationCap,
      title: `Courses — ${courseCount} Learning Hubs`,
      desc: "SaveMyExams-style per-subject hubs (pilot: Edexcel IGCSE Chemistry 4CH1): sidebar topic tree, notes reader, question player, flashcards.",
    },
    {
      href: `/courses/${pilotSlug ?? ""}`,
      icon: BookOpen,
      title: "4CH1 Learning Hub",
      desc: "The fully-loaded pilot course — revision notes, exam questions by topic, flashcards and strengths & weaknesses.",
    },
    {
      href: "/knowledge-graph",
      icon: Network,
      title: "Knowledge Graph",
      desc: "The 4CH1 specification as an explorable graph — your measured mastery painted onto the spec points it belongs to.",
    },
    {
      href: "/practice",
      icon: Zap,
      title: "Practice",
      desc: "Part-level practice player with confidence/self-doubt telemetry feeding the SIMULATED overlay.",
    },
    {
      href: "/tutor",
      icon: Sparkles,
      title: "Tutor",
      desc: "Grounded AI tutor with numbered citations + honest refusals when evidence is thin.",
    },
    {
      href: "/learner",
      icon: User,
      title: "My Progress",
      desc: "Your measured mastery, review queue and attempt history — live from your SyllabAI account on the 4CH1 pilot.",
    },
    // F-2 (frontend-flow audit): the Experiments card marketed the internal
    // sandbox on the product's first screen. The route stays URL-available
    // for staff (C-4's /staff gating lands in Tier 2); it no longer advertises.
  ];

  return (
    <div className="space-y-8">
      {/* A-1's server half lives in src/proxy.ts since A-2 (Tier 1): a
          signed-in identity opening / is redirected to the role home
          before first paint. Tier 0's client-side role-home-redirect was
          removed in the same series — it lost every race to the proxy. */}
      {/* hero — SME student flow */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-[11px]">
            {provider.displayName}
          </Badge>
          {cfg.coreConfigured && (
            <Badge variant="outline" className="font-mono text-[11px]">
              core-api ✓
            </Badge>
          )}
        </div>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Revise by subject. Master by spec point.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Add the subjects you are studying, then revise from spec-anchored notes, drill real exam
          questions by topic and drill flashcards — all in one place, all mapped to your
          syllabus. {manifest.curriculum.board} {courseLevels} registry ·{" "}
          <span className="font-medium text-foreground">{courseCount} subjects</span> ready to add.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* audit F3 (one-accent budget): demoted to the themes' inverse
              voice via the authored layers; inert under SME/QG */}
          <Button asChild size="lg" className="hero-cta-inverse gap-2">
            <Link href="/dashboard">
              <LayoutDashboard className="size-4" aria-hidden />
              Open my dashboard
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="gap-2">
            <Link href="/courses">
              <GraduationCap className="size-4" aria-hidden />
              Browse all subjects
            </Link>
          </Button>
        </div>
      </section>

      {/* how it works — the SME flow */}
      <section aria-label="How it works" className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: LayoutDashboard,
            step: "1",
            title: "Add your subjects",
            desc: "Pick your courses in the dashboard — each becomes a personal Learning Hub.",
            href: "/dashboard",
          },
          {
            icon: BookOpen,
            step: "2",
            title: "Study the resources",
            desc: "Revision notes, exam questions and flashcards organised around each subject's specification tree.",
            href: "/courses",
          },
          {
            icon: FileQuestion,
            step: "3",
            title: "Test yourself",
            desc: "Work topic-by-topic exam questions with instant marking, model answers and flashcard recall.",
            href: "/courses",
          },
        ].map((s) => (
          <Link key={s.step} href={s.href} className="group focus-visible:outline-none">
            <Card className="h-full transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/60">
              <CardContent className="flex h-full items-start gap-3 p-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {s.step}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <s.icon className="size-4 text-primary" aria-hidden />
                    {s.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      {/* corpus stats — scoped honestly: these are the 4CH1 pilot's numbers
          (UX audit P2-6: they were presented as global totals) */}
      <section aria-label="Pilot corpus stats" className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Inside the {manifest.curriculum.code} {manifest.curriculum.subject} pilot
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          // manifest counts keys are the corpus's own (sections/topics/specPoints/…);
          // the graph node count comes from the already-fetched T-C11 graph
          { label: "Spec points", value: manifest.counts.specPoints },
          { label: "Graph nodes (T-C11)", value: graph.nodes.length },
          { label: "Revision notes", value: manifest.counts.notes },
          { label: "Exam questions", value: manifest.counts.questions },
        ].map((s) => (
          <Card key={s.label} className="py-4">
            <CardContent className="px-4">
              <p className="text-2xl font-bold tabular-nums">{s.value ?? 0}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
        </div>
      </section>

      {/* surfaces */}
      <section aria-label="More to explore" className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">More to explore</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Beyond the core study flow: a grounded AI tutor with citations, the contextual
            assistant, knowledge-graph surfaces and the full past-paper library — all anchored to
            the specification.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {surfaces.map((s) => (
            <Link key={s.href} href={s.href} className="group focus-visible:outline-none">
              <Card className="h-full transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <s.icon className="size-4 text-primary" aria-hidden />
                    {s.title}
                    <ArrowRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">{s.desc}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* F-1 (frontend-flow audit): the provenance register moved to
          /about/provenance — to a 16-year-old, "deterministic fiction" on
          the homepage is not honesty, it is "this site admits its numbers
          are made up". The student-safe statement lives in the global
          footer and links there. */}
    </div>
  );
}
