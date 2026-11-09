import { NextResponse } from "next/server";
import { SHOWCASE_DEMO_ENABLED, showcaseAccountFor } from "@/lib/demo/showcase";

/**
 * T-DEMO-SHOWCASE-1 — the showcase demo-session mint (see
 * lib/demo/showcase.ts for the temporary-scope contract and kill-switch).
 *
 * GET /api/demo/login?role=student|teacher
 *
 * Performs the SAME login the sign-in page performs — POST
 * {v2}/api/v1/auth/login — but server-side, with the demo account's
 * credentials, which never reach the browser. The response is the
 * AuthResponse the client already knows (lib/api.ts setSession), so the
 * showcase landing runs the exact login-client dance afterwards:
 * setSession → announceSessionChange → mirrorRoutingSession → route push.
 *
 * Hard limits, on purpose:
 *   - the flag off answers 404 — the route stops existing, effectively;
 *   - the role is allow-listed; there is no credential input anywhere;
 *   - no-store: a demo session is never served from a cache;
 *   - the authenticated user's email is checked against the requested
 *     account, so a drifted/misconfigured credential pair fails loudly
 *     instead of handing out the wrong identity.
 */

export const dynamic = "force-dynamic";

/** Same resolution as next.config.ts's V2_ORIGIN — the bare v2 API origin. */
const V2_ORIGIN = (process.env.NEXT_PUBLIC_API_V2_BASE_URL ?? "")
  .replace(/\/$/, "")
  .replace(/\/api\/v1$/, "");

interface AuthResponse {
  accessToken?: unknown;
  tokenType?: unknown;
  user?: { email?: unknown; [key: string]: unknown };
}

export async function GET(request: Request) {
  if (!SHOWCASE_DEMO_ENABLED) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const account = showcaseAccountFor(new URL(request.url).searchParams.get("role"));
  if (!account) {
    return NextResponse.json({ error: "Unknown demo role." }, { status: 400 });
  }
  if (!V2_ORIGIN) {
    return NextResponse.json(
      { error: "The API origin is not configured for the demo session." },
      { status: 500 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${V2_ORIGIN}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "The demo sign-in couldn't reach the API — try again." },
      { status: 502 },
    );
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "The demo sign-in failed — try again." },
      { status: 502 },
    );
  }

  const auth = (await upstream.json().catch(() => null)) as AuthResponse | null;
  if (
    !auth ||
    typeof auth.accessToken !== "string" ||
    typeof auth.user?.email !== "string" ||
    auth.user.email.toLowerCase() !== account.email.toLowerCase()
  ) {
    // A 200 from the API that isn't the requested demo identity is a
    // misconfiguration, not a session — fail closed.
    return NextResponse.json(
      { error: "The demo sign-in failed — try again." },
      { status: 502 },
    );
  }

  return NextResponse.json(auth, {
    headers: { "Cache-Control": "no-store" },
  });
}
