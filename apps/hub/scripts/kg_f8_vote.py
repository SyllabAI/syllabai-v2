#!/usr/bin/env python3
"""kg_f8_vote.py — F8 pilot-fit round 2: self-consistency voting.

Runs the single-pass pair generation N times for the pilot (fresh LLM calls,
temperature-free), then keeps pairs that appear in >= K runs. Scores the
voted set against the operator-validated ground truth. If precision clears
the ship bar, the corpus run uses the same voting (K of N).
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import kg_f8_generate as gen  # noqa: E402

HUB = Path(__file__).resolve().parent.parent
PILOT = "igcse-chemistry-19"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
K = int(sys.argv[2]) if len(sys.argv) > 2 else 2
BAR = 0.60


def ordk(pid: str):
    parts = []
    for comp in pid.split("."):
        m = ""
        c = comp
        while c and not c[-1].isdigit():
            m, c = c[-1] + m, c[:-1]
        parts.append((int(c or 0), m))
    return tuple(parts)


def main() -> int:
    qual, label, points, _ = gen.course_points(PILOT)
    valid = {p["code"] for p in points}
    listing = {p["code"]: i for i, p in enumerate(points)}
    prompt = gen.prompt_pairs(qual, label, points)

    per_run = []
    for i in range(N):
        out = gen.zai_json(gen.SYS, prompt, gen.RAW / f"vote-{PILOT}.run{i}.json")
        if not out or not isinstance(out.get("edges"), list):
            print(f"run {i}: FAIL")
            continue
        pairs = set()
        for e in out["edges"]:
            pre, dep = str(e.get("pre") or ""), str(e.get("dep") or "")
            if pre in valid and dep in valid and pre != dep \
                    and listing[pre] < listing[dep]:
                pairs.add((pre, dep))
        per_run.append(pairs)
        print(f"run {i}: {len(pairs)} valid pairs")

    if len(per_run) < 2:
        print("not enough clean runs")
        return 1

    votes = Counter(p for run in per_run for p in run)
    voted = {p for p, c in votes.items() if c >= K}
    print(f"\nvoted (>= {K} of {len(per_run)} runs): {len(voted)} pairs")

    published = json.loads((HUB / "public/kg/data" / f"{PILOT}.json").read_text())
    gt = {(e[0][2:], e[1][2:]) for e in published["edges"] if e[2] == "pre"}
    inter = {(a[2:], b[2:]) for a, b in ((("p:" + p), ("p:" + d)) for p, d in voted) if False}
    ai_norm = {(("p:" + p), ("p:" + d)) for p, d in voted}
    gt_norm = gt
    hits = {(("p:" + p), ("p:" + d)) for p, d in voted if ("p:" + p, "p:" + d) in gt_norm}
    precision = len(hits) / len(ai_norm) if ai_norm else 0
    recall = len(hits) / len(gt_norm)
    print(f"ground truth: {len(gt_norm)} published pre edges")
    print(f"precision {precision:.2%} | recall {recall:.2%}")
    print("hits:", sorted(hits)[:15])
    miss = sorted(ai_norm - gt_norm)[:15]
    print("AI-only sample:", miss)

    print(f"\nship bar precision >= {BAR:.0%}: {'PASS' if precision >= BAR else 'FAIL'}")
    (gen.WORK / "vote-pilot.json").write_text(json.dumps({
        "n": len(per_run), "k": K, "voted": sorted(voted),
        "precision": precision, "recall": recall,
        "votes": {f"{p}|{d}": c for (p, d), c in votes.most_common()},
    }, indent=1))
    return 0 if precision >= BAR else 2


if __name__ == "__main__":
    sys.exit(main())
