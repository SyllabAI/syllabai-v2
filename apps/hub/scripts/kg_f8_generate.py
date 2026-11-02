#!/usr/bin/env python3
"""kg_f8_generate.py — F8 (KG-AUDIT-2): AI prerequisite pairs -> prerequisites.json.

For every course without a committed prerequisite snapshot, generate
point-level prerequisite pairs from the curriculum bundle with the z-ai CLI
(glm) — VOTE_RUNS independent passes, keep pairs agreed by >= VOTE_K runs
(self-consistency vote) — then write content/<slug>/prerequisites.json:

    conceptWebPrerequisiteEdges  [{prerequisite, dependent, skill, basis}]
                                 (verbatim point codes = structure endpoints;
                                 the exporter's resolve() projects 1:1)

Shape history (all measured against the operator-validated pilot store,
145 pre edges — see the KG-AUDIT-2 receipt):
  concept-anchors + cross-product -> precision 2.36% (anchor explosion; the
  operator's own web averages 1.04 anchors/concept, near point-level);
  single-pass point-level pairs  -> precision 44.1%;
  3-run vote K=2                 -> precision 46.3% LOWER BOUND (the store is
  selective, not exhaustive — pairs it lacks are not proven wrong), recall
  17.2%; K=3 unanimous hit 58.3% but webs too sparse to matter.

Everything is AI_SUGGESTED / unvalidated — the exporter projects the pairs
as the concept-web tier (meta.prerequisites.tiers.conceptWebInferred), keeps
them OUT of prereqValidated, and only in-order pairs ship; the renderer fork
labels them INFERRED PROTOTYPE. Courses where no valid pair survives get NO
snapshot (the honest v1.2 shape).

Ledger + raw LLM responses land in work/f8/ for audit; re-runs resume.
"""
from __future__ import annotations

import collections
import json
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HUB = Path(__file__).resolve().parent.parent
CONTENT = HUB / "content"
WORK = Path("/tmp/kg-f8-work")  # sandbox scratch; ledger + raws are audit-only
RAW = WORK / "raw"
LEDGER = WORK / "ledger.json"

MAX_EDGES = 80
MAX_PER_DEPENDENT = 6
VOTE_RUNS = 3
VOTE_K = 2
STATEMENT_CAP = 220
WORKERS = 4

_lock = threading.Lock()


def log(msg: str) -> None:
    with _lock:
        print(msg, flush=True)


def ledger_load() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text())
    return {}


def ledger_put(slug: str, entry: dict) -> None:
    with _lock:
        led = ledger_load()
        led[slug] = entry
        LEDGER.write_text(json.dumps(led, indent=1, sort_keys=True))


def zai_json(system: str, user: str, out_raw: Path, tries: int = 3) -> dict | None:
    """One z-ai chat call; returns parsed JSON or None (raw saved for audit)."""
    for attempt in range(1, tries + 1):
        try:
            r = subprocess.run(
                ["z-ai", "chat", "-p", user, "-s", system, "-o", str(out_raw)],
                capture_output=True, text=True, timeout=420,
            )
            if r.returncode != 0:
                log(f"    z-ai rc={r.returncode} attempt {attempt}: {r.stderr[-160:]}")
                time.sleep(4 * attempt)
                continue
            d = json.loads(out_raw.read_text())
            content = d["choices"][0]["message"]["content"].strip()
            # robust extraction: strip fences, take outermost braces
            content = re.sub(r"^```(?:json)?|```$", "", content.strip(), flags=re.M).strip()
            start, end = content.find("{"), content.rfind("}")
            if start == -1:
                log(f"    no JSON object in response (attempt {attempt})")
                continue
            blob = content[start : end + 1] if end > start else content[start:]
            try:
                return json.loads(blob)
            except json.JSONDecodeError:
                # truncated output: salvage complete objects from the edges array
                salvage = re.findall(
                    r"\{[^{}]*?\"pre\"\s*:\s*\"[^\"]+\"[^{}]*?\"dep\"\s*:\s*\"[^\"]+\"[^{}]*?\}",
                    blob)
                if len(salvage) >= 5:
                    objs = []
                    for s in salvage:
                        try:
                            objs.append(json.loads(s))
                        except json.JSONDecodeError:
                            pass
                    if objs:
                        log(f"    salvaged {len(objs)} objects from truncated output")
                        return {"edges": objs}
                log(f"    unparseable JSON (attempt {attempt}), len={len(blob)}")
                time.sleep(4 * attempt)
        except (json.JSONDecodeError, KeyError, subprocess.TimeoutExpired) as exc:
            log(f"    parse/exec failure attempt {attempt}: {exc}")
            time.sleep(4 * attempt)
    return None


