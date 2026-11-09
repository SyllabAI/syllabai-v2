"use client";

/**
 * T-TEACHGENIE-001 — the live session screen (flow laws unchanged since
 * run-001; T-TEACHGENIE-004 restyles it to the house design system):
 *  - sticky header card: Back | "Objective N/M · View learning objectives" |
 *    End Session (destructive voice, two-step confirm);
 *  - the current-objective strip (rounded-lg bg-muted + status circle);
 *  - the stream: SillyAI groups (avatar tile + name, bubble-less prose) and
 *    right-aligned user bubbles — the SAME anatomy as the live view of the
 *    tutor chat (user bubble = bg-muted);
 *  - the "New messages" inverted pill when you scroll away from the bottom;
 *  - the composer in the tutor composer's house voice (border bg-card
 *    focus-within:border-primary/50, ghost mic, round primary send):
 *    dictation ("say it out loud") + Ask-for-help escape hatch; verdict
 *    captions stay quiet.
 * Read-only mode renders the completed session: header reads "Session
 * completed", the composer is replaced with the honest read-only chip, and
 * the Session Complete overlay can mount above the stream.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, LifeBuoy, Mic, MicOff, SendHorizontal } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BabyGenieAvatar } from "./baby-genie";
import { objectiveDotClass, objectiveStatusLabel } from "./util";
import type { TeachObjective, TeachSession, VerdictChip } from "@syllabai/contracts";

export interface TeachGenieTranscriptRow {
  id: string;
  seq: number;
  role: "student" | "pupil";
  kind: string | null;
  text: string;
}

export interface TeachGenieSessionProps {
  courseSlug: string;
  session: TeachSession;
  transcript: TeachGenieTranscriptRow[];
  chips: Record<number, VerdictChip>;
  sending: boolean;
  readOnly: boolean;
  ceilingReached: boolean;
  ending: boolean;
  endArmed: boolean;
  showComplete: boolean;
  onCompleteDismiss: () => void;
  onViewReview: () => void;
  onSend: (text: string) => void;
  onEnd: () => void;
  onArmEnd: () => void;
  onBack: () => void;
}

export function TeachGenieSession({
  courseSlug,
  session,
  transcript,
  chips,
  sending,
  readOnly,
  ceilingReached,
  ending,
  endArmed,
  showComplete,
  onCompleteDismiss,
  onViewReview,
  onSend,
  onEnd,
  onArmEnd,
  onBack,
}: TeachGenieSessionProps) {
  const objectives = session.objectives;
  const covered = objectives.filter((o) => o.status === "covered").length;
  const current = objectives.find((o) => o.status === "not_started") ?? null;
  const allDone = current == null && objectives.length > 0;

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-16rem)] min-h-[30rem] w-full flex-col" data-testid="tg-session">
      {/* sticky header card */}
      <div className="sticky top-3 z-10 w-full pt-3">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 p-2">
            <Button type="button" variant="ghost" size="sm" onClick={onBack} className="-ml-1 text-muted-foreground">
              <ArrowLeft aria-hidden /> Back
            </Button>
            <p className="min-w-0 flex-1 pl-2 text-center text-sm font-medium text-muted-foreground">
              {readOnly ? (
                <>Session completed</>
              ) : (
                <>
                  Objective {Math.min(covered + 1, objectives.length)}/{objectives.length} ·{" "}
                  <ObjectivesPopover session={session} />
                </>
              )}
            </p>
            {readOnly ? (
              <Button type="button" variant="ghost" size="sm" onClick={onViewReview} className="-mr-1 text-primary hover:text-primary">
                View review
              </Button>
            ) : endArmed ? (
              <span className="flex shrink-0 items-center gap-1">
                <Button type="button" variant="destructive" size="sm" onClick={onEnd} disabled={ending}>
                  {ending ? "Ending…" : "End & review"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onArmEnd} className="text-muted-foreground">
                  Keep teaching
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onArmEnd}
                className="-mr-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                End Session
              </Button>
            )}
          </div>
          {/* current-objective strip */}
          {!readOnly && objectives.length > 0 && (
            <div className="p-1.5 pt-0">
              <div className="rounded-lg bg-muted p-1 pr-2">
                <div className="mt-0.5 flex items-start gap-2 p-1 text-sm font-medium text-pretty text-foreground">
                  <span
                    className={`mt-0.5 size-4 shrink-0 rounded-full ${
                      allDone ? "border-transparent bg-green-500" : "border-2 border-border bg-transparent"
                    }`}
                    aria-hidden
                  />
                  {allDone ? (
                    <span>All objectives covered — end the session when you&apos;re ready.</span>
                  ) : (
                    <span>{current?.text}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* stream */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-6 sm:px-0">
        <ChatStream
          session={session}
          transcript={transcript}
          chips={chips}
          sending={sending}
          readOnly={readOnly}
          ceilingReached={ceilingReached}
          courseSlug={courseSlug}
          onSend={onSend}
          currentObjectiveText={allDone ? null : current?.text ?? null}
        />
      </div>

      {/* Session Complete overlay */}
      {showComplete && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Session complete"
            className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl sm:p-8"
          >
            <div className="flex flex-col items-center text-center">
              <BabyGenieAvatar size={72} />
              <h4 className="mt-3 text-balance text-xl font-bold tracking-tight text-foreground">Session Complete</h4>
              <p className="mt-1 text-sm font-normal text-muted-foreground">
                {covered}/{objectives.length} objectives completed
              </p>
            </div>
            <ul className="mt-6 space-y-3">
              {objectives.map((o) => (
                <li key={o.id} className="flex items-start gap-2.5">
                  <span className={`mt-1.5 size-3 shrink-0 rounded-full border-2 ${objectiveDotClass(o.status)}`} aria-hidden />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-normal text-foreground">{o.text}</p>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">{objectiveStatusLabel(o.status)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-2">
              <Button type="button" onClick={onViewReview}>View Session Review</Button>
              <Button type="button" variant="outline" onClick={onCompleteDismiss}>
                View Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stream + composer                                                    */
/* ------------------------------------------------------------------ */

function ChatStream({
  session,
  transcript,
  chips,
  sending,
  readOnly,
  ceilingReached,
  courseSlug,
  onSend,
  currentObjectiveText,
}: {
  session: TeachSession;
  transcript: TeachGenieTranscriptRow[];
  chips: Record<number, VerdictChip>;
  sending: boolean;
  readOnly: boolean;
  ceilingReached: boolean;
  courseSlug: string;
  onSend: (text: string) => void;
  currentObjectiveText: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const atBottomRef = useRef(true);

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  useLayoutEffect(() => {
    scrollToBottom(false);
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
    else setShowJump(true);
  }, [transcript.length, sending]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = gap < 96;
    if (atBottomRef.current) setShowJump(false);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      <div className="relative flex h-full min-h-0 w-full flex-auto flex-col overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label="Teach SillyAI conversation"
          className="scrollbar-none relative flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="flex flex-col gap-2.5 px-2 py-4">
            {transcript.map((row) =>
              row.role === "pupil" ? (
                <div key={row.id} className="flex w-full flex-col items-start">
                  <div className="mb-1.5 flex items-center gap-2 px-2">
                    <BabyGenieAvatar size={28} />
                    <span className="text-base font-medium text-foreground">SillyAI</span>
                  </div>
                  <div className="group relative w-full max-w-[75%] px-2">
                    <div className="prose-sm max-w-full min-w-0 text-[15px] leading-relaxed text-foreground">
                      <Markdown>{row.kind === "clarify_nudge" ? `*${row.text}*` : row.text}</Markdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={row.id} className="flex w-full flex-col items-end gap-1">
                  <div className="max-w-[75%] rounded-2xl rounded-br-md bg-muted px-4 py-3 text-[15px] leading-relaxed text-foreground">
                    <p className="m-0 whitespace-pre-wrap">{row.text}</p>
                  </div>
                  {chips[row.seq] && !readOnly && (
                    <VerdictCaption chip={chips[row.seq]} />
                  )}
                </div>
              ),
            )}
            {sending && (
              <div className="flex w-full flex-col items-start" aria-label="SillyAI is thinking">
                <div className="mb-1.5 flex items-center gap-2 px-2">
                  <BabyGenieAvatar size={28} />
                  <span className="text-base font-medium text-foreground">SillyAI</span>
                </div>
                <div className="px-2">
                  <div className="flex w-fit items-center gap-[3px] rounded-2xl border bg-card px-3 py-2.5 shadow-sm">
                    <span className="tg-dot size-[5px] rounded-full bg-foreground/30" />
                    <span className="tg-dot size-[5px] rounded-full bg-foreground/30" />
                    <span className="tg-dot size-[5px] rounded-full bg-foreground/30" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="h-0" />
        </div>

        {/* New messages pill */}
        {showJump && (
          <div className="pointer-events-auto sticky bottom-4 z-20 mx-auto flex w-fit flex-none justify-center">
            <button
              type="button"
              onClick={() => {
                setShowJump(false);
                atBottomRef.current = true;
                scrollToBottom();
              }}
              className="flex select-none items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-background shadow-lg transition-colors"
            >
              <span className="text-sm font-medium">New messages</span>
              <ArrowDown className="-mr-1.5 h-5 w-5" aria-hidden />
            </button>
          </div>
        )}

        {/* composer / read-only footer */}
        <div className="@container pt-0.5">
          {readOnly || ceilingReached ? (
            <p className="rounded-xl border bg-muted/50 px-4 py-3 text-center text-sm font-normal text-muted-foreground">
              {ceilingReached
                ? "That's the session's message ceiling — end it to generate the review."
                : "Session is complete and read-only"}
            </p>
          ) : (
            <Composer
              courseSlug={courseSlug}
              currentObjectiveText={currentObjectiveText}
              onSend={onSend}
              sending={sending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The quiet verdict caption under your own message (T-TEACHME-001 law:
 *  chips render; the chat floor stays clean). */
function VerdictCaption({ chip }: { chip: VerdictChip }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="mr-2 cursor-pointer text-right text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="font-medium">{chip.flaggedPastedNotes ? "Flagged" : chip.verdict}</span>
      {open && <span className="mt-0.5 block max-w-72 text-pretty">{chip.feedbackLine}</span>}
    </button>
  );
}

function ObjectivesPopover({ session }: { session: TeachSession }) {
  return (
    <Popover>
      <PopoverTrigger className="cursor-pointer underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground">
        View learning objectives
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={8} className="w-96 max-w-[90vw]">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Learning objectives
        </p>
        <ul className="space-y-3">
          {session.objectives.map((o) => (
            <ObjectiveRow key={o.id} o={o} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function ObjectiveRow({ o }: { o: TeachObjective }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-1 size-3 shrink-0 rounded-full border-2 ${objectiveDotClass(o.status)}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-normal text-foreground">{o.text}</p>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">{objectiveStatusLabel(o.status)}</p>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Composer — dictation via the tutor composer's Web Speech pattern,    */
/* skinned in the tutor composer's house voice (T-TEACHGENIE-004)       */
/* ------------------------------------------------------------------ */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function Composer({
  courseSlug,
  currentObjectiveText,
  onSend,
  sending,
}: {
  courseSlug: string;
  currentObjectiveText: string | null;
  onSend: (text: string) => void;
  sending: boolean;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setSpeechAvailable(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => {
      recRef.current?.stop();
    };
  }, []);

  // autosize
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let chunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        chunk += event.results[i][0]?.transcript ?? "";
      }
      if (chunk) setText((prev) => (prev ? `${prev} ${chunk.trim()}` : chunk.trim()));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const submit = () => {
    const t = text.trim();
    if (!t || sending) return;
    onSend(t);
    setText("");
  };

  return (
    <form
      data-slot="tg-chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0"
    >
      <div className="rounded-2xl border bg-card shadow-sm transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Teach SillyAI — type it, or say it out loud…"
          aria-label="Your explanation to SillyAI"
          disabled={sending}
          className="max-h-[200px] min-h-[24px] w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-1 p-1.5">
          <div className="flex min-w-0 items-center gap-1">
            {speechAvailable && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleMic}
                aria-pressed={listening}
                aria-label={listening ? "Stop dictation" : "Start dictation"}
                className={`size-9 text-muted-foreground ${listening ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : ""}`}
              >
                {listening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
              </Button>
            )}
            <Popover>
              <PopoverTrigger
                aria-label="Ask for help"
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground @xs:w-fit"
              >
                <LifeBuoy className="size-5" aria-hidden />
                <span className="hidden text-sm @xs:inline">Ask for help</span>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={8} className="w-80 max-w-[90vw]">
                <p className="text-sm font-medium text-foreground">Stuck on this one?</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  SillyAI can&apos;t help you — it&apos;s the one learning. The SyllabAI Tutor can walk you through{" "}
                  {currentObjectiveText ? (
                    <span className="font-medium text-foreground">“{currentObjectiveText}”</span>
                  ) : (
                    "the topic"
                  )}
                  , then come back and teach it in your own words.
                </p>
                <Button type="button" asChild className="mt-3 w-full">
                  <a
                    href={`/tutor?course=${encodeURIComponent(courseSlug)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ask the SyllabAI Tutor
                  </a>
                </Button>
              </PopoverContent>
            </Popover>
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim() || sending}
            aria-label="Send to SillyAI"
            className="size-9 rounded-full"
          >
            <SendHorizontal className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <p className="mt-1.5 px-2 text-[11px] text-muted-foreground">
        Give it 40+ words — short replies earn a nudge instead of a verdict.
      </p>
    </form>
  );
}
