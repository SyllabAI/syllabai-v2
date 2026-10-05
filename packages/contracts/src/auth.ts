/**
 * Identity/auth contracts — ported from the frozen Java core.
 *
 * Sources (syllabai-core @ main, frozen, verified 2026-10-04 by T-MIG-001):
 *   src/main/java/com/syllabai/identity/dto/RegisterRequest.java
 *   src/main/java/com/syllabai/identity/dto/LoginRequest.java
 *   src/main/java/com/syllabai/identity/dto/PasswordChangeRequest.java
 *   src/main/java/com/syllabai/identity/dto/AuthResponse.java
 *   src/main/java/com/syllabai/identity/dto/UserView.java
 *   src/main/java/com/syllabai/identity/Role.java
 *
 * Wire facts verified in the frozen sources (T-MIG-001 evidence):
 *   - Identity surfaces live under /api/v1/auth/** (AuthController.java:25,
 *     BootstrapAdminController.java:24): register, login, me, password,
 *     bootstrap-status, bootstrap-admin. Path parity is T-MIG-010's gate.
 *   - Spring Boot default Jackson (no override in the frozen repo): unknown
 *     JSON properties are IGNORED on request binding. Therefore the request
 *     schemas below are NOT `.strict()` — a request with extra keys is
 *     accepted by the core and must be accepted here (index.ts rule 3).
 *     The seed's `.strict()` was a port bug; removed in T-MIG-001.
 *   - jakarta @NotBlank (null/blank rejected; " x " with padding is VALID)
 *     is mirrored by the `notBlank` refine — zod's built-ins alone accept
 *     "  ", which the core rejects (load-bearing on displayName,
 *     login.password, currentPassword).
 *   - jakarta @Email is Hibernate Validator's AbstractEmailValidator:
 *     split at the LAST '@', dot-atom local part (≤64 chars), domain of
 *     alphanumeric labels (hyphens inside labels ok, no TLD required —
 *     "a@b" is VALID), label ≤63, domain ≤255. Mirrored by
 *     `isJakartaEmail` + `jakartaEmailSchema`. Known residual divergences,
 *     flagged for golden capture (R6): bracketed IP-literal domains and
 *     RFC-5322 quoted local parts are accepted by Hibernate and rejected
 *     here — record them in golden cases only if a capture hits them.
 *   - Role.java: exactly { STUDENT, TEACHER, ADMIN }. User.roles is
 *     Set<Role>; UserView.from maps Enum::name, so a UserView.roles array
 *     can only ever contain those three names (all three UserView
 *     construction sites — AuthService.java:84, AuthService.java:139,
 *     BootstrapAdminService.java:127 — go through UserView.from).
 *
 * Boundary note for T-MIG-010 (service-level, deliberately NOT encoded in
 * these DTO schemas): AuthService.register resolves the requested role as
 * STUDENT by default, honours TEACHER only with a join code (constant-time
 * compare, fails closed when SYLLABAI_TEACHER_JOIN_CODE is unset) and
 * refuses ADMIN (AuthService.java:102). The DTO itself takes `role: String`
 * — "role":"ADMIN" must pass THIS schema and be refused by the ported
 * service, or the accept/reject set drifts from the core.
 *
 * zod-3 note: `.refine()` returns ZodEffects, which has no string methods —
 * so every chain below applies min/max/regex FIRST and refinements LAST
 * (accept/reject sets are unaffected by that ordering; jakarta evaluates
 * all constraints and rejects on any violation, and so does any zod chain).
 */
import { z } from "zod";

/** jakarta @NotBlank — null/empty rejected, whitespace-padded values valid.
 * (T-MIG-005: exported for the wave-2 param schemas — no behavior change.) */
export const notBlank = (message: string) => (s: string) => s.trim().length > 0;

/**
 * jakarta @Email per Hibernate Validator's AbstractEmailValidator
 * (constraint-for-constraint; see header). "a@b" is valid; "a@b." is not.
 */
export const isJakartaEmail = (value: string): boolean => {
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || domain.length > 255) return false;
  const localRe = /^[A-Za-z0-9_!#$%&'*+/=?`{|}~^-]+(?:\.[A-Za-z0-9_!#$%&'*+/=?`{|}~^-]+)*$/;
  const labelRe = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  if (!localRe.test(local)) return false;
  return domain.split(".").every((label) => labelRe.test(label));
};

