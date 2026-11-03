import { listCourses } from "@/lib/courses";
import { readSession } from "@/lib/session";
import { DashboardClient } from "./dashboard-client";

export const metadata = {
  title: "Dashboard",
  description: "Your subjects and their spec-anchored resources.",
};

export default async function DashboardPage() {
  // B-2: /dashboard is an account surface — the proxy redirects signed-out
  // requests to /login?next=…, so a session reaching this page is the
  // routing contract's guarantee (readSession() re-reads it defensively;
  // a null here only happens on a fail-closed misconfig, which the proxy
  // already treats as signed-out). The name server-renders the greeting —
  // it used to hydrate in from localStorage after a "Hi there" frame.
  const [courses, session] = await Promise.all([listCourses(), readSession()]);
  return <DashboardClient courses={courses} name={session?.name ?? "there"} />;
}
