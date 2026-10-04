/**
 * Route-level Jackson/jakarta emulation — turns a raw JSON body into either
 * typed data or the EXACT 400 the frozen core would answer.
 * Frozen sources (verified 2026-10-04, T-MIG-010):
 *   GlobalExceptionHandler.invalid() → 400 "validation_failed",
 *     message "<field>: <defaultMessage>" of the FIRST field error
 *   GlobalExceptionHandler.unreadableBody() → 400 "malformed_body"
 *   dto/*.java constraint declaration order (evaluation order per field)
 *   Hibernate AbstractEmailValidator: null and "" are VALID for @Email
 *     (deferred to @NotBlank) — empty short-circuit mirrored here
 *
 * Why this layer exists: the @syllabai/contracts schemas (T-MIG-001) are the
 * wire-shape truth, but jakarta texts and first-violation ordering live at
 * the Spring boundary. Golden cases capture the boundary, so the boundary is
 * what this module emulates — constraint-for-constraint, in declaration
 * order, with Jackson's scalar→String coercion.
 *
 * Known residuals (from T-MIG-001, unchanged): bracketed IP-literal domains
 * and quoted local parts are Hibernate-accepted but schema-rejected; when a
 * capture hits one, that is a justified-divergence decision — NOT a silent
 * widening. This layer follows the schema in those cases.
 */

import {
  loginRequestSchema,
  passwordChangeRequestSchema,
  registerRequestSchema,
} from "@syllabai/contracts";
import { isJakartaEmail } from "@syllabai/contracts";
import { MalformedBodyError, ValidationError } from "./errors";

const NOT_BLANK = "must not be blank";
const VALID_EMAIL = "must be a valid email";

const sizeText = (min: number, max: number): string => `size must be between ${min} and ${max}`;

/** Jackson scalar→String coercion; non-scalar in a String slot = unreadable. */
function coerceString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  throw new MalformedBodyError();
}

interface StringSlot {
  value: string | null;
}

function slot(body: Record<string, unknown>, field: string): StringSlot {
  return { value: coerceString(body[field]) };
}

function notBlank(s: StringSlot): string | null {
  if (s.value === null || s.value.trim().length === 0) return NOT_BLANK;
  return null;
}

/** @Email with Hibernate's null/"" short-circuit (see module doc). */
function emailStructure(s: StringSlot): string | null {
  if (s.value === null || s.value === "") return null;
  return isJakartaEmail(s.value) ? null : VALID_EMAIL;
}

function sizeMax(s: StringSlot, min: number, max: number): string | null {
  if (s.value === null) return null;
  return s.value.length >= min && s.value.length <= max ? null : sizeText(min, max);
}

function objectBody(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    // Jackson: "Cannot deserialize ... from ARRAY/STRING/etc" → unreadable
    throw new MalformedBodyError();
  }
  return raw as Record<string, unknown>;
}

export interface Parsed<T> {
  ok: boolean;
  data?: T;
  field?: string;
  message?: string;
}

function fail<T>(field: string, message: string): Parsed<T> {
  return { ok: false, field, message };
}

/**
 * RegisterRequest — component order email, password, displayName, role,
 * joinCode; constraint order per component exactly as declared.
 */
export function validateRegister(raw: unknown): Parsed<{
  email: string;
  password: string;
  displayName: string;
  role: string | null;
  joinCode: string | null;
}> {
  const body = objectBody(raw);
  const email = slot(body, "email");
  const password = slot(body, "password");
  const displayName = slot(body, "displayName");
  const role = slot(body, "role");
  const joinCode = slot(body, "joinCode");

  // email: @Email @NotBlank @Size(max = 254)
  let v = emailStructure(email);
  if (v === null) v = notBlank(email);
  if (v === null) v = sizeMax(email, 0, 254);
  if (v !== null) return fail("email", v);

  // password: @NotBlank @Size(min 12, max 100) @Pattern letter @Pattern digit
  v = notBlank(password);
  if (v === null) v = sizeMax(password, 12, 100);
  if (v === null && !/\p{L}/u.test(password.value!)) v = "must contain a letter";
  if (v === null && !/\d/.test(password.value!)) v = "must contain a digit";
  if (v !== null) return fail("password", v);

  // displayName: @NotBlank @Size(min 2, max 100)
  v = notBlank(displayName);
  if (v === null) v = sizeMax(displayName, 2, 100);
  if (v !== null) return fail("displayName", v);

  // role / joinCode: unconstrained String (nullable) — service owns policy
  const data = {
    email: email.value!,
    password: password.value!,
    displayName: displayName.value!,
    role: role.value,
    joinCode: joinCode.value,
  };
  // wire-shape gate (defense-in-depth; contracts is jakarta-faithful per
  // T-MIG-001 except the documented residuals, which arbitrate here)
  const parsed = registerRequestSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue
      ? { ok: false, field: String(issue.path[0] ?? "request"), message: issue.message }
      : fail("request", "request invalid");
  }
  return { ok: true, data };
}

/** LoginRequest — email: @Email @NotBlank (NO @Size); password: @NotBlank only. */
export function validateLogin(raw: unknown): Parsed<{ email: string; password: string }> {
  const body = objectBody(raw);
  const email = slot(body, "email");
  const password = slot(body, "password");

  let v = emailStructure(email);
  if (v === null) v = notBlank(email);
  if (v !== null) return fail("email", v);

  v = notBlank(password);
  if (v !== null) return fail("password", v);

  const data = { email: email.value!, password: password.value! };
  const parsed = loginRequestSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue
      ? { ok: false, field: String(issue.path[0] ?? "request"), message: issue.message }
      : fail("request", "request invalid");
  }
  return { ok: true, data };
}

/**
 * PasswordChangeRequest — currentPassword: @NotBlank (no bounds);
 * newPassword: the register floor (R6 — one platform bar, no weak path).
 */
export function validatePasswordChange(
  raw: unknown,
): Parsed<{ currentPassword: string; newPassword: string }> {
  const body = objectBody(raw);
  const currentPassword = slot(body, "currentPassword");
  const newPassword = slot(body, "newPassword");

  let v = notBlank(currentPassword);
  if (v !== null) return fail("currentPassword", v);

  v = notBlank(newPassword);
  if (v === null) v = sizeMax(newPassword, 12, 100);
  if (v === null && !/\p{L}/u.test(newPassword.value!)) v = "must contain a letter";
  if (v === null && !/\d/.test(newPassword.value!)) v = "must contain a digit";
  if (v !== null) return fail("newPassword", v);

  const data = { currentPassword: currentPassword.value!, newPassword: newPassword.value! };
  const parsed = passwordChangeRequestSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue
      ? { ok: false, field: String(issue.path[0] ?? "request"), message: issue.message }
      : fail("request", "request invalid");
  }
  return { ok: true, data };
}
