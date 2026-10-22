"use client";

/**
 * Teaching Toolkit output renderers (T-TEACH-014) — ported from the
 * fidelity-validated recreation (znotes/recreation renderers.tsx): the
 * ZNotes tab structures, byte-for-byte where it matters (tab names, section
 * order, computed timing/sums displays). Rubric scores are COMPUTED
 * (100/75/50/25% of marksPerCriterion — the capture-pinned rule) and arrive
 * already pinned by the backend; the renderers trust nothing.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type {
  CoachOutput,
  LessonPlanOutput,
  RubricOutput,
  SowOutput,
} from "./presets";

function List({ items, marker = "•" }: { items: string[]; marker?: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed">
          <span className="text-muted-foreground select-none shrink-0">{marker}</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Chip({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{String(value)}</div>
    </div>
  );
}

function Diff3({ d }: { d: { support: string[]; core: string[]; extension: string[] } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          Support
        </div>
        <List items={d.support} />
      </div>
      <div className="rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
          Core
        </div>
        <List items={d.core} />
      </div>
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Extension
        </div>
        <List items={d.extension} />
      </div>
    </div>
  );
}

// ---------------- Lesson Plan ----------------
export function LessonPlanView({ out }: { out: LessonPlanOutput }) {
  const mins =
    (out.lessonPlan.starterActivity.duration || 0) +
    (out.lessonPlan.mainActivities || []).reduce((a, m) => a + (m.duration || 0), 0) +
    (out.lessonPlan.plenary.duration || 0);
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="flex h-auto flex-wrap gap-1">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="plan">Lesson Plan</TabsTrigger>
        <TabsTrigger value="assessment">Assessment</TabsTrigger>
        <TabsTrigger value="additional">Additional</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Chip label="Subject" value={out.overview.subject} />
          <Chip label="Topic" value={out.overview.topic} />
          <Chip label="Duration" value={`${out.overview.duration} min`} />
          <Chip label="Teaching style" value={out.overview.teachingStyle} />
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Learning Objectives</CardTitle>
            <p className="text-xs text-muted-foreground">
              attached verbatim from the class&apos;s curriculum — the grounding the plan is built on
            </p>
          </CardHeader>
          <CardContent>
            <List items={out.overview.learningObjectives} marker="✓" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Initial Prompts</CardTitle>
          </CardHeader>
          <CardContent>
            <List items={out.overview.initialPrompts} marker="?" />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="plan" className="mt-4 space-y-4">
        <div className="text-xs text-muted-foreground">
          Timing: starter + activities + plenary ={" "}
          <b className="text-foreground">{mins} min</b> (target {out.overview.duration})
        </div>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Starter Activity</CardTitle>
            <Badge variant="secondary">{out.lessonPlan.starterActivity.duration} min</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{out.lessonPlan.starterActivity.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {out.lessonPlan.starterActivity.materials.map((m, i) => (
                <Badge key={i} variant="outline">
                  {m}
                </Badge>
              ))}
            </div>
            <Separator />
            <List items={out.lessonPlan.starterActivity.instructions} marker="→" />
          </CardContent>
        </Card>
        {(out.lessonPlan.mainActivities || []).map((m, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Main Activity {i + 1}</CardTitle>
              <Badge variant="secondary">{m.duration} min</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{m.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {m.materials.map((x, j) => (
                  <Badge key={j} variant="outline">
                    {x}
                  </Badge>
                ))}
              </div>
              <Separator />
              <List items={m.instructions} marker="→" />
              <Diff3 d={m.differentiation} />
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Plenary</CardTitle>
            <Badge variant="secondary">{out.lessonPlan.plenary.duration} min</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{out.lessonPlan.plenary.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {out.lessonPlan.plenary.materials.map((x, j) => (
                <Badge key={j} variant="outline">
                  {x}
                </Badge>
              ))}
            </div>
            <Separator />
            <List items={out.lessonPlan.plenary.instructions} marker="→" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  Teacher follow-up
                </div>
                <List items={out.lessonPlan.plenary.teacherFollowUp} />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  Success indicators
                </div>
                <List items={out.lessonPlan.plenary.successIndicators} marker="✓" />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="assessment" className="mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Assessment Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <List items={out.assessmentQuestions} marker="Q" />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="additional" className="mt-4 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Differentiation &amp; SEN</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Diff3 d={out.differentiationAndSEN.differentiation} />
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                SEN support
              </div>
              <List items={out.differentiationAndSEN.senSupport} />
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cross-Curricular Links</CardTitle>
            </CardHeader>
            <CardContent>
              <List items={out.crossCurricularLinks} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Reflection Suggestions</CardTitle>
            </CardHeader>
            <CardContent>
              <List items={out.reflectionSuggestions} />
            </CardContent>
          </Card>
        </div>
        {out.additionalNotes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <List
                items={
                  Array.isArray(out.additionalNotes)
                    ? out.additionalNotes
                    : [String(out.additionalNotes)]
                }
              />
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ---------------- Rubric ----------------
const LEVELS = [
  ["advanced", "Advanced", "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-400"],
  ["proficient", "Proficient", "bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950/40 dark:border-sky-900 dark:text-sky-400"],
  ["basic", "Basic", "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-400"],
  ["emerging", "Emerging", "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400"],
] as const;

export function RubricView({ out }: { out: RubricOutput }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chip label="Subject" value={out.metadata.subject} />
        <Chip label="Topic" value={out.metadata.topic} />
        <Chip label="Assignment" value={out.metadata.assignmentType} />
        <Chip label="Assessment" value={out.metadata.assessmentType} />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <b>Purpose:</b> {out.overview.assignmentPurpose}
          </p>
          <p>
            <b>Submission format:</b> {out.overview.submissionFormat}
          </p>
          <p>
            <b>Performance scale:</b> {out.overview.performanceScale} ·{" "}
            <b>Marks/criterion:</b> {out.metadata.marksPerCriterion}
          </p>
          <p className="text-xs text-muted-foreground">
            Criteria assessed: {out.overview.criteriaAssessed} — level scores are computed
            (advanced = the full marks; the rest at 75 / 50 / 25%), never generated.
          </p>
        </CardContent>
      </Card>
      {out.rubric.criteria.map((c, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{c.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{c.criterionIntent}</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 lg:grid-cols-2">
              {LEVELS.map(([key, label, cls]) => {
                const lv = c.levels[key];
                return (
                  <div key={key} className={`rounded-md border p-3 ${cls.split(" ").slice(0, 2).join(" ")}`}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className={`text-xs font-bold uppercase tracking-wide ${cls.split(" ")[2]}`}>
                        {label}
                      </span>
                      <Badge variant="secondary" className="font-mono">
                        {lv.score} marks
                      </Badge>
                    </div>
                    <p className="text-sm leading-relaxed">{lv.description}</p>
                    <Separator className="my-2" />
                    <p className="text-xs italic text-muted-foreground">Feedback: {lv.feedback}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Moderation Guidance</CardTitle>
        </CardHeader>
        <CardContent>
          <List items={out.moderationGuidance} marker="§" />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Scheme of Work ----------------
export function SowView({ out }: { out: SowOutput }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chip label="Subject" value={out.subject} />
        <Chip label="Topic" value={out.topic} />
        <Chip label="Lessons" value={out.lessons.length} />
        <Chip label="Version" value={`${out.metadata.version} · ${out.metadata.createdAt}`} />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Overarching Objectives</CardTitle>
        </CardHeader>
        <CardContent>
          <List items={out.overarchingObjectives} marker="✓" />
        </CardContent>
      </Card>
      {out.lessons.map((l) => (
        <Card key={l.lessonNumber}>
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-base">
                Lesson {l.lessonNumber}: {l.title}
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {l.learningObjectives.join(" · ")}
              </p>
            </div>
            <Badge variant="secondary">{l.duration} min</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Activities (sum: {l.activities.reduce((a, x) => a + x.duration, 0)} min)
              </div>
              {l.activities.map((a, i) => (
                <div key={i} className="rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{a.title}</span>
                    <Badge variant="outline" className="shrink-0 font-mono">
                      {a.duration} min
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.description}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {a.resources.map((r, j) => (
                      <Badge key={j} variant="outline" className="text-[11px]">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  Assessment
                </div>
                <List items={l.assessment} />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  Scaffolding strategies
                </div>
                <List items={l.scaffoldingStrategies} />
              </div>
            </div>
            <Diff3 d={l.differentiation} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  Reflection prompts
                </div>
                <List items={l.reflectionPrompts} marker="?" />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  Cross-curricular
                </div>
                <List items={l.crossCurricularLinks} />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  Stretch tasks
                </div>
                <List items={l.stretchTasks} marker="↑" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <p className="text-center text-xs text-muted-foreground">Authored by {out.metadata.author}</p>
    </div>
  );
}

// ---------------- Learning Coach (clarify / challenge) ----------------
export function CoachView({ out }: { out: CoachOutput }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold leading-snug">{out.topic}</h3>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="secondary">
            {out.key_concepts.filter((k) => k.importance === "Core").length} core
          </Badge>
          <Badge variant="outline">
            {out.key_concepts.filter((k) => k.importance === "Supporting").length} supporting
          </Badge>
        </div>
      </div>
      <Tabs defaultValue="main" className="w-full">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="main">Main Argument</TabsTrigger>
          <TabsTrigger value="concepts">Key Concepts</TabsTrigger>
          <TabsTrigger value="details">Critical Details</TabsTrigger>
          <TabsTrigger value="apps">Applications In Practice</TabsTrigger>
          <TabsTrigger value="think">Thinking Prompt</TabsTrigger>
          <TabsTrigger value="links">Connections</TabsTrigger>
        </TabsList>
        <TabsContent value="main" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-[15px] leading-relaxed">{out.main_argument}</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="concepts" className="mt-4 space-y-3">
          {out.key_concepts.map((k, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold">{k.title}</span>
                  <Badge variant={k.importance === "Core" ? "default" : "outline"}>{k.importance}</Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{k.description}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="details" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <List items={out.critical_details} marker="!" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="apps" className="mt-4 space-y-3">
          {out.applications_in_practice.map((a, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="mb-1 font-semibold">{a.example}</div>
                <p className="text-sm leading-relaxed text-muted-foreground">{a.description}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="think" className="mt-4">
          <Card className="border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30">
            <CardContent className="pt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Thinking prompt
              </div>
              <p className="text-[15px] leading-relaxed">{out.thinking_prompt}</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="links" className="mt-4 space-y-3">
          {out.connections.map((c, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="mb-1 font-semibold">{c.concept}</div>
                <p className="text-sm leading-relaxed text-muted-foreground">{c.relationship}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
