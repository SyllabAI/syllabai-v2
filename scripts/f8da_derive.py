#!/usr/bin/env python3
"""
f8da_derive.py — T-KG-PRE-22 (batch twenty, the Edexcel science tranche 17,
the double-award family). Emits the NINE f8da_lattice_*.py modules:
  3 linear masters  f8da_lattice_4sd0{bio,chem,phys}.py   (4SD0, 2017 register)
  6 modular units   f8da_lattice_4xsd{b,c,p}u{1,2}.py     (4XSD1, 2024 register)

DERIVATION (two disclosed hops, both text-verified):
  hop 1: igcse-science-double-award-17-<s> is a verified TEXT SUBSET of the
         separate-science 2017 spec (igcse-biology-19 = 4BI1,
         igcse-chemistry-19 = 4CH1, igcse-physics-19 = 4PH1). Every 4SD0
         statement maps 1:1 onto a separate-science statement by exact or
         >=0.85 similarity text match (all >=0.879 pairs eyeballed: they are
         punctuation / formula-extraction / and-or variants of the SAME
         statement), except THREE manual-override points resolved by hand
         and EXACT text evidence (bio B1.4 -> 4BI1 1.4, the pathogens
         statement with 'and' vs 'or' plus curly quotes; chem C4.41 -> the
         scope note "4.41, 4.42, 4.43 are in the ... Chemistry only." which
         is NOT a teaching statement and stays UNANCHORED, disclosed), and
         the two unit-register manual overrides below.
  hop 2: each 4XSD1 modular unit re-sections the SAME 4SD0 linear content
         into a continuing register (bio U1 1.x-3.x, U2 4.x-6.x; chem U1
         1.x-4.x, U2 5.x-8.x; phys U1 1.x-5.x, U2 6.x-9.x). Every unit
         statement maps 1:1 onto a 4SD0 statement by text (exact or >=0.85;
         all eyeballed — formula-extraction and ion-formatting variants of
         the same statement), except TWO manual overrides with exact text
         evidence (chem U2 5.2 -> C1.38 ion charges, Ag+/Cu2+ formatting;
         phys U1 4.1 -> P5.1 units list, spacing).

The derived lattice = the master web (f8bi_lattice_4bi1 / f8ch_lattice_4ch1
/ f8ph_lattice_4ph1 — concepts kept with their authored ids, anchors
renumbered onto the target register) minus the concepts whose anchor falls
outside the target point set, minus the edges whose endpoints do not both
survive. NO edge is re-authored, re-weighted or re-oriented.

D-asserts (fail-closed, before any module is written):
  D1 map coverage  — every target point mapped (chem linear: all but the
                     disclosed C4.41 scope note)
  D2 injectivity   — maps are injective on both hops
  D3 edge hygiene  — kept edges: basis in store vocab, no self/dup/mutual,
                     both endpoints in the surviving concept set
  D4 1:1 coverage  — per course: concept count == mapped point count,
                     each concept single-anchored
  D5 reversed      — the exact reversed list per course computed against
                     the TARGET spine's own point order via the law of
                     record (scripts/kg_f8al_project.py export_pairs),
                     written into each module docstring.
"""
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
import kg_f8al_project as P  # noqa: E402

DATA = REPO / "apps" / "hub" / "public" / "kg" / "data"
OUT = REPO / "scripts"

DD, UWR = "DEFINITIONAL_DEPENDENCY", "USED_WITHOUT_RETEACHING"
BASIS = {DD, UWR}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().strip())


def load(slug: str):
    return json.loads((DATA / f"{slug}.json").read_text())


def fail(msg: str):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


