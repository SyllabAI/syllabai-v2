/**
 * Exam-paper browsing router — path parity with the frozen core (T-MIG-031
 * tranche 2): ExamPaperController @RequestMapping("/api/v1/exam-papers")
 * (syllabai-core @ 6cad6ef), two @GetMapping surfaces:
 *
 *   GET  /api/v1/exam-papers        list(:42-48) — optional subjectId filter,
 *                                     newest-first by created_at
 *   GET  /api/v1/exam-papers/{id}   get(:50-74) — PaperDetailView | 404
 *                                     NotFoundException("exam paper", id)
 *
 * Route security: any authenticated user may list/view (SecurityConfig :91 —
 * NO role-specific rules for this base path; the class javadoc states it and
 * the captured unauthed-401/student-200 pairs pin it). The authz shell
 * answers before any handler body.
 *
 * Parameter binding law (Spring parity, identical to routes/questions):
 *   - @RequestParam UUID subjectId: unparseable → 400 bad_request "malformed
 *     request" (MethodArgumentTypeMismatchException :167-170 parity — a
 *     failed safeParse IS the conversion failure).
 *   - @PathVariable UUID id: unparseable → 400 bad_request "malformed
 *     request", distinct from the 404 unknown-id path
 *     (NotFoundException envelope "exam paper {uuid} not found").
 *
 * The detail payload's laws live in the service layer (tranche-1): the
 * T-C28 shared specPointRefs projection (honest absence = empty list),
 * difficulty-ordered questions, latest version heads batched (R-M-LAZY
 * disclosure) — the router stays a binding shell exactly like the frozen
 * controller.
 */
import { Hono } from "hono";
import { ExamPaperViews } from "../../services/exam-papers";
import { ServableQuestions } from "../../services/questions";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { BadRequestException } from "../../services/identity/errors";
import { requireAuth } from "../../middleware/auth";
import {
  examPaperIdPathSchema,
  examPapersListParamsSchema,
} from "@syllabai/contracts";

/** Port of MethodArgumentTypeMismatchException handling
 * (GlobalExceptionHandler.java:167-170): 400 bad_request, fixed client
 * message. Structural duplicate of the curriculum helper — fence law keeps
 * the landed lanes unimported (import, never edit). */
const malformedRequest = () => new BadRequestException("malformed request");

export function createExamPapersRouter(papers: ExamPaperViews): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity): the
  // captured 401 shells (w3-exam-papers-*-unauthed-401) pin the Boot body
  // before any handler work.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET / — list(:42-48): optional subjectId filter (absent = all papers,
  // newest-first by created_at — the repository ordering the service owns).
  r.get("/", async (c) => {
    const parsed = examPapersListParamsSchema.safeParse({
      subjectId: c.req.query("subjectId"),
    });
    if (!parsed.success) throw malformedRequest(); // UUID conversion parity
    return c.json(await papers.list(parsed.data.subjectId ?? null));
  });

  // GET /:id — get(:50-74): PaperDetailView (200) | NotFoundException 404
  // (the service throws the shared "exam paper", id envelope).
  r.get("/:id", async (c) => {
    const parsed = examPaperIdPathSchema.safeParse({ id: c.req.param("id") });
    if (!parsed.success) throw malformedRequest();
    return c.json(await papers.detail(parsed.data.id));
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildSelfMarkRouters
 * shape (env → requireDatabaseUrl → createSql adapter). Java injects the
 * shared ServableQuestionService into ExamPaperController (its specPointRefs
 * projection powers the detail payload); the port constructs the same
 * read-model cluster over the module's sql adapter.
 */
export function buildExamPapersRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const papers = new ExamPaperViews(sql, new ServableQuestions(sql));
  return { papers, examPapersRoute: createExamPapersRouter(papers) };
}
