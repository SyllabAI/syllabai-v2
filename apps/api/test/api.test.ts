import { describe, expect, test } from "bun:test";
import app from "../src/index";

/**
 * Day-one parity tests. These are the seed of the golden-master gate:
 * /actuator/health is the first contract the v2 api must keep, byte-exact,
 * because capture/replay infra and the hub import both rely on it.
 */
describe("GET /actuator/health (path parity with Java core)", () => {
  test("returns 200 {status:UP} — same shape as Spring Boot actuator", async () => {
    const res = await app.request("/actuator/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "UP" });
  });
});

describe("POST /api/auth/register (contracts-first validation)", () => {
  test("400 on invalid password (Java floor: 12 chars, letter+digit)", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.co", password: "short1", displayName: "Ann" }),
    });
    expect(res.status).toBe(400);
  });

  test("400 on missing displayName (Java: @NotBlank @Size(min=2,max=100))", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.co", password: "longenough1x", displayName: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("501 (honest port-pending) on a VALID payload — never a fake 200", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.co", password: "longenough1x", displayName: "Ann" }),
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.task).toBe("T-MIG-010");
  });
});
