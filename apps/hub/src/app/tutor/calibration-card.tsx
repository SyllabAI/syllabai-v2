"use client";

/**
 * T-TUTOR-AIM-P3 (DC10 §7.9): the calibration read-out — the learner-visible
 * "when you say you're sure, you're right X% of the time" surface, over the
 * P2 confidence log + the P3 served-evidence ledger.
 *
 * THE §7.4 GATES RENDER HONESTLY (the surface never claims what the data
 * cannot back):
 *   - gathering — under the ~15-response normalisation floor (rule 1):
 *     the card says the baseline is still forming. No numbers are implied.
 *   - no_signal — the sure-vs-guessing gap under the ~10-point noise floor
 *     (rule 5): the card says the log stays log-only for now. It does NOT
 *     render a calibration claim.
 *   - ok — the read-out: per-band correctness shares, in the plan's own
 *     words ("when you say you're sure, you're right 85% of the time").
 * Per-learner ONLY (rule 1: the learner's OWN baseline, never population
 * stats). The read-out is deterministic arithmetic — no AI class, no
 * AI_SUGGESTED disclosure burden. Zero free text travels (bands + numbers).
 */
import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CalibrationBand {
  confidence: "sure" | "think_so" | "guessing";
  asks: number;
  parts: number;
  accuracy: number | null;
}

interface CalibrationReadout {
  status: "gathering" | "no_signal" | "ok";
  bands: CalibrationBand[];
  asksCovered: number;
  asksLogged: number;
  outcomeWindowDays: number;
  generatedAt: string;
}

/** The plan's own phrasing, per band ("when you say you're sure…"). */
const BAND_PHRASE: Record<CalibrationBand["confidence"], string> = {
  sure: "when you say you're sure",
  think_so: "when you say you think so",
  guessing: "when you say you're guessing",
};

const BAND_LABEL: Record<CalibrationBand["confidence"], string> = {
  sure: "Sure",
  think_so: "Think so",
  guessing: "Guessing",
};

function pct(accuracy: number): string {
  return `${Math.round(accuracy * 100)}%`;
}

export function CalibrationCard() {
  const [readout, setReadout] = useState<CalibrationReadout | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/tutor/calibration")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: CalibrationReadout) => {
        if (alive) setReadout(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return null; // the honest degrade: the surface never renders a fake
  if (readout == null) return null; // silent while loading — no layout bet

  const dataBands = readout.bands.filter((b) => b.parts > 0 && b.accuracy != null);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-primary" aria-hidden />
          Your confidence calibration
        </CardTitle>
        <CardDescription className="text-xs">
          How your own confidence tags line up with how your practice actually went.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {readout.status === "gathering" && (
          <p className="text-muted-foreground">
            Still forming your baseline — answer with the confidence buttons and practise what you
            review; your calibration read-out appears once there is enough of your own data
            (about {15} tagged answers with practice behind them).
          </p>
        )}
        {readout.status === "no_signal" && (
          <p className="text-muted-foreground">
            So far your confidence tags don&apos;t separate right from wrong beyond noise — the
            honest read is that they&apos;re not a signal yet. Keep tagging; this stays a log
            until it isn&apos;t.
          </p>
        )}
        {readout.status === "ok" && dataBands.length > 0 && (
          <ul className="space-y-1.5">
            {dataBands.map((b) => (
              <li key={b.confidence} className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">
                  {BAND_PHRASE[b.confidence]}, your practice went right{" "}
                  <span className="font-medium text-foreground">{pct(b.accuracy!)}</span> of the
                  time.
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {b.parts} part{b.parts === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {readout.status === "ok" && dataBands.length === 0 && (
          <p className="text-muted-foreground">
            Not enough tagged practice behind these answers yet — the read-out fills as you
            practise what you review.
          </p>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          {readout.asksCovered} tagged answer{readout.asksCovered === 1 ? "" : "s"} with practice
          behind them · practice within {readout.outcomeWindowDays} days of each answer · your own
          data only, never other learners&apos;.
        </p>
      </CardContent>
    </Card>
  );
}
