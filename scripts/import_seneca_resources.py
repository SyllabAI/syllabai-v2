#!/usr/bin/env python3
"""
T-SENECA-001 — import the operator-approved Seneca Resource Hub harvest into
`seneca_resources`, linked ONLY to hub courses that exist.

PLACEMENT (run-004 rework, operator ruling trace 1a16adad843081b1):
`seneca_resources` is a CORPUS plane — the rows live in the sci-chem
course-group WAREHOUSE (template wh-v2), never in main
(docs/DATA-PLANE-PLACEMENT.md). Writes therefore go to the WAREHOUSE URL
(SYLLABAI_WAREHOUSE_URL_SCI_CHEM — the 0013 naming law name the registry row
stores); the fail-closed course_registry re-check runs against MAIN
(MAIN_DATABASE_URL) because that anchor stays in main (ids are the contract,
§4.1 — the importer passes slugs/ids across the seam, never joins). The table
DDL is owned by the wh-v2 template — this script NEVER creates it (preflight
fail-closed). No dual writes ever: after the T1 zero-residue main drop this
is the ONLY write path of the library plane.

Source corpus (read-only; never shipped inside this repo):
  SyllabAI/syllabai-experimental @ d67bc1e3
  senecalearning/resources/captures/resource-hub-content/
    courses/edexcel-igcse-chemistry/Chemistry_Edexcel_iGCSE.json   (free 4CH1 course layer)
    by-subject/Chemistry.jsonl.gz                                   (PII-scrubbed subject quizzes)

Linking law (the operator directive "only for the subject/courses that are in
syllabai right now"): the SENEGA→HUB map below names hub slugs that MUST exist
in apps/hub/content/courses.json — the import refuses to run otherwise
(fail-closed; a slug absent from the registry is never written).

PII law: the corpus is scrubbed (creatorName/creatorId/schoolId/schoolGroupId
removed corpus-side, verified 0 leaks at build). This import re-checks EVERY
row before insert and aborts the run on any leak (fail-closed, the S11 rule).

Idempotence: upsert by resource id (ON CONFLICT DO UPDATE) — re-runs converge.

Usage:
  # dry run (no DB contact at all — census + PII gate only):
  python3 scripts/import_seneca_resources.py \
      --corpus /path/to/resource-hub-content --dry-run

  # real run: WAREHOUSE receives the rows, MAIN is the registry anchor:
  SYLLABAI_WAREHOUSE_URL_SCI_CHEM=postgres://…/wh-main \
  MAIN_DATABASE_URL=postgres://…/main \
  python3 scripts/import_seneca_resources.py \
      --corpus /path/to/resource-hub-content [--only sections|questions|quizzes]
  (CLI overrides: --warehouse-url / --main-url)
"""
import argparse
import gzip
import json
import os
import re
import sys

PII_KEYS = ("creatorName", "creatorId", "schoolId", "schoolGroupId")

# The Seneca course → hub course slug map of record. VALUES must exist in
# apps/hub/content/courses.json (the import hard-fails otherwise). Extend as
# more courses come online — never invent a slug.
SENECA_TO_HUB = {
    "Chemistry: Edexcel iGCSE": ["igcse-chemistry-19"],
}


def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def pii_leak(blob: str) -> bool:
    return any(k in blob for k in PII_KEYS)


def load_registry_slugs(repo_root: str) -> set:
    courses = json.load(open(os.path.join(repo_root, "apps/hub/content/courses.json")))
    return {c["slug"] for c in courses["courses"]}


