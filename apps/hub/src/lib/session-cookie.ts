"use client";

/**
 * Client mirror for the signed routing cookie (frontend-flow audit A-2,
 * Tier 1 phase 1).
 *
 * The auth session is localStorage-based (lib/api.ts); the SERVER needs a
 * mirror of "who is signed in" to route (proxy.ts). This module pushes and
 * pulls that mirror:
 *
 *   - mirrorRoutingSession(user) — called by the login page right after
 *     setSession(), AWAITED before router.push so the cookie is on the
 *     first routed request (a fire-and-forget mirror would race the proxy
 *     and bounce a fresh teacher back to /login).
 *   - unmirrorRoutingSession() — fire-and-forget DELETE; clearSession()
 *     in lib/api.ts calls it, which covers sign-out AND the 401
 *     session-expired path without making clearSession async.
 *
 * Role mapping mirrors lib/identity.ts's rule for core's UserView.roles:
 * TEACHER/ADMIN → "teacher", everything else a student. The name fallback
 * mirrors identity.ts's nameFromEmail. This module deliberately imports
 * nothing from lib/api.ts or lib/identity.ts — the dependency direction is
 * api.ts → here, never here → api.ts (a cycle would make the mirror fire
 * before the store it mirrors is even loaded).
 */
import type { SessionRole } from "@/lib/session";

export interface RoutingUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

function routingRole(roles: string[]): SessionRole {
  return roles.some((r) => r === "TEACHER" || r === "ADMIN")
    ? "teacher"
    : "student";
}

/** Same rule as identity.ts's nameFromEmail — kept local to avoid a
 * session-cookie → identity → api import cycle. */
function displayNameFor(user: RoutingUser): string {
  const trimmed = user.displayName?.trim();
  if (trimmed) return trimmed;
  const local = user.email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._\-+]+/g, " ").trim();
  return cleaned || "there";
}

export async function mirrorRoutingSession(user: RoutingUser): Promise<void> {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sub: user.id,
      name: displayNameFor(user),
      email: user.email,
      role: routingRole(user.roles),
    }),
  });
  if (!response.ok) {
    // Loud, honest failure: auth succeeded but the server-side session
    // mirror did not — the routing gates (e.g. /teacher) would disagree
    // with the signed-in state until this succeeds. Surfaced through the
    // login page's existing error banner; a retry is the fix.
    throw new Error("Session setup failed — please try again.");
  }
}

export async function unmirrorRoutingSession(): Promise<void> {
  try {
    await fetch("/api/session", { method: "DELETE" });
  } catch {
    // best effort — the cookie is SameSite=Lax and expires on its own;
    // a network blip while signing out must not block sign-out
  }
}
