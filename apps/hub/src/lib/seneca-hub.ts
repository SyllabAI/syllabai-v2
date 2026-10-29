import "server-only";

/**
 * Seneca resource registry (T-SENECA-001 Task 42 → Task 43 production port).
 *
 * The harvest pipeline commits a static bundle per Seneca source course under
 * public/seneca-bundles/<slug>.json plus a registry mapping hub courses to
 * their bundles (content/seneca/registry.json). Same posture as the rest of
 * the hub (ADR-029): committed, immutable-between-deploys content — no
 * database access from the production frontend.
 *
 * Gating law (flags.json, ADR-CLASS-0001 practice adapted to content — same
 * shape as ugm.ts): the flag FILE, the flag KEY or the course slug being
 * ABSENT = OFF — getSenecaForCourse returns null and every surface renders
 * its honest empty/not-found state; nothing renders from an unflagged
 * registry entry. One-flip kill: remove the course slug (or the whole key)
 * from flags.json — a content-only change, no code deploy. The flag gates
 * RENDERING only; it never fabricates data.
 *
 * Registry missing = feature absent for the deployment; every accessor
 * degrades honestly to null/empty instead of inventing data.
 */
import { cache } from "react";
import { z } from "zod";
import { loadContentJson } from "@/lib/corpus";

export const SENECA_STUDENT_FLAG_KEY = "senecaStudentResourceHub";

export interface SenecaBundleRef {
  /** Seneca source course slug (= bundle file stem) */
  slug: string;
  /** humanized Seneca course label, e.g. "Chemistry Edexcel IGCSE" */
  label: string;
  sections: number;
  questions: number;
}

export interface SenecaCourseEntry {
  bundles: SenecaBundleRef[];
  /** total browsable resources across bundles */
  total: number;
}

const RegistryEntry = z.object({
  slug: z.string(),
  label: z.string(),
  sections: z.number(),
  questions: z.number(),
});

const RegistryFile = z.object({
  courses: z.record(z.string(), z.array(RegistryEntry)),
});

const FlagsFile = z.object({
  schema: z.string(),
  flags: z.record(z.string(), z.unknown()),
});

/**
 * Render-time flag check. Absent file / absent key / absent slug = OFF.
 * Errors degrade to OFF (a broken flag file must never surface content).
 */
const senecaFeatureEnabled = cache(async (courseSlug: string): Promise<boolean> => {
  const raw = await loadContentJson("flags.json");
  if (!raw) return false;
  const parsed = FlagsFile.safeParse(raw);
  if (!parsed.success) {
    console.error("[seneca] flags.json unreadable — surface stays OFF", parsed.error.message);
    return false;
  }
  const entry = parsed.data.flags[SENECA_STUDENT_FLAG_KEY];
  if (!entry || typeof entry !== "object") return false;
  const courses = (entry as { courses?: unknown }).courses;
  return Array.isArray(courses) && courses.includes(courseSlug);
});

const loadRegistry = cache(async (): Promise<Record<string, SenecaBundleRef[]>> => {
  const raw = await loadContentJson("seneca/registry.json");
  if (!raw) return {};
  const parsed = RegistryFile.safeParse(raw);
  if (!parsed.success) {
    console.error("[seneca] registry schema drift — serving honest empty state", parsed.error.message);
    return {};
  }
  return parsed.data.courses;
});

/** Seneca bundles registered (and flagged) for a hub course — null when none. */
export const getSenecaForCourse = cache(
  async (slug: string): Promise<SenecaCourseEntry | null> => {
    if (!(await senecaFeatureEnabled(slug))) return null;
    const bundles = (await loadRegistry())[slug];
    if (!bundles || bundles.length === 0) return null;
    return { bundles, total: bundles.reduce((n, b) => n + b.sections + b.questions, 0) };
  },
);

/** Every hub course slug that carries at least one flagged Seneca bundle. */
export const listSenecaCourseSlugs = cache(async (): Promise<string[]> => {
  const registry = await loadRegistry();
  const enabled: string[] = [];
  for (const slug of Object.keys(registry).sort()) {
    if (await senecaFeatureEnabled(slug)) enabled.push(slug);
  }
  return enabled;
});
