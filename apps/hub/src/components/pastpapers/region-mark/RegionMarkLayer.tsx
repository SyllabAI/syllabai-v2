"use client";

/**
 * RegionMarkLayer — the clickable regions surface + the crop producer's
 * trigger UI (T-MG-CROPMARK-1 run-002; plan of record
 * docs/MG-MARK-PARITY-PLAN.md §3.4 — the UI half the run-001 divergence
 * #2 named "the run-002 surface"; RegionOverlay's chrome law carried).
 *
 * MOUNTING LAW: STANDALONE alongside pdf-pane (the monolith is NOT
 * modified — the RegionOverlay/InkLayer law). Mounts in the QP ink-host
 * wrapper (view-mode QP only — the mock keeps exam conditions by layout:
 * the mock phases render their own subtrees). The layer renders NOTHING
 * until an authed learner opens a paper WITH a regions plane (?paperId=
 * deep-link → fetchPaperRegions) AND that plane is markable — the honest
 * zero-chrome default (no token, no paperId, no regions, ungrounded
 * paper → a clean paper).
 *
 * THE CROP-THEN-MARK LOOP (one click): region rect → planRegionViewRect
 * (user-rot mapped) → produceRegionCrop (page bitmap + live ink, clipped)
 * → POST /paper-marks/regions/:id/mark → 202 {markId} → pollUntilTerminal
 * → the honest panel (score + award rows + feedback; failed/timeout/lost
 * states speak their own truth). retry: 0 — a re-mark is a NEW job.
 *
 * GESTURE LAW: while the surface is ON, a region rect owns the click
 * (the marking intent); everywhere else the pane keeps its gestures. The
 * pane's own chrome wins stacking (the ink toolbar z-40 > rects z-30).
 * While OFF the layer renders only the small activation toggle — the
 * paper stays a clean paper.
 *
 * A11Y: the toggle is a labelled button; rects are buttons with honest
 * labels ("Mark region 9.b — 3 marks"); the panel is a labelled region
 * with role=status for the running phases.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, ScanSearch, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { fetchPaperRegions, type MirroredRegionsResponse } from "@/lib/regions";
import {
  fetchPaperMarksLedger,
  pollUntilTerminal,
  requestRegionMark,
  type MirroredPaperMarksLedger,
} from "@/lib/paper-marks";
import { readLiveInk } from "@/components/pastpapers/ink/live-ink";
import type { PaperAssetRegion } from "@syllabai/contracts";
import {
  planRegionViewRect,
  readViewerRotation,
  type NormRect,
  type ViewRotation,
} from "./region-crop";
import { produceRegionCrop } from "./produce-crop";
import {
  awardsTotals,
  initialRegionMarkState,
  regionMarkReducer,
  type RegionMarkEntry,
} from "./region-mark-state";
import {
  feedbackCopyModel,
  ledgerRegionScores,
  ledgerTotals,
} from "./paper-feedback";

const TOKEN_KEY = "syllabai.token";

interface HolderEntry {
  page: number;
  el: HTMLElement;
}

export interface RegionMarkLayerProps {
  /** Wrapper around the QP PdfPane — its subtree is scanned for
   * [data-page] holders (scoped, the InkLayer law). */
  hostRef: React.RefObject<HTMLElement | null>;
  /** The canonical document URL — the live-ink registry key. */
  sourceUrl: string | null;
  /** The paper-asset uuid (?paperId= deep-link) — null = zero chrome. */
  paperId: string | null;
}

const CROP_REASONS: Record<string, string> = {
  holder_missing: "That page is not on screen right now — scroll to it and mark again.",
  page_not_rendered: "That page has not finished rendering — try again in a moment.",
  degenerate_crop: "The region's grounded rect is empty on that page.",
  canvas_unavailable: "The browser refused the canvas composite.",
  export_blocked: "The browser blocked exporting the page image (cross-origin taint).",
  too_large: "The crop exceeded the 4 MB wire cap even as JPEG — mark a smaller region.",
};

