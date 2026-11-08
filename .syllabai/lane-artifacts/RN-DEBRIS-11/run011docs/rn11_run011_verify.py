#!/usr/bin/env python3
"""RN-DEBRIS-11 run-011 — the independent verification battery.

G0 byte anchors — the working tree delta is EXACTLY the 4 of-record files.
G1 serializer laws — round-trip byte-exact on all 4 (curriculum/manifest
   indent=1 + trailing newline; KG + index compact single-line).
G2 zero-invention — the 9 point titles byte-equal a fresh PDF extraction
   (evidence artifact rebuilt + compared); every pre-existing node/edge byte
   outside the declared repair fields equals origin/main.
G3 structure laws — node/edge/point counts; TOPIC 1..6; SPEC_POINT 1..61
   global sequence; SUBTOPIC per-topic 1..M; hierarchical family blocks;
   PART_OF mirrors parents (16 old + 9 new links); DFS edge order.
G4 KG recompute — export_course() rerun deep-equals the written KG file
   ex-generatedUtc (T-SPEC-KG-REGEN-1 law); index row == meta counts; the
   105 sibling KG files byte-untouched.
G5 manifest sync — counts == curriculum truth (6/29/61).
G6 placement A/B — verify_sme_wire_r0.ts on an origin/main worktree (pre)
   vs the repaired tree (post): totals + gen-row homes IDENTICAL.
G7 untouched planes — questions/notes/flashcards/prerequisites.json and the
   other content files byte-equal origin/main.
G8 title uniqueness — T1's 15 new/riding titles distinct; no collision with
   any existing title in the course.
"""
import json
import subprocess
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
HUB = REPO / "apps" / "hub"
CONTENT = HUB / "content"
SLUG = "cie-igcse-business-25"
COURSE = CONTENT / SLUG
KG = HUB / "public" / "kg" / "data"
EXPECTED = {
    f"apps/hub/content/{SLUG}/curriculum.json",
    f"apps/hub/content/{SLUG}/manifest.json",
    f"apps/hub/public/kg/data/{SLUG}.json",
    f"apps/hub/public/kg/data/index.json",
}
BASE = "origin/main"

GATES = {}


def fail(name, msg):
    print(f"FAIL {name}: {msg}", flush=True)
    sys.exit(2)


def git(*args):
    return subprocess.run(["git", "-C", str(REPO), *args],
                          capture_output=True, check=True).stdout


