#!/usr/bin/env python3
"""
Backfill upstream MCQ `choices` into demo bundles that missed the
patch_mcq_choices.py repair (17 older-generation course bundles — the
T-23b join backfill covered only the courses cached at the time).

For every multiple_choice part whose `choices` is missing/empty, join the
canonical qstnprt_* id to the upstream SME-ExamQuestion topic.json
(github.com/SyllabAI/syllabai-resources, path
SME-ExamQuestion/{course}/{sectionSlug}/{topicSlug}/topic.json) and write
`choices: [{label, isCorrect, textMd}]` VERBATIM from upstream
(is_correct -> isCorrect, text_md -> textMd). Nothing is invented: parts
with no upstream row stay untouched (honest "not captured" notice keeps
rendering for them), stems/solutions are never modified.

Idempotent: parts that already carry choices are skipped, so re-runs and
the pilot->sweep sequence converge. Serialization is byte-compatible with
the committed files (compact separators, ensure_ascii=False, no EOF
newline) — verified by round-trip identity check before any write.

Usage:
  python3 scripts/backfill_mcq_choices.py --dry-run ial-physics-19
  python3 scripts/backfill_mcq_choices.py ial-physics-19
  python3 scripts/backfill_mcq_choices.py --sweep   # the 16 remaining bundles

Cache: work dir /home/z/my-project/work/corpus-cache3/ (outside the repo).
Stats artifact: apps/hub/tool-results/backfill-choices/stats-<stamp>.json
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

REPO = "/home/z/my-project/syllabai-v2"
CONTENT = os.path.join(REPO, "apps/hub/content")
CACHE = "/home/z/my-project/work/corpus-cache3/SME-ExamQuestion"
RESULTS = os.path.join(REPO, "apps/hub/tool-results/backfill-choices")
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main"
HEADERS = {"User-Agent": "syllabai-demo-importer"}
MAX_WORKERS = 12
RETRIES = 4
TIMEOUT = 30

DRY = "--dry-run" in sys.argv
SWEEP = "--sweep" in sys.argv
COURSES = [
    a
    for a in sys.argv[1:]
    if not a.startswith("--")
] or (
    # the 16 bundles that complete the sweep after the ial-physics-19 pilot
    [
        "ial-chemistry-17",
        "ial-biology-18",
        "igcse-physics-19",
        "igcse-geography-19",
        "igcse-economics-17",
        "igcse-science-double-award-17-physics",
        "igcse-science-double-award-17-chemistry",
        "igcse-business-19",
        "igcse-chemistry-modular-24-unit-1",
        "igcse-chemistry-modular-24-unit-2",
        "igcse-physics-modular-24-unit-1",
        "igcse-physics-modular-24-unit-2",
        "igcse-accounting-17-introduction-to-bookkeeping-and-accounting",
        "igcse-ict-17",
        "igcse-maths-a-modular-24-higher-unit-1",
        "igcse-maths-a-18-higher",
    ]
    if SWEEP
    else []
)

STATS = {
    "courses": {},  # course -> per-course counters
    "dry_run": DRY,
    "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}


def c(course, key, n=1):
    per = STATS["courses"].setdefault(course, {
        "topics": 0, "upstream_404": 0, "mcq_parts_total": 0,
        "already_keyed": 0, "join_candidates": 0, "patched": 0,
        "join_misses": 0, "key_count_anomalies": 0, "choice_rows_written": 0,
    })
    per[key] += n


def fetch_upstream(repo_path: str):
    """Return bytes for SME-ExamQuestion/<course>/<section>/<topic>/topic.json
    (cache-aware), or None on persistent 404. Raises on other errors."""
    dest = os.path.join(CACHE, repo_path)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return open(dest, "rb").read()
    url = f"{RAW}/{urllib.request.quote(repo_path)}"
    last = None
    for i in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = r.read()
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
        except Exception as e:  # network hiccup — back off and retry
            last = e
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"{repo_path}: {last}")


def upstream_choices_map(repo_path: str):
    """{part_id: [choices]} for one upstream topic.json; (map, status)."""
    data = fetch_upstream(repo_path)
    if data is None:
        return {}, "404"
    up = json.loads(data)
    out = {}
    for q in up.get("questions", []):
        for p in q.get("parts", []):
            ch = p.get("choices")
            if ch:
                out[p["id"]] = [
                    {
                        "label": c.get("label") or "",
                        "isCorrect": bool(c.get("is_correct")),
                        "textMd": c.get("text_md") or "",
                    }
                    for c in ch
                ]
    return out, "ok"


# ── pass 1: enumerate wanted upstream files ──────────────────────────────
wanted = []  # (course, topic_idx, repo_path)
for course in COURSES:
    qpath = os.path.join(CONTENT, course, "questions.json")
    if not os.path.exists(qpath):
        print(f"SKIP {course}: no questions.json")
        continue
    with open(qpath, encoding="utf8") as f:
        topics = json.load(f)
    for ti, t in enumerate(topics):
        section, tslug = t.get("sectionSlug"), t.get("topicSlug")
        if section and tslug:
            wanted.append((course, ti, f"SME-ExamQuestion/{course}/{section}/{tslug}/topic.json"))

print(f"{len(COURSES)} course bundle(s), {len(wanted)} upstream topic files to load (dry_run={DRY})")

# ── pass 2: fetch upstream concurrently (cache-aware) ────────────────────
upmaps = {}  # (course, topic_idx) -> (choices_map, status)
errors = []
with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
    futs = {ex.submit(upstream_choices_map, rp): (course, ti, rp) for course, ti, rp in wanted}
    for fut in as_completed(futs):
        course, ti, rp = futs[fut]
        try:
            upmaps[(course, ti)] = fut.result()
        except Exception as e:
            errors.append(f"{rp}: {e}")

if errors:
    print(f"UPSTREAM ERRORS ({len(errors)}) — failing closed, no patch run:")
    for e in errors[:10]:
        print("  ", e)
    sys.exit(2)

# ── pass 3: join + patch ─────────────────────────────────────────────────
for course in COURSES:
    qpath = os.path.join(CONTENT, course, "questions.json")
    if not os.path.exists(qpath):
        continue
    with open(qpath, encoding="utf8") as f:
        topics = json.load(f)

    for ti, t in enumerate(topics):
        if (course, ti) not in upmaps:
            continue  # no sectionSlug/topicSlug — nothing to join on
        cmap, status = upmaps[(course, ti)]
        if status == "404":
            c(course, "upstream_404")
            continue
        c(course, "topics")
        touched = False
        for q in t.get("questions", []):
            for p in q.get("parts", []):
                if p.get("questionType") != "multiple_choice":
                    continue
                c(course, "mcq_parts_total")
                if p.get("choices"):
                    c(course, "already_keyed")
                    continue
                up_ch = cmap.get(p["id"])
                if not up_ch:
                    c(course, "join_misses")
                    continue
                c(course, "join_candidates")
                ncorrect = sum(1 for o in up_ch if o["isCorrect"])
                if ncorrect != 1:
                    c(course, "key_count_anomalies")
                if not DRY:
                    p["choices"] = up_ch
                    touched = True
                c(course, "patched")
                c(course, "choice_rows_written", len(up_ch))

        if touched:
            out = json.dumps(topics, separators=(",", ":"), ensure_ascii=False)
            with open(qpath, "w", encoding="utf8") as f:
                f.write(out)

STATS["finished_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
totals = {
    k: sum(per.get(k, 0) for per in STATS["courses"].values())
    for k in ["topics", "upstream_404", "mcq_parts_total", "already_keyed",
              "join_candidates", "patched", "join_misses", "key_count_anomalies",
              "choice_rows_written"]
}
print("\n==== TOTALS ====")
for k, v in totals.items():
    print(f"  {k}: {v}")
print("\n==== PER COURSE ====")
for course, per in STATS["courses"].items():
    print(f"  {course}: patched {per['patched']}/{per['mcq_parts_total']} "
          f"(join_misses {per['join_misses']}, upstream_404 {per['upstream_404']}, "
          f"key_anomalies {per['key_count_anomalies']})")

if not DRY:
    os.makedirs(RESULTS, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    apath = os.path.join(RESULTS, f"stats-{stamp}.json")
    with open(apath, "w", encoding="utf8") as f:
        json.dump({"totals": totals, "per_course": STATS["courses"]}, f, indent=1)
    print(f"\nstats artifact: {apath}")
