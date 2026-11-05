"use client";

/**
 * T-TEACHGENIE-001 — the Teach Genie landing (MG "Teach Genie" page of
 * record, saved captures 2026-10-31): left history rail (+ New Session,
 * UTC-day-grouped rows with subject/time-ago/status dot), centred hero with
 * the Baby Genie preview chat floating above the avatar (typing dots before
 * the first session), the "Learn by Teaching" title + Feynman line, the
 * blue Start pill, and the "How it works" 3-step card. Tokens come from the
 * .tg-scope MathsGenie palette (globals.css T-TEACHGENIE-001 block).
 */
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
  const hasRail = history != null && history.length > 0;
  return (
    <div className="flex w-full flex-col gap-3 px-4 sm:px-6">
      <div className="flex w-full flex-col gap-6 lg:flex-row lg:gap-4">
        {/* history rail (only once there is something to list — MG hides the
            rail entirely on the fresh landing, snapshot (3)) */}
        {hasRail && (
          <aside
            aria-label="Your Teach SillyAI sessions"
            className="flex shrink-0 flex-col gap-3 border-b-2 border-border pb-6 lg:w-60 lg:border-b-0 lg:border-r-2 lg:pr-4 lg:pb-0"
          >
            <button
              type="button"
              onClick={onStart}
              className="inline-flex w-fit cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium text-[#1cb0f6] transition-colors hover:bg-muted dark:text-[#46cbe3]"
            >
              + New Session
            </button>
            <div className="min-h-0 overflow-y-auto lg:max-h-[32rem]">
              <nav aria-label="Sessions by day">
                <ul className="flex flex-col">
                  {groupRows(history ?? []).map((group) => (
                    <li key={group.label}>
                      <p className="px-3 pb-1.5 pt-5 text-xs font-medium text-muted-foreground">{group.label}</p>
                      <ul className="flex flex-col">
                        {group.items.map((it) => (
                          <li key={it.sessionId}>
                            <button
                              type="button"
                              onClick={() => onOpenSession(it.sessionId)}
                              className="block w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted"
                            >
                              <span className="flex items-baseline justify-between gap-2">
                                <p className="text-xs font-normal text-muted-foreground">{courseLabel}</p>
                                <p className="text-xs font-normal text-muted-foreground">{timeAgo(it.createdAt)}</p>
                              </span>
                              <p className="mt-1 line-clamp-2 text-base font-medium text-foreground">
                                {it.specPointIds.join(" · ")}
                              </p>
                              <p className="mt-1 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                                <span className={`size-2 shrink-0 rounded-full ${statusDotClass(it.status)}`} />
                                {statusLabel(it.status)}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </aside>
        )}

        {/* hero column */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-14 py-8 sm:py-12">
          <div className="isolate mx-auto flex w-full max-w-lg flex-col items-center text-center">
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
                            <div className="w-fit max-w-[65%] rounded-2xl bg-background p-2 px-3 text-left text-xs font-medium leading-relaxed text-pretty text-foreground shadow-lg ring-2 ring-foreground/5">
                              {row.text}
                            </div>
                          </div>
                        ) : (
                          <div key={row.id} className="flex flex-col items-end">
                            <span className="mb-1 px-2 text-xs font-medium text-muted-foreground/60">You</span>
                            <div className="tg-bubble-user w-fit max-w-[65%] rounded-2xl p-2 px-3 text-left text-xs font-medium leading-relaxed text-pretty shadow-lg">
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
                          className="flex w-fit items-center gap-[3px] rounded-2xl bg-background px-3 py-2 shadow-lg ring-2 ring-foreground/5"
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
            <h2 className="tg-title mt-6 text-balance text-3xl tracking-tight text-foreground">Learn by Teaching</h2>
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
            <button
              type="button"
              onClick={onStart}
              disabled={starting}
              className="mt-7 inline-flex w-full max-w-xs cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-transparent bg-[#1cb0f6] px-4 py-2.5 font-medium text-white transition-all hover:bg-[#1cb0f6]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#46cbe3] dark:text-[#191919]"
            >
              Start New Session
            </button>
          </div>

          <div className="w-full max-w-3xl">
            <div className="w-full rounded-xl border-2 border-border bg-card p-6">
              <div className="mb-6">
                <h3 className="tg-title text-balance text-center text-2xl tracking-tight text-foreground">
                  How it works
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
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
            </div>
            <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
              What you cover is saved as an AI_SUGGESTED suggestion your teacher can ratify — the end-of-session review
              is the correction of record, so read it even when everything ticks green.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ badge, title, body }: { badge: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#cefbff] text-lg font-bold text-[#1cb0f6] dark:bg-[#002e5f] dark:text-[#46cbe3]">
          {badge}
        </span>
      </div>
      <div className="mb-1">
        <h5 className="tg-title text-balance text-center text-lg tracking-tight text-foreground">{title}</h5>
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
