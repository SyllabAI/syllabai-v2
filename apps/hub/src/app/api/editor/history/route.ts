/**
 * /api/editor/history — the ADR-044 Phase 1 read-only per-question
 * edit-history surface (the hub's route-gating layer, ADR §5: capability
 * enforcement happens at three layers — middleware on the API, route-
 * gating in the hub, and the Workbench's own view switching; this handler
 * IS layer two).
 *
 *   GET /api/editor/history?course=<slug>&topic=<topicSlug>&q=<questionId>
 *
 *   → 200 QuestionHistoryPayload (editor-history.ts — bank path, content-
 *     anchored region, the corpus commits, per-commit touched/hunks).
 *   → 401 { error: "unauthorized" } — no Bearer token forwarded (the
 *     identity-gated law: signed-out sessions never reach provenance).
 *   → 403 { error: "forbidden" } — the forwarded token holds no unrevoked
 *     editor_grants row (verified against the v2 api's /editor/me of
 *     record — the hub NEVER trusts a client capability claim).
 *   → 503 { error: "editor_plane_unavailable" } — the v2 api base is not
 *     configured; the capability check cannot run, so the surface stays
 *     closed (fail-closed, never fail-open).
 *   → 400 { error: "bad_request" } — missing/invalid query params.
 *   → 404 { error: "not_found" } — unknown course/set/question, or no
 *     corpus bank path of record.
 *   → 502 { error: "upstream_unavailable" | "rate_limited" } — GitHub REST
 *     failures (typed, honest; the panel renders the verdict).
 *
 * The handler is READ-ONLY end to end: no corpus byte, no DB row, no
 * proposal. The data itself is public-repo git provenance; the CAPABILITY
 * gate exists because the surface is an editor-plane affordance (ADR §5
 * matrix: provenance is delivered to editors; students' served content
 * plane is untouched).
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  BankHistoryError,
  buildQuestionHistory,
  buildSetHistory,
  type QuestionHistoryPayload,
} from "@/lib/editor-history";

/** The v2 api base (server-side env; the same bare origin the client's
 * v2SurfaceBase resolves). Null when unconfigured — the surface closes. */
function editorApiBase(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_API_V2_BASE_URL ?? process.env.SYLLABAI_API_V2_BASE_URL ?? "";
  if (!raw) return null;
  return raw.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

interface EditorMeView {
  editor: boolean;
  scopes: string[];
}

async function verifyEditorCapability(
  token: string | null,
): Promise<{ ok: boolean; status: 200 | 401 | 403 | 503; detail: string }> {
  if (!token) return { ok: false, status: 401, detail: "no bearer token on the request" };
  const base = editorApiBase();
  if (!base) {
    return { ok: false, status: 503, detail: "the v2 api base is not configured for this deployment" };
  }
  try {
    const res = await fetch(`${base}/api/v1/editor/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200) {
      const body = (await res.json().catch(() => null)) as EditorMeView | null;
      if (body && body.editor === true && Array.isArray(body.scopes)) {
        return { ok: true, status: 200, detail: "editor" };
      }
      return { ok: false, status: 403, detail: "drifted capability body" };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 403, detail: "the forwarded token holds no editor grant" };
    }
    return { ok: false, status: 503, detail: `capability check failed (status ${res.status})` };
  } catch {
    return { ok: false, status: 503, detail: "the v2 api is unreachable" };
  }
}

function err(status: number, code: string, detail: string) {
  return NextResponse.json({ error: code, detail }, { status });
}

export async function GET(request: NextRequest) {
  // 1. the capability gate (route-gating layer, ADR-044 §5)
  const auth = request.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() || null : null;
  const gate = await verifyEditorCapability(token);
  if (!gate.ok) {
    return err(
      gate.status,
      gate.status === 401 ? "unauthorized" : gate.status === 403 ? "forbidden" : "editor_plane_unavailable",
      gate.detail,
    );
  }

  // 2. the params
  const sp = request.nextUrl.searchParams;
  const course = sp.get("course")?.trim() ?? "";
  const topicSlug = sp.get("topic")?.trim() ?? "";
  const questionId = sp.get("q")?.trim() ?? null;
  if (!course || !topicSlug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(course)) {
    return err(400, "bad_request", "course and topic query params are required (kebab-case course)");
  }

  // 3. resolve the set of record from the served bundle (server-side read;
  //    the hub's own content plane is the set inventory — no editor write
  //    anywhere, E-0)
  const { loadHubCourse } = await import("@/lib/courses");
  const hub = await loadHubCourse(course);
  if (!hub) return err(404, "not_found", `unknown course: ${course}`);
  const set =
    hub.questionTopics.find((t) => t.slug === topicSlug) ??
    hub.officialPaperTopics.find((t) => t.slug === topicSlug);
  if (!set) return err(404, "not_found", `unknown question set: ${topicSlug}`);

  // 4. the history build (typed, honest upstream failures)
  try {
    if (questionId) {
      const q = set.questions.find((qq) => qq.id === questionId);
      if (!q) return err(404, "not_found", `unknown question: ${questionId}`);
      const payload: QuestionHistoryPayload = await buildQuestionHistory(course, set, q);
      return NextResponse.json(payload);
    }
    const setHistory = await buildSetHistory(course, set);
    return NextResponse.json({
      course,
      questionId: null,
      questionOrder: null,
      attribution: "set_level",
      bank: setHistory.bank,
      anchor: null,
      commits: setHistory.commits,
      disclosure: "Read-only edit history for the whole question set.",
    });
  } catch (e) {
    if (e instanceof BankHistoryError) {
      if (e.code === "not_found") return err(404, "not_found", e.message);
      return err(502, e.code, e.message);
    }
    return err(502, "upstream_unavailable", "the history build failed");
  }
}
