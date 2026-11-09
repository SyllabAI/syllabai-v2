import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The ground rules for using SyllabAI: accounts, acceptable use, and the honest limits of pilot content.",
};

/**
 * T-HUB-AUDITFIX-1 run-005 (2026-11-08 design audit P9): terms scaffold,
 * PENDING LEGAL REVIEW — same posture as the privacy scaffold. The
 * study-use page (T-TUTOR-UX-1 TU-8) already states what the material may
 * be used for; this page links to it rather than duplicating it, and adds
 * the account and acceptable-use ground rules.
 */
function PendingBanner() {
  return (
    <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-xs leading-relaxed text-warn-ink">
      <strong className="font-semibold">Scaffold pending legal review.</strong> This
      page was prepared as part of the design audit fix lane and still needs a
      counsel pass before it is treated as the policy of record — do not
      publish this URL as final until that pass lands.
    </div>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Terms of use</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The ground rules for using SyllabAI. Last updated:{" "}
        <time dateTime="2026-11-09">9 November 2026</time>.
      </p>

      <div className="mt-4">
        <PendingBanner />
      </div>

      <div className="mt-6 space-y-5 text-sm leading-relaxed">
        <section>
          <h2 className="text-sm font-semibold">The service</h2>
          <p className="mt-1 text-muted-foreground">
            SyllabAI is a revision hub for Edexcel and Cambridge International
            qualifications: specification-mapped notes, exam questions,
            flashcards, past papers and a grounded AI tutor. It is offered as
            a pilot — features are labelled honestly (including a visible{" "}
            <em>coming soon</em> marker where something is not ready yet) and
            the service may change as the pilot develops.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">What the material may be used for</h2>
          <p className="mt-1 text-muted-foreground">
            Personal study and revision. The short, student-facing statements
            of allowed use — including not republishing the course material —
            live on the{" "}
            <Link href="/about/study-use" className="underline underline-offset-2 hover:text-foreground">
              study-use terms
            </Link>{" "}
            page, and the sources and licences behind every course are listed
            in the{" "}
            <Link href="/about/provenance" className="underline underline-offset-2 hover:text-foreground">
              provenance register
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Accounts</h2>
          <p className="mt-1 text-muted-foreground">
            Keep your sign-in details private and use your real name and email
            so your school can find your account. Where a student is under 16,
            the account should be created or approved by a school or a parent —
            see the{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              privacy notice
            </Link>{" "}
            for what that means in practice. Do not use the service to
            impersonate anyone else.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Acceptable use</h2>
          <p className="mt-1 text-muted-foreground">
            Use the tutor and practice tools to learn. Don&apos;t try to break
            the service, scrape it at scale, resell access, or put the content
            somewhere else. We can pause accounts that put the service or other
            students at risk. [pending: full acceptable-use schedule, to be
            settled in legal review]
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Content and accuracy</h2>
          <p className="mt-1 text-muted-foreground">
            Every note, question and flashcard is written against the official
            specification and checked before it ships, and anything not ready
            is marked as coming soon. That is the honest limit: the content is
            provided for study support without warranty, and your teacher and
            the exam board&apos;s own materials remain the authority for your
            exams.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Contact</h2>
          <p className="mt-1 text-muted-foreground">
            Questions about these terms: <span className="font-mono">[pending: legal contact address]</span>.
          </p>
        </section>
      </div>
    </div>
  );
}
