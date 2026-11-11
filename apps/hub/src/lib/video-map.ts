import "server-only";

/**
 * video-map — the P3 lane loader for the Cognito/external video map
 * (T-VIDEOMAP-P2B/P2C/P2D → P3 lane surface).
 *
 * Data: apps/hub/content/video-map/<course>.json (schema hub.video-map/1),
 * emitted by SyllabAI/syllabai-resources
 * Videos/scripts/build-content-map-external.mjs from the OWNER-REVIEWED
 * per-course drafts. The emitter gates review law (0 reviewed:false in
 * content); this loader re-filters reviewed:true rows as defense in depth —
 * an unreviewed mapping must never render, even if a future emit regresses.
 *
 * Gating law (flags.json key "videoMap", same shape as
 * senecaStudentResourceHub): the flag FILE, the flag KEY or the course slug
 * being ABSENT = OFF — every accessor degrades to null/[] and the lane
 * renders nothing. One-flip kill: remove the slug (or the key) from
 * flags.json — a content-only change, no code deploy. The flag gates
 * RENDERING only; it never fabricates data.
 *
 * Link resolution law (flags.videoMap.status of record): site-lane
 * rows/videos carry lessonUrl (a Cognito notes page); external-lane rows
 * carry lessonUrl:null and their video entry carries watchUrl (YouTube).
 * videoHref resolves lessonUrl → watchUrl and returns null when a row has
 * neither — the UI then renders the row without a link instead of
 * inventing one.
 */
import { cache } from "react";
import { z } from "zod";
import { loadContentJson } from "@/lib/corpus";

export const VIDEO_MAP_FLAG_KEY = "videoMap";
export const VIDEO_MAP_SCHEMA = "hub.video-map/1";

const VideoEntry = z.object({
  id: z.string(),
  title: z.string().nullish(),
  lessonRef: z.string().nullish(),
  lessonUrl: z.string().nullish(),
  topicPath: z.array(z.string()).nullish(),
  durationS: z.number().nullish(),
  guestVisible: z.boolean().nullish(),
  subelementOfPrimary: z.boolean().nullish(),
  /** external-lane extensions (absent on site-lane entries) */
  provider: z.string().nullish(),
  watchUrl: z.string().nullish(),
  levelTag: z.string().nullish(),
  boardNote: z.string().nullish(),
  oembedAuthor: z.string().nullish(),
  oembedVerifiedUtc: z.string().nullish(),
  identityMethod: z.string().nullish(),
});

/**
 * P2F anchor granularity (docs/ANCHOR-GRANULARITY.md): a row may anchor at a
 * coarser grain than a lesson — a spine TOPIC/SUBTOPIC code, the course
 * itself (e.g. a paper-code-bound past-paper walkthrough), or (rarely) the
 * subject. level:"lesson" rows are the classic P2B rows and omit the field
 * entirely; anchor rows carry specs:[] and lessonRef:null — they are
 * ZERO-WEIGHT enrichment and never count toward spec-point coverage
 * (the accounting rule). Strings, not enums: an unknown level must not
 * invalidate the whole file; the UI buckets the known levels and the
 * builder already hard-fails unknown refs upstream.
 */
const Anchor = z.object({
  level: z.string(),
  ref: z.string(),
});

const MappingRow = z.object({
  video: z.string(),
  lessonRef: z.string().nullish(),
  lessonUrl: z.string().nullish(),
  specs: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]).nullish(),
  evidence: z.string().nullish(),
  reviewed: z.boolean(),
  reviewer: z.string().nullish(),
  reviewedUtc: z.string().nullish(),
  method: z.string().nullish(),
  boardMismatch: z.boolean().nullish(),
  /** anchor-granularity extensions (absent on lesson rows) */
  anchor: Anchor.nullish(),
  kind: z.string().nullish(),
  unitScope: z.string().nullish(),
});

const Coverage = z.object({
  specPointsTotal: z.number(),
  specPointsMapped: z.number(),
  specPointsUnmapped: z.number(),
  videosTotal: z.number(),
  videosMapped: z.number(),
  videosUnmapped: z.number(),
  mappingRows: z.number(),
  byConfidence: z
    .object({ high: z.number(), medium: z.number(), low: z.number() })
    .nullish(),
});

export const VideoMapFileSchema = z.object({
  schema: z.literal(VIDEO_MAP_SCHEMA),
  course: z.string(),
  qual: z.string().nullish(),
  videos: z.array(VideoEntry),
  mappings: z.array(MappingRow),
  coverage: Coverage,
});

export type VideoMapVideo = z.infer<typeof VideoEntry>;
export type VideoMapRow = z.infer<typeof MappingRow>;
export type VideoMapCoverage = z.infer<typeof Coverage>;

export interface VideoMapData {
  course: string;
  qual: string | null;
  videos: VideoMapVideo[];
  /** reviewed:true rows only, joined to a known video entry */
  mappings: VideoMapRow[];
  videoById: Map<string, VideoMapVideo>;
  coverage: VideoMapCoverage;
}

const FlagsFile = z.object({
  schema: z.string(),
  flags: z.record(z.string(), z.unknown()),
});

/**
 * Render-time flag check (the seneca-hub read of record). Absent file /
 * absent key / absent slug = OFF. Errors degrade to OFF — a broken flag
 * file must never surface content.
 */
