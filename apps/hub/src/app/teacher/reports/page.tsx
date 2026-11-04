import type { Metadata } from "next";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reports · Teacher workspace",
  description:
    "Phase 3 teacher operations: printable per-class summaries plus per-student and per-topic CSV exports over the same live, graded evidence the Class insights page renders. Read-only, teacher-gated.",
};

export default function TeacherReportsPage() {
  return <ReportsClient />;
}
