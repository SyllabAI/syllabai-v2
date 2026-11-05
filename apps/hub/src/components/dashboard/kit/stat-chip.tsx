import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TINTS, type Tone } from "./tint";

/**
 * StatChip — the hero band's count pill (dashboard-redesign kit,
 * T-DASH-SKIN-1).
 *
 * Counts are content: the value is semibold tabular-nums, the label names
 * what was counted, and the tinted icon ties the chip to its band's
 * semantic tone. Renders NOTHING when value is undefined or null — an
 * absent number is honest (the loading line in the band header carries
 * the state instead); a dash or a zero-fabrication is not.
 */
export function StatChip({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}) {
  if (value === undefined || value === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-xs backdrop-blur-[2px]">
      {Icon && <Icon className={cn("size-3.5 shrink-0", TINTS[tone].ink)} aria-hidden />}
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