/** @Email @NotBlank (register email adds @Size(max=254) — login does not).
 *  R0 (T-MIG-017): message text pinned to Hibernate's @Email default as
 *  captured live from the frozen core (golden auth-register-bad-email-400):
 *  "must be a well-formed email address". */
const jakartaEmailSchema = (max: number | undefined) =>
  z
    .string()
    .max(max ?? Number.MAX_SAFE_INTEGER)
    .refine(isJakartaEmail, "must be a well-formed email address")
    .refine(notBlank("must not be blank"), "must not be blank");

/**
 * The platform's ONE password bar (R6) — shared by RegisterRequest and
 * PasswordChangeRequest ("same floor as registration: one platform bar, no
 * weak rotation path" — PasswordChangeRequest.java:17):
 *   @NotBlank @Size(min = 12, max = 100)
 *   @Pattern(".*\p{L}.*")  — must contain a letter
 *   @Pattern(".*\d.*")     — must contain a digit
 */
const passwordSchema = z
  .string()
  .min(12)
  .max(100)
  .regex(/.*\p{L}.*/u, "must contain a letter")
  .regex(/.*\d.*/u, "must contain a digit")
  .refine(notBlank("must not be blank"), "must not be blank");

/**
 * RegisterRequest — self-registration AND first-admin bootstrap (the
 * bootstrap controller reuses this record — RegisterRequest.java:9-10).
 *
 * Java constraints (copied verbatim):
 *   email:       @Email @NotBlank @Size(max = 254)
 *   password:    @NotBlank @Size(min = 12, max = 100) + letter + digit
 *   displayName: @NotBlank @Size(min = 2, max = 100)
 *   role:        nullable String (no annotations). Default STUDENT.
 *                TEACHER honoured ONLY with a valid join code, gate fails
 *                closed when unset. ADMIN refused — at the SERVICE, not
 *                here (AuthService.java:102; see boundary note above).
 *   joinCode:    nullable String, required when role = TEACHER.
 */
export const registerRequestSchema = z.object({
  email: jakartaEmailSchema(254),
  password: passwordSchema,
  displayName: z
    .string()
    .min(2)
    .max(100)
    .refine(notBlank("must not be blank"), "must not be blank"),
  role: z.string().nullish(),
  joinCode: z.string().nullish(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** LoginRequest — @Email @NotBlank email (no @Size) + @NotBlank password (no floor). */
export const loginRequestSchema = z.object({
  email: jakartaEmailSchema(undefined),
  password: z.string().refine(notBlank("must not be blank"), "must not be blank"),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * PasswordChangeRequest — self-service credential rotation (§22). The
 * CURRENT password must be presented — knowledge of the existing secret is
 * the authorization for the change, so a stolen access token alone cannot
 * take over the account (PasswordChangeRequest.java:8-11).
 *
 * Java constraints (copied verbatim):
 *   currentPassword: @NotBlank (no size bounds)
 *   newPassword:     the register floor (R6) — @NotBlank @Size(12,100)
 *                    + letter + digit
 */
export const passwordChangeRequestSchema = z.object({
  currentPassword: z.string().refine(notBlank("must not be blank"), "must not be blank"),
  newPassword: passwordSchema,
});

export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>;

/**
 * Role.java — system roles (Master Spec §6.1, T-003), mirrors the roles
 * table seed values. Enum valueOf is case-sensitive, so "student" is not a
 * role. Used by the RBAC middleware port (T-MIG-010) and as the observed
 * value domain of UserView.roles.
 */
export const roleSchema = z.enum(["STUDENT", "TEACHER", "ADMIN"]);

export type Role = z.infer<typeof roleSchema>;

/** UserView — the user projection at the API boundary (Master Spec §22: never expose entities). */
export const userViewSchema = z.object({
  id: z.string().uuid(),
  email: z.string().refine(isJakartaEmail, "must be a well-formed email address"),
  displayName: z.string(),
  roles: z.array(roleSchema),
});

export type UserView = z.infer<typeof userViewSchema>;

/**
 * AuthResponse — tokenType is ALWAYS "Bearer" (Java compact constructor
 * normalises it — AuthResponse.java:5-7; callers pass null and the record
 * rewrites it). accessToken: unconstrained String.
 */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  user: userViewSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
