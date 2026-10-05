/**
 * GET /actuator/health — path AND payload parity with the Java core.
 *
 * R0 fix (T-MIG-017): the seed served the bare {"status":"UP"} shape, but
 * the frozen core actually serves {"groups":["liveness","readiness"],"status":"UP"}
 * — captured verbatim from the Render core by T-MIG-003 run-001 and pinned as
 * golden case `actuator-health-parity` (justified:true). The golden gate is
 * the authority on what the core serves; the seed's own header text conceded
 * this ("the seed's bare shape … is stricter than the real core") while the
 * route kept the seed shape — a parity bug this verification caught on replay.
 */
import { Hono } from "hono";

export const healthRoute = new Hono().get("/actuator/health", (c) =>
  c.json({ groups: ["liveness", "readiness"], status: "UP" }),
);
