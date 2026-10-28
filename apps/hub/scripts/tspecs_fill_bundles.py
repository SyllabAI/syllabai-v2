#!/usr/bin/env python3
"""T-SPECS-9696-4HI1 bundle fill: spec-tree-only official-spine fills for
cie-a-level-maths-20-pure-2, cie-a-level-geography-21 (existing skeletons)
+ igcse-history-17 (new 7-file bundle). Teaching banks stay honestly empty."""
import json, subprocess, datetime
from pathlib import Path

REPO = Path("/home/z/my-project/lane-spec-tree-fill")
STAGING = Path("/home/z/my-project/work/tspecs-staging")
PIN = "340803c9af4a949d3e274251b08697c6b42ba016"
NOW = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT00:00:00Z")

def gshow(rev, path):
    r = subprocess.run(["git", "-C", REPO, "show", f"{rev}:{path}"],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None

ORIGIN = "origin/main"
fills = {
    "cie-a-level-maths-20-pure-2": {"reg_board": "Cambridge International", "sv_fallback": None},
    "cie-a-level-geography-21": {"reg_board": "Cambridge International", "sv_fallback": None},
    "igcse-history-17": {"reg_board": "Pearson Edexcel", "sv_fallback": "2017"},
}

for slug, cfg in fills.items():
    spine = json.loads((STAGING / f"{slug}.json").read_text())
    cur = spine["curriculum"]
    mc = spine["meta"]["counts"]
    cdir = REPO / "apps/hub/content" / slug
    new = slug not in ("cie-a-level-maths-20-pure-2", "cie-a-level-geography-21")

    # header of record: SPINE VERBATIM (level/subject/code/syllabusVersion —
    # the rekey law overlays ONLY the board to the registry form; the map-law
    # census binds the SUBJECT node title to the fleet's shared roots, e.g.
    # 'Maths (9709)')
    hdr = {
        "board": cfg["reg_board"],
        "level": cur["level"],
        "subject": cur["subject"],
        "code": cur["code"],
        "sv": cur["syllabusVersion"] or cfg["sv_fallback"],
    }
    curriculum = {
        "board": hdr["board"], "level": hdr["level"], "subject": hdr["subject"],
        "code": hdr["code"], "syllabusVersion": hdr["sv"],
        "nodes": cur["nodes"], "edges": cur["edges"],
    }
    # integrity: header block of the spine must agree with the overlay
    assert cur["nodes"][0]["family"] == "SUBJECT"

    # ---- manifest ----
    fams = {}
    for n in curriculum["nodes"]:
        fams[n["family"]] = fams.get(n["family"], 0) + 1
    counts = {
        "sections": fams.get("TOPIC", 0),
        "topics": fams.get("SUBTOPIC", 0),
        "specPoints": fams.get("SPEC_POINT", 0),
        "notes": 0, "questionSets": 0, "questions": 0, "parts": 0,
        "marks": 0, "flashcards": 0,
    }
    manifest = {
        "schema": "syllabai-demo.content-bundle/2.0",
        "generatedUtc": NOW,
        "importSource": {
            "repo": "SyllabAI/syllabai-resources",
            "ref": f"main@{PIN}",
            "upstreamSchemas": ["syllabai.parsed-specification/1.0"],
        },
        "curriculum": {"board": "Edexcel" if hdr["board"].startswith("Pearson") else hdr["board"],
                        "level": hdr["level"], "subject": hdr["subject"],
                        "code": hdr["code"], "syllabusVersion": hdr["sv"]},
        "license": ("Official exam-board specification statements (parsed from the "
                    "official syllabus PDF, syllabai-resources Official-Specifications "
                    "plane). No third-party teaching content is bundled yet (honest "
                    "skeleton — notes/questions/flashcards arrive with the resource wave)."),
        "counts": counts,
        "treeKind": "official-spine",
        "officialSpine": {
            "spine": f"spines/{slug}.json",
            "resourcesSha": PIN,
        },
    }

    if new:
        cdir.mkdir(parents=True, exist_ok=True)
        (cdir / "notes.json").write_text("[]")
        (cdir / "questions.json").write_text("[]")
        (cdir / "flashcards.json").write_text("[]")
        (cdir / "learner-sim.json").write_text(json.dumps({
            "learnerId": f"sim-{slug}",
            "displayName": "Demo learner (simulated)",
            "disclaimer": ("No simulated learner overlay is seeded for this course yet "
                           "(honest skeleton bundle — T-SPECS-9696-4HI1 spec fill). "
                           "Strengths analytics are only seeded for the 4CH1 pilot; "
                           "practice marks and flashcard ratings you record are still "
                           "saved locally."),
            "skillStates": [], "misconceptionStates": [],
        }, indent=2) + "\n")
        (cdir / "concept-graph.json").write_text(json.dumps({
            "curriculumCode": hdr["code"], "edgeVocabulary": None, "counts": None,
            "validationGate": None, "nodes": [], "edges": [],
        }, indent=2) + "\n")
    (cdir / "curriculum.json").write_text(json.dumps(curriculum, indent=2, ensure_ascii=False) + "\n")
    (cdir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"{slug}: nodes={len(curriculum['nodes'])} edges={len(curriculum['edges'])} "
          f"counts={mc['topics']}T/{mc['subtopics']}S/{mc['specPoints']}P "
          f"(sections {counts['sections']}, topics {counts['topics']}, pts {counts['specPoints']}) new={new}")

# ---- integrity cross-checks vs the spine meta ----
for slug in fills:
    spine = json.loads((STAGING / f"{slug}.json").read_text())
    mc = spine["meta"]["counts"]
    cur = json.loads((REPO / "apps/hub/content" / slug / "curriculum.json").read_text())
    n_pts = sum(1 for n in cur["nodes"] if n["family"] == "SPEC_POINT")
    n_top = sum(1 for n in cur["nodes"] if n["family"] == "TOPIC")
    n_sub = sum(1 for n in cur["nodes"] if n["family"] == "SUBTOPIC")
    assert n_pts == mc["specPoints"], (slug, n_pts, mc)
    assert n_top == mc["topics"], (slug, n_top, mc)
    assert n_sub == mc["subtopics"], (slug, n_sub, mc)
    ids = [n["code"] for n in cur["nodes"]]
    assert len(ids) == len(set(ids)), f"{slug}: duplicate node codes"
    print(f"{slug}: spine-meta cross-check PASS ({n_top}T/{n_sub}S/{n_pts}P, codes unique)")
print("OK bundles written")
