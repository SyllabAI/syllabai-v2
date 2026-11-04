import { redirect } from "next/navigation";

/**
 * Teach-Me → Teach Genie (T-TEACHGENIE-001). The lane was reskinned to the
 * MathsGenie Teach Genie experience; this route is the permanent handoff so
 * committed links (course tiles, provenance notes, bookmarks) stay alive.
 * The target page owns the flags gate — a non-pilot course lands on the
 * same honest "import pending" state it saw here.
 */
export default async function TeachMeRedirect({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course } = await params;
  redirect(`/courses/${encodeURIComponent(course)}/teach-genie`);
}
