"use client";

/**
 * F-182 — the drill surface client (the per-spec-point drill; prereg of
 * record docs/F182-DRILL-BUILD-PLAN.md). The wire layer the drill UI reads:
 * the drillable address picker, one 5-part draw, and the F-055-shaped
 * attempt-evidence submission whose ack carries the instant post-attempt
 * reveal.
 *
 * Posture law (the progress-server shape): every call returns null on any
 * failure (unsigned-in, network, fail-closed 404) and the caller renders the
 * honest empty state — never a fabricated second truth. Answer facts never
 * cross this layer before the attempt: the draw payload carries no
 * isCorrect/solutionMd (the server strips them; the reveal rides the
 * evidence ack only).
 */
import { apiPath, getToken } from "@/lib/api";

export interface DrillChoiceView {
  label: string;
  textMd: string;
}

export interface DrillPartView {
  partId: string;
  questionId: string;
  setId: string;
  plane: "official" | "topic";
  order: number;
  marks: number;
  questionType: string | null;
  commandWord: string | null;
  problemMd: string;
  choices: DrillChoiceView[] | null;
  specPointCodes: string[];
}

export interface DrillAddressRow {
  code: string;
  official: number;
  topic: number;
  combined: number;
  drillable: boolean;
}

export interface DrillAddressesResponse {
  course: string;
  summary: {
    specPointAddresses: number;
    covered: number;
    drillable: number;
    thin: number;
    uncovered: number;
  };
  addresses: DrillAddressRow[];
}

export interface DrillDrawResponse {
  drawId: string;
  course: string;
  code: string;
  seed: number;
  poolSize: number;
  freshPoolSize: number;
  usedFallback: boolean;
  parts: DrillPartView[];
}

export type DrillResponse =
  | { kind: "choice"; label: string }
  | { kind: "text"; text: string };

export interface DrillEvidenceResponse {
  evidenceId: string;
  drawId: string;
  partId: string;
  correct: boolean | null;
  marksAwarded: number | null;
  marksPossible: number;
  solutionMd: string | null;
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const token = getToken();
  if (!token) return null; // unsigned-in — the caller renders the sign-in posture
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

export function fetchDrillAddresses(course: string): Promise<DrillAddressesResponse | null> {
  return authedFetch<DrillAddressesResponse>(
    `/api/v1/learners/me/drill/addresses?course=${encodeURIComponent(course)}`,
  );
}

export function postDrillDraw(course: string, code: string, seed?: number): Promise<DrillDrawResponse | null> {
  return authedFetch<DrillDrawResponse>("/api/v1/learners/me/drill/draw", {
    method: "POST",
    body: JSON.stringify(seed === undefined ? { course, code } : { course, code, seed }),
  });
}

export function postDrillEvidence(
  drawId: string,
  partId: string,
  response: DrillResponse,
  responseTimeMs: number,
  confidenceLevel: number,
  selfDoubtFlag: boolean,
): Promise<DrillEvidenceResponse | null> {
  return authedFetch<DrillEvidenceResponse>("/api/v1/learners/me/drill/evidence", {
    method: "POST",
    body: JSON.stringify({
      drawId,
      partId,
      response,
      responseTimeMs,
      confidenceLevel,
      selfDoubtFlag,
    }),
  });
}
