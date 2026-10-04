/**
 * /api/auth/** — first vertical slice of the contracts-first port (Wave 1).
 *
 * Status: REQUEST VALIDATION LIVE, HANDLERS PENDING PORT (T-MIG-010).
 *
 * Why validation first and not a stubbed 200: request validation is pure,
 * deterministic, and contracts-driven — it can reach golden-master parity
 * TODAY (same accepted/rejected sets as jakarta.validation on the Java
 * core), while the persistence + bcrypt + JWT half lands with the db
 * baseline (T-MIG-002). Until then the route answers 501 honestly rather
 * than pretending. No silent fakes — the frozen core's discipline.
 *
 * Java sources (frozen):
 *   syllabai-core/src/main/java/com/syllabai/identity/... (AuthController,
 *   BootstrapAdminController, PasswordChangeRequest, UserService)
 */
import { Hono } from "hono";
import { loginRequestSchema, registerRequestSchema } from "@syllabai/contracts";

export const authRoute = new Hono()
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
        note: "Request shape validated against @syllabai/contracts (parity-verified); persistence lands with the db baseline.",
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
