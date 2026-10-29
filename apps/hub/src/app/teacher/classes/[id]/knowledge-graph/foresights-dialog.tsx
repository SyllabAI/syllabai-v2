"use client";

/**
 * T-FORESIGHT-V0-PLAN-1 Stage B — the dialog shell around the Foresights
 * panel: the class-KG heatmap's "Readiness" node action opens this, the
 * wrapper fetches the foresights/v1 view for the picked node (the house
 * data-fetching pattern: state lands in async callbacks only), and the
 * ADR-CLASS-0002 panel renders headline-first.
 *
 * The wrapper invents nothing: loading = skeletons, errors surface the
 * backend's own message (403 "this class belongs to another teacher" and
 * the 404s are the service's words), and the panel is a pure function of
 * the wire view.
 */

import { useEffect, useState } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ForesightsPanel } from "./foresights-panel";
import type { ClassForesightsView } from "@/lib/types";

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function ForesightsDialog({
  classId,
  rootId,
  nodeId,
  onClose,
}: {
  classId: string;
  rootId: string;
  nodeId: string | null;
  onClose: () => void;
}) {
  const [view, setView] = useState<ClassForesightsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nodeId == null) {
      setView(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setView(null);
    api
      .teacherClassForesights(classId, rootId, nodeId)
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch((e) => {
        if (!cancelled) setError(apiMessage(e, "Could not load the readiness panel."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, rootId, nodeId]);

  return (
    <Dialog
      open={nodeId != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            <Sparkles className="size-5 text-primary" aria-hidden />
            Readiness (Foresights)
          </DialogTitle>
          <DialogDescription>
            A pre-assignment readiness prior for this topic — derived only from this
            class&apos;s own practice evidence on its prerequisite chain. The headline first,
            then how it was derived; nothing here is a measurement of the topic itself.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2" data-testid="foresights-loading">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" aria-hidden />
            <AlertTitle>Could not load the readiness panel</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : view ? (
          <ForesightsPanel view={view} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
