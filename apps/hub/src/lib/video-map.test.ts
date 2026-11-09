/**
 * T-VIDEOMAP-P3 — the video-map lane loader laws.
 *
 * Pins three laws hub-side so a bad emit or a regression fails CI, not a
 * learner:
 *
 *  1. Link resolution (flags.videoMap.status of record): site-lane
 *     lessonUrl wins, then the video entry's lessonUrl, then the external
 *     watchUrl; a row with neither resolves null — the UI renders the row
 *     link-less instead of inventing an href.
 *  2. Review law (defense in depth): the emitter gates 0 reviewed:false in
 *     content/, but the loader re-filters — reviewed:false rows and rows
 *     referencing unknown videos must NEVER surface from getVideoMap.
 *  3. Corpus-at-rest census: every flags.videoMap course's committed file
 *     parses as hub.video-map/1 AND carries zero reviewed:false rows at
 *     rest (the same census the emitter asserts, re-checked at rest).
 */
import { describe, expect, test, mock } from "bun:test";

// video-map is a server module (import "server-only"); the package is a
// Next.js build-time stub absent from the bun-test module graph — shim it
// BEFORE the module under test loads (the books-lesson.test.ts law).
mock.module("server-only", () => ({}));

const { videoHref, videoSourceLabel, formatDuration, VideoMapFileSchema, getVideoMap } =
  await import("./video-map");
const { loadContentJson } = await import("./corpus");

const externalVideo = {
  id: "Lomr_t5Pdjs",
  title: 'GCSE Biology Revision "Inheritance of Sex"',
  provider: "freesciencelessons",
  watchUrl: "https://www.youtube.com/watch?v=Lomr_t5Pdjs",
  lessonRef: null,
  lessonUrl: null,
  levelTag: "gcse",
  boardNote: "AQA-aligned GCSE channel; content generic GCSE biology",
  durationS: 144,
  guestVisible: null,
  subelementOfPrimary: false,
  oembedAuthor: "Freesciencelessons",
  oembedVerifiedUtc: "2026-10-31T19:19:49Z",
};

const siteVideo = {
  id: "-BqvOucCTYg",
  title: "6.4 - The Eye - Accommodation",
  lessonRef: "6.4",
  lessonUrl: "https://cognitoedu.org/courses/gcse/biology-triple/iedexcel/notes/SFFzb0lRY3o/6.4-the-eye-accommodation",
  topicPath: ["Structure and functions in living organisms"],
  durationS: null,
  guestVisible: true,
  subelementOfPrimary: false,
};

describe("videoHref — the lessonUrl → watchUrl resolution law", () => {
  test("external row: mapping lessonUrl null → the video's watchUrl", () => {
    const row = { lessonUrl: null };
    expect(videoHref(externalVideo as never, row)).toBe(
      "https://www.youtube.com/watch?v=Lomr_t5Pdjs",
    );
  });

  test("site row: the mapping's own lessonUrl wins over everything", () => {
    const row = {
      lessonUrl:
        "https://cognitoedu.org/courses/gcse/biology-triple/iedexcel/notes/TGVNQ3NhbnA/1.1-characteristics-of-living-organisms",
    };
    expect(videoHref(siteVideo as never, row)).toBe(row.lessonUrl);
  });

  test("mapping without lessonUrl falls back to the video entry's lessonUrl (site lane)", () => {
    const row = { lessonUrl: null };
    expect(videoHref(siteVideo as never, row)).toBe(siteVideo.lessonUrl);
  });

  test("neither mapping nor video carries a link → null (never an invented href)", () => {
    const row = { lessonUrl: null };
    const linkless = { ...externalVideo, watchUrl: null };
    expect(videoHref(linkless as never, row)).toBeNull();
  });
});

describe("videoSourceLabel — the human source label", () => {
  test("oEmbed-verified author wins verbatim", () => {
    expect(videoSourceLabel(externalVideo as never)).toBe("Freesciencelessons");
  });

  test("provider slug is titleized when no oEmbed author", () => {
    expect(
      videoSourceLabel({ ...externalVideo, oembedAuthor: null } as never),
    ).toBe("Freesciencelessons");
    expect(
      videoSourceLabel({ ...externalVideo, oembedAuthor: null, provider: "doodle-science" } as never),
    ).toBe("Doodle Science");
  });

  test("site-lane entry (no provider, no author) reads as Cognito", () => {
    expect(videoSourceLabel(siteVideo as never)).toBe("Cognito");
  });
});

describe("formatDuration", () => {
  test("m:ss under an hour", () => {
    expect(formatDuration(144)).toBe("2:24");
    expect(formatDuration(65)).toBe("1:05");
  });

  test("h:mm:ss over an hour, and honest dash for junk", () => {
    expect(formatDuration(3752)).toBe("1:02:32");
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(-3)).toBe("—");
  });
});

describe("review law — getVideoMap never surfaces an unreviewed row", () => {
  test("igcse-biology-19: every served row is reviewed:true with a known video", async () => {
    const map = await getVideoMap("igcse-biology-19");
    expect(map).not.toBeNull();
    expect(map!.mappings.length).toBeGreaterThan(0);
    for (const row of map!.mappings) {
      expect(row.reviewed).toBe(true);
      expect(row.reviewer).toBeTruthy();
      expect(row.reviewedUtc).toBeTruthy();
      expect(map!.videoById.has(row.video)).toBe(true);
    }
  });

  test("unflagged courses resolve OFF (null), flagged-but-missing files degrade to null", async () => {
    // a slug that exists in the registry but is NOT in flags.videoMap.courses
    expect(await getVideoMap("gcse-maths-edexcel")).toBeNull();
    expect(await getVideoMap("this-course-does-not-exist")).toBeNull();
  });
});

describe("corpus-at-rest census — the emitter's gate, re-checked hub-side", () => {
  test("every flags.videoMap course parses as hub.video-map/1 with 0 reviewed:false at rest", async () => {
    const flags = (await loadContentJson("flags.json")) as {
      flags: { videoMap: { courses: string[] } };
    };
    const courses = flags.flags.videoMap.courses;
    expect(courses.length).toBeGreaterThanOrEqual(10);
    for (const course of courses) {
      const raw = await loadContentJson(`video-map/${course}.json`);
      expect(raw).not.toBeNull();
      const parsed = VideoMapFileSchema.safeParse(raw);
      expect(parsed.success).toBe(true);
      const unreviewed = (raw as { mappings: { reviewed: boolean }[] }).mappings.filter(
        (m) => m.reviewed !== true,
      );
      expect(unreviewed).toHaveLength(0);
    }
  });
});
