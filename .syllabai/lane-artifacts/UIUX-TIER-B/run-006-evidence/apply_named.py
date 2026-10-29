#!/usr/bin/env python3
"""run-006 apply: named-part patches, fail-closed.
- Row splice by P-tag for ROW_PATCHES parts (untouched rows byte-identical).
- Full replace for Q28 solutionMd + Q21 problemMd/solutionMd.
- Asserts: every target found exactly once; part identity vs named6-full.json;
  structure counts + per-part marks unchanged vs pre-patch snapshot.
"""
import json, re, sys, hashlib

sys.path.insert(0, "/home/z/my-project/scripts/run006")
from patches_named import (ROW_PATCHES, PROBLEMMD_STRIPS, Q28_SLUG, Q28_Q, Q28_P,
                           Q28_SOLUTION, Q21_SLUG, Q21_Q, Q21_P, Q21_PROBLEMMD, Q21_SOLUTION)

BUNDLE = "/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json"
OLD = json.load(open("/home/z/my-project/scripts/run006/work/named6-full.json"))

raw = open(BUNDLE, encoding="utf-8").read()
d = json.loads(raw)
sets = d if isinstance(d, list) else d.get("sets", d)

def find_part(slug, qo, po):
    s = next(x for x in sets if x["slug"].split("--")[0] == slug)
    q = next(q for q in s["questions"] if q["order"] == qo)
    return next(p for p in q["parts"] if p["order"] == po)

ROW_RE = re.compile(r"^(\*\*P(\d+)\*\*)")

def split_rows(sol):
    rows, cur = [], []
    for line in sol.split("\n"):
        if line.startswith("**P") and cur:
            rows.append("\n".join(cur)); cur = [line]
        else:
            cur.append(line)
    if cur: rows.append("\n".join(cur))
    return rows

def splice(sol, repl, where):
    rows = split_rows(sol)
    out, used = [], set()
    for row in rows:
        m = ROW_RE.match(row)
        tag = f"**P{m.group(2)}**" if m else None
        if tag and tag in repl:
            out.append(repl[tag]); used.add(tag)
        else:
            out.append(row)
    missing = set(repl) - used
    assert not missing, f"{where}: tags not found {missing}"
    return "\n\n".join(out)

# ---- identity check vs pre-patch dump
for key, old in OLD.items():
    slug, qp = key.split("|")
    qo = int(qp[1:qp.index("p")]); po = int(qp[qp.index("p") + 1:])
    p = find_part(slug, qo, po)
    assert p["solutionMd"] == old["solutionMd"], f"identity drift solutionMd {key}"
    assert p["problemMd"] == old["problemMd"], f"identity drift problemMd {key}"
print("identity vs pre-patch dump: OK")

# ---- snapshot for gates
pre_counts = (len(sets), sum(len(s["questions"]) for s in sets),
              sum(len(q["parts"]) for s in sets for q in s["questions"]),
              sum(len(p.get("choices") or []) for s in sets for q in s["questions"] for p in q["parts"]))
pre_marks = {f"{s['slug']}|{q['order']}|{p['order']}": p["marks"]
             for s in sets for q in s["questions"] for p in q["parts"]}

log = []
# ---- row splices
for (slug, qo, po), fields in ROW_PATCHES.items():
    p = find_part(slug, qo, po)
    for field, repl in fields.items():
        before = p[field]
        p[field] = splice(before, repl, f"{slug} q{qo}p{po} {field}")
        assert p[field] != before, f"no-op {slug} q{qo}p{po} {field}"
        n_rows_before = len(split_rows(before)); n_rows_after = len(split_rows(p[field]))
        log.append(f"  {slug} q{qo}p{po} {field}: rows {n_rows_before} -> {n_rows_after} ({sorted(repl)})")

# ---- problemMd furniture strips
for slug, qo, po, needle in PROBLEMMD_STRIPS:
    p = find_part(slug, qo, po)
    assert needle in p["problemMd"], f"strip needle missing {slug} q{qo}p{po}"
    p["problemMd"] = p["problemMd"].replace(needle, "")
    log.append(f"  {slug} q{qo}p{po} problemMd: stripped {needle!r}")

# ---- full rebuilds
p = find_part(Q28_SLUG, Q28_Q, Q28_P)
p["solutionMd"] = Q28_SOLUTION
log.append(f"  {Q28_SLUG} q{Q28_Q}p{Q28_P} solutionMd: FULL REBUILD (P1-P23)")

p = find_part(Q21_SLUG, Q21_Q, Q21_P)
p["problemMd"] = Q21_PROBLEMMD
p["solutionMd"] = Q21_SOLUTION
log.append(f"  {Q21_SLUG} q{Q21_Q}p{Q21_P} problemMd+solutionMd: FULL REBUILD (QP p18 minus signs + MS p25)")

# ---- structural gates
post_counts = (len(sets), sum(len(s["questions"]) for s in sets),
               sum(len(q["parts"]) for s in sets for q in s["questions"]),
               sum(len(p.get("choices") or []) for s in sets for q in s["questions"] for p in q["parts"]))
assert pre_counts == post_counts, f"structure drift {pre_counts} -> {post_counts}"
post_marks = {f"{s['slug']}|{q['order']}|{p['order']}": p["marks"]
              for s in sets for q in s["questions"] for p in q["parts"]}
assert pre_marks == post_marks, "marks drift"
print("structure gate:", post_counts, "| marks map identical: OK")

# ---- serialize compact single-line (house law) + write
out = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
assert "\n" not in out, "newline in serialized JSON"
open(BUNDLE, "w", encoding="utf-8").write(out)
print(f"wrote bundle: {len(out)} bytes, sha256 {hashlib.sha256(out.encode()).hexdigest()[:16]}")
print("\n".join(log))
