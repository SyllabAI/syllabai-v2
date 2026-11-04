/**
 * Boundary tests for the dashboard's human-facing formatters (tier-3
 * follow-up item 1): formatDue's unit ladder and percentLabel's zero-state
 * thresholds are copy decisions pinned here so a refactor cannot silently
 * ship "overdue · 20761 d" or a wall of "0.4%" again.
 *
 * formatDue takes an injectable `now` — no fake timers needed. The date-branch
 * expectations are built by calling the same Intl rendering on the same
 * instant inside the test, so they hold in any runner timezone.
 */
import { describe, expect, it } from "bun:test";
import { formatDue, percentLabel } from "./format";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** The exact rendering formatDue's date branch uses, applied to the same instant. */
const enGB = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

describe("formatDue — the machine-unit regression pins", () => {
  it("drops the 57-year count on the probe fixture's epoch-0 dueAt", () => {
    // The production leak of record: "overdue · 20761 d" on dueAt 1970-01-01.
    expect(formatDue("1970-01-01T00:00:00.000Z", NOW)).toBe("overdue");
  });

  it("returns 'no due date' for a junk instant instead of a count", () => {
    expect(formatDue("not-a-date", NOW)).toBe("no due date");
  });
});

describe("formatDue — future ladder", () => {
  it("under a minute: due any moment", () => {
    expect(formatDue(new Date(NOW + 30_000).toISOString(), NOW)).toBe("due any moment");
  });

  it("minutes: singular and plural", () => {
    expect(formatDue(new Date(NOW + 1 * MIN).toISOString(), NOW)).toBe("due in 1 min");
    expect(formatDue(new Date(NOW + 45 * MIN).toISOString(), NOW)).toBe("due in 45 mins");
  });

  it("hours below 48: singular and plural — a day is still spoken in hours", () => {
    expect(formatDue(new Date(NOW + 1 * HOUR).toISOString(), NOW)).toBe("due in 1 hour");
    expect(formatDue(new Date(NOW + 3 * HOUR).toISOString(), NOW)).toBe("due in 3 hours");
    expect(formatDue(new Date(NOW + 47 * HOUR).toISOString(), NOW)).toBe("due in 47 hours");
    expect(formatDue(new Date(NOW + DAY).toISOString(), NOW)).toBe("due in 24 hours");
  });

  it("days below 14 (from 48h up): rounded, singular and plural", () => {
    expect(formatDue(new Date(NOW + 2 * DAY).toISOString(), NOW)).toBe("due in 2 days");
    expect(formatDue(new Date(NOW + 3 * DAY).toISOString(), NOW)).toBe("due in 3 days");
    // 13.6 days rounds to 14 — still inside the days rung, never "2 weeks".
    expect(formatDue(new Date(NOW + Math.round(13.6 * DAY)).toISOString(), NOW)).toBe(
      "due in 14 days",
    );
  });

  it("weeks from 14 days to 70: rounded weeks", () => {
    expect(formatDue(new Date(NOW + 14 * DAY).toISOString(), NOW)).toBe("due in 2 weeks");
    expect(formatDue(new Date(NOW + 30 * DAY).toISOString(), NOW)).toBe("due in 4 weeks");
    expect(formatDue(new Date(NOW + 69 * DAY).toISOString(), NOW)).toBe("due in 10 weeks");
  });

  it("from 70 days to 2 years: a real en-GB date", () => {
    const t100 = new Date(NOW + 100 * DAY).toISOString();
    expect(formatDue(t100, NOW)).toBe(`due ${enGB(t100)}`);
  });

  it("beyond two years: the count is dropped", () => {
    expect(formatDue(new Date(NOW + 730 * DAY + DAY).toISOString(), NOW)).toBe("due later");
  });
});

describe("formatDue — overdue ladder", () => {
  it("under a minute: plain overdue", () => {
    expect(formatDue(new Date(NOW - 30_000).toISOString(), NOW)).toBe("overdue");
  });

  it("human units with the 'by' idiom", () => {
    expect(formatDue(new Date(NOW - 2 * HOUR).toISOString(), NOW)).toBe("overdue by 2 hours");
    expect(formatDue(new Date(NOW - 1 * HOUR).toISOString(), NOW)).toBe("overdue by 1 hour");
    expect(formatDue(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe("overdue by 3 days");
    expect(formatDue(new Date(NOW - 21 * DAY).toISOString(), NOW)).toBe("overdue by 3 weeks");
  });

  it("a real date for the 70-day-to-2-years rung", () => {
    const t100 = new Date(NOW - 100 * DAY).toISOString();
    expect(formatDue(t100, NOW)).toBe(`overdue since ${enGB(t100)}`);
  });

  it("beyond two years: badge carries the fact, no count", () => {
    expect(formatDue(new Date(NOW - 731 * DAY).toISOString(), NOW)).toBe("overdue");
  });
});

describe("percentLabel — the zero-state thresholds", () => {
  it("0 (and negative junk) says Not started, not 0%", () => {
    expect(percentLabel(0)).toBe("Not started");
    expect(percentLabel(-0)).toBe("Not started");
    expect(percentLabel(-3)).toBe("Not started");
  });

  it("near-zero says Just started — '0.4%' is not a progress report", () => {
    expect(percentLabel(0.4)).toBe("Just started");
    expect(percentLabel(4.99)).toBe("Just started");
  });

  it("at 5 the number takes over", () => {
    expect(percentLabel(5)).toBe("5%");
    expect(percentLabel(12.4)).toBe("12%");
    expect(percentLabel(100)).toBe("100%");
  });
});
