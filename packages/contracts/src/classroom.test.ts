/**
 * Classroom wire-contract pins (T-MIG-052 tranche 1) — the schemas ported
 * from ClassroomViews.java + TeacherViews.LearnerRosterView + the
 * TeacherClassController request records (frozen @ 6cad6ef). The
 * parse/wire LAWS live in the service (parseClassStatus /
 * parseAnnouncementCategory / .wire) and are pinned there; this file pins
 * the SCHEMA law: constraints copied exactly, the Java record wins.
 */
import { describe, expect, test } from "bun:test";
import {
  announcementReadResultSchema,
  classCreateRequestSchema,
  classEnrollRequestSchema,
  classPublishRequestSchema,
  classStatusRequestSchema,
  classMemberViewSchema,
  learnerAnnouncementViewSchema,
  learnerClassroomViewSchema,
  learnerClassViewSchema,
  learnerRosterViewSchema,
  teacherAnnouncementViewSchema,
  teacherClassDetailViewSchema,
  teacherClassViewSchema,
} from "./classroom";

const UUID_A = "aa000000-0000-4000-8000-000000000001";
const UUID_B = "bb000000-0000-4000-8000-000000000002";
const UUID_C = "cc000000-0000-4000-8000-000000000003";

describe("classroom wire schemas", () => {
  test("teacherClassViewSchema accepts the frozen record shape", () => {
    const parsed = teacherClassViewSchema.parse({
      id: UUID_A,
      courseSlug: "igcse-chemistry-19",
      courseLabel: "IGCSE Chemistry",
      name: "Period 3",
      status: "active",
      memberCount: 12,
      createdAt: "2026-10-06T01:00:00.000Z",
    });
    expect(parsed.memberCount).toBe(12);
    expect(parsed.status).toBe("active");
  });

  test("teacherClassViewSchema rejects a non-int memberCount", () => {
    expect(
      teacherClassViewSchema.safeParse({
        id: UUID_A,
        courseSlug: "s",
        courseLabel: "l",
        name: "n",
        status: "active",
        memberCount: 1.5,
        createdAt: "2026-10-06T01:00:00.000Z",
      }).success,
    ).toBeFalse();
  });

  test("teacherClassDetailViewSchema nests ClassMemberView rows", () => {
    const parsed = teacherClassDetailViewSchema.parse({
      id: UUID_A,
      courseSlug: "s",
      courseLabel: "l",
      name: "n",
      status: "archived",
      createdAt: "2026-10-06T01:00:00.000Z",
      members: [
        {
          studentId: UUID_B,
          displayName: "(removed account)",
          email: "(unavailable)",
          enrolledBy: UUID_C,
          enrolledAt: "2026-10-05T09:00:00.000Z",
        },
      ],
    });
    expect(parsed.members[0]!.displayName).toBe("(removed account)");
  });

  test("teacherAnnouncementViewSchema carries counts + kebab category", () => {
    const parsed = teacherAnnouncementViewSchema.parse({
      id: UUID_A,
      title: "Lab kits",
      body: "Bring lab kits Thursday.",
      category: "exam-reminder",
      readCount: 3,
      memberCount: 12,
      createdAt: "2026-10-06T01:00:00.000Z",
    });
    expect(parsed.category).toBe("exam-reminder");
  });

  test("learnerClassroomViewSchema is the classes[] + unread badge shape", () => {
    const parsed = learnerClassroomViewSchema.parse({
      classes: [
        {
          id: UUID_A,
          courseSlug: "s",
          courseLabel: "l",
          name: "n",
          teacherName: "(unavailable)",
          unreadAnnouncements: 0,
          enrolledAt: "2026-10-05T09:00:00.000Z",
        },
      ],
      unreadAnnouncements: 0,
    });
    expect(parsed.classes).toHaveLength(1);
    expect(parsed.unreadAnnouncements).toBe(0);
  });

  test("learnerAnnouncementViewSchema carries classId/className + read flag", () => {
    const parsed = learnerAnnouncementViewSchema.parse({
      id: UUID_A,
      classId: UUID_B,
      className: "Period 3",
      courseSlug: "s",
      teacherName: "Ms. Okafor",
      title: "t",
      body: "b",
      category: "homework",
      read: false,
      createdAt: "2026-10-06T01:00:00.000Z",
    });
    expect(parsed.read).toBeFalse();
    expect(parsed.classId).toBe(UUID_B);
  });

  test("learnerRosterViewSchema is identity projection only (no learning data)", () => {
    const parsed = learnerRosterViewSchema.parse({
      id: UUID_B,
      displayName: "Amara H.",
      email: "amara@example.test",
      createdAt: "2026-09-01T08:00:00.000Z",
    });
    expect(Object.keys(parsed).sort()).toEqual(["createdAt", "displayName", "email", "id"]);
  });
});