export const videoMapEnabledForCourse = cache(
  async (courseSlug: string): Promise<boolean> => {
    const raw = await loadContentJson("flags.json");
    if (!raw) return false;
    const parsed = FlagsFile.safeParse(raw);
    if (!parsed.success) {
      console.error(
        "[video-map] flags.json unreadable — lane stays OFF",
        parsed.error.message,
      );
      return false;
    }
    const entry = parsed.data.flags[VIDEO_MAP_FLAG_KEY];
    if (!entry || typeof entry !== "object") return false;
    const courses = (entry as { courses?: unknown }).courses;
    return Array.isArray(courses) && courses.includes(courseSlug);
  },
);

/** Reviewed:true rows only; rows referencing unknown videos are dropped. */
function toVideoMapData(parsed: z.infer<typeof VideoMapFileSchema>): VideoMapData {
  const videoById = new Map(parsed.videos.map((v) => [v.id, v]));
  const mappings = parsed.mappings.filter(
    (m) => m.reviewed === true && videoById.has(m.video),
  );
  return {
    course: parsed.course,
    qual: parsed.qual ?? null,
    videos: parsed.videos,
    mappings,
    videoById,
    coverage: parsed.coverage,
  };
}

/**
 * The course's video map, or null when the flag is OFF or the committed
 * file is missing/unparseable — the honest-empty inputs, never a fallback
 * fabrication.
 */
export const getVideoMap = cache(
  async (courseSlug: string): Promise<VideoMapData | null> => {
    if (!(await videoMapEnabledForCourse(courseSlug))) return null;
    const raw = await loadContentJson(`video-map/${courseSlug}.json`);
    if (!raw) return null;
    const parsed = VideoMapFileSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        `[video-map] ${courseSlug}: hub.video-map/1 unreadable — lane stays empty`,
        parsed.error.message,
      );
      return null;
    }
    return toVideoMapData(parsed.data);
  },
);

/**
 * Flagged AND parseable course slugs — the generateStaticParams set. The
 * flags file is the source of the candidate list (the same one-flip law:
 * a slug removed there stops prerendering the lane).
 */
export const listVideoMapCourseSlugs = cache(async (): Promise<string[]> => {
  const raw = await loadContentJson("flags.json");
  if (!raw) return [];
  const parsed = FlagsFile.safeParse(raw);
  if (!parsed.success) return [];
  const entry = parsed.data.flags[VIDEO_MAP_FLAG_KEY];
  if (!entry || typeof entry !== "object") return [];
  const courses = (entry as { courses?: unknown }).courses;
  if (!Array.isArray(courses)) return [];
  const out: string[] = [];
  for (const slug of courses)
    if (typeof slug === "string" && (await getVideoMap(slug))) out.push(slug);
  return out;
});

export type VideoMapAnchor = NonNullable<VideoMapRow["anchor"]>;

/**
 * A coarse-grained (non-lesson) anchor row — the P2F lane shapes. lesson
 * rows never carry the field at the rest layer; a literal level:"lesson"
 * row would also be excluded (defensive, unreachable from the builder).
 */
export function isAnchorRow(row: VideoMapRow): boolean {
  return row.anchor != null && row.anchor.level !== "lesson";
}

export interface AnchorBuckets {
  /** anchored to the course itself — paper-code-bound walkthroughs etc. */
  course: VideoMapRow[];
  /** anchored to a spine TOPIC or SUBTOPIC node */
  topicArea: VideoMapRow[];
  /** anchored to the SUBJECT node — board-agnostic technique, rare */
  subject: VideoMapRow[];
}

/**
 * Split anchor rows into the render buckets of the granularity spec §7.
 * Rows with an unknown level land in no bucket — render what you can
 * prove; the builder v2 hard-fails unknown levels upstream.
 */
export function anchorBuckets(map: VideoMapData): AnchorBuckets {
  const buckets: AnchorBuckets = { course: [], topicArea: [], subject: [] };
  for (const row of map.mappings) {
    if (!row.anchor) continue;
    if (row.anchor.level === "course") buckets.course.push(row);
    else if (row.anchor.level === "topic" || row.anchor.level === "subtopic")
      buckets.topicArea.push(row);
    else if (row.anchor.level === "subject") buckets.subject.push(row);
  }
  return buckets;
}

const KIND_LABELS: Record<string, string> = {
  "past-paper-walkthrough": "Past paper walkthrough",
  "topic-revision": "Topic revision",
  "exam-technique": "Exam technique",
  teaching: "Teaching video",
};

/** kind slug → human chip label; unknown kinds pass through verbatim. */
export function anchorKindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return KIND_LABELS[kind] ?? kind;
}

/** "U5" → "Unit 5"; anything else verbatim. */
export function formatUnitScope(scope: string | null | undefined): string | null {
  if (!scope) return null;
  const m = /^U(\d+)$/i.exec(scope.trim());
  return m ? `Unit ${m[1]}` : scope.trim();
}

/** lessonUrl → watchUrl resolution (flags.videoMap.status law of record). */
export function videoHref(
  video: VideoMapVideo,
  row: Pick<VideoMapRow, "lessonUrl">,
): string | null {
  return row.lessonUrl ?? video.lessonUrl ?? video.watchUrl ?? null;
}

/** Human source label: oEmbed-verified channel, else provider, else Cognito. */
export function videoSourceLabel(video: VideoMapVideo): string {
  if (video.oembedAuthor) return video.oembedAuthor;
  if (video.provider) {
    return video.provider
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join(" ");
  }
  return "Cognito";
}

/** m / m:ss / h:mm:ss — durations in the lane rows. */
export function formatDuration(totalS: number): string {
  if (!Number.isFinite(totalS) || totalS <= 0) return "—";
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
