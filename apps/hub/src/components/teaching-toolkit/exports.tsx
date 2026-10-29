"use client";

/**
 * Teaching Toolkit exports (T-TEACH-016) — browser-side only (the fence
 * forbids server-side document rendering services):
 *   - Print / PDF: window.print() over a print stylesheet that isolates the
 *     generated document ([data-print-root]) from the app chrome.
 *   - DOCX: the `docx` package client-side (ZNotes parity: docx+JSZip in the
 *     browser; Packer.toBlob needs no JSZip) — one dependency line, flagged
 *     OUT-OF-FENCE with the T-MIG-117 mount-line precedent.
 *   - CSV: rubric levels (the gradebook-friendly plane).
 *   - JSON: the raw contract (was the lone export button in T-TEACH-014).
 *
 * SSE progress is DEFERRED by operator order (the generation stays
 * synchronous; the FailoverLlmChain.stream law is encoded in the card for
 * the future lane).
 */
import { useCallback, useState } from "react";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ToolkitToolId } from "./presets";

type Out = Record<string, unknown>;

/* eslint-disable @typescript-eslint/no-explicit-any */
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
/* eslint-enable @typescript-eslint/no-explicit-any */

const AI_NOTE = "Generated with SyllabAI Teaching Toolkit — AI draft, review before use.";

