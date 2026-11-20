import type { MetadataRoute } from "next";

// T-QA-DEF-001 (4): /sitemap.xml 404'd and robots.txt carried no Sitemap:
// line — search engines had no crawlable map of the course catalogue. The
// origin of record is layout.tsx's metadataBase (the deployment's canonical
// home); keep the two in sync by construction. Gated app pages (dashboard,
// learner, teacher, workbench, tutor, practice, plan, experiments,
// graph-explorer, knowledge-graph, assistant) are deliberately excluded —
// a public sitemap lists public, indexable pages only.

const BASE = "https://www.syllab-ai.com";

const STATIC_PATHS = [
  "",
  "/login",
  "/demo",
  "/about",
  "/about/provenance",
  "/about/study-use",
  "/privacy",
  "/terms",
  "/sources",
  "/past-papers",
];

/**
 * Pure entry builder (import-safe outside RSC — courses.ts is server-only):
 * course paths come in already built via coursePath(), so the URL format has
 * exactly one owner.
 */
export function buildSitemapEntries(coursePaths: string[]): MetadataRoute.Sitemap {
  return [
    ...STATIC_PATHS.map((p) => ({ url: `${BASE}${p}` })),
    ...coursePaths.map((p) => ({ url: `${BASE}${p}` })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // lazy — keeps this module import-safe outside RSC (courses.ts is
  // server-only; the pure builder above is what tests exercise)
  const { coursePath, listCourses } = await import("@/lib/courses");
  const courses = await listCourses();
  return buildSitemapEntries(courses.map((c) => coursePath(c)));
}
