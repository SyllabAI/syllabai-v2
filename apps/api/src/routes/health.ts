/**
 * GET /actuator/health — path parity with the Java core.
 *
 * The hub import, the golden-master harness, and any operator probe all
 * speak this exact path today. The v2 api serves the SAME shape
 * ({"status":"UP"}) from day one so capture/replay infra works before any
 * module is ported. Do not "improve" the payload shape — parity wins.
 */
import { Hono } from "hono";

export const healthRoute = new Hono().get("/actuator/health", (c) =>
  c.json({ status: "UP" }),
);
