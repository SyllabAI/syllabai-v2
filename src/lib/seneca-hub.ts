import "server-only";

/**
 * Seneca resource registry (T-SENECA-001 Task 42).
 *
 * The harvest pipeline commits a static bundle per Seneca source course under
 * public/seneca-bundles/<slug>.json plus a registry mapping hub courses to
 * their bundles (content/seneca/registry.json). Same posture as the rest of
 * the hub (ADR-029): committed, immutable-between-deploys content — no
 * database access from the production frontend.
 *
 * Registry missing = feature absent for the deployment; every accessor
 * degrades honestly to null/empty instead of inventing data.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

export interface SenecaBundleRef {
  /** Seneca source course slug (= bundle file stem) */
  slug: string;
  /** humanized Seneca course label, e.g. "Chemistry — Edexcel iGCSE" */
  label: string;
  sections: number;
  questions: number;
}

export interface SenecaCourseEntry {
  bundles: SenecaBundleRef[];
  /** total browsable resources across bundles */
  total: number;
}

type RegistryFile = {
  courses?: Record<string, SenecaBundleRef[]>;
};

const REGISTRY_PATH = path.join(process.cwd(), "content", "seneca", "registry.json");

const loadRegistry = cache(async (): Promise<Record<string, SenecaBundleRef[]>> => {
  try {
    const raw = await readFile(REGISTRY_PATH, "utf8");
    const j = JSON.parse(raw) as RegistryFile;
    return j.courses ?? {};
  } catch {
    return {};
  }
});

/** Seneca bundles registered for a hub course — null when the course has none. */
export const getSenecaForCourse = cache(
  async (slug: string): Promise<SenecaCourseEntry | null> => {
    const bundles = (await loadRegistry())[slug];
    if (!bundles || bundles.length === 0) return null;
    return { bundles, total: bundles.reduce((n, b) => n + b.sections + b.questions, 0) };
  },
);

/** Every hub course slug that carries at least one Seneca bundle. */
export const listSenecaCourseSlugs = cache(async (): Promise<string[]> => {
  return Object.keys(await loadRegistry()).sort();
});
