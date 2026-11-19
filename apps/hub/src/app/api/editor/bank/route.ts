/**
 * /api/editor/bank — the ADR-044 run-011 (Phase 2) served-plane read that
 * the Workbench renders against (the hub's route-gating layer, ADR §5:
 * capability enforcement happens at three layers — middleware on the API,
 * route-gating in the hub, and the Workbench's own view switching; this
 * handler IS layer two, the history route's gate law verbatim).
 *
 *   GET /api/editor/bank?course=<slug>                        → the course's
 *       question sets (slug/name/count), served-state only
 *   GET /api/editor/bank?course=<slug>&topic=<topicSlug>      → the set's
 *       questions (id/order/marks/style) + the corpus bank path of record
 *   GET /api/editor/bank?course=&topic=&q=<questionId>        → the FULL
 *       question artifact: the served question (the render/edit base) + the
 *       baseCtx the gate engine validates against + the bank path
 *
 * READ-ONLY end to end: the served plane is the render/edit BASE (ADR §6
 * step 1 — "the Workbench shows the served artifact exactly as served");
 * every mutation targets the corpus through the editor API's proposal
 * plane, never here (E-0, §2). The capability gate is the same
 * verifyEditorCapability law the history route runs — the hub NEVER
 * trusts a client capability claim.
 *
 *   401 { error: "unauthorized" }   — no Bearer token forwarded
 *   403 { error: "forbidden" }      — the token holds no editor grant
 *   503 { error: "editor_plane_unavailable" } — the v2 api base unset
 *   400 { error: "bad_request" }    — missing/invalid params
 *   404 { error: "not_found" }      — unknown course/set/question
 */
import { NextResponse, type NextRequest } from "next/server";
import { corpusBankPathOfRecord } from "@/lib/editor-history";

/** The v2 api base (server-side env; the history route's resolution). */
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
  if (!course || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(course)) {
    return err(400, "bad_request", "a kebab-case course param is required");
  }

  // 3. the served plane (server-side read; the hub's own content plane is
  //    the render/edit BASE — no write anywhere, E-0)
  const { loadHubCourse } = await import("@/lib/courses");
  const hub = await loadHubCourse(course);
  if (!hub) return err(404, "not_found", `unknown course: ${course}`);

  // course only → the sets list (the Workbench bank browser's second level)
  if (!topicSlug) {
    const sets = hub.questionTopics.map((t) => ({
      slug: t.slug,
      name: t.name,
      section: t.section,
      count: t.questions.length,
    }));
    return NextResponse.json({ course, sets });
  }

  const set =
    hub.questionTopics.find((t) => t.slug === topicSlug) ??
    hub.officialPaperTopics.find((t) => t.slug === topicSlug);
  if (!set) return err(404, "not_found", `unknown question set: ${topicSlug}`);
  const bank = corpusBankPathOfRecord(course, set);

  // course+topic → the set's question list
  if (!questionId) {
    return NextResponse.json({
      course,
      topic: topicSlug,
      setName: set.name,
      bankPath: bank?.path ?? null,
      bankKind: bank?.kind ?? null,
      questions: set.questions.map((q) => ({
        id: q.id,
        order: q.order,
        marks: q.totalMarks,
        style: q.style,
        parts: q.parts.length,
      })),
    });
  }

  // course+topic+q → the full artifact (the render/edit base of record)
  const q = set.questions.find((qq) => qq.id === questionId);
  if (!q) return err(404, "not_found", `unknown question: ${questionId}`);
  return NextResponse.json({
    course,
    topic: topicSlug,
    setName: set.name,
    bankPath: bank?.path ?? null,
    bankKind: bank?.kind ?? null,
    question: q,
    baseCtx: {
      partCount: q.parts.length,
      choiceLabels: Object.fromEntries(
        q.parts.map((p, i) => [String(i), (p.choices ?? []).map((c) => c.label)]),
      ),
    },
    disclosure: "The served artifact is the render/edit base of record (ADR-044 §6); every mutation targets the corpus through a proposal.",
  });
}
