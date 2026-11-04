/**
 * T-TEACH-REPORTS-1 — the /teacher/reports export pins. The builders are
 * pure functions of the class-intelligence wire shapes, so every honesty
 * law is pinned at the unit level: unmeasured exports EMPTY (never 0, never
 * "N/A"), RFC 4180 escaping, CRLF documents, self-describing meta columns,
 * verbatim ISO stamps, and the stable filename law.
 */
import { describe, expect, test } from "bun:test";
import {
  csvDocument,
  csvField,
  csvRow,
  dayStamp,
  formatIso,
  formatMastery,
  misconceptionCodesCell,
  reportFileName,
  rootSlug,
  studentsCsv,
  topicsCsv,
  weakestTopicsCell,
} from "./report-export";
import type { ClassLearnerRow, ClassOverviewView } from "@/lib/types";

// ── fixtures: the smallest honest views ────────────────────────────────────

function overviewFixture(): ClassOverviewView {
  return {
    rootId: "00000000-0000-0000-0000-000000000abc",
    rootCode: "4CH1",
    policy: "paper-defaults",
    enrolledLearners: 2,
    learnersWithEvidence: 1,
    learnersRecentlyActive: 1,
    totalTopics: 12,
    measuredTopics: 4,
    topics: [
      {
        nodeId: "00000000-0000-0000-0000-00000000t001",
        code: "T2",
        title: "States of matter",
        parentCode: null,
        parentTitle: null,
        learnersMeasured: 1,
        meanMastery: 0.42,
        masteryBand: "DEVELOPING",
        evidenceBackedAttempts: 9,
        learnersWithActiveMisconception: 1,
        activeMisconceptionSignals: 1,
        tutorEngagements: 2,
        dueReviews: 4,
        servableQuestions: 17,
      },
      {
        nodeId: "00000000-0000-0000-0000-00000000t002",
        code: "T1",
        title: "Bonding, quoted, \"ionic\"",
        parentCode: null,
        parentTitle: null,
        learnersMeasured: 2,
        meanMastery: null,
        masteryBand: "UNMEASURED",
        evidenceBackedAttempts: 0,
        learnersWithActiveMisconception: 0,
        activeMisconceptionSignals: 0,
        tutorEngagements: 0,
        dueReviews: 0,
        servableQuestions: 0,
      },
    ],
    weakPrerequisites: [],
    recentActivity: {
      recentAttempts: 5,
      learnersActive: 1,
      tutorAsks: 2,
      structuredAnswersPendingMarking: 0,
      windowStart: "2026-11-04T00:00:00Z",
    },
  };
}

function learnerFixture(overrides: Partial<ClassLearnerRow> = {}): ClassLearnerRow {
  return {
    learnerId: "11111111-1111-1111-1111-111111111111",
    displayName: "Nguyen, Linh",
    createdAt: "2026-10-01T08:00:00Z",
    evidenceState: "MEASURED",
    topicsMeasured: 4,
    meanMastery: 0.63,
    evidenceBackedAttempts: 21,
    recentAttempts: 5,
    recentCorrect: 4,
    lastActivityAt: "2026-11-05T01:12:00Z",
    weakestTopics: [
      { nodeId: "n1", code: "T2", title: "States of matter", mastery: 0.31, band: "LOW", attempts: 3 },
    ],
    activeMisconceptions: 1,
    misconceptionSignals: [
      {
        misconceptionNodeId: "m1",
        code: "MC-EVAP-BOIL",
        title: "Evaporation vs boiling",
        probability: 0.71,
        evidenceCount: 3,
        parentTopicNodeId: "n1",
        parentTopicCode: "T2",
      },
    ],
    tutorEngagements: 2,
    tutorSignalCounts: {},
    lastTutorEngagementAt: "2026-11-05T00:40:00Z",
    dueReviews: 6,
    ...overrides,
  };
}

// ── field/row/document primitives ──────────────────────────────────────────

