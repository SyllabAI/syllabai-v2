/**
 * Identity/auth contracts — ported from the frozen Java core.
 *
 * Sources (syllabai-core @ main, 2026-10-04):
 *   src/main/java/com/syllabai/identity/dto/RegisterRequest.java
 *   src/main/java/com/syllabai/identity/dto/LoginRequest.java
 *   src/main/java/com/syllabai/identity/dto/AuthResponse.java
 *   src/main/java/com/syllabai/identity/dto/UserView.java
 */
import { z } from "zod";

/**
 * RegisterRequest — self-registration AND first-admin bootstrap.
 *
 * Java constraints (copied verbatim):
 *   email:       @Email @NotBlank @Size(max = 254)
 *   password:    @NotBlank @Size(min = 12, max = 100)
 *                @Pattern(".*\\p{L}.*" — must contain a letter)
 *                @Pattern(".*\\d.*"   — must contain a digit)
 *   displayName: @NotBlank @Size(min = 2, max = 100)
 *   role:        nullable. Default STUDENT. TEACHER honoured ONLY with a
 *                valid teacher join code (gate fails closed when unset).
 *                ADMIN is NEVER self-serviceable (bootstrap path owns it).
 *   joinCode:    nullable, required when role = TEACHER.
 */
export const registerRequestSchema = z
  .object({
    email: z.string().email().max(254),
    password: z
      .string()
      .min(12)
      .max(100)
      .regex(/.*\p{L}.*/u, "must contain a letter")
      .regex(/.*\d.*/u, "must contain a digit"),
    displayName: z.string().min(2).max(100),
    role: z.string().nullish(),
    joinCode: z.string().nullish(),
  })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** LoginRequest — @Email @NotBlank + @NotBlank password. */
export const loginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** UserView — the user projection at the API boundary (Master Spec §22: never expose entities). */
export const userViewSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  roles: z.array(z.string()),
});

export type UserView = z.infer<typeof userViewSchema>;

/** AuthResponse — tokenType is ALWAYS "Bearer" (Java compact constructor normalises it). */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  user: userViewSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
