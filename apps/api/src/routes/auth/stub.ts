/**
 * Legacy /api/auth mount — the seed's validation-live + honest-501 stub,
 * PRESERVED VERBATIM (behaviour, not file location — moved under routes/auth/
 * within T-MIG-010's fence).
 *
 * Why it stays: apps/api/test/api.test.ts pins this surface (400 validation /
 * 501 honest port-pending on a valid payload) and sits outside T-MIG-010's
 * fence. The REAL identity port serves /api/v1/auth/** (path parity with the
 * frozen core — R0 ruling in the PR #2 review, note 3; R6 orientation flag
 * Q4). The stub answers 501 with a pointer to the ported surface and is
 * removed when the hub re-points (T-MIG-011) — never a fake 200.
 */
import { Hono } from "hono";
import { loginRequestSchema, registerRequestSchema } from "@syllabai/contracts";

export const legacyAuthStub = new Hono()
  .post("/register", async (c) => {
    const parsed = registerRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      // Mirror the Java core's 400-on-validation-failure contract.
      return c.json({ status: 400, error: "Validation failed", details: parsed.error.flatten() }, 400);
    }
    return c.json(
      {
        status: 501,
        error: "Not implemented — port pending",
        task: "T-MIG-010",
        note: "Identity module is PORTED at /api/v1/auth/** (path parity). This legacy mount answers 501 until the hub re-points (T-MIG-011).",
      },
      501,
    );
  })
  .post("/login", async (c) => {
    const parsed = loginRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ status: 400, error: "Validation failed", details: parsed.error.flatten() }, 400);
    }
    return c.json({ status: 501, error: "Not implemented — port pending", task: "T-MIG-010" }, 501);
  });
