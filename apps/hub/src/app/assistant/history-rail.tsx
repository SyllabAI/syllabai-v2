"use client";

/**
 * Assistant history rail — DC-6 phase 1 (docs/DC6-ASSISTANT-HISTORY-PLAN.md).
 *
 * The local tier of the tutor rail's interaction vocabulary (new chat,
 * search, date groups, relative timestamps, turn counts, inline rename,
 * delete with undo, course scope line) over the assistant's OWN thread store
 * (./assistant-threads). No server pane: assistant history is device-local
 * in phase 1 — a disclosed plan deviation; the rail is shaped so the server
 * section can be added later exactly the way the tutor's was.
 */

import { useMemo, useState } from "react";
import {
  Check,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { AssistantThread } from "./assistant-threads";
import {
  createThread,
  deleteThread,
  groupThreads,
  insertThread,
  renameThread,
  relativeTime,
  setActiveThread,
  type AssistantCourseContext,
} from "./assistant-threads";
import { notifyAssistantThreadDeleted, scheduleAssistantSync } from "./assistant-sync";

export function AssistantRailBrand() {
  return (
    <div className="flex items-center gap-2.5 border-b px-4 py-3">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground"
        aria-hidden="true"
      >
        <Sparkles className="size-4" />
      </span>
      <div className="leading-tight">
        <h2 className="text-sm font-semibold">Assistant chats</h2>
        <p className="text-[11px] text-muted-foreground">saved on this device</p>
      </div>
    </div>
  );
}

export function AssistantHistoryRail({
  threads,
  activeId,
  activeCourse,
  onNewChat,
  onNavigate,
}: {
  threads: AssistantThread[];
  activeId: string | null;
  /** the course this assistant instance is scoped to — the rail hides OTHER
   *  courses' threads (slug-to-slug, V53 discipline; never label-matching) */
  activeCourse: AssistantCourseContext;
  onNewChat: () => void;
  onNavigate?: () => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => {
      const base = q
        ? threads.filter(
            (t) =>
              t.title.toLowerCase().includes(q) ||
              t.messages.some((m) => m.content.toLowerCase().includes(q)),
          )
        : threads;
      // course-scoped: threads of OTHER courses stay hidden; course-less
      // threads remain visible (legacy local history). Slug-to-slug only —
      // labels are display-only (the scope line below).
      return base.filter((t) => !t.courseSlug || t.courseSlug === activeCourse.slug);
    },
    [threads, q, activeCourse.slug],
  );
  const groups = useMemo(() => groupThreads(filtered), [filtered]);

  const commitRename = (id: string) => {
    renameThread(id, renameDraft);
    setRenamingId(null);
    // phase 3b: the mirror carries the title — schedule for THIS thread
    // (a renamed thread need not be the active one)
    scheduleAssistantSync(id);
  };

  const remove = (t: AssistantThread) => {
    // phase 3b: the drop marker + the server DELETE go up BEFORE the local
    // removal — an unwired delete would resurrect on every hydration
    notifyAssistantThreadDeleted(t);
    deleteThread(t.id);
    toast({
      title: "Conversation deleted",
      description: t.title,
      action: (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            insertThread(t, t.id);
            toast({ title: "Restored", description: t.title });
          }}
        >
          Undo
        </Button>
      ),
    });
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <AssistantRailBrand />
      <div className="space-y-2.5 p-3">
        <Button onClick={onNewChat} className="w-full justify-start gap-2">
          <Plus className="size-4" aria-hidden /> New chat
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="h-8 border-sidebar-border bg-sidebar-accent/60 pl-8 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Conversation history" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {activeCourse.label && (
          <p className="mx-2 mb-1 rounded-md bg-muted/60 px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
            Scoped to <span className="font-medium text-foreground">{activeCourse.label}</span>
            {" "}— other courses’ chats are hidden
          </p>
        )}

        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {threads.length === 0
              ? "No conversations yet — ask your first question."
              : "Nothing matches that search."}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {g.label}
              </p>
              <ul className="space-y-px">
                {g.threads.map((t) => {
                  const active = t.id === activeId;
                  return (
                    <li key={t.id}>
                      {renamingId === t.id ? (
                        <div className="flex items-center gap-1 rounded-md border border-primary/40 bg-background p-1">
                          <Input
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                commitRename(t.id);
                              }
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            aria-label="Conversation title"
                            className="h-7 border-0 text-xs shadow-none focus-visible:ring-0"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 shrink-0"
                            aria-label="Save title"
                            onClick={() => {
                              commitRename(t.id);
                            }}
                          >
                            <Check className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <div
                          className={
                            "group/item relative flex items-center rounded-lg transition-colors " +
                            (active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")
                          }
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveThread(t.id);
                              onNavigate?.();
                            }}
                            aria-current={active ? "true" : undefined}
                            className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span
                              className={
                                "w-full truncate text-[13px] leading-tight" +
                                (active ? " font-semibold" : "")
                              }
                            >
                              {t.title}
                            </span>
                            <span className="flex w-full items-center gap-1.5 text-[10.5px] text-muted-foreground">
                              <MessageSquare className="size-3 shrink-0" aria-hidden />
                              <span className="shrink-0 tabular-nums">
                                {t.messages.length === 1
                                  ? "1 turn"
                                  : `${t.messages.length} turns`}
                              </span>
                              <span className="ml-auto shrink-0 tabular-nums">
                                {relativeTime(t.updatedAt)}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete conversation: ${t.title}`}
                            className={
                              "mr-1 flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-background hover:text-destructive " +
                              "opacity-100 lg:opacity-0 lg:group-hover/item:opacity-100 lg:focus-visible:opacity-100"
                            }
                            onClick={() => remove(t)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}
