/**
 * Password encoder port — R-BCRYPT compat (MIGRATION_PLAN Wave 1).
 * Frozen source: identity/SecurityConfig.java (verified 2026-10-04):
 *   @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
 *
 * Cost 12 is a compat requirement, not a suggestion: the audit rationale
 * (OWASP floor 10 + rate-budgeted login path paying ~2x) is recorded in the
 * core, and existing hashes carry their own embedded cost — so old
 * credentials keep verifying without a migration.
 *
 * Implementation: Bun's native bcrypt (no new dependency — the workspace's
 * root package.json/bun.lock belong to T-MIG-000's fence).
 *   - hash: bcrypt, cost 12 → "$2b$12$…" strings
 *   - verify: algorithm detected from the hash itself, so "$2a$…" hashes
 *     issued by the Java core (Spring Security BCryptPasswordEncoder) verify
 *     unchanged, and "$2b$…" hashes issued here verify in the Java core
 *     (its BCrypt.checkpw accepts 2a/2b/2y) — bidirectional cutover safety.
 */

export interface PasswordPort {
  hash(raw: string): Promise<string>;
  verify(raw: string, hash: string): Promise<boolean>;
}

export const BCRYPT_COST = 12;

export const bunBcryptPasswordPort: PasswordPort = {
  async hash(raw: string): Promise<string> {
    return Bun.password.hash(raw, { algorithm: "bcrypt", cost: BCRYPT_COST });
  },
  async verify(raw: string, hash: string): Promise<boolean> {
    try {
      return await Bun.password.verify(raw, hash);
    } catch {
      // malformed stored hash — the core's matches() returns false on
      // IllegalArgumentException-shaped inputs rather than 500ing
      return false;
    }
  },
};

/** Deterministic fake for pure-logic tests (no ~300ms bcrypt cost per op). */
export const fakePasswordPort: PasswordPort = {
  hash: async (raw) => `fake$${raw}`,
  verify: async (raw, hash) => hash === `fake$${raw}`,
};
