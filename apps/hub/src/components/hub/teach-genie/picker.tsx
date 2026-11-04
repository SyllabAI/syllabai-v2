"use client";

/**
 * T-TEACHGENIE-001 — the topic picker ("Pick your topics — Pick up to three
 * from your spec, or describe your own"). The picker tree is the committed
 * curriculum projection from components/hub/teach-me/picker-data.ts (the
 * same spec codes the API's canon gate validates). "Describe your own" is
 * the search box: typing filters the tree live and — if a phrase matches a
 * spec statement — surfaces it, so a free-text description picks the spec
 * points it describes without ever leaving the grounded canon (create()
 * still refuses honestly when the corpus can't ground a pick).
 */
import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { TeachDifficulty, TeachSessionLength } from "@syllabai/contracts";
import type { TeachMePickerTopic } from "@/components/hub/teach-me/picker-data";
import { TEACH_ME_MAX_SPEC_POINTS } from "@/components/hub/teach-me/picker-data";

export interface TeachGeniePickerProps {
  topics: TeachMePickerTopic[];
  courseLabel: string;
  busy: boolean;
  onStart: (body: {
    specPointIds: string[];
    difficulty: TeachDifficulty;
    length: TeachSessionLength;
    mode: "chat";
  }) => void;
  onBack: () => void;
}

const DIFFICULTIES: Array<{ value: TeachDifficulty; label: string; hint: string }> = [
  { value: "easy", label: "Easy", hint: "Baby Genie knows nothing yet" },
  { value: "medium", label: "Medium", hint: "He mixes things up" },
  { value: "hard", label: "Hard", hint: "He grills you on edge cases" },
];

const LENGTHS: Array<{ value: TeachSessionLength; label: string; hint: string }> = [
  { value: "quick", label: "Quick", hint: "3 objectives · up to 5 messages" },
  { value: "in_depth", label: "In-Depth", hint: "6 objectives · up to 8 messages" },
];

