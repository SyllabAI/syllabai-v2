import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Study-use terms",
  description: "What SyllabAI material and AI answers may be used for.",
};

/**
 * T-TUTOR-UX-1 (TU-8): the tutor footer's "study-use terms" link used to
 * point at `/` — a dead end dressed as a policy. This page is the honest
 * destination: short, student-facing statements of what this pilot serves,
 * written from the product's own published posture (the footer statement,
 * the provenance register, the corpus licence fields of record) — not
 * invented legal text. The corpus rights position is under operator/legal
 * review (T-TUTOR-AUDIT-1 H-01/P-01, still open); this page deliberately
 * claims nothing that review hasn't settled and points at the provenance
 * register for sources and licences.
 */
export default function StudyUsePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Study-use terms</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Plain statements of what you may do with SyllabAI and its material
        during the pilot. The sources behind every course are listed in the{" "}
        <Link href="/about/provenance" className="underline underline-offset-2 hover:text-foreground">
          provenance register
        </Link>
        .
      </p>

      <div className="mt-6 space-y-4 text-sm leading-relaxed">
        <section>
          <h2 className="text-sm font-semibold">What SyllabAI is for</h2>
          <p className="mt-1 text-muted-foreground">
            Personal study and revision. Use the notes, exam questions,
            flashcards and the tutor to learn and practise for your own exams.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">What we ask in return</h2>
          <p className="mt-1 text-muted-foreground">
            Don&apos;t copy the course material somewhere else or republish it —
            the notes, questions and papers belong to their sources, and the
            pilot runs on those sources&apos; terms. Sharing your own answers,
            notes-in-your-own-words or feedback is fine.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">AI answers can be wrong</h2>
          <p className="mt-1 text-muted-foreground">
            The tutor answers only from the course&apos;s own checked material
            and cites what it used — but it can still make mistakes. Check the
            citations before you rely on an answer, especially near an exam.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Your conversations</h2>
          <p className="mt-1 text-muted-foreground">
            Your tutor conversations are yours. Clearing them from a browser
            clears that browser&apos;s copy; conversations tied to your account can
            be deleted from the conversation list, permanently.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Sources and licences</h2>
          <p className="mt-1 text-muted-foreground">
            Every course names where its content comes from and under which
            licence it serves — see the{" "}
            <Link href="/about/provenance" className="underline underline-offset-2 hover:text-foreground">
              provenance register
            </Link>
            . If you believe material is served in error, contact the operator
            through the account that invited you and it will be pulled while
            it&apos;s checked.
          </p>
        </section>
      </div>
    </div>
  );
}