// ── the print plane ──────────────────────────────────────────────────────────

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  [data-print-root], [data-print-root] * { visibility: visible !important; }
  [data-print-root] {
    position: absolute !important;
    inset: 0 auto auto 0;
    width: 100%;
    padding: 0;
  }
  [data-print-root] [data-print-hide] { display: none !important; }
}
`;

// ── docx helpers ─────────────────────────────────────────────────────────────

const h1 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_1 });
const h2 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
const h3 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_3 });
const p = (text: string) => new Paragraph({ text, spacing: { after: 120 } });
const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 } });
const numbered = (text: string, i: number) => new Paragraph({ text: `${i + 1}. ${text}` });
const meta = (text: string) =>
  new Paragraph({ children: [new TextRun({ text, italics: true, size: 20 })], spacing: { after: 200 } });
const bullets = (rows: string[]) => rows.map((r) => bullet(r));

const durationLine = (label: string, minutes: number) => `${label} (${minutes} min)`;

const differentiationBlock = (d: unknown, heading?: string): Paragraph[] => {
  const diff = rec(d);
  const out: Paragraph[] = [];
  if (heading) out.push(h3(heading));
  for (const [k, label] of [["support", "Support"], ["core", "Core"], ["extension", "Extension"]] as const) {
    const rows = list(diff[k]);
    if (rows.length > 0) {
      out.push(p(`${label}:`));
      out.push(...bullets(rows));
    }
  }
  return out;
};

const activityBlock = (a: unknown, heading: string): Paragraph[] => {
  const act = rec(a);
  const out: Paragraph[] = [h3(durationLine(heading, num(act.duration)))];
  const desc = s(act.description);
  if (desc) out.push(p(desc));
  const materials = list(act.materials);
  if (materials.length > 0) {
    out.push(p("Materials:"));
    out.push(...bullets(materials));
  }
  const instructions = list(act.instructions);
  if (instructions.length > 0) {
    out.push(p("Instructions:"));
    instructions.forEach((line, i) => out.push(numbered(line, i)));
  }
  if (act.differentiation) out.push(...differentiationBlock(act.differentiation, "Differentiation:"));
  return out;
};

const buildLessonPlanDoc = (out: Out): Paragraph[] => {
  const ov = rec(out.overview);
  const lp = rec(out.lessonPlan);
  const body: Paragraph[] = [
    h1(`Lesson Plan — ${s(ov.topic)}`),
    meta(
      `Subject: ${s(ov.subject)} · ${num(ov.duration)} minutes` +
        (s(ov.teachingStyle) ? ` · Teaching style: ${s(ov.teachingStyle)}` : ""),
    ),
    h2("Learning objectives"),
    ...bullets(list(ov.learningObjectives)),
  ];
  const prompts = list(ov.initialPrompts);
  if (prompts.length > 0) {
    body.push(h2("Initial prompts"), ...bullets(prompts));
  }
  body.push(...activityBlock(lp.starterActivity, "Starter activity"));
  const mains = Array.isArray(lp.mainActivities) ? (lp.mainActivities as unknown[]) : [];
  mains.forEach((a, i) => body.push(...activityBlock(a, `Main activity ${i + 1}`)));
  const plenary = rec(lp.plenary);
  body.push(...activityBlock(plenary, "Plenary"));
  const followUp = list(plenary.teacherFollowUp);
  if (followUp.length > 0) body.push(h3("Teacher follow-up"), ...bullets(followUp));
  const indicators = list(plenary.successIndicators);
  if (indicators.length > 0) body.push(h3("Success indicators"), ...bullets(indicators));
  const reflections = list(out.reflectionSuggestions);
  if (reflections.length > 0) body.push(h2("Reflection suggestions"), ...bullets(reflections));
  const sen = rec(out.differentiationAndSEN);
  if (Object.keys(sen).length > 0) {
    body.push(h2("Differentiation & SEN"), ...differentiationBlock(sen.differentiation));
    const senRows = list(sen.senSupport);
    if (senRows.length > 0) {
      body.push(h3("SEN support"), ...bullets(senRows));
    }
  }
  const links = list(out.crossCurricularLinks);
  if (links.length > 0) body.push(h2("Cross-curricular links"), ...bullets(links));
  const questions = list(out.assessmentQuestions);
  if (questions.length > 0) {
    body.push(h2("Assessment questions"));
    questions.forEach((q, i) => body.push(numbered(q, i)));
  }
  if (out.additionalNotes !== undefined) {
    body.push(h2("Additional notes"));
    if (typeof out.additionalNotes === "string") body.push(p(out.additionalNotes));
    else body.push(...bullets(list(out.additionalNotes)));
  }
  return body;
};

const levelCell = (level: unknown): TableCell =>
  new TableCell({
    children: [
      new Paragraph({ children: [new TextRun({ text: `${num(rec(level).score)} — ${s(rec(level).description)}` })] }),
      ...(s(rec(level).feedback) ? [new Paragraph({ children: [new TextRun({ text: s(rec(level).feedback), italics: true, size: 18 })] })] : []),
    ],
  });

const buildRubricDoc = (out: Out): (Paragraph | Table)[] => {
  const md = rec(out.metadata);
  const ov = rec(out.overview);
  const criteria = Array.isArray(rec(out.rubric).criteria) ? (rec(out.rubric).criteria as unknown[]) : [];
  const headLabels = ["Criterion", "Advanced", "Proficient", "Basic", "Emerging"];
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headLabels.map(
          (label, i) =>
            new TableCell({
              width: { size: i === 0 ? 24 : 19, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
            }),
        ),
      }),
      ...criteria.map((c) => {
        const crit = rec(c);
        const levels = rec(crit.levels);
        return new TableRow({
          children: [
            new TableCell({
              width: { size: 24, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: s(crit.name), bold: true })] }),
                ...(s(crit.criterionIntent)
                  ? [new Paragraph({ children: [new TextRun({ text: s(crit.criterionIntent), italics: true, size: 18 })] })]
                  : []),
              ],
            }),
            levelCell(levels.advanced),
            levelCell(levels.proficient),
            levelCell(levels.basic),
            levelCell(levels.emerging),
          ],
        });
      }),
    ],
  });
  const body: (Paragraph | Table)[] = [
    h1(`Rubric — ${s(md.topic)}`),
    meta(
      `Subject: ${s(md.subject)} · ${s(md.assignmentType)} · ${s(md.assessmentType)} · ${num(md.marksPerCriterion)} marks per criterion · Assessor: ${s(md.assessor)}`,
    ),
    p(`Purpose: ${s(ov.assignmentPurpose)}`),
    p(`Submission format: ${s(ov.submissionFormat)}`),
    p(`Performance scale: ${s(ov.performanceScale)}`),
    table,
  ];
  const moderation = list(out.moderationGuidance);
  if (moderation.length > 0) {
    body.push(h2("Moderation guidance"), ...bullets(moderation));
  }
  return body;
};

const buildSowDoc = (out: Out): Paragraph[] => {
  const body: Paragraph[] = [
    h1(`Scheme of Work — ${s(out.topic)}`),
    meta(`Subject: ${s(out.subject)} · Version: ${s(rec(out.metadata).version)} · Author: ${s(rec(out.metadata).author)}`),
    h2("Overarching objectives"),
    ...bullets(list(out.overarchingObjectives)),
  ];
  const lessons = Array.isArray(out.lessons) ? (out.lessons as unknown[]) : [];
  for (const l of lessons) {
    const lesson = rec(l);
    body.push(h2(durationLine(`Lesson ${num(lesson.lessonNumber)}: ${s(lesson.title)}`, num(lesson.duration))));
    const objectives = list(lesson.learningObjectives);
    if (objectives.length > 0) body.push(h3("Objectives"), ...bullets(objectives));
    const acts = Array.isArray(lesson.activities) ? (lesson.activities as unknown[]) : [];
    acts.forEach((a, i) => body.push(...activityBlock(a, `Activity ${i + 1}`)));
    const assessment = list(lesson.assessment);
    if (assessment.length > 0) body.push(h3("Assessment"), ...bullets(assessment));
    body.push(...differentiationBlock(lesson.differentiation, "Differentiation"));
    const scaffolding = list(lesson.scaffoldingStrategies);
    if (scaffolding.length > 0) body.push(h3("Scaffolding strategies"), ...bullets(scaffolding));
    const reflections = list(lesson.reflectionPrompts);
    if (reflections.length > 0) body.push(h3("Reflection prompts"), ...bullets(reflections));
    const cross = list(lesson.crossCurricularLinks);
    if (cross.length > 0) body.push(h3("Cross-curricular links"), ...bullets(cross));
    const stretch = list(lesson.stretchTasks);
    if (stretch.length > 0) body.push(h3("Stretch tasks"), ...bullets(stretch));
  }
  return body;
};

const buildCoachDoc = (out: Out): Paragraph[] => {
  const body: Paragraph[] = [h1(`Learning Coach — ${s(out.topic)}`)];
  const main = s(out.main_argument);
  if (main) body.push(p(main));
  const concepts = Array.isArray(out.key_concepts) ? (out.key_concepts as unknown[]) : [];
  if (concepts.length > 0) {
    body.push(h2("Key concepts"));
    for (const c of concepts) {
      const concept = rec(c);
      body.push(p(`${s(concept.title)}${s(concept.importance) ? ` (${s(concept.importance)})` : ""}`));
      body.push(p(s(concept.description)));
    }
  }
  const details = list(out.critical_details);
  if (details.length > 0) body.push(h2("Critical details"), ...bullets(details));
  const apps = Array.isArray(out.applications_in_practice) ? (out.applications_in_practice as unknown[]) : [];
  if (apps.length > 0) {
    body.push(h2("Applications in practice"));
    for (const a of apps) {
      const app = rec(a);
      body.push(p(s(app.example)));
      body.push(p(s(app.description)));
    }
  }
  const prompt = s(out.thinking_prompt);
  if (prompt) body.push(h2("Thinking prompt"), p(prompt));
  const connections = Array.isArray(out.connections) ? (out.connections as unknown[]) : [];
  if (connections.length > 0) {
    body.push(h2("Connections"));
    for (const c of connections) {
      const conn = rec(c);
      body.push(bullet(`${s(conn.concept)} — ${s(conn.relationship)}`));
    }
  }
  return body;
};

export async function buildDocxBlob(tool: ToolkitToolId, output: Out): Promise<Blob> {
  const children =
    tool === "lesson-plan"
      ? buildLessonPlanDoc(output)
      : tool === "rubric"
        ? buildRubricDoc(output)
        : tool === "sow"
          ? buildSowDoc(output)
          : buildCoachDoc(output);
  children.push(new Paragraph({ children: [new TextRun({ text: AI_NOTE, italics: true, size: 18 })] }));
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{ properties: {}, children }],
  });
  return Packer.toBlob(doc);
}

// ── CSV (rubric levels — the gradebook plane) ────────────────────────────────

const csvCell = (v: string | number): string => {
  const text = String(v);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function rubricCsv(output: Out): string {
  const md = rec(output.metadata);
  const criteria = Array.isArray(rec(output.rubric).criteria) ? (rec(output.rubric).criteria as unknown[]) : [];
  const header = ["Criterion", "Criterion intent"];
  for (const level of ["Advanced", "Proficient", "Basic", "Emerging"]) {
    header.push(`${level} score`, `${level} description`, `${level} feedback`);
  }
  const rows = criteria.map((c) => {
    const crit = rec(c);
    const levels = rec(crit.levels);
    const cells: (string | number)[] = [s(crit.name), s(crit.criterionIntent)];
    for (const level of ["advanced", "proficient", "basic", "emerging"]) {
      const lv = rec(levels[level]);
      cells.push(num(lv.score), s(lv.description), s(lv.feedback));
    }
    return cells;
  });
  return [
    [`# Rubric — ${s(md.topic)}`, s(md.subject), `${s(md.assignmentType)}`, `${num(md.marksPerCriterion)} marks/criterion`].map(csvCell).join(","),
    header.map(csvCell).join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ].join("\n");
}

