import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Validation-status badge with the canonical enum's semantics (never "promoted"). */
export function ValidationBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const map: Record<string, string> = {
    VALIDATED: "border-success/30 bg-success/10 text-success",
    SUGGESTED: "border-warn/30 bg-warn/10 text-warn",
    FLAGGED: "border-destructive/30 bg-destructive/10 text-destructive",
    REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  return (
    <Badge variant="outline" className={cn("text-2xs", map[status])}>
      {status}
    </Badge>
  );
}

/** Provenance-tier badge — AI_SUGGESTED is never displayed as truth.
 *
 * Two voices (T-UX-VOICE-1):
 *  - default (of-record): the raw tier, exactly as the register prints it
 *    (/about/provenance is the audience for the raw vocabulary);
 *  - studentVoice: student-voiced labels with the raw tier kept in the
 *    tooltip — the disclosure survives, the jargon does not.
 */
const STUDENT_TIER_LABELS: Record<string, string> = {
  CORE_MEASURED: "From your account",
  SIMULATED: "Illustrative — this browser",
  RULE_DERIVED: "From the official specification",
  AI_SUGGESTED: "Draft — under review",
  HUMAN_VALIDATED: "Teacher-validated",
  DEMO_DERIVED: "Demo sample",
};

export function ProvenanceBadge({
  tier,
  studentVoice = false,
}: {
  tier: string | null | undefined;
  studentVoice?: boolean;
}) {
  if (!tier) return null;
  const map: Record<string, string> = {
    RULE_DERIVED: "border-info/30 bg-info/10 text-info",
    // text-warn-ink, not text-warn: amber-700 text on the amber wash failed
    // 4.5:1 on warm page backgrounds (axe color-contrast, tranche 4.13) —
    // --warn-ink is the design system's copy-on-warn token (both modes)
    AI_SUGGESTED: "border-warn/30 bg-warn/10 text-warn-ink",
    HUMAN_VALIDATED: "border-success/30 bg-success/10 text-success",
    DEMO_DERIVED: "border-cat/30 bg-cat/10 text-cat",
    SIMULATED: "border-sim/30 bg-sim/10 text-sim",
    /** measured facts read live from the learner's syllabai-core account */
    CORE_MEASURED: "border-success/30 bg-success/10 text-success",
  };
  const label = studentVoice ? (STUDENT_TIER_LABELS[tier] ?? tier) : tier;
  return (
    <Badge
      variant="outline"
      className={cn("text-2xs", map[tier] ?? "text-muted-foreground")}
      title={studentVoice ? `Provenance tier: ${tier}` : undefined}
    >
      {label}
    </Badge>
  );
}

/** Canonical spec-point anchor chip (e.g. 4CH1-1.25). */
export function SpecChip({ code }: { code: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-2xs font-medium text-foreground/80">
      {code}
    </code>
  );
}

/** Persistent banner for simulated (non-governed) surfaces.
 * The badge is student-voiced (T-UX-VOICE-1); the raw tier of record stays
 * in /about/provenance and on every of-record badge rendered without
 * studentVoice. */
export function SimulatedBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-sim/30 bg-sim/10 px-3 py-2 text-xs text-sim">
      <Badge variant="outline" className="shrink-0 border-sim/40 text-2xs text-sim" title="Provenance tier: SIMULATED">
        Illustrative
      </Badge>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
