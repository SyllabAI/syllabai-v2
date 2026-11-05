/**
 * T-TEACHGENIE-001 — Teach Genie display laws (pure helpers, no network).
 */
import { describe, expect, it } from "bun:test";
import {
  endedLine,
  objectiveDotClass,
  objectiveStatusLabel,
  statusDotClass,
  statusLabel,
  timeAgo,
} from "./util";

describe("teach-genie display laws (T-TEACHGENIE-001; house tokens since -004)", () => {
  it("timeAgo: MG row recipe — minutes, hours, days, then the date", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(timeAgo("2026-11-04T12:00:00Z", now)).toBe("0m ago");
    expect(timeAgo("2026-11-04T11:48:00Z", now)).toBe("12m ago");
    expect(timeAgo("2026-11-04T09:30:00Z", now)).toBe("2h ago");
    expect(timeAgo("2026-11-02T12:00:00Z", now)).toBe("2d ago");
    // older than a week: a date, not a day count
    expect(timeAgo("2026-10-01T12:00:00Z", now)).toMatch(/Oct/);
  });

  it("status dots + labels: completed is green, active is house primary, pending amber", () => {
    expect(statusDotClass("completed")).toBe("bg-green-500");
    expect(statusDotClass("active")).toBe("bg-primary");
    expect(statusDotClass("review_pending")).toBe("bg-amber-500");
    expect(statusDotClass("abandoned")).toContain("muted-foreground");
    expect(statusLabel("completed")).toBe("Completed");
    expect(statusLabel("active")).toBe("In progress");
  });

  it("objective statuses: covered/not_covered/flagged/not_started map honestly", () => {
    expect(objectiveStatusLabel("not_started")).toBe("Not started");
    expect(objectiveStatusLabel("covered")).toBe("Covered");
    expect(objectiveStatusLabel("not_covered")).toBe("Not covered");
    expect(objectiveStatusLabel("flagged")).toContain("Flagged");
    // dots: covered green, flagged amber, not_started is the hollow radio
    expect(objectiveDotClass("covered")).toContain("green");
    expect(objectiveDotClass("flagged")).toContain("amber");
    expect(objectiveDotClass("not_started")).toContain("border-border");
  });

  it("endedLine: the review divider renders a real timestamp", () => {
    expect(endedLine("2026-10-31T23:24:00Z")).toMatch(/Oct/);
    expect(endedLine("not-a-date")).toBe("");
  });
});
