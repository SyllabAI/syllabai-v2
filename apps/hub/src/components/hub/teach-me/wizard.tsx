"use client";

/**
 * Teach-Me wizard (T-TEACHME-001 run-003) — the MathsGenie 4-step wizard of
 * record (probe 2026-10-31, task yaml research): topics (up to 3 spec points
 * from the course's spec tree) → pupil difficulty → session length → mode.
 * What is deliberately NOT copied: the 2-free-sessions paywall meter (ADR-040
 * D3 replaces it with the honest 3/day quota law) and Voice (run-004 spike;
 * the option renders as the honest "New" roadmap tile, disabled).
 *
 * All thresholds are server law (apps/api/src/teach-me/config.ts) — this
 * component duplicates none of them; the 3-point pick ceiling is the wire
 * contract's own bound (teachSpecPointIdsSchema max 3).
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TeachDifficulty, TeachSessionLength } from "@syllabai/contracts";
import {
  TEACH_ME_MAX_SPEC_POINTS,
  type TeachMePickerTopic,
} from "./picker-data";

export interface TeachMeWizardProps {
  topics: TeachMePickerTopic[];
  onStart: (body: {
    specPointIds: string[];
    difficulty: TeachDifficulty;
    length: TeachSessionLength;
    mode: "chat";
  }) => void;
  busy: boolean;
}

const DIFFICULTIES: Array<{
  value: TeachDifficulty;
  label: string;
  desc: string;
}> = [
  {
    value: "easy",
    label: "Easy",
    desc: "The Pupil knows nothing — explain everything from the ground up.",
  },
  {
    value: "medium",
    label: "Medium",
    desc: "The Pupil knows the basics but mixes things up.",
  },
  {
    value: "hard",
    label: "Hard",
    desc: "The Pupil gets the basics and grills you on the tricky parts.",
  },
];

const LENGTHS: Array<{ value: TeachSessionLength; label: string; desc: string }> = [
  {
    value: "quick",
    label: "Quick Review",
    desc: "3 objectives to cover — a focused recap session.",
  },
  {
    value: "in_depth",
    label: "In-Depth",
    desc: "4 objectives to cover — room for the harder edges.",
  },
];

export function TeachMeWizard({ topics, onStart, busy }: TeachMeWizardProps) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<TeachDifficulty | null>(null);
  const [length, setLength] = useState<TeachSessionLength | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return topics;
    return topics
      .map((t) => ({
        ...t,
        subtopics: t.subtopics
          .map((s) => ({
            ...s,
            points: s.points.filter(
              (p) =>
                p.title.toLowerCase().includes(q) ||
                p.code.toLowerCase().includes(q) ||
                s.title.toLowerCase().includes(q) ||
                t.title.toLowerCase().includes(q),
            ),
          }))
          .filter((s) => s.points.length > 0),
      }))
      .filter((t) => t.subtopics.length > 0);
  }, [topics, q]);

  const full = picked.length >= TEACH_ME_MAX_SPEC_POINTS;
  const toggle = (code: string) => {
    setPicked((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : full
          ? prev
          : [...prev, code],
    );
  };

  const canStart =
    picked.length >= 1 && difficulty !== null && length !== null && !busy;

  const steps = ["Topics", "Pupil", "Length", "Mode"];

  return (
    <div className="mx-auto max-w-3xl">
      {/* step rail */}
      <ol className="mb-5 flex flex-wrap items-center gap-1.5 text-xs">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground/40">→</span>}
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
              className={`rounded-full border px-2.5 py-1 transition-colors ${
                step === i
                  ? "border-primary/40 bg-primary/10 font-medium text-primary"
                  : i < step
                    ? "border-muted-foreground/20 text-muted-foreground"
                    : "border-muted-foreground/15 text-muted-foreground/60"
              }`}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section aria-label="Choose what you will teach">
          <h3 className="text-sm font-semibold">
            Pick what you&apos;ll teach — up to {TEACH_ME_MAX_SPEC_POINTS} spec points
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Search or browse the specification, then tick the statements you want to
            teach. The Pupil is taught only what you pick.
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the specification — e.g. electrolysis"
            className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {picked.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {picked.length} of {TEACH_ME_MAX_SPEC_POINTS} selected
              {full ? " — deselect one to change" : ""}
            </p>
          )}
          <div className="mt-3 max-h-[26rem] space-y-4 overflow-y-auto pr-1">
            {filtered.map((topic) => (
              <details
                key={topic.code}
                open={filtered.length <= 3}
                className="rounded-lg border border-border bg-card"
              >
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
                  <span className="text-muted-foreground">{topic.number}.</span>{" "}
                  {topic.title}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {topic.subtopics.reduce((n, s) => n + s.points.length, 0)} points
                  </span>
                </summary>
                <div className="space-y-3 border-t border-border/60 px-4 py-3">
                  {topic.subtopics.map((sub) => (
                    <div key={sub.code}>
                      <p className="text-xs font-medium text-muted-foreground">
                        {sub.label !== "·" && (
                          <span className="mr-1.5 font-semibold text-foreground/70">
                            {sub.label}
                          </span>
                        )}
                        {sub.title}
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {sub.points.map((p) => {
                          const checked = picked.includes(p.code);
                          const disabled = !checked && full;
                          return (
                            <li key={p.code}>
                              <label
                                className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                                  disabled
                                    ? "opacity-40"
                                    : checked
                                      ? "bg-primary/10"
                                      : "hover:bg-muted/60"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={() => toggle(p.code)}
                                  className="mt-0.5 size-4 accent-[var(--primary)]"
                                />
                                <span>
                                  <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                                    {p.code}
                                  </span>
                                  {p.title}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            {filtered.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing in this specification matches “{query}”.
              </p>
            )}
          </div>
        </section>
      )}

      {step === 1 && (
        <section aria-label="Choose the pupil difficulty">
          <h3 className="text-sm font-semibold">Who are you teaching?</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDifficulty(d.value)}
                aria-pressed={difficulty === d.value}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  difficulty === d.value
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <span className="text-sm font-semibold">{d.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {d.desc}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section aria-label="Choose the session length">
          <h3 className="text-sm font-semibold">How long?</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {LENGTHS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLength(l.value)}
                aria-pressed={length === l.value}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  length === l.value
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <span className="text-sm font-semibold">{l.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{l.desc}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-label="Choose the mode">
          <h3 className="text-sm font-semibold">How do you want to teach?</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed="true"
              className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-left"
            >
              <span className="text-sm font-semibold">Chat</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Type your explanation; the Pupil answers in kind.
              </span>
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="cursor-not-allowed rounded-lg border border-border bg-card p-3 text-left opacity-60"
            >
              <span className="text-sm font-semibold">
                Voice <Badge className="ml-1 text-[10px]">New</Badge>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Speak your explanation — not rolled out yet.
              </span>
            </button>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            You&apos;ll teach <strong className="text-foreground">{picked.length}</strong>{" "}
            spec point{picked.length === 1 ? "" : "s"} to a{" "}
            <strong className="text-foreground">
              {DIFFICULTIES.find((d) => d.value === difficulty)?.label.toLowerCase()}
            </strong>{" "}
            Pupil in a{" "}
            <strong className="text-foreground">
              {LENGTHS.find((l) => l.value === length)?.label.toLowerCase()}
            </strong>{" "}
            session. Sessions are limited per day — the honest cap lives on the server,
            and it tells you plainly when you&apos;re done for the day.
          </div>
        </section>
      )}

      {/* footer nav */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || busy}
        >
          Back
        </Button>
        {step < 3 ? (
          <Button
            onClick={() => setStep((s) => Math.min(3, s + 1))}
            disabled={(step === 0 && picked.length === 0) || (step === 1 && !difficulty) || (step === 2 && !length) || busy}
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={() =>
              canStart &&
              picked.length >= 1 &&
              difficulty &&
              length &&
              onStart({ specPointIds: picked, difficulty, length, mode: "chat" })
            }
            disabled={!canStart}
          >
            {busy ? "Waking the Pupil…" : "Start teaching"}
          </Button>
        )}
      </div>
    </div>
  );
}