export function TeachGeniePicker({ topics, courseLabel, busy, onStart, onBack }: TeachGeniePickerProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<TeachDifficulty>("medium");
  const [length, setLength] = useState<TeachSessionLength>("quick");
  const [openTopic, setOpenTopic] = useState<string | null>(topics[0]?.code ?? null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => filterTree(topics, query), [topics, query]);

  const toggle = (code: string) => {
    setPicked((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : prev.length >= TEACH_ME_MAX_SPEC_POINTS ? prev : [...prev, code],
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronDown className="size-4 -rotate-90" aria-hidden /> Back
      </button>

      <h2 className="tg-title mt-3 text-balance text-3xl tracking-tight text-foreground">New session</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick up to three from your spec, or describe your own — Baby Genie will muddle his way through whatever you
        teach him.
      </p>

      {/* picked chips */}
      <div className="mt-5 flex min-h-9 flex-wrap items-center gap-2" aria-live="polite">
        {picked.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {picked.length}/{TEACH_ME_MAX_SPEC_POINTS} picked
          </span>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">
              {picked.length}/{TEACH_ME_MAX_SPEC_POINTS}:
            </span>
            {picked.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full bg-[#cefbff] px-3 py-1 text-xs font-medium text-[#1a6fb8] dark:bg-[#002e5f] dark:text-[#46cbe3]"
              >
                {code}
                <button
                  type="button"
                  aria-label={`Remove ${code}`}
                  onClick={() => toggle(code)}
                  className="cursor-pointer rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      {/* search / describe-your-own */}
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 focus-within:ring-2 focus-within:ring-[#1cb0f6]/40">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${courseLabel} spec, or describe what you want to teach…`}
          aria-label="Search the spec or describe your own topic"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
            className="cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* the tree */}
      <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border-2 border-border" role="list" aria-label="Spec topics">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing in your spec matches that yet — try a shorter phrase, or a key word from the statement.
          </p>
        ) : (
          filtered.map((topic) => {
            const open = openTopic === topic.code;
            return (
              <div key={topic.code} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenTopic(open ? null : topic.code)}
                  aria-expanded={open}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="text-xs font-medium text-muted-foreground">
                      {topic.number}. {topic.title}
                    </span>
                  </span>
                  <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {open && (
                  <ul className="px-2 pb-2">
                    {topic.subtopics.map((sub) =>
                      sub.points.map((pt) => {
                        const isPicked = picked.includes(pt.code);
                        return (
                          <li key={pt.code}>
                            <button
                              type="button"
                              onClick={() => toggle(pt.code)}
                              aria-pressed={isPicked}
                              disabled={!isPicked && picked.length >= TEACH_ME_MAX_SPEC_POINTS}
                              className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                isPicked ? "bg-[#cefbff]/60 dark:bg-[#002e5f]/50" : "hover:bg-muted"
                              }`}
                            >
                              <span
                                className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                                  isPicked ? "border-[#1cb0f6] bg-[#1cb0f6] text-white" : "border-border bg-transparent"
                                }`}
                                aria-hidden
                              >
                                {isPicked && <Check className="size-2.5" strokeWidth={3.5} />}
                              </span>
                              <span className="min-w-0">
                                <span className="font-mono text-[10px] text-muted-foreground">{pt.code}</span>
                                <span className="block leading-snug text-foreground">{pt.title}</span>
                              </span>
                            </button>
                          </li>
                        );
                      }),
                    )}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* difficulty + length */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Segmented
          legend="How unsure is Baby Genie?"
          options={DIFFICULTIES.map((d) => ({ value: d.value, label: d.label, hint: d.hint }))}
          value={difficulty}
          onChange={(v) => setDifficulty(v as TeachDifficulty)}
        />
        <Segmented
          legend="Session length"
          options={LENGTHS.map((l) => ({ value: l.value, label: l.label, hint: l.hint }))}
          value={length}
          onChange={(v) => setLength(v as TeachSessionLength)}
        />
      </div>

      <div className="mt-7 flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={picked.length === 0 || busy}
          onClick={() => onStart({ specPointIds: picked, difficulty, length, mode: "chat" })}
          className="inline-flex w-full max-w-xs cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-transparent bg-[#1cb0f6] px-4 py-2.5 font-medium text-white transition-all hover:bg-[#1cb0f6]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#46cbe3] dark:text-[#191919]"
        >
          {busy ? "Waking Baby Genie…" : "Start session"}
        </button>
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Sessions are AI_SUGGESTED evidence — your teacher ratifies before anything counts. Quota: 3 sessions a day.
        </p>
      </div>
    </div>
  );
}

function Segmented({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Array<{ value: string; label: string; hint: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const active = options.find((o) => o.value === value);
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{legend}</legend>
      <div className="flex rounded-xl bg-muted p-1" role="radiogroup" aria-label={legend}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
              value === o.value ? "bg-background shadow-sm ring-1 ring-foreground/5" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{active?.hint}</p>
    </fieldset>
  );
}

/** Live "describe your own" filter: match topic titles and spec statements. */
function filterTree(topics: TeachMePickerTopic[], query: string): TeachMePickerTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return topics;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const hit = (text: string) => {
    const t = text.toLowerCase();
    return t.includes(q) || (words.length > 0 && words.every((w) => t.includes(w)));
  };
  return topics
    .map((topic) => {
      const subtopics = topic.subtopics
        .map((sub) => ({
          ...sub,
          points: sub.points.filter((pt) => hit(pt.title) || hit(sub.title) || hit(topic.title)),
        }))
        .filter((sub) => sub.points.length > 0);
      if (subtopics.length === 0 && hit(topic.title)) {
        // topic-level hit: keep the whole topic
        return topic;
      }
      return subtopics.length > 0 ? { ...topic, subtopics } : null;
    })
    .filter((t): t is TeachMePickerTopic => t !== null);
}
