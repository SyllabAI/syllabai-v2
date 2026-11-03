/**
 * Gating policy tests (frontend-flow audit B-3): the proxy's compiled
 * matcher and lib/route-gate.ts's decision rows must never drift, and the
 * open/gated classification must hold at the path level.
 *
 * The proxy's `config.matcher` has to be a literal in src/proxy.ts (Next
 * statically parses it — an imported array is rejected at build time), so
 * this file is the no-drift contract: change GATED_ROUTES here-or-there
 * and this test fails until both sides say the same thing.
 */
import { describe, expect, it } from "bun:test";

import { config } from "@/proxy";
import { GATED_ROUTES, gateForPath, PROXY_MATCHER } from "./route-gate";

describe("route gate policy", () => {
  it("the proxy's compiled matcher equals the policy's matcher", () => {
    expect([...config.matcher].sort()).toEqual([...PROXY_MATCHER].sort());
  });

  it("PROXY_MATCHER is exactly the gated rows + / and /login", () => {
    const expected = [
      "/",
      "/login",
      ...GATED_ROUTES.flatMap(({ prefix }) => [prefix, `${prefix}/:path*`]),
    ];
    expect([...PROXY_MATCHER].sort()).toEqual(expected.sort());
  });

  it("every GATED_ROUTES prefix really appears in the compiled matcher", () => {
    for (const { prefix } of GATED_ROUTES) {
      expect(config.matcher).toContain(prefix);
    }
  });

  it("core-backed surfaces classify as session-gated, nested paths included", () => {
    for (const path of [
      "/dashboard",
      "/tutor",
      "/assistant",
      "/learner",
      "/plan",
      "/practice/drill",
      "/practice/drill/deep/link",
      "/practice/battle",
    ]) {
      expect(gateForPath(path)).toBe("session");
    }
  });

  it("the teacher workspace classifies as teacher-gated", () => {
    expect(gateForPath("/teacher")).toBe("teacher");
    expect(gateForPath("/teacher/classes/xyz")).toBe("teacher");
  });

  it("corpus surfaces stay open — browsing never meets a login wall", () => {
    for (const path of [
      "/",
      "/courses",
      "/courses/igcse-chemistry-19",
      "/courses/igcse-chemistry-19/revision-notes",
      "/past-papers",
      "/practice",
      "/practice/",
      "/knowledge-graph",
      "/login",
      "/about/provenance",
    ]) {
      expect(gateForPath(path)).toBeNull();
    }
  });

  it("/practice itself is open even though its drill and battle gate", () => {
    // the launcher is a corpus surface; the identity-bearing modes gate.
    // The prefix rows must not swallow the open parent.
    expect(gateForPath("/practice")).toBeNull();
    expect(gateForPath("/practice/drill")).toBe("session");
  });
});
