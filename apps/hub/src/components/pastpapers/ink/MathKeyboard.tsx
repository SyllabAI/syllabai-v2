"use client";

/**
 * MathKeyboard — T-MG-INK-9. The maths keyboard for the math text box
 * editor: our rebuild of MG's equation keyboard (MathsGenie ships
 * MathLive's virtual keyboard; the MG-INK-SDK-GATE bundle/licence
 * discipline stands, so this is OUR panel fed by the EXTRACTED census
 * in ./math-keyboard — same four layers, same tab glyphs, same keys,
 * same insertions, pinned by math-keyboard.test.ts).
 *
 * FOCUS LAW: every key stops the pointerdown (preventDefault) so the
 * math draft's textarea NEVER blurs — the draft's onBlur is the commit
 * path, and a keyboard tap must not commit what the learner is typing.
 * Backspace and Commit act through the same insertion math (pure, in
 * ./math-keyboard) on the draft's real selection.
 */
import { useState } from "react";

import { cn } from "@/lib/utils";

import { MG_KB_LAYERS, keyInsertion, type MgKeyboardKey } from "./math-keyboard";

export interface MathKeyboardProps {
  /** Insert a key's text at the draft caret (caret per the insert law). */
  onInsert: (ins: { text: string; caret: number | null }) => void;
  /** Backspace at the draft caret / over the draft selection. */
  onBackspace: () => void;
  /** The keyboard's commit key (MG's svg-commit): commits the draft. */
  onCommit: () => void;
  onClose: () => void;
}

/** The keyboard panel — pane-wide, anchored to the bottom (MG's
 * virtual keyboard posture). The parent hosts it via a portal; the
 * host carries pointer-events:none, this panel re-enables itself. */
export function MathKeyboard({ onInsert, onBackspace, onCommit, onClose }: MathKeyboardProps) {
  const [layerIdx, setLayerIdx] = useState(0);
  const [shifted, setShifted] = useState(false);
  const layer = MG_KB_LAYERS[layerIdx] ?? MG_KB_LAYERS[0]!;

  // The keyboard's keys keep the draft focused: swallowing the opening
  // press prevents the browser's focus transfer entirely.
  const swallow = (e: React.PointerEvent) => e.preventDefault();

  const press = (key: MgKeyboardKey) => {
    onInsert(keyInsertion(key, shifted));
    // MG's keyboard: a shift tap applies to ONE key, then clears.
    if (shifted) setShifted(false);
  };

  return (
    <div
      role="group"
      aria-label="Math keyboard"
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-50 border-t bg-background/95 p-2 pb-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur"
      onPointerDown={swallow}
    >
      <div className="mb-1.5 flex items-center gap-1">
        {MG_KB_LAYERS.map((l, i) => (
          <button
            key={l.id}
            type="button"
            aria-label={l.name}
            aria-pressed={i === layerIdx}
            onClick={() => setLayerIdx(i)}
            className={cn(
              "flex h-7 items-center rounded-md px-2 text-xs font-medium",
              i === layerIdx ? "bg-secondary" : "hover:bg-secondary/60",
            )}
          >
            {l.tab}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Shift"
            aria-pressed={shifted}
            onClick={() => setShifted((s) => !s)}
            className={cn(
              "flex h-7 items-center rounded-md px-2 text-xs font-medium",
              shifted ? "bg-secondary" : "hover:bg-secondary/60",
            )}
          >
            ⇧
          </button>
          <button
            type="button"
            aria-label="Backspace"
            onClick={onBackspace}
            className="flex h-7 items-center rounded-md px-2 text-xs hover:bg-secondary/60"
          >
            ⌫
          </button>
          <button
            type="button"
            aria-label="Commit"
            onClick={onCommit}
            className="flex h-7 items-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground"
          >
            ⏎
          </button>
          <button
            type="button"
            aria-label="Close math keyboard"
            onClick={onClose}
            className="flex h-7 items-center rounded-md px-2 text-xs hover:bg-secondary/60"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        {layer.rows.map((row, ri) => (
          <div key={ri} className="flex w-full justify-center gap-1">
            {row.map((key, ki) => {
              const shiftedKey = shifted && key.shift;
              return (
                <button
                  key={ki}
                  type="button"
                  aria-label={key.aria ?? key.label}
                  onClick={() => press(key)}
                  className="flex h-9 min-w-9 items-center justify-center rounded-md border bg-background px-1.5 text-sm hover:bg-secondary/60"
                >
                  {shiftedKey ? shiftedKey.label : key.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
