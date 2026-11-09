"use client";

/**
 * T-TEACHGENIE-001 — the Teach SillyAI landing. T-TEACHGENIE-004 (operator
 * order 2026-11-05, "design is not consistent — compare with other pages"):
 * re-laid-out from the MG left-rail hero into the house single-column
 * pattern the sibling select pages use — centred persona hero (SillyAI
 * preview chat floating above the avatar, typing dots before the first
 * session, "Learn by Teaching" title + Feynman line, Start button), the
 * How-it-works card, then Recent sessions as a house list section
 * (UTC-day-grouped rows with status dot + time-ago). Every token is a hub
 * token; the MG palette and left rail are retired.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BabyGenieAvatar } from "./baby-genie";
import { statusDotClass, statusLabel, timeAgo } from "./util";
import type { SessionHistoryItem } from "@syllabai/contracts";

export interface TeachGeniePreviewRow {
  id: string;
  role: "student" | "pupil";
  text: string;
}

export interface TeachGenieLandingProps {
  courseLabel: string;
  history: SessionHistoryItem[] | null;
  preview: TeachGeniePreviewRow[] | null;
  starting: boolean;
  onStart: () => void;
  onOpenSession: (sessionId: string) => void;
}

export function TeachGenieLanding({
  courseLabel,
  history,
  preview,
  starting,
  onStart,
  onOpenSession,
}: TeachGenieLandingProps) {
  const hasHistory = history != null && history.length > 0;
  return (
    <div className="flex w-full flex-col gap-10">
      {/* persona hero — the preview chat floats above the avatar (the one
          MG flourish kept: it is the persona's stage, not a palette) */}
      <div className="isolate mx-auto flex w-full max-w-lg flex-col items-center pt-6 text-center">
        <div className="-mb-24 w-full">
          <div className="relative mx-auto mb-3 h-[200px] w-full max-w-md">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-background via-background/80 to-transparent" />
            <div className="flex h-full flex-col justify-end overflow-hidden px-4 pb-10">
              <div className="flex flex-col gap-2.5">
                {preview && preview.length > 0 ? (
                  preview.map((row) =>
                    row.role === "pupil" ? (
                      <div key={row.id} className="flex flex-col items-start">
                        <span className="mb-1 px-2 text-xs font-medium text-muted-foreground/60">SillyAI</span>
                        <div className="w-fit max-w-[65%] rounded-2xl border bg-card p-2 px-3 text-left text-xs font-medium leading-relaxed text-pretty text-foreground shadow-sm">
                          {row.text}
                        </div>
                      </div>
                    ) : (
                      <div key={row.id} className="flex flex-col items-end">
                        <span className="mb-1 px-2 text-xs font-medium text-muted-foreground/60">You</span>
                        <div className="w-fit max-w-[65%] rounded-2xl bg-muted p-2 px-3 text-left text-xs font-medium leading-relaxed text-pretty text-foreground shadow-sm">
                          {row.text}
                        </div>
                      </div>
                    ),
                  )
                ) : (
                  <div className="flex justify-start">
                    <div
                      role="img"
                      aria-label="SillyAI is thinking"
                      className="flex w-fit items-center gap-[3px] rounded-2xl border bg-card px-3 py-2 shadow-sm"
                    >
                      <span className="tg-dot size-[5px] rounded-full bg-foreground/30" />
                      <span className="tg-dot size-[5px] rounded-full bg-foreground/30" />
                      <span className="tg-dot size-[5px] rounded-full bg-foreground/30" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <BabyGenieAvatar size={180} />
        <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight text-foreground">Learn by Teaching</h2>
        <p className="mt-3 text-balance text-base font-normal text-muted-foreground">
          Review a concept by teaching it to SillyAI.
          <br />
          Practice learning with the{" "}
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger className="inline-flex cursor-help items-center gap-0.5 underline decoration-dotted underline-offset-2">
                Feynman technique
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64 text-xs leading-relaxed">
                Explain it in your own words as if teaching a younger student — the gaps you hit are the gaps you
                revise.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          .
        </p>
        <Button
          type="button"
          size="lg"
          onClick={onStart}
          disabled={starting}
          className="mt-7 w-full max-w-xs"
        >
          Start New Session
        </Button>
      </div>

      {/* how it works — the house card */}
      <section aria-label="How it works" className="rounded-xl border bg-card p-6">
        <h3 className="text-balance text-center text-xl font-bold tracking-tight text-foreground">How it works</h3>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Step
            badge="1"
            title="Pick a revision note"
            body="Choose the note you want to teach from, under unit and topic dropdowns — or search for it."
          />
          <Step
            badge="2"
            title="Teach SillyAI"
            body="Type it or say it out loud. It keeps asking until every step makes sense."
          />
          <Step
            badge="3"
            title="See what stuck"
            body="Objectives tick off as you cover them, then a review at the end."
          />
        </div>
      </section>

      {/* recent sessions — the house list section (the MG left rail, stacked;
          still hidden entirely until the first session exists) */}
      {hasHistory && (
        <section aria-label="Your Teach SillyAI sessions">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold tracking-tight text-foreground">Recent sessions</h3>
            <Button type="button" variant="ghost" size="sm" onClick={onStart} className="text-primary hover:text-primary">
              <Plus aria-hidden /> New session
            </Button>
          </div>
          <div className="divide-y divide-border/60">
            {groupRows(history ?? []).map((group) => (
              <div key={group.label} className="py-2 first:pt-0 last:pb-0">
                <p className="px-1 pb-1 pt-3 text-xs font-medium text-muted-foreground">{group.label}</p>
                <ul className="flex flex-col">
                  {group.items.map((it) => (
                    <li key={it.sessionId}>
                      <button
                        type="button"
                        onClick={() => onOpenSession(it.sessionId)}
                        className="block w-full rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted"
                      >
                        <p className="line-clamp-2 text-sm font-medium text-foreground">
                          {it.specPointIds.join(" · ")}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={`size-2 shrink-0 rounded-full ${statusDotClass(it.status)}`} />
                          {statusLabel(it.status)}
                          <span aria-hidden>·</span>
                          {courseLabel}
                          <span aria-hidden>·</span>
                          {timeAgo(it.createdAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        What you cover is saved as an AI_SUGGESTED suggestion your teacher can ratify — the end-of-session review
        is the correction of record, so read it even when everything ticks green.
      </p>
    </div>
  );
}

function Step({ badge, title, body }: { badge: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
          {badge}
        </span>
      </div>
      <div className="mb-1">
        <h5 className="text-balance text-center text-base font-bold tracking-tight text-foreground">{title}</h5>
      </div>
      <p className="text-center text-sm font-normal leading-relaxed text-pretty text-muted-foreground">{body}</p>
    </div>
  );
}

/** UTC-day grouping — the same quota clock the old Teach-Me history used. */
function groupRows(items: SessionHistoryItem[]): Array<{ label: string; items: SessionHistoryItem[] }> {
  const dayOf = (iso: string) => iso.slice(0, 10);
  const now = new Date();
  const today = dayOf(now.toISOString());
  const yesterday = dayOf(new Date(now.getTime() - 86_400_000).toISOString());
  const groups = new Map<string, SessionHistoryItem[]>();
  for (const item of items) {
    const day = dayOf(item.createdAt);
    const label = day === today ? "Today" : day === yesterday ? "Yesterday" : day;
    const bucket = groups.get(label) ?? [];
    bucket.push(item);
    groups.set(label, bucket);
  }
  return [...groups.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
}