describe("classroom request schemas (constraints verbatim)", () => {
  test("classCreateRequestSchema: @NotBlank @Size(max 64/120/120)", () => {
    expect(
      classCreateRequestSchema.safeParse({ courseSlug: "s", courseLabel: "l", name: "n" }).success,
    ).toBeTrue();
    expect(
      classCreateRequestSchema.safeParse({ courseSlug: "", courseLabel: "l", name: "n" }).success,
    ).toBeFalse(); // @NotBlank courseSlug
    expect(
      classCreateRequestSchema.safeParse({ courseSlug: "s", courseLabel: "l", name: "" }).success,
    ).toBeFalse(); // @NotBlank name
    expect(
      classCreateRequestSchema.safeParse({ courseSlug: "x".repeat(65), courseLabel: "l", name: "n" })
        .success,
    ).toBeFalse(); // @Size(max 64)
    expect(
      classCreateRequestSchema.safeParse({ courseSlug: "s", courseLabel: "x".repeat(121), name: "n" })
        .success,
    ).toBeFalse(); // @Size(max 120)
    expect(
      classCreateRequestSchema.safeParse({ courseSlug: "s", courseLabel: "l", name: "x".repeat(121) })
        .success,
    ).toBeFalse(); // @Size(max 120)
    // T-MIG-056 amendment: @NotBlank is the whitespace-EXACT port — a
    // whitespace-only value fails @Valid (validation_failed envelope),
    // exactly jakarta; .min(1) would have passed it to the service
    expect(
      classCreateRequestSchema.safeParse({ courseSlug: "s", courseLabel: "l", name: "   " })
        .success,
    ).toBeFalse(); // @NotBlank name (whitespace-only)
    expect(
      classCreateRequestSchema.safeParse({ courseSlug: "  ", courseLabel: "l", name: "n" })
        .success,
    ).toBeFalse(); // @NotBlank courseSlug (whitespace-only)
  });

  test("classStatusRequestSchema: @NotBlank status (parse tolerance is service law)", () => {
    expect(classStatusRequestSchema.safeParse({ status: "archived" }).success).toBeTrue();
    expect(classStatusRequestSchema.safeParse({ status: "" }).success).toBeFalse();
    // an UNKNOWN non-blank value passes the SCHEMA — the 400 is the service's
    // verbatim-status law, not schema law
    expect(classStatusRequestSchema.safeParse({ status: "deleted" }).success).toBeTrue();
  });

  test("classEnrollRequestSchema: @NotBlank @Size(max 254) email", () => {
    expect(classEnrollRequestSchema.safeParse({ email: "s@example.test" }).success).toBeTrue();
    expect(classEnrollRequestSchema.safeParse({ email: "" }).success).toBeFalse();
    expect(classEnrollRequestSchema.safeParse({ email: "x".repeat(255) }).success).toBeFalse();
    expect(classEnrollRequestSchema.safeParse({ email: "x".repeat(254) }).success).toBeTrue();
  });

  test("classPublishRequestSchema: title @NotBlank @Size(max 200), body @NotBlank, category optional ≤20", () => {
    const base = { title: "t", body: "b" };
    expect(classPublishRequestSchema.safeParse(base).success).toBeTrue(); // category ABSENT → GENERAL at the service
    expect(classPublishRequestSchema.safeParse({ ...base, category: "exam-reminder" }).success).toBeTrue();
    // T-MIG-056 amendment: an EXPLICIT JSON null binds exactly like an
    // absent field in Jackson → Category.parse(null) → GENERAL (the 201)
    expect(classPublishRequestSchema.safeParse({ ...base, category: null }).success).toBeTrue();
    expect(classPublishRequestSchema.safeParse({ ...base, category: "x".repeat(21) }).success).toBeFalse();
    expect(classPublishRequestSchema.safeParse({ ...base, title: "" }).success).toBeFalse();
    expect(classPublishRequestSchema.safeParse({ ...base, body: "" }).success).toBeFalse();
    expect(
      classPublishRequestSchema.safeParse({ ...base, title: "x".repeat(201) }).success,
    ).toBeFalse();
  });

  test("announcementReadResultSchema is the { id, read: true } receipt", () => {
    expect(announcementReadResultSchema.parse({ id: UUID_A, read: true })).toEqual({
      id: UUID_A,
      read: true,
    });
    expect(announcementReadResultSchema.safeParse({ id: UUID_A, read: false }).success).toBeTrue();
  });

  test("classMemberViewSchema requires enrolledBy uuid (the audited enrollment law)", () => {
    expect(
      classMemberViewSchema.safeParse({
        studentId: UUID_B,
        displayName: "Amara H.",
        email: "a@example.test",
        enrolledBy: "not-a-uuid",
        enrolledAt: "2026-10-05T09:00:00.000Z",
      }).success,
    ).toBeFalse();
  });
});
