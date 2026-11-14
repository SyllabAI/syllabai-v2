"use client";

/**
 * Specification explorer client — topic → sub-topic → statement tree with
 * paper / unit / tier chips, filterable exactly along the printed assessment
 * structure. The chip values ARE the canonical applicability object (T-KG-16)
 * — nothing is derived client-side; the only presentation rule is cosmetic
 * (short codes like "1C" read as "Paper 1C", "U1" as "Unit 1").
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  BookOpen,
  ChevronDown,
  ClipboardList,
  Filter,
  GraduationCap,
  Layers,
  ListChecks,
  Lock,
  SquareStack,
} from "lucide-react";
import type { SpecApplicability } from "@/lib/contracts";
import type { SpecStatementVM } from "@/lib/spec-statement";

export interface SpecPointVM {
  code: string;
  text: string;
  /** T-SPEC-RENDER-1: printed list structure recovered from the flattened
   *  bundle string (null items = no structure, render `text` as-is). */
  statement: SpecStatementVM;
  applicability: SpecApplicability | null;
  /** T-SPECLINK-1: resources joined from of-record anchors — id lists into
   *  the legend (null = nothing anchored to this statement). */
  res?: SpecPointResources | null;
}

/** T-SPECLINK-1 legend: entries resolved once at build; hrefs carry the
 *  course prefix. */
export interface SpecResourceLegend {
  notes: { id: string; title: string; href: string }[];
  sets: { slug: string; name: string; setName: string | null; count: number; href: string }[];
  decks: { slug: string; title: string; count: number; href: string }[];
}

export interface SpecPointResources {
  /** revision-note ids (legend.notes) */
  n: string[];
  /** exam-question set slugs (legend.sets) */
  q: string[];
  /** flashcard deck slugs (legend.decks) */
  f: string[];
}

export interface SpecSubtopicVM {
  code: string;
  label: string;
  title: string;
  points: SpecPointVM[];
}

export interface SpecTopicVM {
  number: number;
  title: string;
  subtopics: SpecSubtopicVM[];
}

interface Option {
  value: string;
  label: string;
}

interface Props {
  topics: SpecTopicVM[];
  totalPoints: number;
  legend?: SpecResourceLegend;
}

/** "1C" → "Paper 1C"; "4MA1/1F" passes through verbatim. */
function paperLabel(p: string): string {
  return p.length <= 4 ? `Paper ${p}` : p;
}

/** "U1" → "Unit 1"; "U1F" → "Unit 1 (Foundation)"; others verbatim. */
function unitLabel(u: string): string {
  const m = /^U(\d+)([FH])?$/.exec(u);
  if (!m) return u;
  const tier = m[2] === "F" ? " (Foundation)" : m[2] === "H" ? " (Higher)" : "";
  return `Unit ${m[1]}${tier}`;
}

const ALL = "__all__";

function chipsFor(app: SpecApplicability): string[] {
  const chips: string[] = [];
  for (const p of app.papers ?? []) chips.push(paperLabel(p));
  if (app.unit_scope) chips.push(unitLabel(app.unit_scope));
  if (app.tier) chips.push(app.tier);
  if (app.coursework) chips.push("Coursework (internally assessed)");
  if (app.double_award_shared) chips.push("Also in Double Award");
  return chips;
}

function matches(app: SpecApplicability | null, paper: string, unit: string, tier: string): boolean {
  if (paper === ALL && unit === ALL && tier === ALL) return true;
  if (!app) return false;
  if (paper !== ALL && !(app.papers ?? []).includes(paper)) return false;
  if (unit !== ALL && app.unit_scope !== unit) return false;
  if (tier !== ALL && app.tier !== tier) return false;
  return true;
}

