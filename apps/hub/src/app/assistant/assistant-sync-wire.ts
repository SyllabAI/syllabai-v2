"use client";

/**
 * The assistant surface's wire construction contract — DC-6 phase 3b
 * (docs/DC6-ASSISTANT-SURFACE-SYNC-PLAN.md §4).
 *
 * PURE module: zero api/store/network imports, so the construction pins run
 * without a network surface (bun test, no DOM). This is the typed law that
 * maps the assistant rail's LOCAL role union onto the sync tier's 2-kind
 * wire union and back — the mirror's round-trip honesty lives here:
 *
 * - the assistant answer leg's payload is the rail's projection VERBATIM
 *   (answer/citations/mode/provider/model/refused/evidenceCount/latencyMs/
 *   coarse context) — absent fields stay absent, nothing is fabricated (the
 *   ratified claAnswerViewSchema's server-resolved uuids/topics/tools do
 *   NOT exist on this surface);
 * - the gate/error kinds are deliberately unreachable: the rail never
 *   stores them (transient setError state) — `fromWire` SKIPS them so a
 *   foreign leg can never leak into the local transcript;
 * - the mirror carries the NEWEST MIRROR_TRANSCRIPT_CAP messages (the
 *   family wire law; the assistant's local 200 cap predates and stays).
 */

import type {
  ClaAnswerView,
  ClaAssistantAnswerPayload,
  ClaAssistantThreadSyncMessage,
  ClaAssistantThreadViewMessage,
  ClaThreadViewMessage,
} from "@/lib/types";
import type { AssistantMessage } from "./assistant-threads";

/** The wire transcript bound (the family law; the local 200 cap stays). */
export const MIRROR_TRANSCRIPT_CAP = 100;

/** local role union -> wire 2-kind union (the typed construction law). */
export function toWireAssistantMessage(m: AssistantMessage): ClaAssistantThreadSyncMessage {
  if (m.role === "user") {
    return { kind: "user", at: m.at, text: m.content };
  }
  return {
    kind: "assistant",
    at: m.at,
    payload: {
      answer: m.content,
      citations: m.citations ?? [],
      ...(m.mode != null ? { mode: m.mode } : {}),
      ...(m.provider != null ? { provider: m.provider } : {}),
      ...(m.model !== undefined ? { model: m.model } : {}),
      ...(m.refused != null ? { refused: m.refused } : {}),
      ...(m.evidenceCount != null ? { evidenceCount: m.evidenceCount } : {}),
      ...(m.latencyMs != null ? { latencyMs: m.latencyMs } : {}),
      ...(m.context !== undefined
        ? {
            context: m.context
              ? {
                  kind: m.context.kind,
                  anchor: m.context.anchor,
                  ...(m.context.attempted !== undefined
                    ? { attempted: m.context.attempted }
                    : {}),
                }
              : null,
          }
        : {}),
    },
  };
}

/** wire view union -> local role union (the exact inverse; the param accepts
 *  the FULL 4-kind view union so the skip law is type-expressible). Only the
 *  assistant PROJECTION maps — a ratified-view payload (the question
 *  surface's assistant leg) and gate/error legs SKIP: they cannot exist on
 *  assistant rows, and a foreign leg must never leak into the local
 *  transcript. Returns null = skip. */
function isAssistantProjection(p: ClaAssistantAnswerPayload | ClaAnswerView): p is ClaAssistantAnswerPayload {
  // the ratified view's REQUIRED topics/tools never exist on the projection
  // (both schemas are .strict() — admission rejects the smuggle)
  return !("tools" in p) && !("topics" in p);
}

export function fromWireAssistantMessage(
  m: ClaAssistantThreadViewMessage | ClaThreadViewMessage,
): AssistantMessage | null {
  switch (m.kind) {
    case "user":
      return { role: "user", content: m.text, at: m.at };
    case "assistant":
      if (!isAssistantProjection(m.payload)) return null; // a question-surface leg — skip
      return {
        role: "assistant",
        content: m.payload.answer,
        at: m.at,
        // the construction-cast seam (the threads-store.ts:145 precedent):
        // the wire types citations unknown[]; the local union types them
        // TutorCitation[] — the CONTENT originated here (toWire), so the
        // round-trip restores what the rail stored
        citations: m.payload.citations as AssistantMessage["citations"],
        ...(m.payload.mode != null ? { mode: m.payload.mode } : {}),
        ...(m.payload.provider != null ? { provider: m.payload.provider } : {}),
        ...(m.payload.model !== undefined ? { model: m.payload.model } : {}),
        ...(m.payload.refused != null ? { refused: m.payload.refused } : {}),
        ...(m.payload.evidenceCount != null
          ? { evidenceCount: m.payload.evidenceCount }
          : {}),
        ...(m.payload.latencyMs != null ? { latencyMs: m.payload.latencyMs } : {}),
        ...(m.payload.context !== undefined
          ? {
              context: m.payload.context
                ? {
                    kind: m.payload.context.kind,
                    anchor: m.payload.context.anchor,
                    ...(m.payload.context.attempted !== undefined
                      ? { attempted: m.payload.context.attempted }
                      : {}),
                  }
                : undefined,
            }
          : {}),
      };
    default:
      // gate/error: unreachable on assistant rows; skip, never leak
      return null;
  }
}