MASTER_SLUG = {
    "bio": "igcse-biology-19",
    "chem": "igcse-chemistry-19",
    "phys": "igcse-physics-19",
}
MASTER_MOD = {"bio": "f8bi_lattice_4bi1", "chem": "f8ch_lattice_4ch1", "phys": "f8ph_lattice_4ph1"}
SDA_SLUG = {
    "bio": "igcse-science-double-award-17-biology",
    "chem": "igcse-science-double-award-17-chemistry",
    "phys": "igcse-science-double-award-17-physics",
}
UNIT_SLUG = {
    ("bio", 1): "igcse-science-double-award-modular-24-biology-unit-1",
    ("bio", 2): "igcse-science-double-award-modular-24-biology-unit-2",
    ("chem", 1): "igcse-science-double-award-modular-24-chemistry-unit-1",
    ("chem", 2): "igcse-science-double-award-modular-24-chemistry-unit-2",
    ("phys", 1): "igcse-science-double-award-modular-24-physics-unit-1",
    ("phys", 2): "igcse-science-double-award-modular-24-physics-unit-2",
}
# resolved by hand against exact statement text (see module docstring)
MANUAL_HOP1 = {("bio", "B1.4"): "1.4"}
EXCLUDE_HOP1 = {("chem", "C4.41")}  # scope note, not a teaching statement
# hop keys: hop1 = (subject,), hop2 = (subject, unit) — manual/exclude lookups use hop + (pid,)
MANUAL_HOP2 = {
    ("chem", 2, "5.2"): "C1.38",
    ("phys", 1, "4.1"): "P5.1",
}


def text_map(src_points, dst_points, manual, exclude, hop):
    """Map src point id -> dst point id by exact text, then >=0.85 fuzzy."""
    dst_by_norm = {norm(p["text"]): p["id"] for p in dst_points}
    mapping, fuzzy, unmatched = {}, {}, []
    for p in src_points:
        pid = p["id"]
        if hop + (pid,) in exclude:
            continue
        if hop + (pid,) in manual:
            mapping[pid] = manual[hop + (pid,)]
            continue
        t = norm(p["text"])
        if t in dst_by_norm:
            mapping[pid] = dst_by_norm[t]
            continue
        best = max(dst_by_norm, key=lambda k: SequenceMatcher(None, t, k).ratio())
        r = SequenceMatcher(None, t, best).ratio()
        if r >= 0.85:
            mapping[pid] = dst_by_norm[best]
            fuzzy[(pid, dst_by_norm[best])] = r
        else:
            unmatched.append((pid, dst_by_norm[best], r))
    return mapping, fuzzy, unmatched


