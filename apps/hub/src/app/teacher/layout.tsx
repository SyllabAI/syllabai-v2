import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { TeacherShell } from "@/components/teacher/teacher-shell";

/**
 * Teacher workspace layout — the RBAC affordance for every teacher surface.
 * Core enforces TEACHER/ADMIN server-side on each call; this gate keeps the
 * signed-out / student experience honest instead of rendering shells that
 * would 403 on first interaction.
 *
 * T-TEACH-SHELL-1 (dashboard-redesign kit): the grouped teacher sidebar
 * (TeacherShell) wraps the gate's children — signed-out visitors and
 * students still see the honest sign-in / role prompt, signed-in teachers
 * get the Workspace / Live data / Tools / Demo lens spine on every teacher
 * surface, replacing the ten-tab strip (teacher-nav.tsx, now a no-op).
 */
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
          Loading workspace…
        </div>
      }
    >
      <RequireAuth role="teacher">
        <TeacherShell>{children}</TeacherShell>
      </RequireAuth>
    </Suspense>
  );
}
