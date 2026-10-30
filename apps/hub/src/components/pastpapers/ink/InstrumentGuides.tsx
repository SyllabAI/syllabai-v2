"use client";

/**
 * Instrument guide chrome — T-MG-INK-2 run-001. The ruler and protractor
 * are SESSION-LOCAL overlays (the tool-versus-artifact split: the guides
 * are never persisted — a reload drops them and replays the ink). They
 * render as direct children of the page holder (the same positioning
 * context the ink canvas portals into), positioned in FRACTIONS so they
 * track zoom/reflow for free — the run-003 RegionOverlay law at guide
 * grain. All pointer math delegates to the pure ./instruments module; the
 * holder box comes from parentElement (a rotated guide's own rect is an
 * AABB — the page box is the only honest box).
 *
 * A11Y: the guides are aria-hidden chrome (the toolbar is the accessible
 * surface — the run-003 posture); the compasses preview paints through
 * the ordinary active-stroke path, so it has no DOM at all.
 */
import type * as React from "react";

import { X } from "lucide-react";

import type { ProtractorGuide, RulerGuide } from "./instruments";

/** The page-box readoff for a guide event: climb to the pane's page
 * holder (the guide chrome nests inside it; a rotated guide's own rect
 * is an AABB — the holder is the only honest box). */
function holderRead(e: React.PointerEvent): {
  frac: { x: number; y: number };
  box: { cssW: number; cssH: number };
} {
  const holder = (e.currentTarget as HTMLElement).closest("[data-page]") as HTMLElement | null;
  const rect = (holder ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
  return {
    frac: {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    },
    box: { cssW: rect.width, cssH: rect.height },
  };
}

export interface GuideViewProps {
  /** Manipulation is live whenever the guide exists (drag/rotate/× work
   * in ANY mode — the tldraw posture); snap-DRAW applies only in the
   * guide's own mode (the canvas routes that). */
  interactive: boolean;
  onDragStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDragMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onRemove: () => void;
}

/** A zero-height rotated arm of the given fraction length anchored at the
 * pivot: children at its right edge ride the +θ direction (CSS carries
 * the aspect law — no px math in the view). */
function Arm({
  guide,
  lengthFrac,
  children,
}: {
  guide: { x: number; y: number; angleDeg: number };
  lengthFrac: number;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      className="absolute h-0"
      style={{
        left: `${guide.x * 100}%`,
        top: `${guide.y * 100}%`,
        width: `${lengthFrac * 100}%`,
        transform: `translateY(-50%) rotate(${guide.angleDeg}deg)`,
      }}
    >
      {children}
    </div>
  );
}

/** The ruler: a ticked straight-edge bar; the rotate grip rides the +θ
 * edge end. transform-origin = the bar's center (the guide's x/y). */
export function RulerGuideView({
  guide,
  interactive,
  onDragStart,
  onDragMove,
  onRotateMove,
  onRemove,
}: GuideViewProps & { guide: RulerGuide; onRotateMove: (e: React.PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div aria-hidden className="absolute inset-0 z-30 select-none">
      <div
        data-ink-guide="ruler"
        onPointerDown={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          onDragStart(e);
        }}
        onPointerMove={(e) => {
          if (!interactive) return;
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          e.stopPropagation();
          onDragMove(e);
        }}
        className="absolute cursor-grab rounded-sm border border-[rgba(15,108,189,0.45)] bg-[rgba(15,108,189,0.10)] shadow-sm backdrop-blur-[1px]"
        style={{
          left: `${guide.x * 100}%`,
          top: `${guide.y * 100}%`,
          width: `${guide.lengthFrac * 100}%`,
          height: 14,
          transform: `translate(-50%, -50%) rotate(${guide.angleDeg}deg)`,
          transformOrigin: "50% 50%",
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(15,108,189,0.35) 0 1px, transparent 1px 10%)",
          touchAction: "none",
        }}
      />
      <Arm guide={guide} lengthFrac={guide.lengthFrac / 2}>
        <div
          aria-hidden
          data-ink-guide="ruler-handle"
          onPointerDown={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!interactive) return;
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            e.stopPropagation();
            onRotateMove(e);
          }}
          className="absolute right-0 top-1/2 size-3.5 -translate-y-1/2 translate-x-1/2 cursor-grab rounded-full border border-[rgba(15,108,189,0.6)] bg-background shadow"
          style={{ touchAction: "none" }}
        />
      </Arm>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute flex size-4 items-center justify-center rounded-full border bg-background/95 text-muted-foreground shadow"
        style={{
          left: `${guide.x * 100}%`,
          top: `${guide.y * 100}%`,
          transform: `translate(-50%, -50%) translateY(-16px)`,
        }}
      >
        <X className="size-2.5" />
      </button>
    </div>
  );
}

/** The protractor: a half-disc (base along angleDeg, dome bulging to the
 * rim side); the rotate grip rides the base's +θ end; the pivot dot marks
 * the center. The swept-angle readout during a rim draw lives in the
 * canvas (role=status there — this component is aria-hidden). */
export function ProtractorGuideView({
  guide,
  interactive,
  onDragStart,
  onDragMove,
  onRotateMove,
  onRemove,
}: GuideViewProps & { guide: ProtractorGuide; onRotateMove: (e: React.PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div aria-hidden className="absolute inset-0 z-30 select-none">
      <div
        data-ink-guide="protractor"
        onPointerDown={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          onDragStart(e);
        }}
        onPointerMove={(e) => {
          if (!interactive) return;
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          e.stopPropagation();
          onDragMove(e);
        }}
        className="absolute cursor-grab rounded-t-full border border-[rgba(16,124,16,0.45)] bg-[rgba(16,124,16,0.08)] shadow-sm backdrop-blur-[1px]"
        style={{
          left: `${guide.x * 100}%`,
          top: `${guide.y * 100}%`,
          width: `${guide.radiusFrac * 200}%`,
          aspectRatio: "2 / 1",
          transform: `translate(-50%, -100%) rotate(${guide.angleDeg}deg)`,
          transformOrigin: "50% 100%",
          touchAction: "none",
        }}
      >
        {/* the base line (the diameter) */}
        <div className="absolute left-[4%] right-[4%] top-full h-px -translate-y-1/2 bg-[rgba(16,124,16,0.4)]" />
      </div>
      <Arm guide={guide} lengthFrac={guide.radiusFrac}>
        <div
          aria-hidden
          data-ink-guide="protractor-handle"
          onPointerDown={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!interactive) return;
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            e.stopPropagation();
            onRotateMove(e);
          }}
          className="absolute right-0 top-1/2 size-3.5 -translate-y-1/2 translate-x-1/2 cursor-grab rounded-full border border-[rgba(16,124,16,0.6)] bg-background shadow"
          style={{ touchAction: "none" }}
        />
      </Arm>
      {/* pivot dot */}
      <div
        aria-hidden
        className="pointer-events-none absolute size-1.5 rounded-full bg-[rgba(16,124,16,0.6)]"
        style={{ left: `${guide.x * 100}%`, top: `${guide.y * 100}%`, transform: "translate(-50%, -50%)" }}
      />
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute flex size-4 items-center justify-center rounded-full border bg-background/95 text-muted-foreground shadow"
        style={{
          left: `${guide.x * 100}%`,
          top: `${guide.y * 100}%`,
          transform: "translate(-50%, -50%) translateY(16px)",
        }}
      >
        <X className="size-2.5" />
      </button>
    </div>
  );
}

export { holderRead };
