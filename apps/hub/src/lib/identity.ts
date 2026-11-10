"use client";

/**
 * Session identity — core-auth-backed (promotion ADR-029).
 *
 * The Hub authenticates against syllabai-core's AuthController. `@/lib/api`
 * owns the session (localStorage "syllabai.token" + "syllabai.user", written
 * by setSession after login/register); this store derives the role-aware
 * identity surface from it so role-aware surfaces (dashboard greeting,
 * teacher workspace, app shell account menu) keep one simple API.
 *
 * Role mapping: core issues role strings on UserView.roles — TEACHER/ADMIN
 * map to the "teacher" workspace role, everything else is a student.
 *
 * ADR-044 Phase 1 (additive; the frozen mapping above stands UNTOUCHED —
 * editor-ness is a grant row on the v2 api, never a fourth workspace role):
 * the derived identity carries an optional `capabilities` field, populated
 * once per signed-in session from the v2-native GET /api/v1/editor/me (the
 * capability surface of record). It gates the editor-plane surfaces (the
 * Phase 1 per-question edit-history view; the Phase 2 Workbench). The probe
 * is the capability bootstrap — the one documented /editor-plane contact a
 * signed-in session makes; every other editor surface stays identity-gated
 * behind the capability it produces (students and signed-out sessions never
 * contact the WORKBENCH plane). 401/403/network → capabilities stay null
 * (fail-closed, honest); a 401 here NEVER clears the session — this store
 * is not a session authority.
 *
 * Same store pattern as my-subjects.ts / theme-store.ts: module store +
 * useSyncExternalStore, referentially-stable snapshot, custom event for
 * same-tab reactivity + storage event for cross-tab. It also follows the
 * api client's `syllabai:session-expired` event so a 401 anywhere signs
 * the identity surface out in place.
 */
import { useEffect, useSyncExternalStore } from "react";
import { apiPath, clearSession, currentUser, getToken } from "@/lib/api";

export type Role = "student" | "teacher";

/** The editor capability of the ADR-044 grant plane (GET /editor/me 200 body). */
export interface EditorCapability {
  scopes: string[];
}

/** Additive ADR-044 capabilities (identity.ts keeps its two-value workspace
 * role untouched — the frozen mapping stands; ADR-044 §5). */
export interface IdentityCapabilities {
  editor: EditorCapability | null;
}

export interface Identity {
  role: Role;
  name: string;
  email: string;
  signedInAt: string;
  /** ADR-044 Phase 1 — populated by the /editor/me capability bootstrap;
   * undefined until the probe settles (the surfaces treat undefined and
   * null identically: no editor capability, no editor-plane contact). */
  capabilities?: IdentityCapabilities;
}

const IDENTITY_EVENT = "syllabai:identity-changed";
const SESSION_EXPIRED_EVENT = "syllabai:session-expired";

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._\-+]+/g, " ").trim();
  if (!cleaned) return "there";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Signed-in identity derived from the core session; null when signed out. */
function readIdentity(): Identity | null {
  if (typeof window === "undefined") return null;
  const token = getToken();
  const user = currentUser();
  if (!token || !user) return null;
  return {
    role:
      user.roles.some((r) => r === "TEACHER" || r === "ADMIN") ? "teacher" : "student",
    email: user.email,
    name: user.displayName?.trim() ? user.displayName.trim() : nameFromEmail(user.email),
    signedInAt: new Date().toISOString(),
    // ADR-044 Phase 1 (additive): the settled capability cache, if any
    ...(editorCapability !== undefined ? { capabilities: { editor: editorCapability } } : {}),
  };
}

// getSnapshot must return a referentially stable value between store changes
let snapshot: Identity | null = null;

function getSnapshot(): Identity | null {
  const next = readIdentity();
  const changed =
    (next === null) !== (snapshot === null) ||
    (next !== null &&
      snapshot !== null &&
      (next.email !== snapshot.email ||
        next.role !== snapshot.role ||
        // ADR-044: a capability settlement is a store change (the probe
        // dispatches IDENTITY_EVENT when it assigns a new value)
        (next.capabilities?.editor ?? null) !== (snapshot.capabilities?.editor ?? null)));
  if (changed) snapshot = next;
  return snapshot;
}

function getServerSnapshot(): Identity | null {
  return null;
}

function subscribe(onChange: () => void) {
  window.addEventListener(IDENTITY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  // a 401 on any core call clears the session — mirror it on the identity
  // surface so the shell flips back to "Sign in" without a reload
  window.addEventListener(SESSION_EXPIRED_EVENT, onChange);
  return () => {
    window.removeEventListener(IDENTITY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SESSION_EXPIRED_EVENT, onChange);
  };
}

/**
 * Announce a session change (same tab). Call after api.setSession(...) on
 * login/register — cross-tab updates arrive via the storage event.
 */
export function announceSessionChange(): void {
  window.dispatchEvent(new CustomEvent(IDENTITY_EVENT));
}

/** Sign out: clear the core session and notify every identity consumer. */
export function clearIdentity(): void {
  clearSession();
  snapshot = null;
  resetEditorCapability();
  window.dispatchEvent(new CustomEvent(IDENTITY_EVENT));
}

/**
 * Non-hook identity read for store-level sync layers (T-TEACH-001) — the
 * same derivation useIdentity snapshots, callable outside React (the
 * my-courses write-through mirror reads this on its debounce tick).
 */
export function readIdentitySnapshot(): Identity | null {
  return readIdentity();
}

/** Reactive identity for role-aware surfaces. `null` until hydration + when signed out. */
export function useIdentity(): Identity | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  teacher: "Teacher",
};

