/**
 * Ink sync controller tests — T-MG-INK-1 run-003. The client half of the
 * run-002 revision law: base-carrying PUT, 409 → GET + rebase + retry
 * once, honest failure states, debounce discipline, flush-before-dispose.
 * Fetchers and the debounce timer are injected (no network, no clock).
 */
import { describe, expect, test } from "bun:test";

import { packDoc, type InkShape, type InkStrokeShape } from "./ink";
import { createInkSync, type InkSyncSnapshot } from "./ink-sync";
import type { PutPdfDrawingResult } from "@/lib/pdf-drawings";

const dot = (id: string): InkShape => ({
  id,
  kind: "stroke",
  page: 1,
  color: "black",
  widthFrac: 0.0038,
  points: [
    [0.1, 0.1],
    [0.2, 0.2],
  ],
}) as InkStrokeShape;

/** Manual debounce clock: tests fire scheduled pushes explicitly. */
function manualClock() {
  const queue: Array<{ fn: () => void; ms: number }> = [];
  const schedule = (fn: () => void, ms: number) => {
    const entry = { fn, ms };
    queue.push(entry);
    return () => {
      const i = queue.indexOf(entry);
      if (i >= 0) queue.splice(i, 1);
    };
  };
  return {
    schedule,
    fireAll() {
      const run = queue.splice(0);
      for (const e of run) e.fn();
    },
    pending: () => queue.length,
  };
}

/** A scripted save: records calls, replays outcomes in order. */
function scriptedSave(outcomes: Array<(rev: number) => PutPdfDrawingResult>) {
  const bases: number[] = [];
  const docs: Array<number> = [];
  const save = (_sourceUrl: string, doc: { shapes: unknown[] }, baseRevision: number): Promise<PutPdfDrawingResult> => {
    bases.push(baseRevision);
    docs.push(doc.shapes.length);
    const next = outcomes.shift();
    if (!next) throw new Error("unexpected extra save");
    return Promise.resolve(next(baseRevision));
  };
  return { save, bases, docs };
}

const storedRow = (shapes: unknown[], revision: number) => ({
  documentRefType: "paper_asset" as const,
  documentRefId: null,
  sourceUrl: "https://example.test/paper.pdf",
  doc: { schema: "syllabai-ink/1" as const, shapes },
  revision,
  updatedAt: "2026-10-30T00:00:00Z",
});