export function SpecificationExplorer({ topics, totalPoints, legend }: Props) {
  const [paper, setPaper] = useState(ALL);
  const [unit, setUnit] = useState(ALL);
  const [tier, setTier] = useState(ALL);
  /** T-SPECLINK-1: the one spec point whose resource panel is open. */
  const [openCode, setOpenCode] = useState<string | null>(null);

  const noteById = useMemo(() => {
    const m = new Map<string, SpecResourceLegend["notes"][number]>();
    for (const x of legend?.notes ?? []) m.set(x.id, x);
    return m;
  }, [legend]);
  const setBySlug = useMemo(() => {
    const m = new Map<string, SpecResourceLegend["sets"][number]>();
    for (const x of legend?.sets ?? []) m.set(x.slug, x);
    return m;
  }, [legend]);
  const deckBySlug = useMemo(() => {
    const m = new Map<string, SpecResourceLegend["decks"][number]>();
    for (const x of legend?.decks ?? []) m.set(x.slug, x);
    return m;
  }, [legend]);

  const filterActive = paper !== ALL || unit !== ALL || tier !== ALL;

  const { paperOptions, unitOptions, tierOptions, chipsSeen } = useMemo(() => {
    const papers = new Map<string, string>();
    const units = new Map<string, string>();
    const tiers = new Map<string, string>();
    let chips = 0;
    for (const t of topics)
      for (const s of t.subtopics)
        for (const p of s.points) {
          const a = p.applicability;
          if (!a) continue;
          chips += 1;
          for (const x of a.papers ?? []) papers.set(x, paperLabel(x));
          if (a.unit_scope) units.set(a.unit_scope, unitLabel(a.unit_scope));
          if (a.tier) tiers.set(a.tier, a.tier);
        }
    const sortEntries = (m: Map<string, string>): Option[] =>
      [...m.entries()]
        .sort((x, y) => x[1].localeCompare(y[1], undefined, { numeric: true }))
        .map(([value, label]) => ({ value, label }));
    return {
      paperOptions: sortEntries(papers),
      unitOptions: sortEntries(units),
      tierOptions: sortEntries(tiers),
      chipsSeen: chips,
    };
  }, [topics]);

  const visible = useMemo(() => {
    let n = 0;
    for (const t of topics)
      for (const s of t.subtopics)
        for (const p of s.points) if (matches(p.applicability, paper, unit, tier)) n += 1;
    return n;
  }, [topics, paper, unit, tier]);

  /** A dimension with exactly one value in this qualification — nothing to
   *  filter, so render it as a locked fact instead of an interactive select. */
  const renderLocked = (
    key: string,
    icon: React.ReactNode,
    labelText: string,
    value: string,
  ) => (
    <div key={key} className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {labelText}
      </Label>
      <div className="flex h-9 items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        <span>Every statement · {value}</span>
      </div>
    </div>
  );

  const renderSelect = (
    id: string,
    icon: React.ReactNode,
    labelText: string,
    value: string,
    onChange: (v: string) => void,
    options: Option[],
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {labelText}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-9 w-full min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  /** T-SPECLINK-1: the resource panel for one spec point (only rendered
   *  when at least one of-record anchored resource exists). */
  const resourceCount = (r: SpecPointResources) => r.n.length + r.q.length + r.f.length;

  const renderResources = (p: SpecPointVM) => {
    const r = p.res;
    if (!r || resourceCount(r) === 0) return null;
    const open = openCode === p.code;
    const notes = r.n.map((id) => noteById.get(id)).filter(Boolean);
    const sets = r.q.map((s) => setBySlug.get(s)).filter(Boolean);
    const decks = r.f.map((d) => deckBySlug.get(d)).filter(Boolean);
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={() => setOpenCode(open ? null : p.code)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <BookOpen className="size-3" aria-hidden />
          {resourceCount(r)} resource{resourceCount(r) === 1 ? "" : "s"}
          <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {open && (
          <div className="mt-2 grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <BookOpen className="size-3.5" aria-hidden /> Revision notes
              </p>
              {notes.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet</p>
              ) : (
                <ul className="space-y-1">
                  {notes.map((x) => (
                    <li key={x!.id}>
                      <a href={x!.href} className="text-sm text-foreground underline-offset-2 hover:underline">
                        {x!.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ClipboardList className="size-3.5" aria-hidden /> Exam questions
              </p>
              {sets.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet</p>
              ) : (
                <ul className="space-y-1">
                  {sets.map((x) => (
                    <li key={x!.slug}>
                      <a href={x!.href} className="text-sm text-foreground underline-offset-2 hover:underline">
                        {x!.name}
                        {x!.setName ? <span className="text-muted-foreground"> · {x!.setName}</span> : null}
                      </a>
                      <span className="ml-1 text-xs text-muted-foreground">{x!.count} Q</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <SquareStack className="size-3.5" aria-hidden /> Flashcards
              </p>
              {decks.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet</p>
              ) : (
                <ul className="space-y-1">
                  {decks.map((x) => (
                    <li key={x!.slug}>
                      <a href={x!.href} className="text-sm text-foreground underline-offset-2 hover:underline">
                        {x!.title}
                      </a>
                      <span className="ml-1 text-xs text-muted-foreground">{x!.count} cards</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {chipsSeen === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Paper/unit applicability has not been derived for this course yet — the
            statements below are the parsed specification, as printed.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="size-4 text-muted-foreground" aria-hidden />
                Scope the specification
              </CardTitle>
              <Badge variant="outline" className="font-mono text-2xs">
                {filterActive ? `${visible} / ${totalPoints}` : totalPoints} spec points
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {paperOptions.length >= 2 &&
              renderSelect("flt-paper", <ListChecks className="size-3.5" aria-hidden />, "Paper", paper, setPaper, paperOptions)}
            {paperOptions.length === 1 &&
              renderLocked("lk-paper", <ListChecks className="size-3.5" aria-hidden />, "Paper", paperLabel(paperOptions[0].value))}
            {unitOptions.length >= 2 &&
              renderSelect("flt-unit", <Layers className="size-3.5" aria-hidden />, "Unit", unit, setUnit, unitOptions)}
            {unitOptions.length === 1 &&
              renderLocked("lk-unit", <Layers className="size-3.5" aria-hidden />, "Unit", unitLabel(unitOptions[0].value))}
            {tierOptions.length >= 2 &&
              renderSelect("flt-tier", <GraduationCap className="size-3.5" aria-hidden />, "Tier", tier, setTier, tierOptions)}
            {tierOptions.length === 1 &&
              renderLocked("lk-tier", <GraduationCap className="size-3.5" aria-hidden />, "Tier", tierOptions[0].value)}
            <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-3">
              Assessment homes come from the parsed Pearson specification (content
              summaries &amp; assessment overviews). Hover a chip for the printed rule.
              Filters appear only where the qualification has that structure — a
              linear IGCSE has no unit scope, and only Maths A splits Foundation /
              Higher tiers.
            </p>
          </CardContent>
        </Card>
      )}

      {topics.map((t) => {
        const topicRows = t.subtopics.reduce(
          (acc, s) => acc + s.points.filter((p) => matches(p.applicability, paper, unit, tier)).length,
          0,
        );
        if (filterActive && topicRows === 0) return null;
        return (
          <Card key={`${t.number}-${t.title}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t.number}. {t.title}
                {filterActive && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {topicRows} shown
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {t.subtopics.map((s) => {
                const rows = s.points.filter((p) => matches(p.applicability, paper, unit, tier));
                if (rows.length === 0) return null;
                return (
                  <div key={s.code}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {s.label}. {s.title}
                    </p>
                    <ul className="space-y-1.5">
                      {rows.map((p) => {
                        const chips = p.applicability ? chipsFor(p.applicability) : [];
                        return (
                          <li
                            key={p.code}
                            className="flex flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-muted/50"
                          >
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                              <Badge variant="outline" className="shrink-0 font-mono text-2xs">
                                {p.code}
                              </Badge>
                              {p.statement.items ? (
                                <div className="min-w-0 flex-1 text-sm leading-relaxed">
                                  {p.statement.lead && <p>{p.statement.lead}</p>}
                                  <ul className="ml-4 mt-1 list-disc space-y-1 marker:text-muted-foreground">
                                    {p.statement.items.map((lines, i) => (
                                      <li key={i}>
                                        {lines.map((line, j) =>
                                          j === 0 ? (
                                            <span key={j} className="block">{line}</span>
                                          ) : (
                                            <span key={j} className="mt-0.5 block pl-4">{line}</span>
                                          ),
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <span className="min-w-0 flex-1 text-sm leading-relaxed">{p.text}</span>
                              )}
                              {chips.length > 0 && (
                                <span
                                  className="flex shrink-0 flex-wrap gap-1"
                                  title={p.applicability?.rule ?? undefined}
                                >
                                  {chips.map((c) => (
                                    <Badge
                                      key={c}
                                      variant="secondary"
                                      className="cursor-help text-2xs"
                                    >
                                      {c}
                                    </Badge>
                                  ))}
                                </span>
                              )}
                            </div>
                            {renderResources(p)}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {filterActive && visible === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No specification statements match this scope combination.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
