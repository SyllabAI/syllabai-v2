"use client";

/**
 * Class id dispatcher (HUB-TEACHER-DASH wave 1; T-TEACH-004 parity pass) —
 * /teacher/classes/[id] serves TWO honest class concepts, and this client
 * picks without ever blurring them:
 *
 *   - a hub-local class container (lib/teacher/my-classes.ts, browser-local
 *     like the student's subject roster) renders LocalClassWorkspace — the
 *     operator's directive made physical: all the tools and course
 *     resources for the class's selected subjects, per-subject sections;
 *   - anything else is a CORE class id (the RBAC-backed roster workspace)
 *     and falls through to the existing ClassDetailClient untouched.
 *
 * T-TEACH-004: the core workspace gains the same course-resource parity
 * (resources incl. the past-papers archive + corpus-local teacher tools,
 * scoped to the class's ONE course), so the server-passed paper counts ride
 * down to it — the local container keeps counting through /api/course-stats
 * alone (its scope is unchanged).
 */

import { ClassDetailClient } from "./class-detail-client";
import { LocalClassMissing, LocalClassWorkspace } from "./class-workspace-local";
import { useMyClasses } from "@/lib/teacher/my-classes";
import type { TeacherCourseLite } from "../../teacher-client";

export function ClassWorkspaceDispatcher({
  classId,
  courses,
  paperCounts,
}: {
  classId: string;
  courses: TeacherCourseLite[];
  /** registry slug → corpus paper count (server-computed from the committed
   *  past-papers index; consumed by the core class workspace only) */
  paperCounts: Record<string, number>;
}) {
  const { has } = useMyClasses();
  // hydration note: useSyncExternalStore renders the SERVER snapshot (empty
  // roster) through hydration and re-renders with the client snapshot after
  // mount — a core class id resolves identically on both passes (never in
  // the local store), and a local id swaps in after hydration, no mismatch.
  // A "local-" id that the store does not know is a removed/expired container
  // — it must NEVER fall through to the core client (a core fetch for a
  // browser-local id would be a category error); it gets the honest
  // missing-class card instead.
  if (classId.startsWith("local-")) {
    return has(classId) ? (
      <LocalClassWorkspace classId={classId} courses={courses} />
    ) : (
      <LocalClassMissing />
    );
  }
  return <ClassDetailClient classId={classId} courses={courses} paperCounts={paperCounts} />;
}
