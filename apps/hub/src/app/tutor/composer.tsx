"use client";

/**
 * Composer — the tutor's input deck.
 *
 * Typical chatbot ergonomics: auto-growing textarea (Enter sends,
 * Shift+Enter breaks a line), live character budget, an attach affordance
 * that is honest about file support, push-to-talk dictation via the Web
 * Speech API when the browser offers it, and a send/stop pair that mirrors
 * the stream state. The 600→2000 character budget is enforced server-side
 * (api/ai/chat zod) and mirrored here.
 *
 * Look (HUB-TUTOR-CLA-LOOK, the itutor.study reference): the deck is a
 * rounded-2xl card with a subject context pill (green dot + the honest
 * single-corpus scope) above a borderless field and a circular send.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Paperclip, ArrowUp, Square } from "lucide-react";

/** Server body cap for `question` (api/ai/chat zod schema). */
export const QUESTION_CAP = 2000;

/** T-TUTOR-AIM-P2 (DC10 §7.4): the learner's self-reported confidence —
 *  three buttons, NO default: none is pre-selected, a tap selects, a
 *  second tap on the selected chip deselects (a no-tap ask sends no
 *  field — the server never infers a value). The capture is per-ask: the
 *  chat resets the selection after every send. The answer NEVER references
 *  the selection (the DC10 honesty rule — capture-side copy stays neutral
 *  and the capture is invisible in the reply). */
export type ConfidenceValue = "sure" | "think_so" | "guessing";
const CONFIDENCE_OPTIONS: ReadonlyArray<{ value: ConfidenceValue; label: string }> = [
  { value: "sure", label: "Sure" },
  { value: "think_so", label: "Think so" },
  { value: "guessing", label: "Guessing" },
];

/** The subject context pill's DEFAULT label — the legacy no-course entry
 *  resolves to the chemistry pilot, so the default stays chemistry; the
 *  scoped entry passes the active course's label (T-MIG-135d). */
const SUBJECT_LABEL = "Chemistry (4CH1)";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export function Composer({
  value,
  onChange,
  busy,
  maxLen,
  placeholder,
  onSend,
  onStop,
  subjectLabel,
  confidence,
  onConfidenceChange,
}: {
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  maxLen: number;
  placeholder: string;
  onSend: () => void;
  onStop: () => void;
  /** T-MIG-135d: the active course's pill label ("Maths (Higher) · 4MA1");
   *  absent keeps the chemistry default (the legacy entry's pilot course). */
  subjectLabel?: string | null;
  /** T-TUTOR-AIM-P2 (DC10 §7.4): the ask's confidence selection — null =
   *  nothing selected (the NO-DEFAULT law; the ask sends no field). */
  confidence?: ConfidenceValue | null;
  /** the selection toggle — a tap selects, a tap on the selected chip
   *  deselects back to null (per-ask capture, never persisted across asks) */
  onConfidenceChange?: (v: ConfidenceValue | null) => void;
}) {
  const { toast } = useToast();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  // Web Speech dictation — feature-detected, hydration-safe (server says no,
  // the client snapshot re-evaluates after mount; button hides where absent)
  const speechAvailable = useSyncExternalStore(
    () => () => {},
    () => {
      const w = window as unknown as Record<string, unknown>;
      return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    },
    () => false,
  );

  // auto-grow up to a screen-friendly ceiling
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value]);

  // stop any live dictation session when the composer unmounts
  useEffect(() => () => recRef.current?.stop(), []);

  const toggleDictation = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.interimResults = false;
    rec.continuous = true;
    const base = value ? `${value.trimEnd()} ` : "";
    rec.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0]?.transcript ?? "";
      onChange(`${base}${said.trim()}`.slice(0, maxLen));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const nearCap = value.length > maxLen - 120;

  return (
    <div className="rounded-2xl border bg-card shadow-sm transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
      {/* subject context pill — the reference's affordance, honestly scoped:
          the tutor answers inside the pilot corpus (HUB-TUTOR-CLA-LOOK) */}
      <div className="flex items-center px-3.5 pt-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-2xs font-medium">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          {subjectLabel ?? SUBJECT_LABEL}
        </span>
      </div>
      {/* T-TUTOR-AIM-P2 (DC10 §7.4): the confidence capture row — neutral
          copy, no default, per-ask. Capture-side only: nothing downstream
          ever tells the learner their confidence influenced anything. */}
      {onConfidenceChange != null && (
        <div className="flex flex-wrap items-center gap-1 px-3.5 pt-1.5">
          <span className="mr-0.5 text-2xs text-muted-foreground">How confident are you feeling?</span>
          {CONFIDENCE_OPTIONS.map((o) => {
            const selected = confidence === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onConfidenceChange(selected ? null : o.value)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-2xs transition-colors",
                  selected
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-end gap-1.5 p-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 text-muted-foreground"
          aria-label="Attach a file"
          onClick={() =>
            toast({
              title: "File upload isn’t available yet",
              description: "Paste the relevant text into your question for now.",
            })
          }
        >
          <Paperclip className="size-4" aria-hidden />
        </Button>
        <Textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              // ignore Enter mid-stream: the chat guards same-thread re-asks,
              // but a silent no-op here beats racing the composer's own state
              if (!busy) onSend();
            }
          }}
          maxLength={maxLen}
          rows={1}
          placeholder={placeholder}
          aria-label="Message the tutor"
          className="max-h-42 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
        />
        {speechAvailable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-10 shrink-0", listening ? "text-destructive" : "text-muted-foreground")}
            aria-label={listening ? "Stop dictation" : "Dictate your question"}
            aria-pressed={listening}
            onClick={toggleDictation}
          >
            {listening ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
          </Button>
        )}
        {busy ? (
          <Button variant="outline" onClick={onStop} className="h-10 shrink-0 gap-1.5 px-3">
            <Square className="size-3.5 fill-current" aria-hidden /> Stop
          </Button>
        ) : (
          <Button
            onClick={onSend}
            disabled={!value.trim()}
            aria-label="Send message"
            className="size-10 shrink-0 rounded-full"
          >
            <ArrowUp className="size-4" aria-hidden />
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between border-t px-3 py-1 text-2xs text-muted-foreground">
        {/* T-TUTOR-UX-1 (TU-15): keyboard hints are desktop noise on touch —
            they render only where a hardware keyboard plausibly exists. */}
        <span className="hidden [@media(pointer:fine)]:inline">
          <kbd className="rounded border bg-muted px-1 py-px font-mono">Enter</kbd> to send ·{" "}
          <kbd className="rounded border bg-muted px-1 py-px font-mono">Shift</kbd>+
          <kbd className="rounded border bg-muted px-1 py-px font-mono">Enter</kbd> for a new line
        </span>
        {nearCap && (
          <span className="tabular-nums" aria-live="polite">
            {value.length}/{maxLen}
          </span>
        )}
      </div>
    </div>
  );
}
