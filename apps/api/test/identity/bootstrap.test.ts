/**
 * Bootstrap window pins — T-MIG-010. Frozen spec:
 * identity/BootstrapAdminService.java + BootstrapStateStore.java (V19,
 * R3 wall-clock anchoring to the row's persisted armed-at time).
 */
import { describe, expect, test } from "bun:test";
import { createBootstrapService, CLAIM_WINDOW_MS } from "../../src/services/identity/bootstrap";
import { MemoryIdentityStore } from "../../src/services/identity/store";
import { fakePasswordPort } from "../../src/services/identity/password";
import { createJwtService } from "../../src/services/identity/jwt";
import { ConflictError } from "../../src/services/identity/errors";

const SECRET = "0123456789abcdef0123456789abcdef";
const CLAIM = {
  email: "Root@Example.invalid",
  password: "longenough1x",
  displayName: "  Root Admin  ", // bootstrap TRIMS displayName (register does not)
};

function makeBootstrap(opts: { enabled?: boolean; now?: () => number } = {}) {
  const store = new MemoryIdentityStore();
  const jwt = createJwtService({ secret: SECRET, ttlMs: 7_200_000, now: opts.now });
  const bootstrap = createBootstrapService({
    store,
    passwords: fakePasswordPort,
    jwt,
    enabled: opts.enabled ?? true,
    now: opts.now,
  });
  return { store, bootstrap };
}

describe("claimable (BootstrapAdminService.claimable)", () => {
  test("PENDING + zero admins → available", async () => {
    const { bootstrap } = makeBootstrap();
    expect(await bootstrap.claimable()).toBe(true);
  });

  test("disabled surface → false (and claim 409)", async () => {
    const { bootstrap } = makeBootstrap({ enabled: false });
    expect(await bootstrap.claimable()).toBe(false);
    await expect(bootstrap.claim(CLAIM)).rejects.toThrow(
      new ConflictError("bootstrap claim surface is disabled on this deployment"),
    );
  });
});

describe("claim (the one-time first-admin)", () => {
  test("claim creates ADMIN+TEACHER, TRIMS displayName, consumes window, 200-shape", async () => {
    const { store, bootstrap } = makeBootstrap();
    const result = await bootstrap.claim(CLAIM);
    expect(result.tokenType).toBe("Bearer");
    expect(result.user.roles).toEqual(["ADMIN", "TEACHER"]);
    expect(result.user.displayName).toBe("Root Admin"); // trimmed
    expect(result.user.email).toBe("root@example.invalid"); // lowercased
    const state = await store.peekState();
    expect(state?.state).toBe("CONSUMED");
    expect(await bootstrap.claimable()).toBe(false);
  });

  test("second claim → 409 'bootstrap claim window is closed (state CONSUMED)'", async () => {
    const { bootstrap } = makeBootstrap();
    await bootstrap.claim(CLAIM);
    await expect(bootstrap.claim(CLAIM)).rejects.toThrow(
      new ConflictError("bootstrap claim window is closed (state CONSUMED)"),
    );
  });

  test("admin exists (invariant) → 409 'an ADMIN account already exists'", async () => {
    const { store, bootstrap } = makeBootstrap();
    await store.put({
      id: "11111111-1111-4111-8111-111111111111",
      email: "boss@example.invalid",
      passwordHash: "fake$x",
      displayName: "Boss",
      enabled: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
      roles: ["ADMIN"],
    });
    await expect(bootstrap.claim(CLAIM)).rejects.toThrow(
      new ConflictError("an ADMIN account already exists"),
    );
  });

  test("window expired on the wall clock (armed-at + 15min, R3) → EXPIRED terminally + 409", async () => {
    let nowMs = 10_000_000;
    const { store, bootstrap } = makeBootstrap({ now: () => nowMs });
    store.setBootstrapState({ state: "PENDING", updatedAtMs: nowMs });
    nowMs += CLAIM_WINDOW_MS + 1;
    await expect(bootstrap.claim(CLAIM)).rejects.toThrow(
      new ConflictError("bootstrap claim window is closed (state EXPIRED)"),
    );
    expect((await store.peekState())?.state).toBe("EXPIRED");
  });

  test("state row missing → 409 'bootstrap state row missing'", async () => {
    const { store, bootstrap } = makeBootstrap();
    store.setBootstrapState(null);
    await expect(bootstrap.claim(CLAIM)).rejects.toThrow(
      new ConflictError("bootstrap state row missing"),
    );
  });

  test("validatePasswordStrength defense-in-depth (DTO-valid inputs always pass)", async () => {
    const { bootstrap } = makeBootstrap();
    // the route layer already enforces the floor; the bootstrap-side check
    // must be invisible for DTO-valid payloads
    const result = await bootstrap.claim(CLAIM);
    expect(result.user.id).toBeDefined();
  });
});
