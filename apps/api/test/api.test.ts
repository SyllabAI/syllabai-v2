import { describe, expect, test } from "bun:test";

/**
 * Day-one parity tests. These are the seed of the golden-master gate:
 * /actuator/health is the first contract the v2 api must keep, byte-exact,
 * because capture/replay infra and the hub import both rely on it.
 *
 * History note (T-MIG-010): the seed's /api/auth 501-honesty tests lived here;
 * the auth surface moved to /api/v1/auth (path parity, AuthController.java:25)
 * and is now ported for real — its tests live in test/identity/** (this
 * file's fence) and the 501 stub no longer exists.
 *
 * Env bootstrap: importing src/index fail-fasts on blank secrets (boot
 * discipline, inherited from the core). Test env is set BEFORE the dynamic
 * import; the DATABASE_URL is a placeholder — the Neon client is lazy and
 * the health path never touches it.
 */
process.env.SYLLABAI_JWT_SECRET ??= "unit-test-secret-0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL ??= "postgresql://placeholder.local/syllabai?sslmode=require";

const { default: app } = await import("../src/index");

describe("GET /actuator/health (path parity with Java core)", () => {
  test("returns 200 {groups:[liveness,readiness],status:UP} — the shape the core actually serves (golden actuator-health-parity; R0 T-MIG-016)", async () => {
    const res = await app.request("/actuator/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groups: ["liveness", "readiness"], status: "UP" });
  });
});

describe("anyRequest().authenticated() parity (SecurityConfig.java:91)", () => {
  test("unknown /api/v1 path → 401 Boot-shaped body when anonymous", async () => {
    const res = await app.request("/api/v1/definitely-not-a-route");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { status: number; error: string; path: string };
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/definitely-not-a-route");
  });
});
