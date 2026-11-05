"use client";

/**
 * T-SYNC-OBS-001 — the my-subjects sync health surface (the dashboard's
 * notifier half of the T-TEACH-001 cache law).
 *
 * Before this component every sync failure was swallowed by a bare
 * `.catch(() => {})` — a live API outage read as "my courses vanished"
 * (operator trace 2026-11-05): the device roster was fine, the account copy
 * silently wasn't, and nothing on screen ever said so. The sync layer
 * (lib/my-subjects.ts) now publishes idle/ok/error with a bounded auto-retry
 * ladder; THIS component renders the human half:
 *
 *   - first failure of a streak → ONE toast: the API's own message, the
 *     honest "still saved on this device" line, and a Retry action
 *     (retrySyncNow) — deduped per streak, never one toast per retry.
 *   - error → ok recovery → one "synced" toast, only after a real streak.
 *   - idle (signed out) resets the dedupe — no toast ever crosses an
 *     identity boundary.
 *
 * Renders nothing itself; it is pure notifier chrome and mounts once on the
 * student dashboard (beside useMyCoursesSync, the sync's owner).
 */
import { useEffect, useRef } from "react";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { retrySyncNow, useMyCoursesSyncStatus } from "@/lib/my-subjects";

export function DashboardSyncStatus() {
  const sync = useMyCoursesSyncStatus();
  const { toast } = useToast();

  // dedupe refs: one toast per failure streak, one recovery toast per streak
  const toastedStreak = useRef(0);
  const lastErrorToasted = useRef<string | null>(null);

  useEffect(() => {
    if (sync.status === "idle") {
      toastedStreak.current = 0;
      lastErrorToasted.current = null;
      return;
    }
    if (sync.status === "error" && toastedStreak.current === 0) {
      toastedStreak.current = sync.failureStreak;
      lastErrorToasted.current = sync.lastError;
      toast({
        title: "Course sync failed",
        description: `${sync.lastError ?? "The API could not be reached."} Your subjects are still saved on this device — retry usually fixes it.`,
        duration: 8000,
        action: (
          <ToastAction altText="Retry syncing your subjects" onClick={() => retrySyncNow()}>
            Retry now
          </ToastAction>
        ),
      });
      return;
    }
    if (sync.status === "ok" && toastedStreak.current > 0) {
      toastedStreak.current = 0;
      const wasError = lastErrorToasted.current;
      lastErrorToasted.current = null;
      toast({
        title: "Subjects synced to your account",
        description: wasError
          ? "The account copy is back in step with this device."
          : undefined,
        duration: 5000,
      });
    }
  }, [sync.status, sync.failureStreak, sync.lastError, toast]);

  return null;
}
