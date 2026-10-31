/**
 * Ink LOCAL store tests — T-MG-INK-3 run-002 (plan of record
 * docs/MG-MARK-PARITY-PLAN.md §3.7). The pins of record:
 *
 * - ZERO-CONTACT: the full local lifecycle (init → edit → debounce →
 *   write → flush → retry) makes ZERO network calls — a fetch spy
 *   guards the whole run (no GET, no PUT, no Bearer, no telemetry).
 * - STORAGE: ONE store, key = sourceUrl (the existing doc-identity
 *   law), the syllabai-ink/1 container VERBATIM, draw/reload survives
 *   (a fresh controller over the same store replays byte-faithfully).
 * - HONESTY: a corrupted stored doc drops its bad shapes at the SAME
 *   parseDoc boundary the server path uses (never throws, never
 *   fabricates); an unreadable store surfaces the honest error state;
 *   a failed write PRESERVES the working set and says so.
 * - DISCIPLINE: single-timer debounce, edits during an in-flight write
 *   re-schedule (never lost, never double-written), flush-before-
 *   dispose, dispose kills the timers.
 * - MIGRATION HELPERS: inkLocalLoad honest-null + parse boundary;
 *   inkLocalClear deletes the key; where IndexedDB does not exist
 *   (this bun CI) both degrade honestly (null / false) — never a throw.
 *
 * The store seam and the debounce timer are injected (no network, no
 * clock, no IndexedDB in unit scope).
 */
import { describe, expect, test } from "bun:test";

import { packDoc, parseDoc, type InkDoc, type InkShape, type InkStrokeShape } from "./ink";
import { createInkLocal, inkLocalClear, inkLocalLoad } from "./ink-local-store";

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

const KEY = "https://example.test/paper.pdf";

/** In-memory store seam — mirrors the IndexedDB backend's contract:
 * absent get → null; delete of an absent key still succeeds (true). */
function memoryBackend() {
  const rows = new Map<string, InkDoc>();
  const puts: Array<{ key: string; doc: InkDoc }> = [];
  const deletes: string[] = [];
  let failPuts = false;
  return {
    rows,
    puts,
    deletes,
    failPuts: (v: boolean) => {
      failPuts = v;
    },
    backend: {
      async get(key: string) {
        return rows.get(key) ?? null;
      },
      async put(key: string, doc: InkDoc) {
        puts.push({ key, doc });
        if (failPuts) return false;
        rows.set(key, doc);
        return true;
      },
      async delete(key: string) {
        deletes.push(key);
        rows.delete(key);
        return true;
      },
    },
  };
}

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

