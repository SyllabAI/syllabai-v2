import { NextRequest, NextResponse } from "next/server";

import { v2FetchAuthorized } from "@/lib/v2-proxy";
import { v2SurfaceBase } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * T-TUTOR-AIM-P3 (DC10 §7.9) — the calibration read-out proxy: the
 * learner-visible "when you say you're sure, you're right X% of the time"
 * surface, crossed over the cookie→Bearer boundary (the /api/ai/* posture).
 * GET only; the read-out is per-learner (the §7.4 rule-1 law: the learner's
 * OWN baseline, never population stats) and the §7.4 gates surface honestly
 * (gathering / no_signal) — the proxy adds nothing, strips nothing.
 */

const CALIBRATION_PATH = "/api/v1/tutor/calibration";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("syllabai.token")?.value ?? null;
  if (token == null) {
    return NextResponse.json(
      { status: 401, error: "unauthorized", message: "Your session expired — sign in again to continue." },
      { status: 401 },
    );
  }
  const base = v2SurfaceBase(CALIBRATION_PATH, process.env.NEXT_PUBLIC_API_V2_BASE_URL);
  if (!base) {
    return NextResponse.json(
      { status: 503, error: "tutor_unavailable", message: "The tutor backend is not configured right now." },
      { status: 503 },
    );
  }
  const result = await v2FetchAuthorized<unknown>(base, CALIBRATION_PATH, {
    method: "GET",
    token,
  });
  if (!result.ok || !result.data) {
    const status = result.status === 401 || result.status === 403 ? 401 : result.status;
    return NextResponse.json(
      {
        status,
        error: status === 401 ? "unauthorized" : "calibration_unavailable",
        message:
          status === 401
            ? "Your session expired — sign in again to continue."
            : "The calibration read-out is not available right now.",
      },
      { status },
    );
  }
  return NextResponse.json(result.data, { status: 200 });
}