describe("csvField", () => {
  test("plain values ride verbatim; null/undefined export as EMPTY cells", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField(42)).toBe("42");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  test("fields with commas, quotes, CR or LF are quoted and quotes doubled", () => {
    expect(csvField("Nguyen, Linh")).toBe('"Nguyen, Linh"');
    expect(csvField('quoted "ionic"')).toBe('"quoted ""ionic"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("cr\r lf")).toBe('"cr\r lf"');
  });
});

describe("csvRow / csvDocument", () => {
  test("rows join fields with commas", () => {
    expect(csvRow(["a", 1, null])).toBe("a,1,");
  });

  test("documents join rows with CRLF and carry the trailing terminator", () => {
    expect(csvDocument(["h1,h2", "a,b"])).toBe("h1,h2\r\na,b\r\n");
  });
});

describe("mastery / iso formatting", () => {
  test("unmeasured mastery exports EMPTY — never 0, never a placeholder", () => {
    expect(formatMastery(null)).toBe("");
    expect(formatMastery(undefined)).toBe("");
  });

  test("measured mastery is the raw 0–1 value at two decimals", () => {
    expect(formatMastery(0)).toBe("0.00");
    expect(formatMastery(0.63)).toBe("0.63");
    expect(formatMastery(1)).toBe("1.00");
  });

  test("ISO stamps ride verbatim (timezone-true), null → empty", () => {
    expect(formatIso("2026-11-05T01:12:00Z")).toBe("2026-11-05T01:12:00Z");
    expect(formatIso(null)).toBe("");
  });
});

describe("cells", () => {
  test("weakest topics render code, band, mastery and attempts", () => {
    expect(weakestTopicsCell(learnerFixture())).toBe("T2 LOW 0.31 (3 attempts)");
  });

  test("a learner with no weak topics exports an empty cell", () => {
    expect(weakestTopicsCell(learnerFixture({ weakestTopics: [] }))).toBe("");
  });

  test("misconception codes join with semicolons", () => {
    expect(misconceptionCodesCell(learnerFixture())).toBe("MC-EVAP-BOIL");
  });
});

// ── document-level laws ────────────────────────────────────────────────────

describe("studentsCsv", () => {
  test("header carries the meta columns then the learner schema", () => {
    const doc = studentsCsv(overviewFixture(), [learnerFixture()], "2026-11-05T02:00:00Z");
    const first = doc.split("\r\n")[0]!;
    expect(first.startsWith("root_code,generated_at,evidence_window_start,learner_id")).toBe(true);
    expect(first).toContain("mean_mastery");
    expect(first).toContain("weakest_topics");
  });

  test("every data row is self-describing and evidence-true", () => {
    const doc = studentsCsv(overviewFixture(), [learnerFixture()], "2026-11-05T02:00:00Z");
    const lines = doc.split("\r\n").filter(Boolean);
    expect(lines.length).toBe(2); // header + one learner
    const row = lines[1]!;
    expect(row.startsWith("4CH1,2026-11-05T02:00:00Z,2026-11-04T00:00:00Z,")).toBe(true);
    expect(row).toContain(",MEASURED,");
    expect(row).toContain(",0.63,");
    expect(row).toContain('"Nguyen, Linh"'); // comma name → quoted field
    expect(row).toContain("MC-EVAP-BOIL");
  });

  test("an UNMEASURED learner exports empty mastery/last-activity cells", () => {
    const unmeasured = learnerFixture({
      evidenceState: "UNMEASURED",
      meanMastery: null,
      topicsMeasured: 0,
      lastActivityAt: null,
      weakestTopics: [],
      misconceptionSignals: [],
      activeMisconceptions: 0,
    });
    const doc = studentsCsv(overviewFixture(), [unmeasured], "2026-11-05T02:00:00Z");
    const row = doc.split("\r\n").filter(Boolean)[1]!;
    expect(row).toContain(",UNMEASURED,");
    expect(row).not.toContain("0.00"); // no fabricated zero anywhere
    // trailing shape: 0 misconceptions, then EMPTY codes and weakest cells
    expect(row.endsWith("0,,")).toBe(true);
  });
});

describe("topicsCsv", () => {
  test("topics sort by code; unmeasured means export empty; parent cells nullable", () => {
    const doc = topicsCsv(overviewFixture(), "2026-11-05T02:00:00Z");
    const lines = doc.split("\r\n").filter(Boolean);
    expect(lines.length).toBe(3); // header + T1 + T2
    expect(lines[1]!.includes(",T1,")).toBe(true); // T1 first (code order)
    expect(lines[1]).toContain('"Bonding, quoted, ""ionic"""');
    expect(lines[1]).toContain(",UNMEASURED,0,0"); // empty mastery between bands
    expect(lines[2]).toContain(",T2,");
    expect(lines[2]).toContain(",DEVELOPING,");
  });
});

describe("filenames", () => {
  test("day stamp is UTC yyyymmdd from the ISO head", () => {
    expect(dayStamp("2026-11-05T02:00:00Z")).toBe("20261105");
  });

  test("root slug lowercases and strips unsafe characters", () => {
    expect(rootSlug("4CH1")).toBe("4ch1");
    expect(rootSlug("Weird//Code!")).toBe("weird-code");
    expect(rootSlug("!!!")).toBe("class"); // never an empty stem
  });

  test("the report filename law is stable and sort-friendly", () => {
    const o = overviewFixture();
    expect(reportFileName(o, "students", "2026-11-05T02:00:00Z")).toBe(
      "syllabai-4ch1-students-report-20261105.csv",
    );
    expect(reportFileName(o, "topics", "2026-11-05T02:00:00Z")).toBe(
      "syllabai-4ch1-topics-report-20261105.csv",
    );
  });
});