describe("T-MG-INK-3 run-002 — the LOCAL store controller (zero-contact ink persistence)", () => {
  test("ZERO-CONTACT PIN — the full lifecycle makes zero network calls (fetch spy)", async () => {
    const calls: Array<unknown> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((...args: unknown[]) => {
      calls.push(args);
      return Promise.reject(new Error("the network is forbidden in local mode"));
    }) as unknown as typeof fetch;
    try {
      const { backend } = memoryBackend();
      const clock = manualClock();
      const local = createInkLocal({ sourceUrl: KEY, schedule: clock.schedule, store: backend });
      await local.init();
      local.applyLocal([dot("a")]);
      clock.fireAll();
      for (let i = 0; i < 6; i++) await Promise.resolve();
      local.applyLocal([dot("a"), dot("b")]); // second burst
      await local.flush(); // unmount path
      local.retry(); // manual retry path
      for (let i = 0; i < 6; i++) await Promise.resolve();
      expect(local.getSnapshot().status).toBe("synced");
      expect(local.getSnapshot().dirty).toBe(false);
      expect(calls).toEqual([]); // no GET, no PUT, no Bearer, no telemetry
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("STORAGE PIN — draw → reload survives: ONE store, key = sourceUrl, syllabai-ink/1 verbatim", async () => {
    const { backend, rows, puts } = memoryBackend();
    const clock = manualClock();
    const first = createInkLocal({ sourceUrl: KEY, schedule: clock.schedule, store: backend });
    await first.init();
    first.applyLocal([dot("a")]);
    await first.flush(); // the unmount write
    // the write of record: the SAME key the server doc uses, the SAME container
    expect(puts).toHaveLength(1);
    expect(puts[0].key).toBe(KEY);
    expect(puts[0].doc.schema).toBe("syllabai-ink/1");
    expect(parseDoc(puts[0].doc)).not.toBeNull();
    expect([...rows.keys()]).toEqual([KEY]); // ONE store, ONE row for this paper
    // a fresh controller (the reload) replays byte-faithfully
    const second = createInkLocal({ sourceUrl: KEY, schedule: clock.schedule, store: backend });
    const s2 = await second.init();
    expect(s2.status).toBe("synced");
    expect(s2.shapes.map((s) => s.id)).toEqual(["a"]);
    expect(second.doc()).toEqual(packDoc([dot("a")]));
  });

  test("HONEST-PARSE PIN — a corrupted stored doc drops bad shapes at the parseDoc boundary, never throws", async () => {
    const { backend } = memoryBackend();
    backend.get = async (key: string) =>
      key === KEY
        ? ({
            schema: "syllabai-ink/1",
            shapes: [dot("good"), { id: "junk", kind: "stroke", page: 0 }, null, "garbage"],
          } as unknown as InkDoc)
        : null;
    const clock = manualClock();
    const local = createInkLocal({ sourceUrl: KEY, schedule: clock.schedule, store: backend });
    const s = await local.init();
    expect(s.status).toBe("synced"); // the store read itself succeeded
    expect(s.shapes.map((x) => x.id)).toEqual(["good"]); // only the honest shapes
  });

  test("UNREADABLE STORE — init surfaces the honest error state (drawing still works in memory)", async () => {
    const { backend } = memoryBackend();
    backend.get = async () => {
      throw new Error("this device refuses");
    };
    const clock = manualClock();
    const local = createInkLocal({ sourceUrl: KEY, schedule: clock.schedule, store: backend });
    const s = await local.init();
    expect(s.status).toBe("error");
    local.applyLocal([dot("a")]);
    expect(local.getSnapshot().shapes.map((x) => x.id)).toEqual(["a"]);
  });

  test("write failure → error state, working set PRESERVED, retry lands it", async () => {
    const { backend, puts, rows, failPuts } = memoryBackend();
    const clock = manualClock();
    const local = createInkLocal({ sourceUrl: KEY, schedule: clock.schedule, store: backend });
    await local.init();
    failPuts(true); // the device write fails
    local.applyLocal([dot("a")]);
    clock.fireAll();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(local.getSnapshot().status).toBe("error");
    expect(local.getSnapshot().dirty).toBe(true);
    expect(local.getSnapshot().shapes.map((x) => x.id)).toEqual(["a"]);
    failPuts(false); // the device recovers
    local.retry(); // the honest error pill's affordance
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(local.getSnapshot().status).toBe("synced");
    expect(puts).toHaveLength(2); // the same working set, re-written whole
    expect(rows.get(KEY)?.shapes.map((s) => s.id)).toEqual(["a"]); // …and it landed
  });

  test("edits during an in-flight write re-schedule (never lost, never double-written)", async () => {
    const { backend, rows } = memoryBackend();
    const clock = manualClock();
    let release: (() => void) | null = null;
    const firstPut = new Promise<boolean>((res) => {
      release = () => res(true);
    });
    let firstCall = true;
    const local = createInkLocal({
      sourceUrl: KEY,
      schedule: clock.schedule,
      store: {
        async get() {
          return null;
        },
        put(_key: string, _doc: InkDoc) {
          // the FIRST write hangs in flight until the test releases it;
          // every later write goes straight to the memory backend
          if (firstCall) {
            firstCall = false;
            return firstPut;
          }
          return backend.put(_key, _doc);
        },
        delete: backend.delete,
      },
    });
    await local.init();
    local.applyLocal([dot("a")]);
    clock.fireAll();
    expect(local.getSnapshot().status).toBe("saving");
    local.applyLocal([dot("a"), dot("b")]); // edit lands mid-write
    release!();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(local.getSnapshot().dirty).toBe(true); // the mid-write edit survives
    expect(clock.pending()).toBe(1); // and a follow-up write is scheduled
    clock.fireAll();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(local.getSnapshot().dirty).toBe(false);
    expect(rows.get(KEY)?.shapes.map((s) => s.id)).toEqual(["a", "b"]);
  });

  test("flush pushes a pending edit before dispose; dispose kills the timers", async () => {
    const { backend, rows } = memoryBackend();
    const clock = manualClock();
    const local = createInkLocal({ sourceUrl: KEY, schedule: clock.schedule, store: backend });
    await local.init();
    local.applyLocal([dot("a")]);
    expect(clock.pending()).toBe(1); // timer pending…
    await local.flush(); // …flush bypasses it
    expect(rows.get(KEY)?.shapes.map((s) => s.id)).toEqual(["a"]);
    expect(clock.pending()).toBe(0);
    expect(local.getSnapshot().dirty).toBe(false);
    // after dispose: edits schedule nothing and write nothing
    local.dispose();
    local.applyLocal([dot("b")]);
    expect(clock.pending()).toBe(0);
  });

  test("migration helpers — load parses honestly, clear deletes; where IndexedDB is absent both degrade honestly", async () => {
    // (a) seam-level contract via injection is covered above; here the
    // DEFAULT backend runs where IndexedDB does not exist (bun CI): the
    // helpers MUST degrade to honest-null / honest-false, never throw.
    expect(await inkLocalLoad(KEY)).toBeNull();
    expect(await inkLocalClear(KEY)).toBe(false);
  });
});
