import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { getCourseBundle, loadHubCourse } from "@/lib/courses";
import { getDataProvider } from "@/lib/data";
import { CoursePageHeader } from "@/components/hub/course-header";
import { allCourseParams } from "@/lib/static-params";
import { normalizeSpecText } from "@/lib/spec-text";
import {
  formatDuration,
  getVideoMap,
  listVideoMapCourseSlugs,
  videoHref,
  videoMapEnabledForCourse,
  videoSourceLabel,
  type VideoMapRow,
} from "@/lib/video-map";

/**
 * Videos lane (T-VIDEOMAP-P3) — the owner-reviewed video map, rendered as a
 * read-only, link-out surface grouped by spine topic → spec point.
 *
 * Serves ONLY when the flags.json "videoMap" gate lists the course
 * (absent=OFF law, one-flip kill — see lib/video-map.ts). A flagged course
 * whose committed map is missing/unparseable renders the honest empty state,
 * never a ghost list. Unreviewed rows cannot reach this page: the emitter
 * gates them, and the loader re-filters to reviewed:true (defense in depth).
 *
 * Evidence posture of record (P2B/P2C/P2D): matches are TITLE-ONLY — the
 * confidence chips say how directly the video title names the spec point's
 * content, and external rows carry boardMismatch:true when the source
 * channel is aligned to another exam board. All links resolve lessonUrl
 * (site lane, Cognito) → watchUrl (external lane, YouTube); a row with
 * neither renders without a link.
 */

interface PointGroup {
  code: string;
  text: string;
  /** deduped per video id — one row per video under a spec point */
  rows: VideoMapRow[];
}

interface TopicGroup {
  key: string;
  title: string;
  order: number;
  points: PointGroup[];
  /** spec points in this topic with ≥1 mapped video */
  covered: number;
  total: number;
}

function groupByTopics(
  map: NonNullable<Awaited<ReturnType<typeof getVideoMap>>>,
  curriculum: {
    nodes: { code: string; family: string; title: string; order?: number; parents?: string[] }[];
  } | null,
): TopicGroup[] {
  const rowsBySpec = new Map<string, VideoMapRow[]>();
  for (const row of map.mappings)
    for (const code of row.specs) {
      const list = rowsBySpec.get(code);
      if (list) list.push(row);
      else rowsBySpec.set(code, [row]);
    }

  const topics = new Map<string, TopicGroup>();

  if (curriculum) {
    const nodeByCode = new Map(curriculum.nodes.map((n) => [n.code, n]));
    const topicOfCode = (code: string) => {
      let cur = nodeByCode.get(code);
      const seen = new Set<string>();
      while (cur && !seen.has(cur.code)) {
        seen.add(cur.code);
        if (cur.family === "TOPIC") return cur;
        const parent = cur.parents?.[0];
        cur = parent ? nodeByCode.get(parent) : undefined;
      }
      return null;
    };

    for (const node of curriculum.nodes) {
      if (node.family !== "SPEC_POINT") continue;
      const topic = topicOfCode(node.code);
      const key = topic?.code ?? "—";
      let group = topics.get(key);
      if (!group) {
        group = {
          key,
          title: topic?.title ?? "Specification",
          order: topic?.order ?? 9999,
          points: [],
          covered: 0,
          total: 0,
        };
        topics.set(key, group);
      }
      group.total += 1;
      const rows = rowsBySpec.get(node.code);
      if (!rows?.length) continue;
      const seenVideos = new Set<string>();
      const deduped: VideoMapRow[] = [];
      for (const row of rows) {
        if (seenVideos.has(row.video)) continue;
        seenVideos.add(row.video);
        deduped.push(row);
      }
      group.covered += 1;
      group.points.push({
        code: node.code,
        text: normalizeSpecText(node.title),
        rows: deduped,
      });
    }
    return [...topics.values()].sort(
      (a, b) => a.order - b.order || a.title.localeCompare(b.title),
    );
  }

  // No curriculum (bundle absent + provider unreachable): an honest flat
  // fallback grouped by spec code — never a fabricated topic tree.
  const flat = new Map<string, PointGroup>();
  for (const row of map.mappings)
    for (const code of row.specs) {
      let group = flat.get(code);
      if (!group) {
        group = { code, text: "", rows: [] };
        flat.set(code, group);
      }
      if (!group.rows.some((r) => r.video === row.video)) group.rows.push(row);
    }
  return [
    {
      key: "—",
      title: "Specification points",
      order: 0,
      points: [...flat.values()].sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true }),
      ),
      covered: flat.size,
      total: map.coverage.specPointsTotal,
    },
  ];
}

export async function generateStaticParams() {
  const videoSlugs = new Set(await listVideoMapCourseSlugs());
  const all = await allCourseParams();
  return all.filter((p) => videoSlugs.has(p.course));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string }>;
}): Promise<Metadata> {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) return {};
  return { title: `Videos — ${hub.meta.label}` };
}

