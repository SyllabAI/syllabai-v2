import type { Metadata } from "next";
import { ShowcaseLanding } from "@/components/demo/showcase-landing";
import { SHOWCASE_DEMO_ENABLED } from "@/lib/demo/showcase";

/**
 * T-DEMO-SHOWCASE-1 — the showcase re-entry surface.
 *
 * `/` serves the same landing for anonymous visitors, but the proxy
 * redirects a signed-in session from `/` to the role home (A-1), so once
 * a demo session is running this route is how you get back — it is also
 * the role switcher (each card re-mints the demo session for its role).
 * `/demo` is deliberately outside src/proxy.ts's matcher: it must answer
 * with a session, not bounce.
 *
 * While SHOWCASE_DEMO_ENABLED is false this page renders a plain
 * signed-out notice (the route itself stays harmless — no session can be
 * minted while the flag is off).
 */

export const metadata: Metadata = {
  title: "Showcase",
  description:
    "Explore SyllabAI as a demo student or demo teacher — no account needed.",
};

export default function DemoPage() {
  if (!SHOWCASE_DEMO_ENABLED) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          The showcase isn't running
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Demo sessions are disabled. Sign in with your own account instead.
        </p>
      </div>
    );
  }
  return <ShowcaseLanding />;
}
