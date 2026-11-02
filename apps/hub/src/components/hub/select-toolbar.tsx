"use client";

/**
 * The MathsGenie select-page toolbar (trace 1a1954cacb3d2ab5, the operator's
 * saved mathsgenie.co.uk revision-guides page as the example): search left,
 * Resume right. Born inline on the revision-notes index; extracted here as
 * the ONE shared law when the other two select pages joined the treatment
 * (trace 1a19acb6ec437e25: "the same three-page treatment could get
 * search/resume on exam-questions and flashcards") — revision-notes,
 * exam-questions and flashcards all render this bar, each naming its own
 * search scope and pointing Resume at its own most-recently-engaged item.
 */
import Link from "next/link";
import { Play, Search, X } from "lucide-react";

export function SelectToolbar({
  searchLabel,
  searchPlaceholder,
  query,
  onQueryChange,
  resume,
}: {
  /** accessible name of the search input (UX audit 2026-10-02 #16 law) */
  searchLabel: string;
  searchPlaceholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  /** Present only when this course's learner overlay holds engagement —
   * nothing engaged yet → no button (the example's empty:hidden wrappers).
   * Each select page computes its own resume target: the notes index picks
   * the most recently READ note, the questionbank the most recently scored
   * set, the flashcards grid the most recently rated deck. */
  resume: { href: string; title: string } | null;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
      <label className="flex min-w-0 flex-1 basis-56 items-center gap-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear search"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </label>
      {resume && (
        <Link
          href={resume.href}
          aria-label={`Resume ${resume.title}`}
          className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Play className="size-4 shrink-0 fill-current text-primary opacity-60" aria-hidden />
          <span className="max-w-[13rem] truncate">Resume {resume.title}</span>
        </Link>
      )}
    </div>
  );
}