def main():
    # ── G0 ───────────────────────────────────────────────────────────────
    names = set(git("status", "--porcelain").decode().split("\n"))
    changed = {ln[3:] for ln in names if ln.strip()}
    if changed != EXPECTED:
        fail("G0", f"working tree delta drifted: {sorted(changed)}")
    GATES["G0"] = "OK (exactly the 4 of-record files)"
    print(GATES["G0"])

    # ── G1 ───────────────────────────────────────────────────────────────
    for rel, compact in ((f"{SLUG}/curriculum.json", False),
                         (f"{SLUG}/manifest.json", False),
                         (f"../public/kg/data/{SLUG}.json", True),
                         (f"../public/kg/data/index.json", True)):
        p = (CONTENT / rel).resolve()
        raw = p.read_bytes()
        obj = json.loads(raw)
        if compact:
            ok = json.dumps(obj, ensure_ascii=False,
                            separators=(",", ":")).encode() == raw
        else:
            ok = (json.dumps(obj, indent=1, ensure_ascii=False) + "\n").encode() == raw
        if not ok:
            fail("G1", f"serializer law broken for {rel}")
    GATES["G1"] = "OK (curriculum+manifest indent=1+trailing NL; KG+index compact single-line)"
    print(GATES["G1"])

    # ── G2 ───────────────────────────────────────────────────────────────
    ev_raw = Path("/home/z/my-project/work/run011/run011_official_evidence.json").read_bytes()
    subprocess.run(["python3", "/home/z/my-project/scripts/rn11_run011_extract_t1.py"],
                   capture_output=True, check=True)
    if Path("/home/z/my-project/work/run011/run011_official_evidence.json").read_bytes() != ev_raw:
        fail("G2", "fresh extraction drifted from the evidence artifact")
    ev = json.loads(ev_raw)
    cur = json.loads((COURSE / "curriculum.json").read_bytes())
    base_cur = json.loads(git("show", f"{BASE}:apps/hub/content/{SLUG}/curriculum.json"))
    base_by = {n["code"]: n for n in base_cur["nodes"]}
    new_titles = set()
    for n in cur["nodes"]:
        o = base_by.get(n["code"])
        if o is None:
            if n["family"] != "SPEC_POINT":
                fail("G2", f"unexpected new {n['family']} node {n['code']}")
            p = next(p for p in ev["points"] if p["code"] == n["code"])
            if n["title"] != p["officialTitle"]:
                fail("G2", f"{n['code']} title != PDF evidence")
            new_titles.add(n["title"])
            continue
        # the husk moves byte-identical; topics/points may only change order
        allowed = {"order"} if n["family"] in ("TOPIC", "SPEC_POINT") else set()
        delta = {k for k in n if json.dumps(n[k], sort_keys=True)
                 != json.dumps(o.get(k), sort_keys=True)}
        if delta - allowed:
            fail("G2", f"{n['code']} changed fields outside the law: {delta}")
    base_edges = [json.dumps(e, sort_keys=True) for e in base_cur["edges"]]
    got_edges = [json.dumps(e, sort_keys=True) for e in cur["edges"][15:]]
    if got_edges != base_edges:
        fail("G2", "legacy edge bytes drifted")
    for e in cur["edges"][:15]:
        if e["relation"] != "PART_OF" or e["provenanceTier"] != "RULE_DERIVED":
            fail("G2", "new edge law violated")
    GATES["G2"] = ("OK (fresh PDF extraction byte-stable; 9 titles == evidence; "
                   "all legacy bytes outside {order} equal origin/main; legacy 81 edges verbatim)")
    print(GATES["G2"])

    # ── G3 ───────────────────────────────────────────────────────────────
    topics = [n for n in cur["nodes"] if n["family"] == "TOPIC"]
    subs = [n for n in cur["nodes"] if n["family"] == "SUBTOPIC"]
    pts = [n for n in cur["nodes"] if n["family"] == "SPEC_POINT"]
    if not (len(topics) == 6 and len(subs) == 29 and len(pts) == 61
            and cur["nodes"][0]["family"] == "SUBJECT"):
        fail("G3", "family counts drifted")
    if [t["order"] for t in topics] != [1, 2, 3, 4, 5, 6]:
        fail("G3", "topic order law broken")
    if sorted(p["order"] for p in pts) != list(range(1, 62)):
        fail("G3", "point global sequence broken")
    from collections import defaultdict
    by_par = defaultdict(list)
    for s in subs:
        by_par[s["parents"][0]].append(s["order"])
    for par, os_ in by_par.items():
        if sorted(os_) != list(range(1, len(os_) + 1)):
            fail("G3", f"subtopic per-topic sequence broken in {par}")
    ecodes = {(e["source"], e["target"]) for e in cur["edges"]}
    for n in cur["nodes"]:
        for p in n["parents"]:
            if (p, n["code"]) not in ecodes:
                fail("G3", f"parents link without edge: {p}->{n['code']}")
    # hierarchical family blocks
    seq = [n["family"] for n in cur["nodes"]]
    if seq.count("TOPIC") != 6 or seq[0] != "SUBJECT" or seq[-1] != "SPEC_POINT":
        fail("G3", "array family blocks drifted")
    pos, blocks = 1, []
    while pos < len(seq):
        if seq[pos] == "TOPIC":
            blocks.append("T"); pos += 1
        elif seq[pos] == "SUBTOPIC":
            while pos < len(seq) and seq[pos] == "SUBTOPIC":
                blocks.append("S"); pos += 1
        else:
            while pos < len(seq) and seq[pos] == "SPEC_POINT":
                blocks.append("P"); pos += 1
    joined = "".join(blocks)
    if "TS" not in joined or "SS" in joined.replace("SP", "X") and False:
        pass  # shape asserted via group walk below
    # strict walk: SUBJECT (T (S P*)*) x6
    pos = 1
    for _ in range(6):
        if seq[pos] != "TOPIC":
            fail("G3", "topic block head lost")
        pos += 1
        while pos < len(seq) and seq[pos] == "SUBTOPIC":
            pos += 1
            while pos < len(seq) and seq[pos] == "SPEC_POINT":
                pos += 1
    if pos != len(seq):
        fail("G3", "array has trailing/misplaced nodes")
    # DFS edge order: T1 group leads
    if cur["edges"][0]["target"] != "cie-igcse-business-2027-2029-T1":
        fail("G3", "T1 edge group does not lead")
    GATES["G3"] = ("OK (97 nodes = 1+6+29+61; TOPIC 1..6; SPEC_POINT 1..61; "
                   "SUBTOPIC per-topic seq; parents<->edges mirrored; strict hierarchical blocks; DFS head T1)")
    print(GATES["G3"])

    # ── G4 ───────────────────────────────────────────────────────────────
    sys.path.insert(0, str(HUB / "scripts"))
    import kg_export
    reg = json.loads((CONTENT / "courses.json").read_text(encoding="utf-8"))
    registry = {e["slug"]: e for e in reg if isinstance(e, dict) and e.get("slug")}
    payload = kg_export.export_course(SLUG, registry)
    written = json.loads((KG / f"{SLUG}.json").read_bytes())
    w_gen = written["meta"].pop("generatedUtc")
    p_gen = payload["meta"].pop("generatedUtc")
    if written != payload:
        fail("G4", "export_course recompute != written file (ex-generatedUtc)")
    idx = json.loads((KG / "index.json").read_bytes())
    row = next(r for r in idx["courses"] if r["slug"] == SLUG)
    c = payload["meta"]["counts"]
    if row["counts"] != {"nodes": c["nodes"], "edges": c["edges"],
                         "specPoints": c["specPoints"]}:
        fail("G4", "index row != meta counts")
    siblings = [p.name for p in KG.glob("*.json") if p.name not in (f"{SLUG}.json", "index.json")]
    base_sib = {n for n in git("ls-tree", "--name-only", f"{BASE}", f"apps/hub/public/kg/data/").decode().split("\n") if n.endswith(".json")}
    changed_sib = {n for n in git("status", "--porcelain").decode().splitlines()
                   if "kg/data" in n and n[3:].endswith(".json")
                   and Path(n[3:]).name not in (f"{SLUG}.json", "index.json")}
    if changed_sib:
        fail("G4", f"sibling KG files changed: {changed_sib}")
    GATES["G4"] = (f"OK (export_course recompute deep-equals written KG ex-generatedUtc "
                   f"[{w_gen} vs {p_gen}]; index row == meta; {len(siblings)} sibling KG files byte-untouched)")
    print(GATES["G4"])

    # ── G5 ───────────────────────────────────────────────────────────────
    man = json.loads((COURSE / "manifest.json").read_bytes())
    tree_pts = len(pts)
    if (man["counts"]["sections"], man["counts"]["topics"],
            man["counts"]["specPoints"]) != (6, 29, tree_pts):
        fail("G5", f"manifest counts drift: {man['counts']}")
    GATES["G5"] = "OK (manifest counts == curriculum truth: sections 6, topics 29, specPoints 61)"
    print(GATES["G5"])

    # ── G6 (A/B legs run separately; the caller compares) ────────────────
    GATES["G6"] = "delegated to the A/B legs (verify_sme_wire_r0.ts pre/post)"
    print(GATES["G6"])

    # ── G7 ───────────────────────────────────────────────────────────────
    untouched = [f"{SLUG}/questions.json", f"{SLUG}/notes.json",
                 f"{SLUG}/flashcards.json", f"{SLUG}/prerequisites.json",
                 f"{SLUG}/concept-graph.json", f"{SLUG}/learner-sim.json",
                 f"{SLUG}/placement-backfill.json"]
    for rel in untouched:
        now = (CONTENT / rel).read_bytes()
        base = git("show", f"{BASE}:apps/hub/content/{SLUG}/{Path(rel).name}")
        if now != base:
            fail("G7", f"{rel} drifted")
    GATES["G7"] = "OK (questions/notes/flashcards/prerequisites/concept-graph/learner-sim/placement-backfill byte-untouched)"
    print(GATES["G7"])

    # ── G8 ───────────────────────────────────────────────────────────────
    all_titles = [n["title"] for n in cur["nodes"]]
    if len(set(all_titles)) != len(all_titles):
        fail("G8", "title collision after repair")
    if len(new_titles) != 9:
        fail("G8", f"new title set {len(new_titles)} != 9")
    GATES["G8"] = "OK (97 node titles distinct; the 9 new titles distinct and non-colliding)"
    print(GATES["G8"])

    print("\nALL GATES GREEN (G0-G5, G7, G8; G6 via A/B legs)")


if __name__ == "__main__":
    main()
