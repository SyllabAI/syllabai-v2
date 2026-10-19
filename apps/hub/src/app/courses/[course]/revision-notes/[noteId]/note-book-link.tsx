"use client";

/**
 * T-MIG-133 band 133j — the note reader's STUDENT BOOK back-link (operator
 * go "go mapping", trace 1a156004911ee41d).
 *
 * CLIENT-side join by design (the /api/notes digest precedent: "the panel
 * joins locally — no extra round trip"): this note page is prerendered at
 * build for the pilot course (static-params.ts), so a server-side books
 * fetch would either bake a stale registry snapshot into static HTML or
 * force every note page dynamic. Instead the join runs in the browser
 * against the LIVE public books surface (the /api/v1/content/books flip
 * row, band 133j) using the PURE join law (lib/books-notes.ts — exact
 * spineCode intersection, census of record: 87/112 chem notes map to
 * exactly one chapter).
 *
 * Honest-absent law: a course with no published book, a fetch hiccup, or
 * an orphan note (spec codes in no chapter LO box — census: 25/112) renders
 * NOTHING here. Never a nearest-guess link, never a skeleton, never an
 * error surface — the block simply does not exist for that note.
 *
 * Chapter-level landing: ?chapter=<key> (the shelf mount shape) opens the
 * chapter's page-exact slice at its start — a spec-level join has no honest
 * page claim inside the chapter, so the link lands at the chapter, exactly
 * like the shelf's own rows.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { z } from "zod";

import { apiPath } from "@/lib/api";
import { bookChaptersForNote } from "@/lib/books-notes";

const shelfMirror = z
  .object({ documentId: z.string().min(1), title: z.string().min(1) })
  .passthrough();

const chapterMirror = z.object({
  documentId: z.string().min(1),
  chapterKey: z.string().min(1),
  chapterIndex: z.number().int().min(1),
  unitIndex: z.number().int().min(1).nullable(),
  title: z.string().min(1),
  unitTitle: z.string().nullable(),
  specCodes: z
    .object({ spineCode: z.string().min(1) })
    .passthrough()
    .array(),
});

export function NoteBookLinks({
  course,
  specPointCodes,
}: {
  course: string;
  specPointCodes: string[];
}) {
  const [matches, setMatches] = useState<
    { documentId: string; chapterKey: string; chapterIndex: number; unitIndex: number | null; title: string; unitTitle: string | null }[]
  >([]);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    if (!specPointCodes || specPointCodes.length === 0) {
      setDead(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const shelfRes = await fetch(
          apiPath(`/api/v1/content/books?courseId=${encodeURIComponent(course)}`),
          { headers: { Accept: "application/json" } },
        );
        if (!shelfRes.ok) throw new Error("shelf");
        const shelf = z.array(shelfMirror).parse(await shelfRes.json());
        if (shelf.length === 0) throw new Error("no-book");
        const primary = shelf[0];
        const chRes = await fetch(
          apiPath(`/api/v1/content/books/${encodeURIComponent(primary.documentId)}/chapters`),
          { headers: { Accept: "application/json" } },
        );
        if (!chRes.ok) throw new Error("chapters");
        const chapters = z.array(chapterMirror).parse(await chRes.json());
        const joined = bookChaptersForNote({ specPointCodes }, chapters);
        if (!cancelled) setMatches(joined.slice(0, 3));
      } catch {
        if (!cancelled) setDead(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [course, specPointCodes]);

  if (dead || matches.length === 0) return null;

  return (
    <section aria-label="In the student book" className="pt-2">
      {matches.map((c) => (
        <Link
          key={c.chapterKey}
          href={`/courses/${course}/books/${c.documentId}?chapter=${encodeURIComponent(c.chapterKey)}`}
          className="group flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:border-primary/40"
        >
          <BookOpen className="size-4 text-primary" aria-hidden />
          <span className="text-[13px] font-medium">
            Student book — {c.unitTitle ? `${c.unitTitle}: ` : ""}ch. {c.chapterIndex} {c.title}
            <span className="block text-xs font-normal text-muted-foreground">
              Open the matching chapter of the student book
            </span>
          </span>
        </Link>
      ))}
    </section>
  );
}