export function RegionMarkLayer({ hostRef, sourceUrl, paperId }: RegionMarkLayerProps) {
  const [token, setToken] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [payload, setPayload] = useState<MirroredRegionsResponse | null>(null);
  const [holders, setHolders] = useState<HolderEntry[]>([]);
  const [marks, dispatch] = useReducer(regionMarkReducer, undefined, initialRegionMarkState);
  const [ledger, setLedger] = useState<MirroredPaperMarksLedger | null>(null);
  /** bumped after a succeeded session mark — the highlight/rollup truth
   * RE-READS the ledger (pin c: never a local counter). */
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const cancelledRef = useRef<Set<string>>(new Set());

  // The v0 pilot posture (the InkLayer token law, verbatim).
  useEffect(() => {
    try {
      setToken(window.localStorage.getItem(TOKEN_KEY));
    } catch {
      setToken(null);
    }
  }, []);

  // The regions plane (?paperId= deep-link). Honest-null on any failure —
  // the layer renders its zero-chrome state.
  useEffect(() => {
    if (!token || !paperId) {
      setPayload(null);
      return;
    }
    let alive = true;
    setPayload(null);
    void fetchPaperRegions(paperId, token).then((p) => {
      if (alive) setPayload(p);
    });
    return () => {
      alive = false;
    };
  }, [token, paperId]);

  const markableRegions = useMemo(
    () => (payload?.markable ? payload.regions.filter((r) => r.markable) : []),
    [payload],
  );

  // THE LEDGER (T-MG-FEEDBACK-1): the calling learner's award rows for
  // this paper — the highlight + paper-rollup truth of record. Honest-null
  // on any failure (no marks shown); refetched on ledgerVersion bumps
  // (after each succeeded session mark — Σ from the ledger, never a local
  // counter). no-store (the paper-marks client law). Deferred one
  // microtask (the MockResultsStrip hydration-safe pattern).
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      if (!token || !paperId) {
        setLedger(null);
        return;
      }
      void fetchPaperMarksLedger(paperId, token).then((r) => {
        if (alive) setLedger(r.outcome === "ledger" ? r.ledger : null);
      });
    });
    return () => {
      alive = false;
    };
  }, [token, paperId, ledgerVersion]);

  /** regionKey → the served award slice (the highlight join). */
  const ledgerScores = useMemo(() => (ledger ? ledgerRegionScores(ledger) : null), [ledger]);
  const paperTotals = useMemo(() => (ledger && ledger.regions.length > 0 ? ledgerTotals(ledger) : null), [ledger]);

  // Holder presence tracking (structure-only observer; the InkLayer law).
  // T-MG-FEEDBACK-1: holders are also wanted when the interactive surface
  // is OFF but the ledger carries marks (the highlight-only overlay).
  const wantsHolders = enabled || (ledgerScores !== null && ledgerScores.size > 0);
  useEffect(() => {
    if (!wantsHolders || !hostRef.current) return;
    const host = hostRef.current;
    const rescan = () => {
      const found: HolderEntry[] = [];
      for (const el of host.querySelectorAll<HTMLElement>("[data-page]")) {
        const page = Number.parseInt(el.dataset.page ?? "", 10);
        if (Number.isInteger(page) && page >= 1 && el.isConnected) found.push({ page, el });
      }
      found.sort((a, b) => a.page - b.page);
      setHolders((prev) =>
        prev.length === found.length && prev.every((h, i) => h.el === found[i].el && h.page === found[i].page)
          ? prev
          : found,
      );
    };
    rescan();
    const obs = new MutationObserver(rescan);
    obs.observe(host, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [wantsHolders, hostRef]);

  useEffect(() => () => {
    cancelledRef.current = new Set();
  }, []);

  const markRegion = async (region: PaperAssetRegion, page: number) => {
    if (!sourceUrl) return;
    const label = `${region.regionKey} · ${region.marks} mark${region.marks === 1 ? "" : "s"}`;
    cancelledRef.current.delete(region.id);
    dispatch({ type: "start", regionId: region.id, label });

    const rot: ViewRotation = readViewerRotation();
    const viewRect: NormRect | null = planRegionViewRect(region.rects, page, rot);
    if (!viewRect) {
      dispatch({ type: "failed", regionId: region.id, detail: "The region has no grounded rect on that page." });
      return;
    }
    const host = hostRef.current;
    if (!host) {
      dispatch({ type: "failed", regionId: region.id, detail: CROP_REASONS.holder_missing });
      return;
    }
    // T-MG-INK-4 run-003: the producer is async now (the mtext
    // foreignObject raster may await its font css + decode) — the same
    // start-state UI covers the await; failures land in the same arm.
    const crop = await produceRegionCrop({ host, page, viewRect, shapes: readLiveInk(sourceUrl) });
    if (!crop.ok) {
      dispatch({ type: "failed", regionId: region.id, detail: CROP_REASONS[crop.reason] ?? crop.reason });
      return;
    }
    dispatch({ type: "cropped", regionId: region.id });

    const accepted = await requestRegionMark(region.id, crop.dataUrl, token);
    if (accepted.outcome !== "accepted") {
      const detail =
        accepted.outcome === "rejected"
          ? accepted.message
          : accepted.outcome === "no_token"
            ? "Sign in to mark regions."
            : "The marking service could not be reached — try again.";
      dispatch({ type: "failed", regionId: region.id, detail });
      return;
    }
    dispatch({ type: "accepted", regionId: region.id, markId: accepted.markId });

    const isCancelled = () => cancelledRef.current.has(region.id);
    const loop = await pollUntilTerminal({ markId: accepted.markId, token, isCancelled });
    if (loop.status === "cancelled") return;
    if (loop.status === "succeeded") {
      dispatch({ type: "succeeded", regionId: region.id, snapshot: loop.snapshot });
      setLedgerVersion((v) => v + 1); // the highlights/rollup re-read the LEDGER
      return;
    }
    if (loop.status === "failed") {
      const snap = loop.snapshot;
      dispatch({
        type: "failed",
        regionId: region.id,
        detail:
          snap?.status === "failed" && snap.error
            ? `${snap.error.message} (${snap.error.code})`
            : "The marking service could not be reached — try again.",
      });
      return;
    }
    if (loop.status === "lost") {
      dispatch({
        type: "failed",
        regionId: region.id,
        detail: "The marking service no longer knows this job (it may have restarted) — mark the region again.",
      });
      return;
    }
    dispatch({
      type: "timeout",
      regionId: region.id,
      markId: accepted.markId,
      detail: "Still marking after the poll window — check again in a moment.",
    });
  };

  const resumePoll = async (regionId: string, markId: string) => {
    cancelledRef.current.delete(regionId);
    dispatch({ type: "progress", regionId, status: "running" });
    const isCancelled = () => cancelledRef.current.has(regionId);
    const loop = await pollUntilTerminal({ markId, token, isCancelled });
    if (loop.status === "cancelled") return;
    if (loop.status === "succeeded") {
      dispatch({ type: "succeeded", regionId, snapshot: loop.snapshot });
      setLedgerVersion((v) => v + 1);
      return;
    }
    if (loop.status === "timeout") {
      dispatch({
        type: "timeout",
        regionId,
        markId,
        detail: "Still marking after the poll window — check again in a moment.",
      });
      return;
    }
    dispatch({
      type: "failed",
      regionId,
      detail:
        loop.status === "lost"
          ? "The marking service no longer knows this job (it may have restarted) — mark the region again."
          : "The marking service could not be reached — try again.",
    });
  };

  // Zero-chrome gates (the honest defaults): anonymous, no deep-link
  // paperId, no sourceUrl, no regions plane, or an unmarkable paper.
  // T-MG-FEEDBACK-1: a ledger with marks does NOT force the surface on —
  // highlights render inside the same gate (a paper without a regions
  // plane has no rects to anchor them, and stays a clean paper).
  if (!token || !paperId || !sourceUrl || !payload || markableRegions.length === 0) return null;

  const active: RegionMarkEntry | null = marks.activeId ? marks.entries[marks.activeId] ?? null : null;
  const activeId = marks.activeId;

  return (
    <>
      <div className="absolute bottom-3 left-2 z-40 flex items-center gap-2">
        <Button
          size="sm"
          variant={enabled ? "secondary" : "outline"}
          className={cn("h-8 gap-1.5 bg-background/95 text-xs shadow-md backdrop-blur")}
          aria-pressed={enabled}
          aria-label="Mark regions with AI (crop-then-mark)"
          onClick={() => setEnabled((v) => !v)}
        >
          <ScanSearch className="size-3.5" aria-hidden /> Mark regions
        </Button>
        {/* the paper-level rollup (pin c): Σ score / Σ maxScore FROM THE
            LEDGER — the same truth the highlights draw, re-read after every
            succeeded mark. Hidden while zero marks exist. */}
        {paperTotals && (
          <span
            className="rounded-full border bg-background/95 px-2 py-0.5 text-[11px] font-medium tabular-nums text-emerald-700 shadow-sm backdrop-blur"
            title="Your AI-marked total for this paper (from the award ledger)"
          >
            Marked {paperTotals.score}/{paperTotals.max}
          </span>
        )}
      </div>

      {/* one rect portal per mounted page holder: interactive buttons while
          the surface is ON; ledger highlights (pointer-events-none) always
          when the surface is OFF but marks exist */}
      {holders.map(({ page, el }) => {
        const rects = markableRegions.flatMap((r) =>
          r.rects
            .filter((rect) => rect.page === page)
            .map((rect) => ({ region: r, rect })),
        );
        const marks_ = ledgerScores
          ? [...ledgerScores.entries()]
              .map(([regionKey, total]) => ({ regionKey, total }))
              .filter(({ regionKey }) => rects.some(({ region }) => region.regionKey === regionKey))
          : [];
        // surface OFF + no marks on this page → nothing (the clean paper);
        // surface ON → the interactive buttons render regardless.
        if (!enabled && marks_.length === 0) return null;
        return createPortal(
          <div className="pointer-events-none absolute inset-0 z-30" aria-hidden="false">
            {/* the interactive buttons (surface ON only — the gesture law) */}
            {enabled &&
              rects.map(({ region, rect }) => {
                const entry = marks.entries[region.id];
                const busy =
                  entry?.phase === "cropping" || entry?.phase === "queued" || entry?.phase === "running";
                const awarded = ledgerScores?.get(region.regionKey) ?? null;
                return (
                  <button
                    key={`${region.id}:${rect.ordinal}`}
                    type="button"
                    className={cn(
                      "pointer-events-auto absolute rounded-sm border-2 border-dashed border-emerald-600/80 bg-emerald-400/5 transition-colors",
                      "hover:bg-emerald-400/20 hover:border-emerald-600 focus-visible:bg-emerald-400/20 focus-visible:outline-2 focus-visible:outline-emerald-700",
                      (busy || awarded) && "border-solid border-emerald-600 bg-emerald-400/20",
                    )}
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.width * 100}%`,
                      height: `${rect.height * 100}%`,
                    }}
                    aria-label={
                      awarded
                        ? `Region ${region.regionKey} — marked ${awarded.score}/${awarded.max} (mark again with AI)`
                        : `Mark region ${region.regionKey} — ${region.marks} mark${region.marks === 1 ? "" : "s"} with AI`
                    }
                    onClick={() => void markRegion(region, page)}
                  >
                    {awarded && (
                      <span className="absolute -top-2.5 right-1 rounded-full bg-emerald-600 px-1.5 py-px text-[10px] font-semibold leading-tight text-white shadow">
                        {awarded.score}/{awarded.max}
                      </span>
                    )}
                  </button>
                );
              })}
            {/* the LEDGER highlights (always — with the surface OFF they
                are the whole overlay, pointer-events-none: the paper keeps
                its gestures) */}
            {marks_.map(({ regionKey, total }) => {
              const hits = rects.filter(({ region }) => region.regionKey === regionKey);
              if (hits.length === 0) return null;
              return (
                <div key={`hl-${regionKey}`}>
                  {hits.map(({ region, rect }) =>
                    enabled ? null : ( // the ON-state button already carries the chip
                      <div
                        key={`${region.id}:${rect.ordinal}`}
                        className="absolute rounded-sm border-2 border-solid border-emerald-600/70 bg-emerald-400/5"
                        style={{
                          left: `${rect.x * 100}%`,
                          top: `${rect.y * 100}%`,
                          width: `${rect.width * 100}%`,
                          height: `${rect.height * 100}%`,
                        }}
                      >
                        <span className="absolute -top-2.5 right-1 rounded-full bg-emerald-600 px-1.5 py-px text-[10px] font-semibold leading-tight text-white shadow">
                          {total.score}/{total.max}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              );
            })}
          </div>,
          el,
        );
      })}

      {/* the honest result panel — the most recent mark */}
      {active && (
        <div
          className="absolute bottom-14 left-2 z-40 max-h-[70%] w-80 max-w-[calc(100%-1rem)] overflow-y-auto rounded-lg border bg-background/95 p-3 text-sm shadow-md backdrop-blur"
          role={active.phase === "cropping" || active.phase === "queued" || active.phase === "running" ? "status" : "region"}
          aria-label={`AI marking result — ${active.label}`}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-medium">AI mark — {active.label}</span>
            <Button
              size="sm"
              variant="ghost"
              className="size-6 px-0"
              aria-label="Close marking panel"
              onClick={() => {
                if (activeId) {
                  cancelledRef.current.add(activeId);
                  dispatch({ type: "dismiss", regionId: activeId });
                }
              }}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
          <PanelBody
            entry={active}
            onCheckAgain={() => {
              if (active?.markId && activeId) void resumePoll(activeId, active.markId);
            }}
            onDismiss={() => {
              if (activeId) {
                cancelledRef.current.add(activeId);
                dispatch({ type: "dismiss", regionId: activeId });
              }
            }}
          />
        </div>
      )}
    </>
  );
}

function PanelBody({
  entry,
  onCheckAgain,
  onDismiss,
}: {
  entry: RegionMarkEntry;
  onCheckAgain: () => void;
  onDismiss: () => void;
}) {
  if (entry.phase === "cropping") {
    return (
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Compositing the region crop…
      </p>
    );
  }
  if (entry.phase === "queued" || entry.phase === "running") {
    return (
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
        {entry.phase === "queued" ? "Mark queued…" : "Marking…"}
      </p>
    );
  }
  if (entry.phase === "timeout") {
    return (
      <div className="space-y-2">
        <p className="text-amber-600">{entry.detail}</p>
        <Button size="sm" variant="outline" onClick={onCheckAgain}>
          Check again
        </Button>
      </div>
    );
  }
  if (entry.phase === "failed") {
    return (
      <div className="space-y-2">
        <p className="text-destructive">{entry.detail}</p>
        <Button size="sm" variant="outline" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    );
  }
  const snap = entry.snapshot;
  if (!snap) return <p className="text-muted-foreground">No result.</p>;
  if (snap.status === "failed") {
    return (
      <div className="space-y-2">
        <p className="text-destructive">
          {snap.error ? `${snap.error.message} (${snap.error.code})` : "The mark failed honestly — nothing was written."}
        </p>
        <Button size="sm" variant="outline" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    );
  }
  const totals = awardsTotals(snap);
  // T-MG-FEEDBACK-1 (pin b): the FIVE feedbackObject fields via the copy
  // model of record — chatMessage as markdown, both point lists, the
  // transcription-first reasoning, and the FAILURE-ONLY strategies law.
  const copy = snap.feedback ? feedbackCopyModel(snap.feedback, totals.score, totals.max) : null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 font-medium text-emerald-700">
        <Check className="size-4" aria-hidden /> {totals.score} / {totals.max} marks
      </p>
      {snap.awards && snap.awards.length > 0 && (
        <ul className="space-y-0.5 text-[13px]">
          {snap.awards.map((a) => (
            <li key={`${a.ordinal}-${a.code}`} className="flex items-baseline justify-between gap-2">
              <span>
                <span aria-hidden>{a.awarded ? "✓" : "✗"}</span> {a.code}
              </span>
              <span className={a.awarded ? "text-emerald-700" : "text-muted-foreground"}>
                {a.score}/{a.maxScore}
              </span>
            </li>
          ))}
        </ul>
      )}
      {copy && copy.chatMessage.length > 0 && <Markdown className="text-[13px]">{copy.chatMessage}</Markdown>}
      {copy && copy.scored.length > 0 && (
        <div className="text-[13px]">
          <p className="font-medium">Scored</p>
          <ul className="list-disc pl-4">
            {copy.scored.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {copy && copy.notScored.length > 0 && (
        <div className="text-[13px]">
          <p className="font-medium">Not scored</p>
          <ul className="list-disc pl-4">
            {copy.notScored.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {copy && copy.strategies && (
        <div className="text-[13px]">
          <p className="font-medium">How to improve</p>
          <ul className="list-disc pl-4">
            {copy.strategies.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {snap.transcription && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted-foreground">Your working (transcribed)</summary>
          <p className="mt-1 whitespace-pre-wrap">{snap.transcription}</p>
        </details>
      )}
      {copy && copy.transcription && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted-foreground">Marker reasoning (transcription-first)</summary>
          <p className="mt-1 whitespace-pre-wrap">{copy.transcription}</p>
        </details>
      )}
      {snap.receipt && (
        <p className="text-[11px] text-muted-foreground">
          Ledger: {snap.receipt.emitted} written{snap.receipt.suppressed > 0 ? `, ${snap.receipt.suppressed} duplicate write(s) absorbed` : ""}.
        </p>
      )}
      <Button size="sm" variant="outline" onClick={onDismiss}>
        Close
      </Button>
    </div>
  );
}