def rows_for_course(corpus_dir: str, seneca_course: str, hub_slug: str):
    """Yield seneca_resources rows for one mapped Seneca course."""
    safe = re.sub(r"[^\w-]+", "_", seneca_course.replace(" ", "_")).replace(":", "")
    safe = re.sub(r"_+", "_", safe).strip("_")
    course_file = os.path.join(corpus_dir, "courses", "edexcel-igcse-chemistry", f"{safe}.json")
    if not os.path.exists(course_file):
        # generic lookup: any course-layer file whose courseTitle matches
        base = os.path.join(corpus_dir, "courses")
        for fam in sorted(os.listdir(base)):
            p = os.path.join(base, fam, f"{safe}.json")
            if os.path.exists(p):
                course_file = p
                break
    data = json.load(open(course_file))
    assert data.get("courseTitle") == seneca_course, (
        f"course-layer mismatch: {data.get('courseTitle')!r} != {seneca_course!r}"
    )

    n_sections = n_eqs = 0
    for s in data.get("sections", []):
        c = s.get("content") or {}
        content = {
            "description": clean(c.get("description")),
            "topicNotes": clean(c.get("topicNotes")),
            "imageUrl": clean(c.get("imageUrl") or c.get("previewUrl") or c.get("contentUrl")),
        }
        row = {
            "id": s["id"],
            "course_slug": hub_slug,
            "kind": "courseSection",
            "title": clean(s.get("title")),
            "topic_path": clean(data.get("courseTitle")),
            "marks_total": None,
            "question_type": None,
            "content_json": content,
        }
        n_sections += 1
        yield row

    for e in data.get("examQuestions", []):
        c = e.get("content") or {}
        crumbs = [x.strip() for x in (c.get("topicBreadcrumbs") or []) if x.strip()]
        mine = next((b for b in crumbs if b.startswith(seneca_course)), None)
        content = {
            "questionTitleMd": clean(c.get("questionTitleMd")),
            "markScheme": clean(c.get("markScheme")),
            "generationScript": clean(c.get("generationScript")),
        }
        row = {
            "id": e["id"],
            "course_slug": hub_slug,
            "kind": "examQuestion",
            "title": clean(e.get("title")),
            "topic_path": mine,
            "marks_total": e.get("marksTotal"),
            "question_type": clean(e.get("questionType")),
            "content_json": content,
        }
        n_eqs += 1
        yield row
    print(f"[{seneca_course}] → {hub_slug}: {n_sections} sections, {n_eqs} exam questions")


def quiz_rows(corpus_dir: str, hub_slug: str):
    """Subject-tagged quizzes (PII-scrubbed corpus; re-checked per row)."""
    path = None
    for cand in ("Chemistry.jsonl.gz", "Chemistry.jsonl"):
        p = os.path.join(corpus_dir, "by-subject", cand)
        if os.path.exists(p):
            path = p
            break
    assert path, "Chemistry by-subject file not found in the corpus"
    opener = gzip.open if path.endswith(".gz") else open
    n = 0
    with opener(path, "rt") as f:
        for line in f:
            r = json.loads(line)
            if r.get("type") != "quiz":
                continue
            c = r.get("content") or {}
            content = {
                "quizSummary": clean(c.get("quizSummary") or r.get("quizSummary")),
                "access": clean(r.get("access")),
                "isPublic": r.get("isPublic"),
                "saveCount": r.get("saveCount"),
            }
            n += 1
            yield {
                "id": r["id"],
                "course_slug": hub_slug,
                "kind": "quiz",
                "title": clean(r.get("title")),
                "topic_path": None,
                "marks_total": None,
                "question_type": None,
                "content_json": content,
            }
    print(f"[quizzes] → {hub_slug}: {n} subject quizzes")


