#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-017 tranche-3: eyes-on restoration wave.

Scope of record (all printed-evidenced, pages READ at 150dpi + zooms):
  - 2025-06 4MB1-01: q6, q8-b, q11, q12 solutionMd (MS p8/p9/p12/p13)
  - 2026-06 4MB1-01R: q18, q19, q25, q27-a, q27-b solutionMd (MS p20-22/p23/p32-34/p36)
  - 2025-06 4MB1-01 q23-a problemMd: wage-table GFM re-emit (QP p19; renderer
    verification prerequisite GREEN: question-player.tsx -> Markdown -> remark-gfm
    + defaultSchema sanitize + table renderer; precedent 2019-06-02R q7 GFM table)

FAIL-CLOSED: in-memory edit + gate battery; write only on ALL GREEN.
Gates: census 66/1281/2443/6600 EXACT; marks map identical; PUA/FFFD 0;
unescaped-$ parity even per edited field; diff scope EXACT (pid,field) set;
mirror law MP[0].textMd := solutionMd on S-edited parts; serialization byte-law;
GFM transform assert (single-hit replace_sub); target-before hash pins.
"""
import json, hashlib, sys, copy, importlib.util

REPO = "/home/z/my-project/repos/syllabai-v2"
PLANE = f"{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json"
ART = f"{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-017"

def load_mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

mod_a = load_mod("t3_manifest_a", f"{ART}/t3_manifest_a.py")
mod_b = load_mod("t3_manifest_b", f"{ART}/t3_manifest_b.py")
MANIFEST = mod_a.MANIFEST_A + mod_b.MANIFEST_B

raw = open(PLANE, "rb").read()
data = json.loads(raw)
before_sha = hashlib.sha256(raw).hexdigest()[:16]
snapshot = copy.deepcopy(data)

EXPECT_BEFORE = "a11ad0ccc1923806"
if before_sha != EXPECT_BEFORE:
    print(f"FATAL plane sha16 {before_sha} != expected {EXPECT_BEFORE}"); sys.exit(2)

# ---------------------------------------------------------------- apply (in-memory)
index = {}
for si, s in enumerate(data):
    for qi, q in enumerate(s.get("questions") or []):
        for pi, p in enumerate(q.get("parts") or []):
            index[(s["slug"], q["id"], pi)] = (si, qi, pi)

edits, missing = [], []

def apply_one(slug, qid, pi, field, op, payload):
    si, qi, pidx = index[(slug, qid, pi)]
    p = data[si]["questions"][qi]["parts"][pidx]
    old = p.get(field)
    if op == "set":
        new = payload
    else:  # replace_sub
        needle, repl = payload
        n = (old or "").count(needle)
        if n != 1:
            print(f"FATAL replace_sub hit={n} for {p.get('id')} {field}"); sys.exit(2)
        new = old.replace(needle, repl)
    edits.append({"slug": slug, "qid": qid, "porder": pi,
                  "pid": p.get("id"), "field": field,
                  "old_sha16": hashlib.sha256((old or "").encode()).hexdigest()[:16] if old else None,
                  "new_len": len(new)})
    p[field] = new
    # mirror law: MP[0].textMd := solutionMd on S-edited parts
    if field == "solutionMd":
        mps = p.get("markPoints") or []
        if mps:
            edits.append({"slug": slug, "qid": qid, "porder": pi,
                          "pid": p.get("id"), "field": "markPoints[0].textMd",
                          "old_sha16": hashlib.sha256((mps[0].get("textMd") or "").encode()).hexdigest()[:16] if mps[0].get("textMd") else None,
                          "new_len": len(new)})
            mps[0]["textMd"] = new

for slug, qid, porder, fields in MANIFEST:
    if (slug, qid, porder) not in index:
        missing.append((slug, qid, porder)); continue
    for field, (op, payload) in fields.items():
        apply_one(slug, qid, porder, field, op, payload)

if missing:
    print("FATAL missing targets:", missing); sys.exit(2)

# ---------------------------------------------------------------- gates
def census(d):
    return (len(d),
            sum(len(s.get("questions") or []) for s in d),
            sum(len(q.get("parts") or []) for s in d for q in s.get("questions") or []),
            sum((p.get("marks") or 0) for s in d for q in s.get("questions") or [] for p in q.get("parts") or []))

def marks_map(d):
    out = {}
    for s in d:
        for q in s.get("questions") or []:
            for p in q.get("parts") or []:
                mps = p.get("markPoints") or []
                out[p["id"]] = (p.get("marks"), tuple((m.get("marks"), m.get("code")) for m in mps))
    return out

gates = {}
gates["census_EXACT"] = census(data) == (66, 1281, 2443, 6600)
gates["marks_map_identical"] = marks_map(data) == marks_map(snapshot)

bad = []
for s in data:
    for q in s.get("questions") or []:
        for p in q.get("parts") or []:
            txt = json.dumps([p.get("problemMd"), p.get("solutionMd")] +
                             [m.get("textMd") for m in (p.get("markPoints") or [])], ensure_ascii=False)
            if "\ufffd" in txt or any(0xE000 <= ord(c) <= 0xF8FF for c in txt):
                bad.append(p["id"])
gates["PUA_FFFD_0"] = not bad

dollar_bad = []
for e in edits:
    if e["field"] in ("problemMd", "solutionMd"):
        for s in data:
            for q in s.get("questions") or []:
                for p in q.get("parts") or []:
                    if p.get("id") == e["pid"] and s["slug"] == e["slug"]:
                        f = e["field"]
                        txt = p.get(f) or ""
                        n = txt.replace("\\$", "").count("$")
                        if n % 2:
                            dollar_bad.append((e["pid"], f))
                        break
gates["dollar_parity"] = not dollar_bad

mirror_bad = []
for e in edits:
    if e["field"] == "solutionMd":
        for s in data:
            if s["slug"] != e["slug"]: continue
            for q in s.get("questions") or []:
                for p in q.get("parts") or []:
                    if p.get("id") == e["pid"]:
                        mp = (p.get("markPoints") or [{}])[0]
                        if mp.get("textMd") != p.get("solutionMd"):
                            mirror_bad.append(e["pid"])
gates["mirror_law"] = not mirror_bad

expected_n = sum(len(f) for _, _, _, f in MANIFEST) + sum(1 for _, _, _, f in MANIFEST if "solutionMd" in f)
gates["diff_scope_EXACT"] = len(edits) == expected_n

new_raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
gates["serialization_roundtrip"] = json.loads(new_raw) == data

# changed-set must be exactly the manifest pids/fields (+ mirrors)
changed = set()
for s_old, s_new in zip(snapshot, data):
    if s_old["slug"] not in {m[0] for m in MANIFEST}: continue
    for q_old, q_new in zip(s_old["questions"], s_new["questions"]):
        for p_old, p_new in zip(q_old["parts"], q_new["parts"]):
            for f in ("problemMd", "solutionMd"):
                if p_old.get(f) != p_new.get(f):
                    changed.add((p_old["id"], f))
            mp_o = (p_old.get("markPoints") or [{}])[0].get("textMd")
            mp_n = (p_new.get("markPoints") or [{}])[0].get("textMd")
            if mp_o != mp_n:
                changed.add((p_old["id"], "markPoints[0].textMd"))
expect_changed = set()
for slug, qid, porder, fields in MANIFEST:
    si, qi, pidx = index[(slug, qid, porder)]
    pid = data[si]["questions"][qi]["parts"][pidx]["id"]
    for f in fields:
        expect_changed.add((pid, f))
        if f == "solutionMd":
            expect_changed.add((pid, "markPoints[0].textMd"))
gates["changed_set_EXACT"] = changed == expect_changed

ALLGREEN = all(gates.values())
print("BEFORE sha16:", before_sha)
print("AFTER  sha16:", hashlib.sha256(new_raw).hexdigest()[:16])
print("edits:", len(edits), "expected:", expected_n)
print("GATES:", json.dumps(gates))
if dollar_bad: print("dollar_bad:", dollar_bad[:5])
if mirror_bad: print("mirror_bad:", mirror_bad[:5])
if changed != expect_changed:
    print("changed-expect only:", sorted(expect_changed - changed)[:5])
    print("changed-unexpected:", sorted(changed - expect_changed)[:5])
if not ALLGREEN:
    print("FAIL-CLOSED: no write"); sys.exit(3)

open(PLANE, "wb").write(new_raw)
json.dump({"edits": edits, "before": before_sha,
           "after": hashlib.sha256(new_raw).hexdigest()[:16]},
          open(f"{ART}/tranche3-apply-log.json", "w"), ensure_ascii=False, indent=1)
print("WROTE plane. edits:", len(edits))