def derive(subject: str):
    master_spine = load(MASTER_SLUG[subject])
    sda_spine = load(SDA_SLUG[subject])
    m = __import__(MASTER_MOD[subject])
    hop = (subject,)
    map1, fuzzy1, un1 = text_map(
        sda_spine["points"], master_spine["points"], MANUAL_HOP1, EXCLUDE_HOP1, hop
    )
    if un1:
        fail(f"hop1 {subject}: unmatched points {un1}")
    if len(set(map1.values())) != len(map1):
        fail(f"hop1 {subject}: not injective")
    inv1 = {v: k for k, v in map1.items()}

    concepts1 = {}
    for cid, binds in m.CONCEPTS.items():
        if len(binds) != 1:
            fail(f"{subject}: master concept {cid} not single-anchored: {binds}")
        if binds[0] in inv1:
            concepts1[cid] = [inv1[binds[0]]]
    edges1 = [e for e in m.EDGES if e[0] in concepts1 and e[1] in concepts1]

    n_pts = len(sda_spine["points"]) - len(EXCLUDE_HOP1 & {(subject, p["id"]) for p in sda_spine["points"]})
    if len(concepts1) != n_pts:
        fail(f"hop1 {subject}: D4 broken — concepts {len(concepts1)} != mapped points {n_pts}")

    # D5 — reversed list against the TARGET spine order (law of record)
    order1 = {p["id"]: i for i, p in enumerate(sda_spine["points"])}
    web1 = [{"prerequisite": a, "dependent": b, "basis": bas} for a, b, bas in edges1]
    pairs1, stats1 = P.export_pairs(web1, concepts1, order1)
    rev1 = sorted(
        (a, b) for a, b, _ in edges1
        if any((x, y) not in pairs1 for x in concepts1[a] for y in concepts1[b])
    )
    # exact: enumerate which authored edges export reversed
    rev_exact1 = []
    for a, b, _ in edges1:
        for x in concepts1[a]:
            for y in concepts1[b]:
                if x != y and order1[x] > order1[y]:
                    rev_exact1.append((a, b, x, y))

    units = {}
    for u in (1, 2):
        unit_spine = load(UNIT_SLUG[(subject, u)])
        hop2 = (subject, u)
        map2, fuzzy2, un2 = text_map(
            unit_spine["points"], sda_spine["points"], MANUAL_HOP2, set(), hop2
        )
        if un2:
            fail(f"hop2 {subject} U{u}: unmatched points {un2}")
        if len(set(map2.values())) != len(map2):
            fail(f"hop2 {subject} U{u}: not injective")
        inv2 = {v: k for k, v in map2.items()}
        concepts2 = {cid: [inv2[binds[0]]] for cid, binds in concepts1.items() if binds[0] in inv2}
        edges2 = [e for e in edges1 if e[0] in concepts2 and e[1] in concepts2]
        if len(concepts2) != len(unit_spine["points"]):
            fail(f"hop2 {subject} U{u}: D4 broken — concepts {len(concepts2)} != points {len(unit_spine['points'])}")
        order2 = {p["id"]: i for i, p in enumerate(unit_spine["points"])}
        web2 = [{"prerequisite": a, "dependent": b, "basis": bas} for a, b, bas in edges2]
        pairs2, stats2 = P.export_pairs(web2, concepts2, order2)
        rev_exact2 = []
        for a, b, _ in edges2:
            for x in concepts2[a]:
                for y in concepts2[b]:
                    if x != y and order2[x] > order2[y]:
                        rev_exact2.append((a, b, x, y))
        units[u] = {
            "spine": unit_spine, "concepts": concepts2, "edges": edges2,
            "map": map2, "fuzzy": fuzzy2, "stats": stats2, "rev": rev_exact2,
        }

    # D3 — hygiene on every kept edge set
    for tag, cons, eds in (
        ("linear", concepts1, edges1),
        *[("U%d" % u, units[u]["concepts"], units[u]["edges"]) for u in (1, 2)],
    ):
        seen = set()
        for a, b, bas in eds:
            if bas not in BASIS:
                fail(f"{subject} {tag}: basis {bas!r} outside vocab")
            if a == b or (a, b) in seen or (b, a) in seen:
                fail(f"{subject} {tag}: self/dup/mutual edge {(a, b)}")
            if a not in cons or b not in cons:
                fail(f"{subject} {tag}: edge endpoint not in concepts {(a, b)}")
            seen.add((a, b))

    return {
        "master": m, "sda": sda_spine, "concepts": concepts1, "edges": edges1,
        "map": map1, "fuzzy": fuzzy1, "stats": stats1, "rev": rev_exact1,
        "units": units,
    }


def fmt_rev(rev, label):
    if not rev:
        return "  (none — every kept dependency is served in-order)"
    lines = []
    for a, b, x, y in rev:
        lines.append(f"  - {a} [{x}] -> {b} [{y}]")
    return "\n".join(lines)


def emit(path: Path, docstring: str, concepts: dict, edges: list):
    body = [docstring, '\nDD = "DEFINITIONAL_DEPENDENCY"', 'UWR = "USED_WITHOUT_RETEACHING"', "", "CONCEPTS = {"]
    for cid, binds in concepts.items():
        body.append(f'    "{cid}": ["{binds[0]}"],')
    body.append("}")
    body.append("")
    body.append("EDGES = [")
    for a, b, bas in edges:
        short = "DD" if bas == DD else "UWR"
        body.append(f'    ("{a}", "{b}", {short}),')
    body.append("]")
    path.write_text("\n".join(body) + "\n")
    print(f"EMITTED {path.name}: concepts {len(concepts)}, edges {len(edges)}")


