import { NextRequest, NextResponse } from "next/server";

import { v2FetchAuthorized } from "@/lib/v2-proxy";
import { v2SurfaceBase } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * T-TUTOR-AIM-P3 (DC10 §7.8 + §13.2) — the drill-directive CLAIM proxy:
 * the tonight-chip's tap crosses the cookie→Bearer boundary here (the
 * /api/ai/* posture). The claim itself is exactly-once server-side (the
 * two guards: the server-issued directive row + the claimed_at CAS) — a
 * re-render / double-tap answers the SAME artefact, never a second set.
 * The body is the §22 identity only ({sessionId, turnId}); the directive
 * id never travels from the client — the API recomputes it from the
 * caller's OWN ids (state guard 1's unforgeability posture).
 *
 * Status mapping: 200/201 pass through as data (the chip flips to its
 * claimed state); 404 (no directive) / 409 (nothing schedulable) / 503
 * (dormant) pass through as data too — the chip degrades honestly; 401
 * re-prompts.
 */

const CLAIM_PATH = "/api/v1/tutor/drill-directives/claim";

interface ClaimBody {
  sessionId?: unknown;
  turnId?: unknown;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("syllabai.token")?.value ?? null;
  if (token == null) {
    return NextResponse.json(
      { status: 401, error: "unauthorized", message: "Your session expired — sign in again to continue." },
      { status: 401 },
    );
  }
  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return NextResponse.json(
      { status: 400, error: "malformed_body", message: "request body is not readable" },
      { status: 400 },
    );
  }
  // the closed shape of record: the §22 identity pair, nothing else — an
  // over-posting body is refused here, before it ever reaches the API
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const turnId = typeof body.turnId === "number" && Number.isInteger(body.turnId) && body.turnId > 0 ? body.turnId : 0;
  if (!sessionId || turnId === 0) {
    return NextResponse.json(
      { status: 400, error: "validation_failed", message: "sessionId must be a uuid and turnId a positive integer" },
      { status: 400 },
    );
  }
  const base = v2SurfaceBase(CLAIM_PATH, process.env.NEXT_PUBLIC_API_V2_BASE_URL);
  if (!base) {
    return NextResponse.json(
      { status: 503, error: "tutor_unavailable", message: "The tutor backend is not configured right now." },
      { status: 503 },
    );
  }
  const result = await v2FetchAuthorized<{ status: string; scheduledCount: number }>(base, CLAIM_PATH, {
    method: "POST",
    token,
    body: { sessionId, turnId },
  });
  if (!result.ok || !result.data) {
    const status = result.status === 401 || result.status === 403 ? 401 : result.status;
    return NextResponse.json(
      {
        status,
        error: status === 401 ? "unauthorized" : "claim_failed",
        message:
          status === 401
            ? "Your session expired — sign in again to continue."
            : "Could not schedule the practice set right now — try again later.",
      },
      { status },
    );
  }
  return NextResponse.json(result.data, { status: 200 });
}
