"use client";

/**
 * PaperMarksRollup — the paper-level rollup on the archive paper card
 * (T-MG-FEEDBACK-1 run-001; plan of record docs/MG-MARK-PARITY-PLAN.md
 * §3.6, the rollup pin: the card shows Σ score / Σ maxScore FROM THE
 * LEDGER, never a local counter — lib/mock-results.ts's manual tally stays
 * the separate "Log your mark" surface it always was, untouched).
 *
 * THE IDENTITY CHAIN (one badge, two cached reads): the corpus card knows
 * (paperCode = ref "unit/variant", sessionLabel = sessionLabel(sessionId)
 * — the pastpapers-shared law); GET /api/v1/paper-assets/resolve maps the
 * pair to the exam_papers uuid (the seed's uq_exam_paper_identity law);
 * GET /api/v1/paper-marks serves the calling learner's award ledger for
 * that uuid (the Phase-2 contract). HONEST-ABSENT LAW: anonymous, a
 * not-ingested paper (404), a paper with zero award rows, any fetch
 * failure — the badge renders NOTHING. Most corpus papers are not ingested
 * as exam_papers rows yet: the empty card is the honest steady state, and
 * a 0/0 is never fabricated for one. Both fetchers memoize per session
 * (lib/regions.ts resolvePaperAssetCached + a module ledger memo) so the
 * list's one-badge-per-row economy costs each paper at most one resolve
 * (+ one ledger read when ingested).
 *
 * Posture: the v0 pilot token law (localStorage["syllabai.token"],
 * caller-supplied Bearer); no-store on both reads; no learnerId on any
 * wire shape (the Phase-2 posture law).
 */
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  fetchPaperMarksLedger,
  type MirroredPaperMarksLedger,
} from "@/lib/paper-marks";
import { resolvePaperAssetCached } from "@/lib/regions";

const TOKEN_KEY = "syllabai.token";

/** per-session ledger memo keyed by the resolved paper uuid (the strict
 * no-store law is about HTTP caching; this memo only dedupes concurrent
 * mounts of the SAME card — the badge never survives a reload). */
const ledgerMemo = new Map<string, Promise<MirroredPaperMarksLedger | null>>();

function ledgerFor(paperId: string, token: string | null): Promise<MirroredPaperMarksLedger | null> {
  let p = ledgerMemo.get(paperId);
  if (!p) {
    p = fetchPaperMarksLedger(paperId, token).then((r) => (r.outcome === "ledger" ? r.ledger : null));
    ledgerMemo.set(paperId, p);
  }
  return p;
}

export function PaperMarksRollup({ paperCode, sessionLabel }: { paperCode: string; sessionLabel: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [totals, setTotals] = useState<{ score: number; max: number } | null>(null);

  // the v0 pilot posture (the InkLayer token law, verbatim) — deferred one
  // microtask: hydration-safe localStorage read
  // (react-hooks/set-state-in-effect; the MockResultsStrip pattern).
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      try {
        setToken(window.localStorage.getItem(TOKEN_KEY));
      } catch {
        setToken(null);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // no token → totals stays null (the honest-absent render gate below)
    if (!token) return;
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      try {
        const resolved = await resolvePaperAssetCached(paperCode, sessionLabel, token);
        const ledger = resolved ? await ledgerFor(resolved.paperId, token) : null;
        if (!alive || !ledger || ledger.regions.length === 0) return;
        let score = 0;
        let max = 0;
        for (const r of ledger.regions) {
          score += r.score;
          max += r.maxScore;
        }
        setTotals({ score, max });
      } catch {
        // the honest-absent law: a failed chain renders nothing
      }
    });
    return () => {
      alive = false;
    };
  }, [token, paperCode, sessionLabel]);

  // the honest-absent default: nothing (no token, not ingested, unmarked,
  // failed) — never a fabricated 0/0.
  if (!token || !totals) return null;
  return (
    <Badge variant="outline" className="border-emerald-600/50 text-[10px] tabular-nums text-emerald-700">
      AI-marked {totals.score}/{totals.max}
    </Badge>
  );
}
