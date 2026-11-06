import {
  CloudCheck,
  Database,
  FlaskConical,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProvenanceBadge — the kit's ONE data-source badge (dashboard-redesign
 * kit, T-DASH-SKIN-1).
 *
 * The dashboard surfaces had grown five ad-hoc provenance chips ("Live ·
 * core", "This browser", "from your account", "from this device", the
 * demo lens's SAMPLE disclosure) — same job, five anatomies, drifting
 * type scales. This badge is the one meaning per kind (audit F8's law,
 * one icon one meaning), with the copy and tint fixed here so no surface
 * can improvise its own version. The kind, not the wording, is the API.
 */
export type ProvenanceKind = "live-core" | "device" | "account" | "demo-lens";

const KINDS: Record<
  ProvenanceKind,
  { label: string; icon: LucideIcon | null; classes: string; title: string }
> = {
  /** database-backed, roster-managed — the CoreClassCard contract */
  "live-core": {
    label: "Live · core",
    icon: ShieldCheck,
    classes: "border-success/30 bg-success/10 text-success",
    title: "Database-backed and managed on the Classes surface",
  },
  /** browser-local by design — the honest container, not a downgrade */
  device: {
    label: "This browser",
    icon: Database,
    classes: "border bg-background/90 text-muted-foreground",
    title: "Browser-local by design — not synced to your account",
  },
  /** the cross-device account trail (CloudCheck already means this on
   *  the student dashboard's resume card) */
  account: {
    label: "From your account",
    icon: CloudCheck,
    classes: "border-primary/30 bg-primary/5 text-primary",
    title: "From your SyllabAI account — it follows you across devices",
  },
  /** the demo lens's disclosed sample cohort */
  "demo-lens": {
    label: "Demo · sample cohort",
    icon: FlaskConical,
    classes: "border-sim/30 bg-sim/10 text-sim",
    title: "Sample cohort, disclosed on-page — not live data",
  },
};

export function ProvenanceBadge({
  kind,
  className,
}: {
  kind: ProvenanceKind;
  className?: string;
}) {
  const k = KINDS[kind];
  const Icon = k.icon;
  return (
    <span
      title={k.title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        k.classes,
        className,
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {k.label}
    </span>
  );
}
