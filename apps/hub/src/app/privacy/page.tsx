import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "What SyllabAI collects, what it stores, and how a student, parent or school can have data removed.",
};

/**
 * T-HUB-AUDITFIX-1 run-005 (2026-11-08 design audit P9): the hub serves
 * school-age students and had NO privacy page. This is the approved
 * SCAFFOLD: standard sections written from the product's own published
 * posture (the footer pledge, the provenance register, the theme stored
 * in the browser) — explicitly PENDING LEGAL REVIEW, claiming nothing a
 * counsel pass hasn't settled. Facts only the operator knows (contact
 * addresses, retention windows, processor list) are marked [pending].
 */
function PendingBanner() {
  return (
    <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-xs leading-relaxed text-warn-ink">
      <strong className="font-semibold">Draft — pending legal review.</strong> This
      page is a draft that still needs a legal review. Items marked{" "}
      <span className="font-mono">[pending]</span> must be filled in during that
      review — do not treat this page as the final policy until then.
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Privacy notice</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Plain statements of what SyllabAI stores and why. Last updated:{" "}
        <time dateTime="2026-11-09">9 November 2026</time>.
      </p>

      <div className="mt-4">
        <PendingBanner />
      </div>

      <div className="mt-6 space-y-5 text-sm leading-relaxed">
        <section>
          <h2 className="text-sm font-semibold">Who this page is for</h2>
          <p className="mt-1 text-muted-foreground">
            SyllabAI is built for school students revising for Edexcel and
            Cambridge International qualifications — which means many of our
            users are minors. Teachers and parents can reach every control on
            this page on a student&apos;s behalf.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">What we collect</h2>
          <p className="mt-1 text-muted-foreground">
            <strong>Account basics:</strong> the name, email address and role
            (student / teacher) you or your school give us when signing in.{" "}
            <strong>Study activity:</strong> your progress, marks, saved
            questions and flashcard scheduling, so the dashboard and tutor work
            from what you have actually studied.{" "}
            <strong>Tutor questions:</strong> what you type into the AI tutor,
            processed to generate an answer. We do not sell personal data or
            run advertising trackers. [pending: full processor/subprocessor
            list and retention windows]
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Cookies and local storage</h2>
          <p className="mt-1 text-muted-foreground">
            The hub stores only what it needs to run: an essential session
            cookie that keeps you signed in, and a small local-storage entry
            that remembers your chosen theme on this device. No advertising or
            cross-site tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Accounts for users under 16</h2>
          <p className="mt-1 text-muted-foreground">
            Where a student is under 16, an account should be created or
            approved by a school or a parent, and the school or parent stands
            in for the student&apos;s consent. [pending: exact minimum-age
            wording per jurisdiction, to be settled in legal review.] A
            parent, guardian or school can ask for a minor&apos;s account and
            study data to be removed at any time — see contact below.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Your choices and removal</h2>
          <p className="mt-1 text-muted-foreground">
            You can ask for a copy of your study data, a correction, or full
            deletion of your account and its data. Schools can request removal
            for any of their students. We action verified requests within a
            reasonable window. [pending: committed response window and
            verification procedure]
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Contact</h2>
          <p className="mt-1 text-muted-foreground">
            Privacy questions, access requests and removal requests:{" "}
            <span className="font-mono">[pending: legal contact address]</span>.
            Until the legal review completes, use the contact route your school
            or account email received when the pilot started.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Related</h2>
          <p className="mt-1 text-muted-foreground">
            How the material itself may be used:{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
              Terms of use
            </Link>{" "}
            · how content is checked:{" "}
            <Link href="/about/provenance" className="underline underline-offset-2 hover:text-foreground">
              the provenance register
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
