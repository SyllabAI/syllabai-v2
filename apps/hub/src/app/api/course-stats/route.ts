import { NextResponse } from "next/server";
import { loadContentJson, hasContentFile } from "@/lib/corpus";

/**
 * GET /api/course-stats?slugs=a,b,c
 *
 * Lightweight per-course resource counts for the dashboard subject cards.
 * Reads the committed content bundles through lib/corpus.ts (defensive, no
 * Zod) and caches results in-process — the bundles are immutable between
 * deploys. Bundle-offload note (perf band): the old direct fs reads with
 * `join(process.cwd(), "content", slug)` are what traced the whole corpus
 * into this function's bundle on every deployment.
 */
export const dynamic = "force-dynamic";

/**
 * The corpus behind this route is committed and immutable between deploys,
 * so the CDN may cache responses (ADR-021 perf pass, tranche 4.12). Not
 * `immutable` — URLs are not deploy-versioned.
 */
const CONTENT_CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" };

interface CourseStat {
  slug: string;
  hasBundle: boolean;
  treeKind: string | null;
  topics: number;
  notes: number;
  questionSets: number;
  questions: number;
  flashcards: number;
}

const cache = new Map<string, Promise<CourseStat>>();

function count(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function questionsInSet(set: unknown): number {
  if (!set || typeof set !== "object") return 0;
  const q = (set as { questions?: unknown }).questions;
  return Array.isArray(q) ? q.length : 0;
}

async function statFor(slug: string): Promise<CourseStat> {
  const cached = cache.get(slug);
  if (cached) return cached;

  const work = (async (): Promise<CourseStat> => {
  const stat: CourseStat = {
    slug,
    hasBundle: await hasContentFile(`${slug}/manifest.json`),
    treeKind: null,
    topics: 0,
    notes: 0,
    questionSets: 0,
    questions: 0,
    flashcards: 0,
  };

  const safeRead = (file: string) => loadContentJson(`${slug}/${file}`);

  const manifest = (await safeRead("manifest.json")) as { counts?: Record<string, unknown>; treeKind?: string } | null;
  if (manifest?.treeKind) stat.treeKind = manifest.treeKind;

  const curriculum = (await safeRead("curriculum.json")) as { nodes?: Array<{ family?: string }> } | null;
  if (curriculum?.nodes) {
    stat.topics = curriculum.nodes.filter((n) => n?.family === "TOPIC").length;
  }

  const notes = await safeRead("notes.json");
  stat.notes = count(notes) || count((notes as { notes?: unknown[] } | null)?.notes);

  const questions = await safeRead("questions.json");
  const asArray = Array.isArray(questions) ? questions : (questions as { sets?: unknown[] } | null)?.sets;
  stat.questionSets = count(asArray);
  if (Array.isArray(asArray)) {
    stat.questions = asArray.reduce((a: number, s) => a + questionsInSet(s), 0);
  }

  const flashcards = await safeRead("flashcards.json");
  stat.flashcards =
    count(flashcards) || count((flashcards as { flashcards?: unknown[] } | null)?.flashcards);

  return stat;
  })();

  cache.set(slug, work);
  work.catch(() => cache.delete(slug)); // don't pin a failed read forever
  return work;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slugs = (searchParams.get("slugs") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]+$/.test(s))
    .slice(0, 45);

  const stats: Record<string, CourseStat> = {};
  await Promise.all(
    slugs.map(async (slug) => {
      stats[slug] = await statFor(slug);
    }),
  );

  // Corpus counts are committed + immutable between deploys (ADR-021 perf
  // pass, tranche 4.12): CDN-cacheable with bounded staleness, SWR keeps
  // serving through revalidation onto the next deploy's lambda.
  return NextResponse.json({ stats }, { headers: CONTENT_CACHE });
}
