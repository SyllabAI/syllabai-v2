"use client";

/**
 * account-stores — the simple-store kit of T-ACCOUNT-ONLY run-001 (operator
 * order 2026-11-05: "remove device-local things completely — every single
 * thing must be saved in account").
 *
 * The single-preference stores (theme, cla-panel-mode, dashboard-prefs,
 * course-shell-prefs, tutor-prefs, pdf-viewer-prefs, note-scroll) share one
 * shape: a module-memory value, hydrated from the workspace-document plane,
 * every write a debounced writeDoc PUT (the account-docs engine owns the
 * wire), and the retired localStorage record adopted once per tab via
 * adoptLegacyStorage (the no-data-loss clause of the sweep law).
 *
 * THE CONTRACT (one truth, four verbs):
 *   - get()    the current value (initial until hydration lands)
 *   - set(v)   memory now, PUT follows (the engine's debounce) — a
 *              remote-driven adoption never re-enters set (echo guard)
 *   - subscribe(cb)  useSyncExternalStore-friendly listener set
 *   - hydrated()     the engine's hydration gate (server value is in)
 *
 * Remote-driven changes (hydration merge, explicit null, engine echoes)
 * arrive through ONE engine subscription: the store adopts readDoc(docKey)
 * — null → initial (the honest "no durable copy") — and never writes back.
 * Account switches / sign-out clear the value with the engine (the reset
 * broadcast): a pref composed under account A must never surface in B.
 *
 * A store NEVER THROWS: engine failures degrade to the in-tab value.
 */
import {
  adoptLegacyStorage,
  isAccountDocsHydrated,
  onAccountDocsReset,
  readDoc,
  subscribeAccountDocs,
  writeDoc,
} from "./account-docs";

export interface AccountStore<T> {
  get(): T;
  set(next: T): void;
  subscribe(cb: () => void): () => void;
  /** true once the engine hydration landed (the value is server-authoritative). */
  hydrated(): boolean;
  /** Test seam: adopt the explicit-null state without a network. */
  __adoptNullForTests(): void;
}

export function createAccountStore<T>(config: {
  /** the closed-vocabulary workspace-document key of record */
  docKey: string;
  initial: T;
  /** validate/normalize a stored value; junk → initial (never throws) */
  parse: (raw: unknown) => T;
  /** the retired localStorage keys this store adopts once, then retires */
  legacyKeys?: readonly string[];
  /** read the legacy device record as the doc shape (the parse is applied) */
  readLegacy?: () => unknown;
}): AccountStore<T> {
  const { docKey, initial, parse } = config;
  let value: T = initial;
  const listeners = new Set<() => void>();
  let applyingRemote = false;

  if (config.legacyKeys && config.readLegacy) {
    adoptLegacyStorage(docKey, config.legacyKeys, config.readLegacy);
  }

  const adopt = (raw: unknown) => {
    applyingRemote = true;
    try {
      value = raw === null || raw === undefined ? initial : parse(raw);
    } catch {
      value = initial; // a malformed doc re-bases honestly
    } finally {
      applyingRemote = false;
    }
    for (const l of [...listeners]) {
      try {
        l();
      } catch {
        // a broken listener never breaks the store
      }
    }
  };

  // engine → store: the hydration merge, the explicit null, flush echoes.
  // key === null is the "hydration landed" broadcast — every store adopts.
  subscribeAccountDocs((key) => {
    if (key !== null && key !== docKey) return;
    if (!isAccountDocsHydrated()) return;
    adopt(readDoc(docKey));
  });

  // account switch / sign-out: clear with the engine (the reset broadcast)
  onAccountDocsReset(() => adopt(null));

  return {
    get: () => value,
    set: (next: T) => {
      if (applyingRemote) return; // an adoption is not an intent
      value = next;
      writeDoc(docKey, next);
      for (const l of [...listeners]) {
        try {
          l();
        } catch {
          // never throws
        }
      }
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    hydrated: () => isAccountDocsHydrated(),
    __adoptNullForTests: () => adopt(null),
  };
}
