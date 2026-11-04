/**
 * humanizeCoreReasonDetail boundary tests (tier-3 follow-up item 1): core's
 * reasonDetail facts stay verbatim — only the machine FORMATTING changes.
 * These pins keep the "unknown patterns pass through untouched" law honest:
 * the first cut stripped a trailing ")" even when the "(scheduled …"
 * rewrite never ran, unbalancing every detail that ends in a paren.
 *
 * Date expectations call the same en-GB rendering on the same instant as the
 * implementation, so the pins hold in any runner timezone.
 */
import { describe, expect, it } from "bun:test";
import { humanizeCoreReasonDetail } from "./next-best-actions";

/** The exact date rendering the humanizer emits for an ISO instant. */
const enGBDate = (dateOnly: string) =>
  new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

describe("humanizeCoreReasonDetail — the production shape", () => {
  it("rewrites the scheduled-decay row the review captured", () => {
    expect(
      humanizeCoreReasonDetail(
        "Retrieval practice due (scheduled 2026-09-23T05:00:00.102Z, decay crossed threshold, overdue)",
      ),
    ).toBe(
      `Retrieval practice due — scheduled ${enGBDate("2026-09-23")}, its review date has passed, overdue`,
    );
  });

  it("handles ISO without milliseconds and multiple instants", () => {
    expect(
      humanizeCoreReasonDetail("from 2026-08-01T00:00:00Z to 2026-09-23T12:30:00Z"),
    ).toBe(`from ${enGBDate("2026-08-01")} to ${enGBDate("2026-09-23")}`);
  });

  it("decodes the decay code case-insensitively", () => {
    expect(humanizeCoreReasonDetail("DECAY CROSSED THRESHOLD")).toBe(
      "its review date has passed",
    );
  });
});

describe("humanizeCoreReasonDetail — the untouched law", () => {
  it("keeps the closing paren when there is no scheduled rewrite", () => {
    expect(humanizeCoreReasonDetail("Risk noted (self-marked)")).toBe(
      "Risk noted (self-marked)",
    );
    expect(humanizeCoreReasonDetail("Risk noted (decay crossed threshold)")).toBe(
      "Risk noted (its review date has passed)",
    );
  });

  it("passes plain text through byte-identical", () => {
    const line = "3 spec points due for review — weakest at 41% mastery";
    expect(humanizeCoreReasonDetail(line)).toBe(line);
  });

  it("adds no facts: numbers survive verbatim", () => {
    const out = humanizeCoreReasonDetail(
      "likelihood 38% (scheduled 2026-09-23T05:00:00.102Z, overdue)",
    );
    expect(out).toContain("38%");
    expect(out).toContain(enGBDate("2026-09-23"));
  });
});
