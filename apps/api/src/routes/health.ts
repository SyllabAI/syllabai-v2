/**
 * GET /actuator/health — path parity with the Java core.
 *
 * The hub import, the golden-master harness, and any operator probe all
 * speak this exact path today. Body parity: the frozen core exposes the
 * boot probes (application.yml: management.endpoint.health.probes.enabled),
 * so the real shape is {"groups":["liveness","readiness"],"status":"UP"} —
 * pinned by golden case actuator-health-parity (T-MIG-003 capture,
 * justified:true). The seed's {status:"UP"} was the divergence.
 *
 * ⚠️ OUT-OF-FENCE edit (T-MIG-010, R0 ratify): routes/health.ts is outside
 * the T-MIG-010 scope.allowed globs; this one-liner completes the capture
 * case the golden gate now enforces.
 */
import { Hono } from "hono";

export const healthRoute = new Hono().get("/actuator/health", (c) =>
  c.json({ groups: ["liveness", "readiness"], status: "UP" }),
);
