#!/usr/bin/env python3
"""import_lesson_packs.py — bake CourseLessons lessonPackV1 packs into the
hub content plane (T-BOOK-033).

Fetch-first law (START-HERE.md law 1): this script READS from the
syllabai-resources repo over the GitHub API using SYLLABAI_PAT from the
environment — the token is never written to disk, logs, or the produced
files. Produced artifacts are committed content JSON (the same plane as
notes.json/questions.json — immutable between deploys, ADR-021).

Usage:
    SYLLABAI_PAT=ghp_... python3 apps/hub/scripts/import_lesson_packs.py [courseSlug]

Writes (idempotent):
    apps/hub/content/<slug>/lessons/<packId>.json
    apps/hub/content/<slug>/lessons/<packId>.glossary.json
    apps/hub/content/<slug>/lessons/lessons-index.json
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML required: pip install pyyaml")

REPO = "SyllabAI/syllabai-resources"
CL_COURSE_DIR = "CourseLessons/lessons/pearson-edexcel/international-gcse/chemistry-4ch1"
API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"
HUB = Path(__file__).resolve().parents[1]  # apps/hub

TOKEN = os.environ.get("SYLLABAI_PAT")
if not TOKEN:
    sys.exit("SYLLABAI_PAT env required (fetch-first; token stays in env only)")

slug = sys.argv[1] if len(sys.argv) > 1 else "igcse-chemistry-19"


def call(url, raw=False):
    req = urllib.request.Request(url, headers={
        "Authorization": f"token {TOKEN}",
        "Accept": "application/vnd.github+json" if not raw else "application/vnd.github.raw+json",
    })
    with urllib.request.urlopen(req) as r:
        body = r.read()
    if raw:
        return body
    return json.loads(body)


def get_raw(path):
    return call(f"{RAW}/{REPO}/main/{path}", raw=True)


# 1) course config (slug cross-check)
cfg = yaml.safe_load(get_raw(f"{CL_COURSE_DIR}/course.yaml"))
if cfg.get("course_slug") != slug:
    sys.exit(f"course_slug mismatch: {cfg.get('course_slug')} != {slug}")

# 2) discover pack dirs
entries = call(f"{API}/repos/{REPO}/contents/{CL_COURSE_DIR}/lessons")
pack_dirs = [e["name"] for e in entries if e["type"] == "dir"]
if not pack_dirs:
    sys.exit(f"no lesson packs found under {CL_COURSE_DIR}/lessons")

out_dir = HUB / "content" / slug / "lessons"
out_dir.mkdir(parents=True, exist_ok=True)

index = []
for name in sorted(pack_dirs):
    pack_bytes = get_raw(f"{CL_COURSE_DIR}/lessons/{name}/qa/lessonPackV1.json")
    pack = json.loads(pack_bytes)
    for key in ("packId", "chapterKey", "status", "sections"):
        if key not in pack:
            sys.exit(f"{name}: pack missing key {key} (emit of record is lessonctl.py S4)")
    glossary_yaml = get_raw(f"{CL_COURSE_DIR}/lessons/{name}/glossary.yaml")
    glossary = yaml.safe_load(glossary_yaml) or []
    glossary_json = [
        {"slug": g["slug"], "term": g["term"], "definition": g.get("definition", ""),
         "msAccepts": g.get("ms_accepts") or [], "msAvoids": g.get("ms_avoids") or [],
         "source": g.get("source")}
        for g in glossary
    ]
    (out_dir / f"{pack['packId']}.json").write_bytes(json.dumps(pack, ensure_ascii=False, indent=1).encode())
    (out_dir / f"{pack['packId']}.glossary.json").write_bytes(
        json.dumps(glossary_json, ensure_ascii=False, indent=1).encode())
    index.append({"packId": pack["packId"], "chapterKey": pack["chapterKey"]})
    print(f"  baked {pack['packId']} (chapterKey={pack['chapterKey']}, status={pack['status']}, "
          f"sections={len(pack['sections'])}, glossary={len(glossary_json)})")

(out_dir / "lessons-index.json").write_bytes(
    json.dumps({"packs": index}, ensure_ascii=False, indent=1).encode())
print(f"lessons-index.json: {len(index)} pack(s) -> {out_dir}")
print("NOTE: T-C20 — baking does NOT publish; status stays whatever the pack carries.")
