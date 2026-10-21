"use client";

/**
 * T-BOOK-004 — mcq-embed: the check-yourself player. THE BANK LAW (ADR §7):
 * the question text comes from the question bank via checkRefs — nothing is
 * authored here. Correctness is a SERVER verdict (T-BOOK-008 submit lane;
 * the wire never carries isCorrect). Keyboard paths: options are a native
 * radiogroup (arrow keys), Enter submits.
 *
 * Without checkSource (the pre-008 window, or a failed load) the block
 * renders its honest anchor card — never a fake player.
 */
import { useState } from "react";

import type { RailBlock } from "@/lib/books-rail";

import type { BlockRendererProps, RailCheckQuestion, RailCheckVerdict } from "../block-renderer";
import { WidgetCard } from "../check-shared";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";

type Props = {
  block: RailBlock;
  onJump: (p: number) => void;
  checkSource?: BlockRendererProps["checkSource"];
};

export function McqEmbedBlock({ block, onJump, checkSource }: Props) {
  const [question, setQuestion] = useState<RailCheckQuestion | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "failed">("idle");
  const [chosen, setChosen] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<RailCheckVerdict | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const page = block.pdfPageAnchor;

  if (checkSource == null) {
    // the honest card (the pack flip window before the data lane lands —
    // never a pretend player)
    return (
      <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm" data-ord={block.ord}>
        <WidgetHeader ord={block.ord} />
        <p className="font-medium leading-snug">Check yourself</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Questions for this checkpoint come from the question bank
          {page != null ? ` (around p.${page})` : ""}.
        </p>
        {page != null && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-7 gap-1 px-2 text-xs"
            onClick={() => onJump(page)}
            aria-label={`Show page ${page} in the book pane`}
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            See p.{page}
          </Button>
        )}
      </div>
    );
  }

  const load = async () => {
    setLoadState("loading");
    const q = await checkSource.load(block.checkRefs);
    if (q == null) setLoadState("failed");
    else {
      setQuestion(q);
      setLoadState("idle");
    }
  };

  const submit = async () => {
    if (question == null || chosen == null) return;
    setSubmitting(true);
    const v = await checkSource.submit(question.questionId, chosen);
    setVerdict(v);
    setSubmitting(false);
  };

  return (
    <WidgetCard ord={block.ord} typeLabel="Check yourself" prompt={question?.stem ?? null}>
      {question == null ? (
        <div>
          {loadState === "failed" ? (
            <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">
              This check could not be loaded — try again shortly.
            </p>
          ) : null}
          <Button size="sm" className="mt-1 h-7 px-3 text-xs" onClick={load} disabled={loadState === "loading"}>
            {loadState === "loading" ? "Loading…" : "Load check"}
          </Button>
        </div>
      ) : (
        <div>
          <RadioGroup
            value={chosen ?? ""}
            onValueChange={(v) => {
              setChosen(v);
              setVerdict(null);
            }}
            className="mt-1 gap-1.5"
            aria-label="Choose one answer"
          >
            {question.options.map((o) => (
              <div key={o.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                <RadioGroupItem value={o.id} id={`${block.id}-${o.id}`} disabled={verdict != null} />
                <Label
                  htmlFor={`${block.id}-${o.id}`}
                  className="flex-1 cursor-pointer text-[13px] font-normal leading-snug"
                >
                  <span className="mr-1.5 font-semibold">{o.label}</span>
                  {o.text}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {verdict == null ? (
            <Button
              size="sm"
              className="mt-2 h-7 px-3 text-xs"
              onClick={submit}
              disabled={chosen == null || submitting}
            >
              {submitting ? "Checking…" : "Submit answer"}
            </Button>
          ) : (
            <div className="mt-2 space-y-1">
              <p
                className={`text-xs font-medium ${verdict.correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}
                role="status"
                aria-live="polite"
              >
                {verdict.correct
                  ? `Correct · ${verdict.marksAwarded}/${question.marks} mark${question.marks === 1 ? "" : "s"}`
                  : `Not this one${verdict.correctOptionId ? ` — the answer is ${question.options.find((o) => o.id === verdict.correctOptionId)?.label ?? ""}` : ""}`}
              </p>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

function WidgetHeader({ ord }: { ord: number }) {
  return (
    <p className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <span>Check yourself</span>
      <span className="text-[10px] font-normal normal-case opacity-60">block {ord}</span>
    </p>
  );
}
