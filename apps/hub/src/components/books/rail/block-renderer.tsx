"use client";

/**
 * T-BOOK-004/005/006 — the block renderer: the BookBlock type switch of
 * record for the rail. One component per frozen type (PACK-SPEC §4); the
 * dispatcher stays dumb — payloads were already law-checked by contracts
 * (book.block/1) at the api boundary and envelope-mirrored at lib/books-rail.
 *
 * Widget payload OPTIONAL fields (all passthrough-legal, authored in the
 * packs of record, read defensively here — a missing optional never throws):
 *   prose:        { text }                              (law: text)
 *   callout:      { body, label? }                      (law: body)
 *   figure:       { page, caption? }                    (law: page)
 *   mcq-embed:    {} — the question comes from the BANK via checkRefs
 *                 (T-BOOK-008 data lane; this player renders when loaded)
 *   sort-match:   { items[{id,text}], targets?[{id,text}],
 *                 correctOrder? string[] (order mode) |
 *                 solution? Record<itemId,targetId> (match mode) }
 *   drag-label:   { labels[], slots[{id,answer,alt?}], prompt? }
 *   table-fill:   { columns[], rows[{label?, cells[{accepts[], hint?}]}], prompt? }
 *   num-stepper:  { steps[{prompt, answer, unit?, tolerance?, sigFigs?, hint?}] }
 *   eq-builder:   { target, tokens[], prompt? }  (law: target — tokens are
 *                 the bank the learner assembles from)
 *   sim-embed:    { provider, simId, title, attribution, fallbackUrl } (law)
 *   media-embed:  { title, url, licenseRef } (law)
 */
import type { ReactNode } from "react";

import type { RailBlock } from "@/lib/books-rail";

import { ProseBlock } from "./widgets/prose-block";
import { CalloutBlock } from "./widgets/callout-block";
import { FigureBlock } from "./widgets/figure-block";
import { McqEmbedBlock } from "./widgets/mcq-embed-block";
import { SortMatchBlock } from "./widgets/sort-match-block";
import { DragLabelBlock } from "./widgets/drag-label-block";
import { TableFillBlock } from "./widgets/table-fill-block";
import { NumStepperBlock } from "./widgets/num-stepper-block";
import { EqBuilderBlock } from "./widgets/eq-builder-block";
import { SimEmbedBlock } from "./widgets/sim-embed-block";
import { MediaEmbedBlock } from "./widgets/media-embed-block";

/** The check-question serving shape the T-BOOK-008 lane feeds into
 *  mcq-embed players (NO correctness on the wire — server-verdict law). */
export interface RailCheckQuestion {
  questionId: string;
  stem: string;
  marks: number;
  commandWord?: string | null;
  options: Array<{ id: string; label: string; text: string }>;
}

export interface RailCheckVerdict {
  correct: boolean;
  correctOptionId: string | null;
  marksAwarded: number;
}

export interface BlockRendererProps {
  block: RailBlock;
  onJump: (page: number) => void;
  /** T-BOOK-008 wiring: resolve checkRefs → served questions + the
   *  server-verdict submit. Absent ⇒ the honest anchor card. */
  checkSource?: {
    load: (checkRefs: string[]) => Promise<RailCheckQuestion | null>;
    submit: (
      blockId: string,
      questionId: string,
      chosenOptionId: string,
      dwellMs: number,
    ) => Promise<RailCheckVerdict | null>;
  };
}

export function BlockRenderer({ block, onJump, checkSource }: BlockRendererProps): ReactNode {
  switch (block.type) {
    case "prose":
      return <ProseBlock block={block} />;
    case "callout":
      return <CalloutBlock block={block} />;
    case "figure":
      return <FigureBlock block={block} onJump={onJump} />;
    case "mcq-embed":
      return <McqEmbedBlock block={block} onJump={onJump} checkSource={checkSource} />;
    case "sort-match":
      return <SortMatchBlock block={block} />;
    case "drag-label":
      return <DragLabelBlock block={block} />;
    case "table-fill":
      return <TableFillBlock block={block} />;
    case "num-stepper":
      return <NumStepperBlock block={block} />;
    case "eq-builder":
      return <EqBuilderBlock block={block} />;
    case "sim-embed":
      return <SimEmbedBlock block={block} />;
    case "media-embed":
      return <MediaEmbedBlock block={block} />;
    default: {
      // the enum is closed — exhaustiveness guard, unreachable
      return null;
    }
  }
}
