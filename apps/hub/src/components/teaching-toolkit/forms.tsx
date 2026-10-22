"use client";

/**
 * Teaching Toolkit form bodies (T-TEACH-014) — ported from the recreation's
 * forms minus EVERY subject/board/level input (the operator directive: the
 * picked class resolves the subject; the chips render read-only in the page
 * shell). The one "content" input the teacher makes is the topic, picked
 * from the class's book-chapter lane or typed freehand.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ToolkitOutcomeView, ToolkitTopicView } from "@/lib/types";
import {
  ASSESSMENT_TYPES,
  ASSIGNMENT_TYPES,
  COACH_AUDIENCES,
  CRITERIA,
  DIFFICULTY_LEVELS,
  EMPHASIS_AREAS,
  LESSON_DURATIONS,
  MARKS_PER_CRITERION,
  SOW_LESSON_DURATIONS,
  STUDENT_ABILITY,
  TEACHING_STYLES,
  type CoachFormData,
  type LessonPlanFormData,
  type RubricFormData,
  type SowFormData,
} from "./presets";

const selCls = "bg-card";

// ── the shared topic lane (book chapters for the class's course) ─────────────

export function TopicPicker({
  topics,
  topicId,
  onTopicId,
  freeTopic,
  onFreeTopic,
}: {
  topics: ToolkitTopicView[];
  topicId: string | null;
  onTopicId: (id: string | null) => void;
  freeTopic: string;
  onFreeTopic: (t: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Topic</Label>
      {topics.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            value={topicId ?? "__free__"}
            onValueChange={(v) => onTopicId(v === "__free__" ? null : v)}
          >
            <SelectTrigger className={selCls}>
              <SelectValue placeholder="Pick from the course's chapters" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__free__">Free topic (type below)</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t.topicId} value={t.topicId}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={topicId ? undefined : "e.g. Enzymes"}
            value={topicId ? (topics.find((t) => t.topicId === topicId)?.title ?? "") : freeTopic}
            onChange={(e) => onFreeTopic(e.target.value)}
            disabled={!!topicId}
          />
        </div>
      ) : (
        <Input
          placeholder="e.g. Enzymes"
          value={freeTopic}
          onChange={(e) => onFreeTopic(e.target.value)}
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        The subject never appears here — the picked class resolves it server-side.
      </p>
    </div>
  );
}

// ── lesson plan ──────────────────────────────────────────────────────────────

export function LessonPlanForm({
  value,
  onChange,
  topicId,
  outcomes,
  outcomeSel,
  onToggleOutcome,
  freeObjectives,
  onFreeObjectives,
  children,
}: {
  value: LessonPlanFormData;
  onChange: (patch: Partial<LessonPlanFormData>) => void;
  topicId: string | null;
  outcomes: ToolkitOutcomeView[] | null;
  outcomeSel: Set<string>;
  onToggleOutcome: (title: string) => void;
  freeObjectives: string;
  onFreeObjectives: (t: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {children}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Duration</Label>
          <Select
            value={String(value.duration)}
            onValueChange={(v) => onChange({ duration: Number(v) })}
          >
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LESSON_DURATIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} minutes
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Teaching style</Label>
          <Select
            value={value.teachingStyle ?? "__none__"}
            onValueChange={(v) => onChange({ teachingStyle: v === "__none__" ? null : v })}
          >
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">No preference</SelectItem>
              {TEACHING_STYLES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Class ability</Label>
          <Select
            value={value.studentAbility ?? "__none__"}
            onValueChange={(v) => onChange({ studentAbility: v === "__none__" ? null : v })}
          >
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No preference</SelectItem>
              {STUDENT_ABILITY.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* the grounding law, visible: outcomes auto-attach verbatim */}
      {outcomes && outcomes.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Learning objectives (attached verbatim from the curriculum)</Label>
            <Badge variant="outline" className="text-[10px] font-normal">
              {outcomeSel.size} / {outcomes.length} attached
            </Badge>
          </div>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
            {outcomes.map((o) => (
              <label
                key={o.nodeId ?? o.title}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60",
                  !outcomeSel.has(o.title) && "text-muted-foreground",
                )}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={outcomeSel.has(o.title)}
                  onCheckedChange={() => onToggleOutcome(o.title)}
                />
                <span>{o.title}</span>
                {o.coverage === "TAUGHT" && (
                  <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] font-normal">
                    taught
                  </Badge>
                )}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Learning objectives (one per line, up to 12)</Label>
          <Textarea
            rows={4}
            placeholder={
              topicId
                ? "Loading the curriculum outcomes…"
                : "Describe enzymes as biological catalysts\nExplain the effect of temperature and pH"
            }
            value={freeObjectives}
            onChange={(e) => onFreeObjectives(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Homework</Label>
        <Select value={value.homework} onValueChange={(v) => onChange({ homework: v as "Yes" | "No" })}>
          <SelectTrigger className={selCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Yes">Yes — include a homework task</SelectItem>
            <SelectItem value="No">No — keep it in-class</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── rubric ───────────────────────────────────────────────────────────────────

export function RubricForm({
  value,
  onChange,
  children,
}: {
  value: RubricFormData;
  onChange: (patch: Partial<RubricFormData>) => void;
  children?: React.ReactNode;
}) {
  const toggleCriterion = (c: string) => {
    const has = value.criteria.includes(c);
    if (has) onChange({ criteria: value.criteria.filter((x) => x !== c) });
    else if (value.criteria.length < 4) onChange({ criteria: [...value.criteria, c] });
  };
  return (
    <div className="space-y-4">
      {children}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Assignment type</Label>
          <Select value={value.assignmentType} onValueChange={(v) => onChange({ assignmentType: v })}>
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {ASSIGNMENT_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Assessment type</Label>
          <Select value={value.assessmentType} onValueChange={(v) => onChange({ assessmentType: v })}>
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {ASSESSMENT_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Task description</Label>
        <Textarea
          rows={3}
          maxLength={600}
          placeholder="What exactly will the students do? e.g. Write up the amylase practical including method, results and evaluation."
          value={value.taskDescription}
          onChange={(e) => onChange({ taskDescription: e.target.value })}
        />
        <p className="text-[11px] text-muted-foreground">{value.taskDescription.length} / 600</p>
      </div>
      <div className="space-y-1.5">
        <Label>Marks per criterion</Label>
        <Select
          value={String(value.marksPerCriterion)}
          onValueChange={(v) => onChange({ marksPerCriterion: Number(v) })}
        >
          <SelectTrigger className={cn(selCls, "w-40")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MARKS_PER_CRITERION.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m} marks
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Criteria assessed (up to 4)</Label>
          <Badge variant="outline" className="text-[10px] font-normal">
            {value.criteria.length} / 4
          </Badge>
        </div>
        <div className="grid max-h-52 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {CRITERIA.map((c) => (
            <label
              key={c}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60",
                !value.criteria.includes(c) && "text-muted-foreground",
              )}
            >
              <Checkbox
                checked={value.criteria.includes(c)}
                onCheckedChange={() => toggleCriterion(c)}
              />
              {c}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── scheme of work ───────────────────────────────────────────────────────────

export function SowForm({
  value,
  onChange,
  children,
}: {
  value: SowFormData;
  onChange: (patch: Partial<SowFormData>) => void;
  children?: React.ReactNode;
}) {
  const toggleEmphasis = (a: string) => {
    const has = value.emphasisAreas.includes(a);
    onChange(
      has
        ? { emphasisAreas: value.emphasisAreas.filter((x) => x !== a) }
        : { emphasisAreas: [...value.emphasisAreas, a] },
    );
  };
  return (
    <div className="space-y-4">
      {children}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Lessons</Label>
          <Select
            value={String(value.totalLessons)}
            onValueChange={(v) => onChange({ totalLessons: Number(v) })}
          >
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} lesson{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Lesson duration</Label>
          <Select
            value={String(value.lessonDuration)}
            onValueChange={(v) => onChange({ lessonDuration: Number(v) })}
          >
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {SOW_LESSON_DURATIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} minutes
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Difficulty</Label>
          <Select
            value={value.difficultyLevel}
            onValueChange={(v) => onChange({ difficultyLevel: v })}
          >
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTY_LEVELS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Emphasis areas (optional)</Label>
          <Badge variant="outline" className="text-[10px] font-normal">
            {value.emphasisAreas.length} selected
          </Badge>
        </div>
        <div className="grid max-h-44 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2 lg:grid-cols-3">
          {EMPHASIS_AREAS.map((a) => (
            <label
              key={a}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60",
                !value.emphasisAreas.includes(a) && "text-muted-foreground",
              )}
            >
              <Checkbox checked={value.emphasisAreas.includes(a)} onCheckedChange={() => toggleEmphasis(a)} />
              {a}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Teacher preferences (optional)</Label>
        <Textarea
          rows={2}
          maxLength={500}
          placeholder="Anything the scheme should respect — e.g. bi-weekly practicals, invigilated mid-unit checks…"
          value={value.userPreferences ?? ""}
          onChange={(e) => onChange({ userPreferences: e.target.value || null })}
        />
      </div>
    </div>
  );
}

// ── learning coach ───────────────────────────────────────────────────────────

export function CoachForm({
  value,
  onChange,
}: {
  value: CoachFormData;
  onChange: (patch: Partial<CoachFormData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Mode</Label>
          <Select value={value.mode} onValueChange={(v) => onChange({ mode: v as "clarify" | "challenge" })}>
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clarify">Clarify — explain the passage step by step</SelectItem>
              <SelectItem value="challenge">Challenge — extend and stress-test it</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Audience</Label>
          <Select value={value.audience} onValueChange={(v) => onChange({ audience: v })}>
            <SelectTrigger className={selCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COACH_AUDIENCES.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Passage / note card</Label>
        <Textarea
          rows={8}
          maxLength={2000}
          placeholder="Paste the passage, notes or explanation the coach should work from…"
          value={value.inputText}
          onChange={(e) => onChange({ inputText: e.target.value })}
        />
        <p className="text-[11px] text-muted-foreground">{value.inputText.length} / 2000</p>
      </div>
    </div>
  );
}
