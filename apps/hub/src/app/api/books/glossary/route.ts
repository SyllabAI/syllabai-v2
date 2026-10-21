import { NextRequest, NextResponse } from "next/server";

import { coreBaseUrl } from "@/lib/core-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * T-BOOK-007 — the glossary proxy. The CLIENT speaks the hub course slug;
 * the SUBJECT code of record (book_glossary_terms.subject_code) resolves
 * here via the one-line-per-course registry (the 133k rollout law — the
 * same shape as lib/books-registry.ts). Public-read passthrough (the VALIDATED
 * gate is the api's; terms are corpus content, zero PII).
 */

/** Courses whose glossary subject code is registered (one line per course). */
const COURSE_SUBJECT: Readonly<Record<string, string>> = {
  "igcse-chemistry-19": "4ch1",
};

export async function GET(req: NextRequest) {
  const base = coreBaseUrl();
  if (!base) return NextResponse.json({ error: "core_not_configured" }, { status: 503 });
  const course = req.nextUrl.searchParams.get("course") ?? "";
  const subject = COURSE_SUBJECT[course];
  if (subject == null) {
    // a course outside the registry has no glossary — the honest empty, not
    // an error (the popover layer renders no chips)
    return NextResponse.json([]);
  }
  const slugs = req.nextUrl.searchParams.get("slugs");
  const qs = new URLSearchParams({ subject });
  if (slugs != null && slugs.trim() !== "") qs.set("slugs", slugs.trim());
  const res = await fetch(`${base}/api/v1/content/books/glossary?${qs.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = res.ok ? await res.json() : null;
  return NextResponse.json(body ?? [], { status: res.status });
}
