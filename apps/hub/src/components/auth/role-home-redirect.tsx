"use client";

/**
 * Role-home redirect — the client-side half of audit A-1 (Tier 0).
 *
 * Signed-in users who open the marketing hero are replaced to their role
 * home (lib/role-home.ts) once identity hydrates: the returning user's
 * session starts in the product, not on the pitch. Signed-out visitors see
 * the hero unchanged, and a signed-in user can still read the marketing
 * page during the brief pre-hydration frame — the cookie session +
 * middleware land this decision server-side before first paint in Tier 1
 * (A-2).
 *
 * Renders nothing; mount it once in the `/` route.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIdentity } from "@/lib/identity";
import { roleHome } from "@/lib/role-home";
import { useSettled } from "@/lib/use-settled";

export function RoleHomeRedirect() {
  const router = useRouter();
  const identity = useIdentity();
  const settled = useSettled();

  useEffect(() => {
    // replace, not push: the hero must not become a back-button trap
    if (settled && identity) router.replace(roleHome(identity));
  }, [settled, identity, router]);

  return null;
}