def course_points(slug: str) -> tuple[str, str, list[dict], dict]:
    """(qual code, display label, points [{code, sub, sec, statement}], sections)"""
    cur = json.loads((CONTENT / slug / "curriculum.json").read_text())
    reg = {}
    reg_path = CONTENT / "courses.json"
    if reg_path.exists():
        rd = json.loads(reg_path.read_text())
        for e in (rd if isinstance(rd, list) else rd.get("courses", [])):
            if isinstance(e, dict) and e.get("slug") == slug:
                reg = e
    qual = cur.get("code") or slug

    nodes = cur["nodes"]
    by_code = {n["code"]: n for n in nodes}
    # section/subtopic titles for context (unit-layer aware, mirrors exporter)
    title_of = {n["code"]: n["title"] for n in nodes}
    sec_of_sub, sec_title = {}, {}
    for n in nodes:
        if n["family"] == "SUBTOPIC":
            for p in n.get("parents") or []:
                if p in title_of:
                    sec_of_sub[n["code"]] = p
                    sec_title[p] = title_of[p]

    points = []
    for n in nodes:
        if n["family"] != "SPEC_POINT":
            continue
        sub = next((p for p in (n.get("parents") or []) if p in sec_of_sub), None)
        sec = sec_of_sub.get(sub, "")
        points.append({
            "code": n["code"],
            "sub": title_of.get(sub, "") if sub else "",
            "sec": sec_title.get(sec, "") if sec else "",
            "statement": (n.get("title") or "")[:STATEMENT_CAP],
        })
    label = reg.get("subject") or slug
    return qual, label, points, sec_title


def prompt_pairs(qual: str, label: str, points: list[dict]) -> str:
    lines = [f"Course: {label} (qualification code {qual}). Specification points in teaching order (code | subtopic | statement):",
             ""]
    for p in points:
        lines.append(f"{p['code']} | {p['sub']} | {p['statement']}")
    lines += ["",
        "Task: list the prerequisite dependencies between POINTS — a pair (pre, dep) where the knowledge or skill carried by 'pre' is genuinely required before a learner can learn or perform 'dep', as a subject teacher would mark them in a scheme of work.",
        "Rules: only load-bearing dependencies, not topical proximity; 'pre' must come earlier in the listing than 'dep' (printed spec order); no self-pairs; each 'dep' should not collect more than a handful of 'pre' entries; at most 50 pairs, strongest first; 'skill' = a 2-5 word label for the prerequisite idea; 'basis' = ONE short clause, under 100 characters, naming the mechanism or skill.",
        'Output strict COMPACT JSON only (no spaces, no markdown): {"edges":[{"pre":"CODE","dep":"CODE","skill":"...","basis":"..."}]} with codes echoed verbatim.']
    return "\n".join(lines)


SYS = "You are a meticulous curriculum specialist. Output strict JSON only — no markdown fences, no commentary, no trailing text."


def valid_pairs_of(obj: dict, valid_codes: set[str], listing: dict[str, int]) -> set[tuple[str, str]]:
    """Deterministic validation of one run's raw edges -> in-order valid pairs."""
    pairs = set()
    for e in obj.get("edges", []):
        if not isinstance(e, dict):
            continue
        pre, dep = str(e.get("pre") or "").strip(), str(e.get("dep") or "").strip()
        if pre not in valid_codes or dep not in valid_codes or pre == dep:
            continue
        if listing[pre] >= listing[dep]:   # reversed / adjacent-echo guard
            continue
        pairs.add((pre, dep))
    return pairs


