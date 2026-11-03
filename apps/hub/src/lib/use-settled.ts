"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Hydration flag without setState-in-effect: false on the server + first
 * hydration render, true on every settled client render. Shared by the
 * client-side gates that must not act on the server snapshot (RequireAuth's
 * quiet loader, the hero's role-home redirect, the sign-in link builder's
 * query attach in lib/sign-in-link.ts).
 */
export function useSettled(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
