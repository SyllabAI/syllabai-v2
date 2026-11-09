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
    // Mirrors route-gate.ts's derivation — including the trailing-slash
    // strip on the :path* arm (the "/courses/" row's arm is "/courses/:path*").
    const expected = [
      "/",
      "/login",
      ...GATED_ROUTES.flatMap(({ prefix }) => [
        prefix,
        `${prefix.replace(/\/+$/, "")}/:path*`,
      ]),
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

  it("T-ACCOUNT-ONLY run-001 — every stateful surface gates (the account is the only store)", () => {
    // The sweep moved ALL user state onto the account, so the course hub
    // PAGES (progress overlays, flashcards, guided lessons, question
    // players), past papers (mocks, marking, ink) and the practice launcher
    // now gate exactly like the dashboard. (The directory root /courses was
    // re-opened afterwards by the option 1 ruling — see the test below.)
    for (const path of [
      "/courses/igcse-chemistry-19",
      "/courses/igcse-chemistry-19/revision-notes",
      "/past-papers",
      "/practice",
      "/practice/",
    ]) {
      expect(gateForPath(path)).toBe("session");
    }
  });

  it("option 1 (trace 1a1b53d8068b9b7d) — the directory root is open, the hub subtree gates", () => {
    // Operator ruling "option 1": /courses renders static registry data —
    // no user state, no session read — so anonymous browsing of the
    // directory is honest, and the login page's "Browse without an
    // account" link finally resolves instead of 307-looping. Everything
    // UNDER the root still touches account data and keeps the gate. The
    // trailing slash is the same open root, normalized.
    expect(gateForPath("/courses")).toBeNull();
    expect(gateForPath("/courses/")).toBeNull();
    expect(gateForPath("/courses/igcse-chemistry-19")).toBe("session");
    expect(gateForPath("/courses/igcse-chemistry-19/")).toBe("session");
    expect(gateForPath("/courses/igcse-chemistry-19/flashcards")).toBe("session");
  });

  it("marketing/public surfaces stay open — only stateless browsing is anonymous", () => {
    for (const path of [
      "/",
      "/knowledge-graph",
      "/login",
      "/about/provenance",
    ]) {
      expect(gateForPath(path)).toBeNull();
    }
  });
});