def process(slug: str, force: bool = False) -> None:
    led = ledger_load()
    prev = led.get(slug)
    snap_path = CONTENT / slug / "prerequisites.json"
    if snap_path.exists() and not force:
        log(f"  skip {slug} (snapshot exists)")
        ledger_put(slug, {"status": "skip-existing"})
        return
    if prev and prev.get("status") == "ok" and not force:
        log(f"  skip {slug} (ledger ok)")
        return

    qual, label, points, _ = course_points(slug)
    if len(points) < 4:
        log(f"  skip {slug} ({len(points)} points — too small)")
        ledger_put(slug, {"status": "skipped-too-small", "points": len(points)})
        return

    # N independent passes, then self-consistency voting (K of N): the vote
    # is the corpus-scale agreement filter — pilot-fit on the operator-validated
    # store measured precision 46% (K=2, lower bound vs a selective store).
    runs, basis_of, skill_of = [], {}, {}
    valid_codes = {p["code"] for p in points}
    listing = {p["code"]: i for i, p in enumerate(points)}
    for i in range(VOTE_RUNS):
        obj = zai_json(SYS, prompt_pairs(qual, label, points), RAW / f"{slug}.v{i}.json")
        if obj is None or not isinstance(obj.get("edges"), list):
            continue
        pairs = valid_pairs_of(obj, valid_codes, listing)
        for e in obj["edges"]:
            if not isinstance(e, dict):
                continue
            key = (str(e.get("pre") or "").strip(), str(e.get("dep") or "").strip())
            if key in pairs:
                if key not in basis_of or not basis_of[key]:
                    basis_of[key] = str(e.get("basis") or "").strip()[:200]
                if key not in skill_of or not skill_of[key]:
                    skill_of[key] = str(e.get("skill") or "").strip()[:60]
        runs.append(pairs)
    if len(runs) < 2:
        ledger_put(slug, {"status": "fail-pass1", "cleanRuns": len(runs)})
        log(f"  FAIL {slug} ({len(runs)}/{VOTE_RUNS} clean runs)")
        return
    votes = collections.Counter(p for r in runs for p in r)
    voted = sorted(p for p, c in votes.items() if c >= VOTE_K)

    # deterministic caps: strongest agreements first (3-vote unanimous pairs
    # measured ~58% lower-bound precision vs the operator store, K=2 ~46%),
    # then listing order; per-dependent hub guard + course total
    per_dep: dict[str, int] = {}
    edges, hub_dropped = [], 0
    ranked = sorted(voted, key=lambda pd: (-votes[pd], listing[pd[0]], listing[pd[1]]))
    for pre, dep in ranked:
        if per_dep.get(dep, 0) >= MAX_PER_DEPENDENT:
            hub_dropped += 1
            continue
        per_dep[dep] = per_dep.get(dep, 0) + 1
        edges.append({
            "prerequisite": pre,
            "dependent": dep,
            "skill": skill_of.get((pre, dep), ""),
            "basis": basis_of.get((pre, dep), ""),
        })
        if len(edges) >= MAX_EDGES:
            break

    if not edges:
        ledger_put(slug, {"status": "skipped-no-edges", "cleanRuns": len(runs),
                          "hubDropped": hub_dropped})
        log(f"  skip {slug} (0 voted pairs)")
        return

    snap = {
        "source": ("AI-projected prerequisite pairs (glm via z-ai, AI_SUGGESTED, unvalidated; "
                   f"{VOTE_RUNS}-run self-consistency vote, kept at >= {VOTE_K} votes) "
                   "generated from content/" + slug + "/curriculum.json by "
                   "scripts/kg_f8_generate.py — point-level pairs, structure endpoints; "
                   "the exporter projects them as the concept-web tier (renderer label: "
                   "INFERRED PROTOTYPE); no operator validation has occurred"),
        "generatedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "curriculumCode": qual,
        "hubCourseSlug": slug,
        "conceptAnchors": {},
        "conceptWebPrerequisiteEdges": edges,
        "counts": {
            "points": len(points),
            "cleanRuns": len(runs),
            "votedPairs": len(voted),
            "conceptEdges": len(edges),
            "hubDropped": hub_dropped,
            "capDropped": max(0, len(voted) - hub_dropped - len(edges)),
        },
    }
    snap_path.write_text(json.dumps(snap, ensure_ascii=False, indent=1) + "\n",
                         encoding="utf-8")
    ledger_put(slug, {"status": "ok", "points": len(points), "conceptEdges": len(edges),
                      "cleanRuns": len(runs), "hubDropped": hub_dropped})
    log(f"  ok   {slug}: {len(edges)} voted pairs ({len(runs)} runs, hub-dropped {hub_dropped})")


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"
    RAW.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)

    if mode == "one":
        process(sys.argv[2], force="--force" in sys.argv)
        return 0

    slugs = sorted(p.parent.name for p in CONTENT.glob("*/curriculum.json"))
    todo = [s for s in slugs if not (CONTENT / s / "prerequisites.json").exists()
            or ledger_load().get(s, {}).get("status", "").startswith("fail")]
    log(f"F8 generation: {len(slugs)} courses, {len(todo)} to do, workers={WORKERS}")
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(process, s): s for s in todo}
        for fut in as_completed(futs):
            s = futs[fut]
            try:
                fut.result()
            except Exception as exc:  # ledger the crash, keep the batch alive
                ledger_put(s, {"status": "crash", "error": str(exc)[:200]})
                log(f"  crash {s}: {exc}")
            done += 1
            log(f"  [{done}/{len(todo)}] latest={s}")
    led = ledger_load()
    ok = sum(1 for v in led.values() if v.get("status") == "ok")
    log(f"ledger: {ok} ok, {len(led)} tracked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
