"use client";

/**
 * F-186 — the Strength Battle wire layer (the lib/drill.ts posture verbatim:
 * every call returns null on any failure — unsigned-in, network, fail-closed
 * 404/409 — and the caller renders the honest empty state, never a fabricated
 * battle). The battle START is opt-in by construction: this layer only fires
 * when the learner presses Start (law B8). Answer facts never cross this
 * layer before the attempt: the battle parts carry no isCorrect/solutionMd —
 * battle answers ride the UNCHANGED drill evidence seam, whose ack carries
 * the instant F-183 reveal.
 */
import { apiPath, getToken } from "@/lib/api";

export interface BattleOpponent {
  kind: "bot";
  law: string;
}

/** The battle start outcome — mirrors the API's battleStartResponseSchema. */
export interface BattleStartResponse {
  drawId: string;
  course: string;
  code: string;
  seed: number;
  poolSize: number;
  freshPoolSize: number;
  usedFallback: boolean;
  selection: { policy: "model" | "random"; sparseFallback: boolean; explorationSlots: number };
  opponent: BattleOpponent;
  clockMs: number;
  startedAt: string;
  parts: BattlePartView[];
}

export interface BattlePartView {
  partId: string;
  questionId: string;
  setId: string;
  plane: "official" | "topic";
  order: number;
  marks: number;
  questionType: string | null;
  commandWord: string | null;
  problemMd: string;
  choices: { label: string; textMd: string }[] | null;
  specPointCodes: string[];
}

/** One settled part — mirrors battleSettlementPartSchema. No answer key (law B7). */
export interface BattleSettlementPart {
  partId: string;
  marks: number;
  learner: { answered: boolean; inClock: boolean; correct: boolean | null; marksAwarded: number | null };
  bot: { correct: boolean; latencyMs: number };
  wonBy: "learner" | "bot" | "split" | "neither";
}

export interface BattleSettlementResponse {
  drawId: string;
  course: string;
  code: string;
  generatedAt: string;
  opponent: BattleOpponent;
  clock: { ms: number; startedAt: string; deadline: string; closedBy: "all-answered" | "clock" };
  parts: BattleSettlementPart[];
  score: { learner: number; bot: number; possible: number };
  verdict: "win" | "loss" | "draw";
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(apiPath(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Opt-in battle start (law B8): fires only on the learner's explicit Start. */
export function postBattleStart(course: string, code: string): Promise<BattleStartResponse | null> {
  return authedFetch<BattleStartResponse>("/api/v1/learners/me/drill/battles", {
    method: "POST",
    body: JSON.stringify({ course, code }),
  });
}

/**
 * The battle settlement, computed at read. Null while the battle is still
 * live (409) or on any failure — the caller renders the honest state and the
 * learner can re-ask (the projection is pure; nothing is consumed by asking).
 */
export function fetchBattleSettlement(drawId: string): Promise<BattleSettlementResponse | null> {
  return authedFetch<BattleSettlementResponse>(
    `/api/v1/learners/me/drill/battles/${encodeURIComponent(drawId)}/settlement`,
  );
}
