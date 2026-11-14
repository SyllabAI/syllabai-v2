"use client";

/**
 * T-DEMO-SHOWCASE-1 — the temporary showcase landing (see
 * lib/demo/showcase.ts for the temporary-scope contract and kill-switch).
 *
 * Rendered at `/` (graft in app/page.tsx) and `/demo` (re-entry, also the
 * role switcher once a demo session is running — the proxy redirects a
 * signed-in session away from `/`, and /demo is deliberately outside the
 * proxy matcher so it stays reachable).
 *
 * The button runs the same dance the sign-in page runs (login-client.tsx):
 * mint the demo session server-side (credentials never reach the browser),
 * setSession → announceSessionChange → AWAIT mirrorRoutingSession → hard
 * navigate. AWAIT matters: a fire-and-forget mirror races the proxy and
 * bounces a fresh teacher back to /login (the A-2 lesson, kept verbatim).
 *
 * T-HUBFIX-SIGNIN-NAV-RACE — why the LAST step is a hard navigation and
 * not router.push: the signed-out landing's quick-nav <Link>s prefetch
 * the gated routes, and the proxy answers those prefetches with the 307
 * sign-in redirect — which the App Router caches under the DESTINATION's
 * key. Every later client-side navigation to /dashboard or /teacher
 * (push OR <Link>, even with the fresh cookie aboard) replays that cached
 * redirect and lands the just-signed-in visitor on /login?next=… — the
 * "pick a dashboard and you're in" contract dead on arrival (observed
 * live in production, both roles, on the demo CTA AND the login page's
 * "Go to my dashboard" link; a full document load was always fine). A
 * hard navigation bypasses the client router cache entirely: the proxy
 * sees the cookie and the dashboard renders. The one-shot full load is
 * the correct price for a deterministic "you're in".
 *
 * Voice law (T-UX-COPY-SWEEP): concrete nouns, no taglines, no internal
 * vocabulary. aria-labels and real buttons kept (agent experience).
 */
import { useState } from "react";
import Link from "next/link";
import { Atom, ClipboardList, GraduationCap, Loader2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AigniteBadge } from "@/components/brand/aignite-badge";
import { setSession } from "@/lib/api";
import { announceSessionChange, useIdentity } from "@/lib/identity";
import { mirrorRoutingSession } from "@/lib/session-cookie";
import type { AuthResponse } from "@/lib/types";

type DemoRole = "student" | "teacher";

const DEMO_CARDS: {
  role: DemoRole;
  icon: typeof GraduationCap;
  title: string;
  desc: string;
  bullets: string[];
  cta: string;
  destination: string;
}[] = [
  {
    role: "student",
    icon: GraduationCap,
    title: "Student dashboard",
    desc: "The full learner view, signed in as a demo student.",
    bullets: [
      "Revision notes and flashcards mapped to the spec",
      "Exam-style questions with marking and attempt history",
      "A tutor that cites the specification for every answer",
    ],
    cta: "Open the student dashboard",
    destination: "/dashboard",
  },
  {
    role: "teacher",
    icon: ClipboardList,
    title: "Teacher workspace",
    desc: "The full teacher view, signed in as a demo teacher.",
    bullets: [
      "Classes with a spec-point mastery heatmap",
      "Assignments and Target Tests in two clicks",
      "Content validation before anything reaches students",
    ],
    cta: "Open the teacher workspace",
    destination: "/teacher",
  },
];

async function mintDemoSession(role: DemoRole): Promise<AuthResponse> {
  const response = await fetch(`/api/demo/login?role=${role}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("The demo session couldn't start — try again in a moment.");
  }
  return (await response.json()) as AuthResponse;
}

export function ShowcaseLanding() {
  const identity = useIdentity();
  const [busyRole, setBusyRole] = useState<DemoRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enter(role: DemoRole, destination: string) {
    setBusyRole(role);
    setError(null);
    try {
      const auth = await mintDemoSession(role);
      setSession(auth);
      announceSessionChange();
      // AWAITED before the hard navigation — the A-2 race law (see header);
      // the navigation itself is a full load, NOT router.push (the cached
      // signed-out redirect replay, T-HUBFIX-SIGNIN-NAV-RACE).
      await mirrorRoutingSession(auth.user);
      window.location.assign(destination);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The demo session couldn't start — try again in a moment.");
      setBusyRole(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6.75rem)] w-full max-w-4xl flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Atom className="size-4" aria-hidden />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">SyllabAI Hub</span>
        <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">Showcase</span>
      </div>

      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Welcome to SyllabAI
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        This is a live showcase. Pick a dashboard below and you're in — no
        account needed. Demo sessions are real accounts, so anything you do
        here is saved.
      </p>

      {/* T-BRAND-AIGNITE-101 — the mandatory buildathon sticker, prominent on
          the showcase's first screen (the judges' entry point); the AppShell
          strip carries it on every other surface. The min-h above now also
          subtracts that strip's h-11 so the landing still fills the viewport
          exactly. */}
      <div className="mt-6">
        <AigniteBadge className="h-14 w-auto drop-shadow-sm sm:h-16" />
      </div>

      {identity && (
        <p className="mt-4 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          You're browsing as{" "}
          <span className="font-medium text-foreground">{identity.name}</span> (
          {identity.role}). Pick a card to switch — the demo session follows
          the role you open.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2" role="group" aria-label="Choose a dashboard to explore">
        {DEMO_CARDS.map((card) => {
          const busy = busyRole === card.role;
          return (
            <section
              key={card.role}
              aria-label={card.title}
              className="flex flex-col rounded-xl border bg-card p-6 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <card.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">{card.title}</h2>
                  <p className="text-sm text-muted-foreground">{card.desc}</p>
                </div>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {card.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="leading-relaxed">{bullet}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full gap-2"
                disabled={busyRole !== null}
                onClick={() => enter(card.role, card.destination)}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  <>{card.cta}</>
                )}
              </Button>
            </section>
          );
        })}
      </div>

      <p className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
          Student demo · Teacher demo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden />
          Sessions ride the same sign-in path as every account.
        </span>
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-2"
        >
          Sign in with your own account instead
        </Link>
      </p>
    </div>
  );
}
