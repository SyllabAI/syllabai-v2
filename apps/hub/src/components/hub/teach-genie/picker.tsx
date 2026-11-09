"use client";

/**
 * T-TEACHGENIE-002 — the note-driven topic picker (operator order, chat trace
 * 1a1a84b5cf0e865d): the learner chooses the REVISION NOTE of the course they
 * want to teach from, organized under unit/topic dropdowns — not hand-picked
 * spec points (T-TEACHME-001's wizard shape, retired with the teach-me route).
 *
 * The dropdowns walk the SAME canonical spec tree every notes surface uses
 * (never a second taxonomy): the unit select lists the tree's TOPICs, the
 * topic select the chosen unit's SUBTOPICs, and the list under them holds the
 * notes anchored there (components/hub/teach-me/picker-data.ts
 * buildTeachGenieNoteTree). The picked note's canon specPointCodes ARE the
 * session's ground truth — they are sent verbatim as the create request's
 * specPointIds, and the API's G1–G4 gates stay the fail-closed law of what is
 * actually servable (create() still refuses honestly when the serving corpus
 * cannot ground the note). The search box keeps the "describe your own"
 * spirit: typing filters notes by title/unit/topic text.
 *
 * T-TEACHGENIE-004: restyled to the house design system — hub tokens only
 * (accent-primary chip, primary pick voice like the notes index's active
 * row, hairline borders, house select/search focus voice); the MG hexes are
 * retired.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeachDifficulty, TeachSessionLength } from "@syllabai/contracts";
import type { TeachGeniePickerNote, TeachGeniePickerNoteTopic } from "@/components/hub/teach-me/picker-data";

export interface TeachGeniePickerProps {
  noteTree: TeachGeniePickerNoteTopic[];
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
  { value: "easy", label: "Easy", hint: "SillyAI knows nothing yet" },
  { value: "medium", label: "Medium", hint: "It mixes things up" },
  { value: "hard", label: "Hard", hint: "It grills you on edge cases" },
];

const LENGTHS: Array<{ value: TeachSessionLength; label: string; hint: string }> = [
  { value: "quick", label: "Quick", hint: "3 objectives · up to 5 messages" },
  { value: "in_depth", label: "In-Depth", hint: "6 objectives · up to 8 messages" },
];

export function TeachGeniePicker({ noteTree, courseLabel, busy, onStart, onBack }: TeachGeniePickerProps) {
  const [unitCode, setUnitCode] = useState<string>(noteTree[0]?.code ?? "");
  const [topicCode, setTopicCode] = useState<string>(noteTree[0]?.subtopics[0]?.code ?? "");
  const [picked, setPicked] = useState<TeachGeniePickerNote | null>(null);
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<TeachDifficulty>("medium");
  const [length, setLength] = useState<TeachSessionLength>("quick");

  const unit = noteTree.find((t) => t.code === unitCode) ?? null;
  const topic = unit?.subtopics.find((s) => s.code === topicCode) ?? unit?.subtopics[0] ?? null;
  const searching = query.trim().length > 0;

  const searchHits = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    const hit = (text: string) => {
      const t = text.toLowerCase();
      return t.includes(q) || (words.length > 0 && words.every((w) => t.includes(w)));
    };
    const out: Array<{ note: TeachGeniePickerNote; unitTitle: string; topicTitle: string }> = [];
    for (const t of noteTree) {
      for (const s of t.subtopics) {
        for (const n of s.notes) {
          if (hit(n.title) || hit(s.title) || hit(t.title)) {
            out.push({ note: n, unitTitle: t.title, topicTitle: s.title });
          }
        }
      }
    }
    return out;
  }, [noteTree, query, searching]);

  const visibleNotes = searching ? searchHits.map((h) => h.note) : (topic?.notes ?? []);

  const pickUnit = (code: string) => {
    setUnitCode(code);
    const next = noteTree.find((t) => t.code === code);
    setTopicCode(next?.subtopics[0]?.code ?? "");
  };

  const codesCaption = (n: TeachGeniePickerNote): string =>
    n.specPointCodes.length === 1
      ? `Covers ${n.specPointCodes[0]}`
      : `Covers ${n.specPointCodes.length} spec points — ${n.specPointCodes.join(" · ")}`;

  return (
    <div className="w-full">
      <Button type="button" variant="ghost" size="sm" onClick={onBack} className="-ml-2 text-muted-foreground">
        <ArrowLeft aria-hidden /> Back
      </Button>

      <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight text-foreground">New session</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick the revision note you&apos;ll teach {courseLabel} from — SillyAI will muddle its way through whatever&apos;s in
        it.
      </p>

      {/* picked note chip */}
      <div className="mt-5 flex min-h-9 flex-wrap items-center gap-2" aria-live="polite">
        {picked ? (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-primary px-3 py-1 text-xs font-medium text-accent-primary-foreground">
            <span className="truncate">{picked.title}</span>
            <button
              type="button"
              aria-label={`Remove ${picked.title}`}
              onClick={() => setPicked(null)}
              className="cursor-pointer rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No note picked yet</span>
        )}
      </div>

      {/* search / describe-your-own — the house composer focus voice */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-xs transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes, or describe what you want to teach…"
          aria-label="Search the course's revision notes"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {searching && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* unit / topic dropdowns */}
      {!searching && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit</span>
            <select
              value={unitCode}
              onChange={(e) => pickUnit(e.target.value)}
              aria-label="Choose a unit"
              className="w-full cursor-pointer appearance-none rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none transition-colors focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
            >
              {noteTree.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.number}. {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Topic</span>
            <select
              value={topic?.code ?? ""}
              onChange={(e) => setTopicCode(e.target.value)}
              aria-label="Choose a topic"
              className="w-full cursor-pointer appearance-none rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none transition-colors focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
            >
              {(unit?.subtopics ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label === "·" ? s.title : `${s.label} · ${s.title}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* the notes under the selection (or the search hits) */}
      <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border bg-card" role="radiogroup" aria-label="Revision notes">
        {visibleNotes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {searching
              ? "No revision note matches that yet — try a shorter phrase, or a key word from the note's title."
              : "No revision notes live under this topic yet — pick another topic, or search for one."}
          </p>
        ) : (
          visibleNotes.map((n) => {
            const isPicked = picked?.noteId === n.noteId;
            const hit = searching ? searchHits.find((h) => h.note.noteId === n.noteId) : undefined;
            return (
              <div key={n.noteId} className="border-b border-border/60 last:border-b-0">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isPicked}
                  onClick={() => setPicked(isPicked ? null : n)}
                  className={`flex w-full cursor-pointer items-start gap-2.5 px-4 py-3 text-left text-sm transition-colors ${
                    isPicked ? "bg-primary/[0.05]" : "hover:bg-muted"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                      isPicked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/25 bg-transparent"
                    }`}
                    aria-hidden
                  >
                    {isPicked && <Check className="size-2.5" strokeWidth={3.5} />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block leading-snug ${isPicked ? "font-medium text-foreground" : "text-foreground"}`}>
                      {n.title}
                    </span>
                    <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
                      {hit ? `${hit.unitTitle} · ${hit.topicTitle} — ` : ""}
                      <span className="font-mono">{codesCaption(n)}</span>
                    </span>
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* difficulty + length */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Segmented
          legend="How unsure is SillyAI?"
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
        <Button
          type="button"
          size="lg"
          disabled={!picked || busy}
          onClick={() =>
            picked &&
            onStart({ specPointIds: picked.specPointCodes, difficulty, length, mode: "chat" })
          }
          className="w-full max-w-xs"
        >
          {busy ? "Waking SillyAI…" : "Start session"}
        </Button>
        <p className="text-center text-2xs leading-relaxed text-muted-foreground">
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
      <div className="flex rounded-lg bg-muted p-1" role="radiogroup" aria-label={legend}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 cursor-pointer rounded-md px-2 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] ${
              value === o.value ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
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
