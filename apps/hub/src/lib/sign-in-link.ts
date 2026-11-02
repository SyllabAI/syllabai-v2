"use client";

/**
 * The one sign-in link builder (frontend-flow audit A-3).
 *
 * Every "Sign in" affordance serialises where the user was into ?next —
 * exactly what RequireAuth's prompt already did (hub UI audit P2-4) — so
 * the login page's nextDestination() returns the user to the surface they
 * left instead of dumping them at their dashboard. Bare /login links were
 * the bug: a student deep in a past-paper viewer who used the header link
 * never found the paper again.
 *
 * The query rides along (the hub is deep-link-heavy: ?spec= anchors, the
 * KG picker's ?course=) via useCurrentSearch, which reads window.location
 * through a useSyncExternalStore snapshot instead of useSearchParams — the
 * app shell renders sign-in links on every statically prerendered page,
 * and this keeps it out of the Suspense-for-search-params tax. Known limit
 * (accepted): a same-path, query-only client navigation does not re-render
 * the shell, so the href can carry the previous query — ?next is context
 * for the login page, never a gate.
 */
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

export function signInHref(pathname: string, search: string): string {
  const next = search ? `${pathname}?${search}` : pathname;
  const params = new URLSearchParams({ next });
  return `/login?${params.toString()}`;
}

function subscribe(onChange: () => void) {
  // back/forward re-read immediately; Link navigations re-read on the
  // render usePathname() schedules below (pushState fires no event)
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function getSnapshot(): string {
  return window.location.search; // primitive — Object.is-stable between changes
}

function getServerSnapshot(): string {
  return "";
}

export function useCurrentSearch(): string {
  // a client-side route change re-renders this component; the store then
  // re-reads the snapshot and the settled href picks up the new query
  usePathname();
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
