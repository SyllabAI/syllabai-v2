import { listCourses } from "@/lib/courses";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardClient } from "./dashboard-client";

export const metadata = {
  title: "Dashboard",
  description: "Your subjects and their spec-mapped resources.",
};

export default async function DashboardPage() {
  // B-2: /dashboard is an account surface — the proxy redirects signed-out
  // requests to /login?next=…, so a session reaching this page is the
  // routing contract's guarantee. (The greeting is the neutral "Welcome
  // back": the routing session carries only the account handle — initials
  // and a code — not a display name; UX review 2026-11-04. The old
  // readSession/name pass rendered that handle as the h1.)
  const courses = await listCourses();
  // T-DASH-SIDEBAR-001: the persistent sidebar chrome wraps the dashboard —
  // AppShell marks /dashboard full-bleed and the shell owns the layout
  // (aside + content column), the course layout's contract exactly.
  return (
    <DashboardShell courses={courses}>
      <DashboardClient courses={courses} />
    </DashboardShell>
  );
}
