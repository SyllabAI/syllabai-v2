/**
 * Content services composition root (T-MIG-020) — Wave 2 read surfaces.
 *
 * Sibling of the identity composition root: builds the raw-SQL session via
 * the identity module's createSql (the exported driver-dispatching factory;
 * same DATABASE_URL guards, same Neon/TCP split after T-MIG-014) and exposes
 * the read repositories the content routers use. Write surfaces of the Java
 * ContentController are NOT built here — the routers answer honest 501s
 * naming this task until their own task lands (honest-response rule).
 */
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../identity/users";
import { DocumentsRepository } from "./documents";
import { QuestionAssetsRepository } from "./assets";
import { ContentReviewRepository } from "./review";
import { CurriculumScopeResolver } from "./scope";
import type { Hono } from "hono";
import { createContentRoutes, createTeacherContentRoutes } from "../../routes/content";

export interface ContentApp {
  documents: DocumentsRepository;
  assets: QuestionAssetsRepository;
  review: ContentReviewRepository;
  scopes: CurriculumScopeResolver;
  contentRoute: Hono;
  teacherContentRoute: Hono;
}

export function buildContentApp(env: Record<string, string | undefined> = process.env): ContentApp {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const documents = new DocumentsRepository(sql);
  const assets = new QuestionAssetsRepository(sql);
  const review = new ContentReviewRepository(sql);
  const scopes = new CurriculumScopeResolver(sql);
  return {
    documents,
    assets,
    review,
    scopes,
    contentRoute: createContentRoutes(documents, assets, review),
    teacherContentRoute: createTeacherContentRoutes(documents, review, scopes),
  };
}