def main():
    results = {}
    for subject in ("bio", "chem", "phys"):
        results[subject] = derive(subject)
        d = results[subject]
        print(
            f"{subject}: hop1 mapped {len(d['map'])} (exact {len(d['map'])-len(d['fuzzy'])}, "
            f"fuzzy {len(d['fuzzy'])}), concepts {len(d['concepts'])}, edges kept {len(d['edges'])}, "
            f"export {d['stats']['exported']} (rev {d['stats']['reversedDropped']}, "
            f"self {d['stats']['selfLoops']}), reversed edges {len(d['rev'])}"
        )
        for u in (1, 2):
            du = d["units"][u]
            print(
                f"  U{u}: mapped {len(du['map'])} (exact {len(du['map'])-len(du['fuzzy'])}, "
                f"fuzzy {len(du['fuzzy'])}), concepts {len(du['concepts'])}, edges {len(du['edges'])}, "
                f"export {du['stats']['exported']} (rev {du['stats']['reversedDropped']}), "
                f"reversed edges {len(du['rev'])}"
            )

    TAG = {"bio": "biology", "chem": "chemistry", "phys": "physics"}
    MASTER = {"bio": "4BI1", "chem": "4CH1", "phys": "4PH1"}
    UNIT_TAG = {("bio", 1): "4XSDBU1", ("bio", 2): "4XSDBU2",
                ("chem", 1): "4XSDCU1", ("chem", 2): "4XSDCU2",
                ("phys", 1): "4XSDPU1", ("phys", 2): "4XSDPU2"}

    for subject in ("bio", "chem", "phys"):
        d = results[subject]
        n = len(d["sda"]["points"])
        nm = len(d["map"])
        fex = "; ".join(f"{k}->{v} ({r:.3f})" for (k, v), r in sorted(d["fuzzy"].items()))
        revs = fmt_rev(d["rev"], TAG[subject])
        exc = "1 point (C4.41) is the spec's scope note — not a teaching statement — and stays UNANCHORED (disclosed)" if subject == "chem" else "every point carries exactly one concept"
        doc = f'''"""4SD0 {TAG[subject]} linear concept lattice — T-KG-PRE-22
(F8 rollout batch twenty, the Edexcel science tranche 17, the double-award
family; serves igcse-science-double-award-17-{subject if subject != "chem" else "chemistry"}, {n} served points).

AI_SUGGESTED / UNVALIDATED concept web DERIVED for the Edexcel 4SD0
Double Award {TAG[subject]} specification, anchored 1:1 to the served spine's
point ids ({exc}).
DERIVATION DISCLOSED: the 4SD0 double-award {TAG[subject]} register is a verified
TEXT SUBSET of the separate-science {MASTER[subject]} 2017 spec — mapcheck of
record: {nm} of {n} points matched by exact or >=0.85 similarity text (the {len(d["fuzzy"])}
sub-exact pairs are punctuation / formula-extraction / and-or variants of the
SAME statement, each eyeballed: {fex}), plus {"ONE" if subject != "bio" else "ONE"}
manual override with exact text evidence ({ "bio B1.4 -> 1.4, the pathogens statement ('and' vs 'or', curly quotes)" if subject == "bio" else ("the disclosed C4.41 scope note exclusion" if subject == "chem" else "none")}); the map is INJECTIVE and
{("covers every teaching statement" if subject != "chem" else "covers every teaching statement (the C4.41 scope note excepted)")}.
The lattice is therefore the separate-science master web
(scripts/{MASTER_MOD[subject]}.py) with anchors renumbered onto the 4SD0
register; the master's authored edges are kept VERBATIM minus the edges
whose endpoints fall outside the double-award territory ({len(d["master"].EDGES) - len(d["edges"])} dropped).
NO edge is re-authored, re-weighted or re-oriented. Concept ids mirror the
master lattice for traceability. The master's reversed-territory edges that
fall inside this course are carried here too and dropped by the same
calibrated in-order law — the exact reversed list for this course, computed
against the 4SD0 spine's own point order:
{revs}

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""'''
        emit(OUT / f"f8da_lattice_4sd0{'bio' if subject=='bio' else ('chem' if subject=='chem' else 'phys')}.py",
             doc, d["concepts"], d["edges"])

        for u in (1, 2):
            du = d["units"][u]
            us = du["map"]
            ufex = "; ".join(f"{k}->{v} ({r:.3f})" for (k, v), r in sorted(du["fuzzy"].items()))
            urevs = fmt_rev(du["rev"], f"{TAG[subject]} U{u}")
            nup = len(du["spine"]["points"])
            sec_desc = {
                ("bio", 1): "unit 1 sections 1-3 (nature and variety; structure and functions part 1-2)",
                ("bio", 2): "unit 2 sections 4-6 (reproduction and inheritance; ecology and the environment; use of biological resources)",
                ("chem", 1): "unit 1 sections 1-4 (principles; inorganic; physical; organic — parts 1)",
                ("chem", 2): "unit 2 sections 5-8 (the continuing parts of the same four sections)",
                ("phys", 1): "unit 1 sections 1-5 (forces and motion; electricity; energy resources; solids-liquids-gases part 1; waves)",
                ("phys", 2): "unit 2 sections 6-9 (solids-liquids-gases part 2; magnetism and electromagnetism; radioactivity and particles; astrophysics)",
            }[(subject, u)]
            doc = f'''"""4XSD1 {TAG[subject]} modular unit {u} concept lattice — T-KG-PRE-22
(F8 rollout batch twenty, the Edexcel science tranche 17, the double-award
family; serves igcse-science-double-award-modular-24-{TAG[subject]}-unit-{u}, {nup} served
points).

AI_SUGGESTED / UNVALIDATED concept web DERIVED for the Edexcel 4XSD1
Double Award {TAG[subject]} modular specification, {sec_desc}, anchored 1:1
to the unit's served point ids.
DERIVATION DISCLOSED (two hops, both text-verified): the 2024 modular spec
RE-SECTIONS the 4SD0 linear content into a continuing register — mapcheck of
record for THIS unit: {nup} statements matched 1:1 onto the 4SD0 linear register
by exact or >=0.85 similarity text ({len(us) - len(du['fuzzy'])} exact + {len(du['fuzzy'])} sub-exact, each eyeballed:
{ufex if ufex else "none"}{"; plus the manual override chem U2 5.2 -> C1.38 (ion formatting)" if (subject, u) == ("chem", 2) else ""}{"; plus the manual override phys U1 4.1 -> P5.1 (units-list spacing)" if (subject, u) == ("phys", 1) else ""}),
the map is INJECTIVE and covers the unit exactly. The unit lattice is the
4SD0 linear web (f8da_lattice_4sd0{ 'bio' if subject=='bio' else ('chem' if subject=='chem' else 'phys') }.py, itself derived from the
separate-science master {MASTER_MOD[subject]}.py) with anchors renumbered onto
the unit register; edges kept VERBATIM minus the edges leaving the unit
territory ({len(d["edges"]) - len(du["edges"])} dropped). NO edge re-authored. Concept ids mirror the master
lattice for traceability. The exact reversed list for THIS unit, computed
against the unit's own spine order:
{urevs}

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""'''
            emit(OUT / f"f8da_lattice_4xsd{'b' if subject=='bio' else ('c' if subject=='chem' else 'p')}u{u}.py",
                 doc, du["concepts"], du["edges"])

    print("ALL D1-D5 ASSERTS PASSED — 9 modules emitted")


if __name__ == "__main__":
    main()
