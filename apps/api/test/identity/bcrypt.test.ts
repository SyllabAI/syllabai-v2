/**
 * Bcrypt cost-12 pin — R-BCRYPT compat (SecurityConfig.java).
 * Real Bun bcrypt ops (slow ~300ms each) — kept to a minimum; everything
 * else in the suite uses the deterministic fake.
 *
 * Cutover safety documented in password.ts: Java-issued "$2a$…" hashes
 * verify here (algorithm detected from the hash), and Bun's "$2b$12$…"
 * output verifies in the Java core (BCrypt.checkpw accepts 2a/2b/2y).
 */
import { describe, expect, test } from "bun:test";
import { bunBcryptPasswordPort, BCRYPT_COST } from "../../src/services/identity/password";

describe("PasswordEncoder bean port: BCrypt cost 12", () => {
  test("cost constant is 12 (the audit-promoted value)", () => {
    expect(BCRYPT_COST).toBe(12);
  });

  test("hash embeds bcrypt cost 12 ($2b$12$ prefix)", async () => {
    const hash = await bunBcryptPasswordPort.hash("longenough1x");
    expect(hash.startsWith(`$2b$${BCRYPT_COST}$`)).toBe(true);
  });

  test("verify: correct password true, wrong password false", async () => {
    const hash = await bunBcryptPasswordPort.hash("longenough1x");
    expect(await bunBcryptPasswordPort.verify("longenough1x", hash)).toBe(true);
    expect(await bunBcryptPasswordPort.verify("wrong-password", hash)).toBe(false);
  });

  test("Java-core issued $2a$ variant verifies (R-BCRYPT cutover compat)", async () => {
    // Spring Security's BCryptPasswordEncoder issues "$2a$…" hashes; Bun
    // issues "$2b$…". Both encode the same algorithm family — the variant
    // flip must not break verification, or Java-era credentials would die
    // at cutover. (A captured production vector is pinned in the receipt.)
    const hash = await bunBcryptPasswordPort.hash("longenough1x");
    const asJavaStyle = hash.replace(/^\$2b\$/, "$2a$");
    expect(asJavaStyle.startsWith("$2a$12$")).toBe(true);
    expect(await bunBcryptPasswordPort.verify("longenough1x", asJavaStyle)).toBe(true);
  });

  test("malformed stored hash → verify false (matches() never 500s)", async () => {
    expect(await bunBcryptPasswordPort.verify("longenough1x", "$2a$not-a-hash")).toBe(false);
  });
});
