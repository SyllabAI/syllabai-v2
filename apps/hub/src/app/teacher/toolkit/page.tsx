import type { Metadata } from "next";
import { ToolkitClient } from "./toolkit-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teaching Toolkit · Teacher workspace",
  description:
    "The four AI generators — lesson plans, rubrics, schemes of work and the learning coach — matched to each class's subject. The picked class sets the subject automatically; there is no subject picker.",
};

export default async function TeacherToolkitPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; tool?: string; resourceId?: string }>;
}) {
  const params = await searchParams;
  return (
    <ToolkitClient
      initialClassId={params.class ?? null}
      initialResourceId={params.resourceId ?? null}
    />
  );
}
