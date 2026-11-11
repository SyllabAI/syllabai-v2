"use client";

/**
 * QualificationGradingCard (T-GB-GRADE-CARD) — the "how this qualification
 * is graded" card for the 16 modular IGCSE pages (aggregate-ums mode).
 *
 * The pages show per-unit raw-mark boundaries, but the qualification grade
 * is NOT read off those numbers: each unit's raw mark converts to UMS, the
 * unit UMS marks are added, and the fixed cash-in thresholds (which never
 * change between sessions) grade the total. Visitors kept asking how those
 * two tables relate — this card states the law, entirely from the data the
 * resources lanes transcribed from the sha256-pinned modular
 * specifications (describeAggregateQualification; absent stays absent).
 *
 * Styling stays inside the MG box's token ladder (rounded-2xl, border-2,
 * bg-card, font-display, muted provenance prose) so every theme re-skins
 * it unchanged; default open — the card IS the answer, the toggle is for
 * after the first read.
 */

import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { QualificationGradingInfo } from "@/lib/grade-boundaries-calc";

export function QualificationGradingCard({
  info,
}: {
  info: QualificationGradingInfo;
}) {
  const th =
    "border-b-2 border-border py-2 pl-4 pr-3 text-left font-medium text-muted-foreground";
  const td = "border-b border-border/60 py-2 pl-4 pr-3 tabular-nums";

  return (
    <Collapsible defaultOpen className="rounded-2xl border-2 bg-card">
      <div className="flex items-start justify-between gap-4 p-4 sm:p-6">
        <div className="min-w-0">
          <h5 className="font-display text-lg font-bold tracking-tight">
            How this qualification is graded
          </h5>
          <p className="mt-1 text-sm text-muted-foreground">
            Modular — {info.units.length} unit{info.units.length === 1 ? "" : "s"}
            , {info.umsMax} UMS total, {info.cashIn} cash-in.
          </p>
        </div>
        <CollapsibleTrigger
          aria-label="Toggle the grading explanation"
          className={cn(
            "mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground",
            "transition-colors hover:bg-muted [&[data-state=closed]>svg]:-rotate-90",
          )}
        >
          <ChevronDown className="size-4 transition-transform" aria-hidden />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="space-y-5 border-t-2 px-4 pb-5 pt-4 sm:px-6">
          <ol className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border font-display text-2xs font-bold text-foreground"
              >
                1
              </span>
              <span>
                <span className="font-medium text-foreground">
                  Each unit&apos;s raw mark converts to a UMS mark.
                </span>{" "}
                Every session publishes a raw→UMS conversion per unit, so a
                harder paper is worth the same UMS as an easier one — the
                tables below stay in raw marks, the law works in UMS.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border font-display text-2xs font-bold text-foreground"
              >
                2
              </span>
              <span>
                <span className="font-medium text-foreground">
                  The unit UMS marks are added together.
                </span>{" "}
                The {info.cashIn} cash-in takes{" "}
                {info.units.map((u) => u.code).join(" + ")} and grades the
                total out of {info.umsMax}.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border font-display text-2xs font-bold text-foreground"
              >
                3
              </span>
              <span>
                <span className="font-medium text-foreground">
                  The qualification grade comes from fixed UMS thresholds.
                </span>{" "}
                Unlike raw boundaries these never change between sessions:
              </span>
            </li>
          </ol>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <caption className="sr-only">
                Fixed cash-in UMS thresholds for the {info.cashIn}{" "}
                qualification grade
              </caption>
              <thead className="bg-muted leading-normal">
                <tr>
                  <th scope="col" className={th}>
                    Grade
                  </th>
                  {info.thresholds.map((t) => (
                    <th key={t.grade} scope="col" className={cn(th, "pl-3")}>
                      {t.grade}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th
                    scope="row"
                    className="border-b border-border/60 py-2 pl-4 pr-3 text-left font-medium"
                  >
                    Total UMS
                  </th>
                  {info.thresholds.map((t) => (
                    <td key={t.grade} className={cn(td, "pl-3")}>
                      {t.ums}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <caption className="sr-only">
                Per-unit UMS maxima and fixed grade tables
              </caption>
              <thead className="bg-muted leading-normal">
                <tr>
                  <th scope="col" className={th}>
                    Unit
                  </th>
                  <th scope="col" className={cn(th, "pl-3")}>
                    UMS max
                  </th>
                  <th scope="col" className={cn(th, "pl-3 whitespace-nowrap")}>
                    Grade{" "}
                    {info.units[0]?.thresholds.length
                      ? `${info.units[0].thresholds[0].grade} → ${
                          info.units[0].thresholds[
                            info.units[0].thresholds.length - 1
                          ].grade
                        }`
                      : ""}{" "}
                    (fixed unit UMS)
                  </th>
                </tr>
              </thead>
              <tbody>
                {info.units.map((u) => (
                  <tr key={u.code}>
                    <th
                      scope="row"
                      className="border-b border-border/60 py-2 pl-4 pr-3 text-left font-mono text-xs font-medium"
                    >
                      {u.code}
                    </th>
                    <td className={cn(td, "pl-3")}>{u.umsMax}</td>
                    <td className={cn(td, "pl-3")}>
                      {u.thresholds.length
                        ? u.thresholds
                            .map((t) => `${t.grade}·${t.ums}`)
                            .join("  ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {info.topGradeNote && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                About the top grade:{" "}
              </span>
              {info.topGradeNote}
            </p>
          )}

          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Resits: </span>
            {info.resitRule}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
