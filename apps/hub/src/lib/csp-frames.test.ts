import { describe, expect, test } from "bun:test";

import nextConfig from "../../next.config";

/**
 * lib/csp-frames.test.ts — the CSP frame law (T-BOOK-CSP-1).
 *
 * `frame-src 'self'` shipped when the only frames were the SAME-ORIGIN KG /
 * graph explorer builds — and silently blocked every cross-origin embed the
 * books lesson rail later shipped (ADR-BOOK-0002 media-embed via
 * youtube-nocookie.com, T-BOOK-006 sim-embed via phet.colorado.edu): the
 * widget card rendered, the browser refused the iframe. This test pins the
 * header to the rail's shipped widget laws so the two can never drift apart
 * again:
 *
 *   - BOTH embed hosts stay allow-listed (a host removed here re-breaks the
 *     lesson player / simulations in every browser);
 *   - NO third host sneaks in (frame hosts are a licensing surface —
 *     ADR-BOOK-0002 embeds video via youtube-nocookie ONLY, T-BOOK-006 PhET
 *     is the ONLY sim provider; a new provider must amend both sides);
 *   - the framing posture is untouched: frame-ancestors 'self' +
 *     X-Frame-Options SAMEORIGIN govern who may frame US, and this lane
 *     deliberately does not widen them.
 */

const ALLOWED_FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://phet.colorado.edu",
] as const;

async function securityHeaders(): Promise<Record<string, string>> {
  expect(nextConfig.headers).toBeDefined();
  const headers = (await nextConfig.headers?.()) ?? [];
  const [row] = headers;
  expect(row).toBeDefined();
  return Object.fromEntries(row!.headers.map((h) => [h.key, h.value]));
}

describe("CSP frame law (next.config.ts SECURITY_HEADERS)", () => {
  test("frame-src allow-lists exactly the shipped embed hosts + self", async () => {
    const headers = await securityHeaders();
    const csp = headers["Content-Security-Policy"];
    expect(csp).toBeDefined();

    const frameSrc = csp
      ?.split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("frame-src"));
    expect(frameSrc).toBeDefined();

    const sources = frameSrc!.split(/\s+/).slice(1);
    expect(sources).toContain("'self'");
    for (const host of ALLOWED_FRAME_HOSTS) {
      expect(sources).toContain(host);
    }
    // the allow-list is CLOSED: self + the two widget hosts, nothing else
    expect(sources.sort()).toEqual(["'self'", ...ALLOWED_FRAME_HOSTS].sort());
  });

  test("the framing posture is untouched (frame-ancestors self + XFO)", async () => {
    const headers = await securityHeaders();
    const csp = headers["Content-Security-Policy"];
    expect(csp).toContain("frame-ancestors 'self'");
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
  });
});
