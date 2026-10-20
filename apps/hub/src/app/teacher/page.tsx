import type { Metadata } from "next";
import { listCourses } from "@/lib/courses";
import { TeacherClient } from "./teacher-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teacher workspace",
  description:
    "The teacher mode of SyllabAI: add a class, select its subjects, and find every tool and course resource inside it — plus the marking console and class intelligence over live cohort data.",
};

export default async function TeacherPage() {
  const courses = (await listCourses())
    .filter((c) => c.hasBundle)
    .map((c) => ({
      slug: c.slug,
      label: c.label,
      subject: c.subject,
      code: c.code,
      level: c.level,
      // board rides along (absent = the pre-CIE Edexcel rows) — the
      // class-creation picker's board cascade and the class-card eyebrows
      // print the row's real awarding board (trace 1a158596b1569079)
      board: c.board,
    }));

  return <TeacherClient courses={courses} />;
}