export default async function VideosPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  // Flag law: key or slug ABSENT = OFF — nothing renders (not even an empty
  // state); the lane does not exist for this course.
  if (!(await videoMapEnabledForCourse(slug))) notFound();
  const map = await getVideoMap(slug);
  const { meta } = hub;
  const board = meta.board ? `${meta.board} ` : "";

  if (!map) {
    // Flagged but the committed map is missing/unparseable → the honest
    // empty state promised by flags.videoMap.status, never a ghost list.
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <CoursePageHeader
          meta={meta}
          title={`${board}${meta.level} ${meta.label} — Videos`}
          crumb="Videos"
          description="The video lane is enabled for this course, but no owner-reviewed video map is committed yet."
        />
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No videos published for this course yet. When the reviewed mapping lands
          in content/video-map/, it appears here spec point by spec point.
        </div>
      </div>
    );
  }

  const bundle = await getCourseBundle(slug);
  const curriculum =
    bundle?.curriculum ?? (hub.viaProvider ? await getDataProvider().curriculum() : null);
  const topics = groupByTopics(map, curriculum);
  const c = map.coverage;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CoursePageHeader
        meta={meta}
        title={`${board}${meta.level} ${meta.label} — Videos`}
        crumb="Videos"
        description={`Owner-reviewed video lessons mapped to this specification point by point (${c.specPointsMapped} of ${c.specPointsTotal} spec points covered by ${c.videosMapped} videos).`}
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="border-muted-foreground/30 text-2xs text-muted-foreground"
        >
          Owner-reviewed{map.qual ? ` · ${map.qual}` : ""}
        </Badge>
        <Badge variant="secondary" className="text-2xs">
          {c.specPointsMapped}/{c.specPointsTotal} spec points
        </Badge>
        <Badge variant="secondary" className="text-2xs">
          {c.videosMapped} videos · {c.mappingRows} mappings
        </Badge>
        {c.byConfidence && (
          <Badge variant="secondary" className="text-2xs">
            {c.byConfidence.high} high · {c.byConfidence.medium} medium ·{" "}
            {c.byConfidence.low} low
          </Badge>
        )}
        <p className="w-full max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Matches are title-only: the confidence chip says how directly the video
          title names the spec point&apos;s content — watch before relying on a medium
          or low match. Rows marked &ldquo;different-board&rdquo; come from channels
          aligned to another exam board (the board note says how). Links open the
          source channel or lesson page; nothing here records progress.
        </p>
      </div>

      <div className="mt-6 space-y-8">
        {topics.map((topic) => (
          <section key={topic.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight">{topic.title}</h2>
              <span className="text-xs text-muted-foreground">
                {topic.covered}/{topic.total} spec points with videos
              </span>
            </div>

            {topic.points.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No spec points in this topic have mapped videos yet.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {topic.points.map((point) => (
                  <div key={point.code} className="rounded-lg border bg-card/40 p-3">
                    <div className="flex items-baseline gap-2">
                      <Badge variant="outline" className="text-2xs tabular-nums">
                        {point.code}
                      </Badge>
                      {point.text && (
                        <p className="text-sm leading-snug text-foreground/90">
                          {point.text}
                        </p>
                      )}
                    </div>
                    <ul className="mt-2 space-y-2">
                      {point.rows.map((row) => {
                        const video = map.videoById.get(row.video);
                        if (!video) return null;
                        const href = videoHref(video, row);
                        const title = video.title ?? video.id;
                        return (
                          <li
                            key={row.video}
                            className="rounded-md border bg-background/60 p-2.5"
                          >
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium underline-offset-4 hover:underline"
                              >
                                {title}
                              </a>
                            ) : (
                              <span className="text-sm font-medium">{title}</span>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" className="text-2xs">
                                {videoSourceLabel(video)}
                              </Badge>
                              {typeof video.durationS === "number" && (
                                <Badge
                                  variant="outline"
                                  className="text-2xs tabular-nums"
                                >
                                  {formatDuration(video.durationS)}
                                </Badge>
                              )}
                              {row.confidence && (
                                <Badge variant="outline" className="text-2xs">
                                  {row.confidence}-confidence match
                                </Badge>
                              )}
                              {row.boardMismatch && (
                                <Badge variant="outline" className="text-2xs">
                                  different-board source
                                </Badge>
                              )}
                            </div>
                            {row.boardMismatch && video.boardNote && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {video.boardNote}
                              </p>
                            )}
                            {row.evidence && (
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                Evidence (title-only): {row.evidence}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {topic.covered < topic.total && topic.points.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {topic.total - topic.covered} of {topic.total} spec points in this
                topic have no mapped video yet — the honest gap stays visible.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