UPSERT = """
INSERT INTO seneca_resources
  (id, course_slug, kind, title, topic_path, marks_total, question_type, content_json)
VALUES (%(id)s, %(course_slug)s, %(kind)s, %(title)s, %(topic_path)s,
        %(marks_total)s, %(question_type)s, %(content_json)s::jsonb)
ON CONFLICT (id) DO UPDATE SET
  course_slug = EXCLUDED.course_slug,
  kind = EXCLUDED.kind,
  title = EXCLUDED.title,
  topic_path = EXCLUDED.topic_path,
  marks_total = EXCLUDED.marks_total,
  question_type = EXCLUDED.question_type,
  content_json = EXCLUDED.content_json
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True, help="path to resource-hub-content/")
    ap.add_argument("--repo-root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    help="syllabai-v2 repo root (for courses.json)")
    ap.add_argument("--warehouse-url", default=os.environ.get("SYLLABAI_WAREHOUSE_URL_SCI_CHEM"),
                    help="the sci-chem WAREHOUSE pooler URL (writes land here; "
                         "default env SYLLABAI_WAREHOUSE_URL_SCI_CHEM — the registry "
                         "row's name, 0013 naming law)")
    ap.add_argument("--main-url", default=os.environ.get("MAIN_DATABASE_URL"),
                    help="MAIN hub URL — the course_registry anchor for the "
                         "fail-closed slug re-check (default env MAIN_DATABASE_URL)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", choices=["sections", "questions", "quizzes"], default=None)
    args = ap.parse_args()

    registry = load_registry_slugs(args.repo_root)
    for seneca_course, hub_slugs in SENECA_TO_HUB.items():
        unknown = [s for s in hub_slugs if s not in registry]
        if unknown:
            sys.exit(f"BLOCKED: hub slugs not in courses.json: {unknown} (fail-closed map law)")

    only = args.only
    batches = []
    for seneca_course, hub_slugs in SENECA_TO_HUB.items():
        for hub_slug in hub_slugs:
            if only in (None, "sections", "questions"):
                for row in rows_for_course(args.corpus, seneca_course, hub_slug):
                    if only == "sections" and row["kind"] != "courseSection":
                        continue
                    if only == "questions" and row["kind"] != "examQuestion":
                        continue
                    batches.append(row)
            if only in (None, "quizzes"):
                batches.extend(quiz_rows(args.corpus, hub_slug))

    # the fail-closed PII gate — every row, every time
    for row in batches:
        blob = json.dumps(row)
        if pii_leak(blob):
            sys.exit(f"BLOCKED: PII keys detected in resource {row['id']} (the S11 scrub law)")

    kinds = {}
    for row in batches:
        kinds[row["kind"]] = kinds.get(row["kind"], 0) + 1
    print("census:", kinds, "total:", len(batches))

    if args.dry_run:
        print("dry-run — no DB writes")
        return

    wh_url = args.warehouse_url
    main_url = args.main_url
    if not wh_url:
        sys.exit("BLOCKED: warehouse URL not set (SYLLABAI_WAREHOUSE_URL_SCI_CHEM / --warehouse-url)")
    if not main_url:
        sys.exit("BLOCKED: main URL not set (MAIN_DATABASE_URL / --main-url) — the "
                 "course_registry anchor re-check is fail-closed (placement law)")
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        sys.exit("BLOCKED: psycopg2 not installed (pip install psycopg2-binary)")

    # the WAREHOUSE receives the rows (run-004 ruling)
    wh = psycopg2.connect(wh_url, sslmode="require", connect_timeout=15)
    main_conn = psycopg2.connect(main_url, sslmode="require", connect_timeout=15)
    try:
        with main_conn.cursor() as cur:
            # the map law, re-checked against the LIVE main registry (the anchor
            # that stays in main — seam law §4.1)
            cur.execute(
                "SELECT course_slug FROM course_registry WHERE course_slug = ANY(%s::text[])",
                ([s for slugs in SENECA_TO_HUB.values() for s in slugs],),
            )
            live = {r[0] for r in cur.fetchall()}
            missing = [s for slugs in SENECA_TO_HUB.values() for s in slugs if s not in live]
            if missing:
                sys.exit(f"BLOCKED: course_registry has no rows for {missing}")
        # the DDL is the wh-v2 template's — never created by this script
        with wh.cursor() as cur:
            cur.execute("SELECT to_regclass('public.seneca_resources')")
            if cur.fetchone()[0] is None:
                sys.exit("BLOCKED: seneca_resources does not exist on the warehouse "
                         "(template wh-v2 owns the DDL — provision sci-chem on wh-v2 first)")
        with wh.cursor() as cur:
            # psycopg2 cannot adapt bare dicts to jsonb — wrap with Json()
            payload = [
                {**row, "content_json": psycopg2.extras.Json(row["content_json"])}
                for row in batches
            ]
            psycopg2.extras.execute_batch(cur, UPSERT, payload, page_size=200)
        wh.commit()
        print(f"imported {len(batches)} seneca_resources rows into the sci-chem "
              f"warehouse (upsert, idempotent)")
    finally:
        wh.close()
        main_conn.close()


if __name__ == "__main__":
    main()