describe("T-MG-INK-1 run-003 — the sync controller (client half of the revision law)", () => {
  test("init loads the stored doc + base revision (honest-empty stays base 0)", async () => {
    const clock = manualClock();
    const loads: Array<string | null> = [
      { drawing: storedRow([packDoc([dot("a")]).shapes[0]], 4) } as never,
      null as never,
    ];
    const load = (() => Promise.resolve(loads.shift() ?? null)) as never;
    const { save } = scriptedSave([]);
    const sync = createInkSync({ sourceUrl: "u", token: "t", schedule: clock.schedule, load, save });
    const s1 = await sync.init();
    expect(s1.status).toBe("synced");
    expect(s1.baseRevision).toBe(4);
    expect(s1.shapes.map((s) => s.id)).toEqual(["a"]);
    const sync2 = createInkSync({ sourceUrl: "u", token: "t", schedule: clock.schedule, load, save });
    const s2 = await sync2.init();
    expect(s2.baseRevision).toBe(0);
    expect(s2.shapes).toEqual([]);
  });

  test("edit → debounced PUT carries the base; accepted write advances base to base+1", async () => {
    const clock = manualClock();
    const load = (() => Promise.resolve(null)) as never;
    const { save, bases, docs } = scriptedSave([
      () => ({ outcome: "written", drawing: storedRow([], 1) as never }),
    ]);
    const sync = createInkSync({ sourceUrl: "u", token: "t", schedule: clock.schedule, load, save });
    await sync.init();
    sync.applyLocal([dot("a")]);
    expect(clock.pending()).toBe(1);
    expect(sync.getSnapshot().status).toBe("synced"); // not yet saving
    clock.fireAll();
    await Promise.resolve();
    await Promise.resolve();
    expect(bases).toEqual([0]); // seeded write: base 0 → revision 1
    expect(docs).toEqual([1]);
    expect(sync.getSnapshot().baseRevision).toBe(1);
    expect(sync.getSnapshot().status).toBe("synced");
    expect(sync.getSnapshot().dirty).toBe(false);
  });

  test("409 → GET + rebase (stored ∪ local) + retry once with the fresh base", async () => {
    const clock = manualClock();
    const loadResponses: Array<unknown> = [
      null, // init: honest-empty
      { drawing: storedRow([packDoc([dot("theirs")]).shapes[0]], 7) }, // the conflict re-read
    ];
    const load = (() => Promise.resolve(loadResponses.shift() ?? null)) as never;
    const { save, bases, docs } = scriptedSave([
      () => ({ outcome: "conflict" }), // stale base 0 (other writer advanced to 7)
      () => ({ outcome: "written", drawing: storedRow([], 8) as never }),
    ]);
    const sync = createInkSync({ sourceUrl: "u", token: "t", schedule: clock.schedule, load, save });
    await sync.init();
    sync.applyLocal([dot("mine")]);
    clock.fireAll();
    // let the PUT → GET → PUT loop settle
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(bases).toEqual([0, 7]); // the retry is cut against the FRESH base
    expect(docs).toEqual([1, 2]); // first PUT: the local set; retry: the rebased union
    expect(sync.getSnapshot().baseRevision).toBe(8);
    expect(sync.getSnapshot().status).toBe("synced");
    expect(sync.getSnapshot().shapes.map((s) => s.id)).toEqual(["theirs", "mine"]);
  });

  test("second 409 surfaces the honest conflict state (never a silent lie)", async () => {
    const clock = manualClock();
    const loadResponses: Array<unknown> = [
      null,
      { drawing: storedRow([], 7) },
    ];
    const load = (() => Promise.resolve(loadResponses.shift() ?? null)) as never;
    const { save } = scriptedSave([
      () => ({ outcome: "conflict" }),
      () => ({ outcome: "conflict" }),
    ]);
    const sync = createInkSync({ sourceUrl: "u", token: "t", schedule: clock.schedule, load, save });
    await sync.init();
    sync.applyLocal([dot("mine")]);
    clock.fireAll();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(sync.getSnapshot().status).toBe("conflict");
  });

  test("network failure → error state, working set PRESERVED, retry lands it", async () => {
    const clock = manualClock();
    const load = (() => Promise.resolve(null)) as never;
    const { save, docs } = scriptedSave([
      () => ({ outcome: "failed" }),
      () => ({ outcome: "written", drawing: storedRow([], 1) as never }),
    ]);
    const sync = createInkSync({ sourceUrl: "u", token: "t", schedule: clock.schedule, load, save });
    await sync.init();
    sync.applyLocal([dot("a")]);
    clock.fireAll();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(sync.getSnapshot().status).toBe("error");
    expect(sync.getSnapshot().dirty).toBe(true);
    expect(sync.getSnapshot().shapes.map((s) => s.id)).toEqual(["a"]);
    sync.retry();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(sync.getSnapshot().status).toBe("synced");
    expect(docs).toEqual([1, 1]); // the same working set, re-pushed whole
  });

  test("edits during an in-flight write re-schedule (never lost, never double-PUT)", async () => {
    const clock = manualClock();
    const load = (() => Promise.resolve(null)) as never;
    let release: (() => void) | null = null;
    const firstPut = new Promise<PutPdfDrawingResult>((res) => {
      release = () => res({ outcome: "written", drawing: storedRow([], 1) as never });
    });
    const bases: number[] = [];
    const save = (_u: string, _d: { shapes: unknown[] }, baseRevision: number): Promise<PutPdfDrawingResult> => {
      bases.push(baseRevision);
      return bases.length === 1 ? firstPut : Promise.resolve({ outcome: "written", drawing: storedRow([], 2) as never });
    };
    const sync = createInkSync({ sourceUrl: "u", token: "t", schedule: clock.schedule, load, save });
    await sync.init();
    sync.applyLocal([dot("a")]);
    clock.fireAll();
    expect(sync.getSnapshot().status).toBe("saving");
    sync.applyLocal([dot("a"), dot("b")]); // edit lands mid-flight
    release!();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(sync.getSnapshot().dirty).toBe(true); // the mid-flight edit survives
    expect(clock.pending()).toBe(1); // and a follow-up push is scheduled
    clock.fireAll();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(sync.getSnapshot().dirty).toBe(false);
    expect(sync.getSnapshot().baseRevision).toBe(2);
  });

  test("flush pushes a pending edit and settles before dispose", async () => {
    const clock = manualClock();
    const load = (() => Promise.resolve(null)) as never;
    const { save, bases } = scriptedSave([
      () => ({ outcome: "written", drawing: storedRow([], 1) as never }),
    ]);
    const sync = createInkSync({ sourceUrl: "u", token: "t", schedule: clock.schedule, load, save });
    await sync.init();
    sync.applyLocal([dot("a")]);
    expect(clock.pending()).toBe(1); // timer pending…
    await sync.flush(); // …flush bypasses it
    expect(bases).toEqual([0]);
    expect(clock.pending()).toBe(0);
    expect(sync.getSnapshot().dirty).toBe(false);
  });
});