// ── ADR-044 Phase 1: the editor capability bootstrap (additive) ──────────────
//
// The grant row IS the role (ADR-044 §3) and the hub reads it through the
// v2-native GET /api/v1/editor/me (the capability surface of record, ADR
// §5/§8). One probe per signed-in email per tab session; the settled value
// is referentially stable and feeds the additive `capabilities` field of
// the identity snapshot. The probe is THE documented /editor-plane contact
// a signed-in session makes — it is what makes the capability field exist;
// every other editor surface stays identity-gated behind it. Fail-closed
// everywhere: 401/403/5xx/network all settle to null (no capability), and
// a 401 here NEVER clears the session (this store is not a session
// authority — the api client's own 401 law stays untouched).


let editorCapability: EditorCapability | null | undefined; // undefined = probe not settled yet
let editorProbeForEmail: string | null = null;
let editorProbeInFlight: Promise<void> | null = null;

/** Test hook / sign-out reset: forget the settled capability cache. */
export function resetEditorCapability(): void {
  editorCapability = undefined;
  editorProbeForEmail = null;
  editorProbeInFlight = null;
}

/** The settled editor capability, without React (null = no capability). */
export function readEditorCapability(): EditorCapability | null {
  return editorCapability ?? null;
}

function assignEditorCapability(next: EditorCapability | null, email: string): void {
  const prev = editorCapability === undefined ? null : editorCapability;
  const same =
    (prev === null && next === null) ||
    (prev !== null &&
      next !== null &&
      prev.scopes.length === next.scopes.length &&
      prev.scopes.every((s, i) => s === next.scopes[i]));
  editorProbeForEmail = email;
  if (same) {
    editorCapability = prev; // keep the stable reference — no snapshot churn
    return;
  }
  editorCapability = next;
  window.dispatchEvent(new CustomEvent(IDENTITY_EVENT));
}

/**
 * The pure settlement law (fail-closed) — map a probe verdict to the
 * capability value. Exposed for the pinned tests; the probe's I/O wrapper
 * is the only production caller. 200 + a well-formed EditorMeView body →
 * the capability; every other verdict (401/403/5xx, drifted body) → null.
 */
export function settleEditorCapability(status: number, body: unknown): EditorCapability | null {
  if (status !== 200) return null;
  if (!body || typeof body !== "object") return null;
  const b = body as { editor?: unknown; scopes?: unknown };
  if (b.editor !== true || !Array.isArray(b.scopes)) return null;
  if (!b.scopes.every((s) => typeof s === "string")) return null;
  return { scopes: b.scopes as string[] };
}

/**
 * The capability probe — GET /api/v1/editor/me with the session token.
 * 200 → { editor: true, scopes } (shape-validated, fail-closed); the Boot
 * 401/403 → null; anything else (5xx, network) → null. Signed-out sessions
 * never fire it (the identity-gated law).
 */
export async function probeEditorCapability(): Promise<void> {
  if (typeof window === "undefined") return;
  const identity = readIdentity();
  if (!identity) return; // signed out — the editor plane is never contacted
  if (editorProbeForEmail === identity.email && editorCapability !== undefined) return;
  if (editorProbeInFlight) return editorProbeInFlight;

  editorProbeInFlight = (async () => {
    const email = identity.email;
    try {
      const token = getToken();
      if (!token) {
        assignEditorCapability(null, email);
        return;
      }
      const res = await fetch(apiPath("/api/v1/editor/me"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = res.status === 200 ? ((await res.json()) as unknown) : null;
      // the settlement law is the pure function above (the 401 here does
      // NOT clear the session — this store is not a session authority)
      assignEditorCapability(settleEditorCapability(res.status, body), email);
    } catch {
      // network failure — fail-closed, honest: no capability, no retry storm
      assignEditorCapability(null, email);
    } finally {
      editorProbeInFlight = null;
    }
  })();
  return editorProbeInFlight;
}

/**
 * The app-shell sync hook (the useTeacherStoresSync pattern): probes the
 * editor capability once per signed-in session and re-probes when the
 * signed-in account changes. Signed-out sessions are a no-op; a settled
 * probe short-circuits, so this is never a fetch loop.
 */
export function useEditorCapabilitySync(): void {
  const identity = useIdentity();
  const email = identity?.email ?? null;
  useEffect(() => {
    if (!email) return; // signed out — the editor plane is never contacted
    void probeEditorCapability(); // the probe reads the session itself
  }, [email]); // re-probe on account switch, not on every render
}
