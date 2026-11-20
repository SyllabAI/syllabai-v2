import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { buildSitemapEntries } from "@/app/sitemap";

// T-QA-DEF-001 (4): the sitemap must cover the static public pages and the
// whole course catalogue, on the origin of record (layout.tsx's metadataBase
// — keep the two in sync by construction). The entry builder is pure (no
// server-only imports); the catalogue comes from the registry of record
// (content/courses.json — NOT every content dir: grade-boundaries/seneca/
// video-map are non-course assets the registry excludes).

const registry = JSON.parse(readFileSync(join(import.meta.dir, "../../content/courses.json"), "utf8")) as {
  courses: { slug: string }[];
};
const entries = buildSitemapEntries(registry.courses.map((c) => `/courses/${c.slug}`));

describe("T-QA-DEF-001: /sitemap.xml", () => {
  test("every URL is absolute on the origin of record", () => {
    expect(entries.length).toBeGreaterThan(100);
    for (const e of entries) expect(e.url.startsWith("https://www.syllab-ai.com")).toBe(true);
  });

  test("the static public pages are present", () => {
    const urls = entries.map((e) => e.url);
    for (const p of ["", "/login", "/demo", "/about", "/privacy", "/terms", "/sources", "/past-papers"]) {
      expect(urls).toContain(`https://www.syllab-ai.com${p}`);
    }
  });

  test("the course catalogue is fully enumerated", () => {
    const urls = entries.map((e) => e.url);
    const courseUrls = urls.filter((u) => u.includes("/courses/"));
    expect(courseUrls.length).toBe(106);
    expect(urls).toContain("https://www.syllab-ai.com/courses/igcse-maths-b-16");
    // gated app pages never leak into the sitemap
    expect(
      urls.some((u) => u.includes("/dashboard") || u.includes("/teacher") || u.includes("/workbench")),
    ).toBe(false);
  });
});