// ── the export bar ───────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportBar({ tool, output }: { tool: ToolkitToolId; output: Out }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);
  const fail = useCallback(
    (what: string) => {
      toast({ title: `${what} failed`, description: "Try again, or use Export JSON.", variant: "destructive" });
    },
    [toast],
  );

  const exportDocx = async () => {
    setBusy("docx");
    try {
      downloadBlob(await buildDocxBlob(tool, output), `${tool}-${stamp}.docx`);
    } catch {
      fail("Word export");
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    try {
      downloadBlob(new Blob([`\uFEFF${rubricCsv(output)}`], { type: "text/csv;charset=utf-8" }), `${tool}-${stamp}.csv`);
    } catch {
      fail("CSV export");
    }
  };

  const exportJson = () => {
    downloadBlob(new Blob([JSON.stringify(output, null, 2)], { type: "application/json" }), `${tool}-${stamp}.json`);
  };

  return (
    <div data-print-hide className="flex flex-wrap items-center gap-2" role="group" aria-label="Export the document">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        Print / PDF
      </Button>
      <Button variant="outline" size="sm" onClick={() => void exportDocx()} disabled={busy === "docx"}>
        {busy === "docx" ? "Preparing…" : "Word (.docx)"}
      </Button>
      {tool === "rubric" && (
        <Button variant="outline" size="sm" onClick={exportCsv}>
          CSV (levels)
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={exportJson}>
        JSON
      </Button>
      <style>{PRINT_CSS}</style>
    </div>
  );
}
