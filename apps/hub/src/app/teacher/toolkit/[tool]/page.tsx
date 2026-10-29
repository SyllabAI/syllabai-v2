import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolkitToolClient } from "./client";
import { toolkitToolMeta } from "@/components/teaching-toolkit/tool-meta";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}): Promise<Metadata> {
  const { tool } = await params;
  const meta = toolkitToolMeta(tool);
  return {
    title: meta ? `${meta.title} · Teacher workspace` : "Teaching Toolkit · Teacher workspace",
    description:
      meta?.subtitle ??
      "The four AI generators, grounded in each class's subject — the picked class resolves it server-side.",
  };
}

export default async function ToolkitToolPage({
  params,
  searchParams,
}: {
  params: Promise<{ tool: string }>;
  searchParams: Promise<{ class?: string; resourceId?: string }>;
}) {
  const { tool } = await params;
  const sp = await searchParams;
  if (!toolkitToolMeta(tool)) notFound();
  return (
    <ToolkitToolClient
      tool={toolkitToolMeta(tool)!.id}
      initialClassId={sp.class ?? null}
      initialResourceId={sp.resourceId ?? null}
    />
  );
}
