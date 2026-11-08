#!/usr/bin/env python3
"""RN-DEBRIS-11 run-012 — sandboxed tagBackfill engine apply + census (no tree writes)."""
import json, shutil, sys, collections
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
HUB = REPO / "apps" / "hub"
SLUG = "cie-igcse-business-25"
SME = "/home/z/my-project/work/sme-pin-4e3a1c68/SME-ExamQuestion"
TMP = Path("/home/z/my-project/work/rn12_engine_sandbox")

# build sandbox layout
if TMP.exists(): shutil.rmtree(TMP)
tmp_content = TMP / "content"
(tmp_content / SLUG).mkdir(parents=True)
for f in ["questions.json", "manifest.json", "curriculum.json"]:
    shutil.copy2(HUB / "content" / SLUG / f, tmp_content / SLUG / f)

sys.path.insert(0, str(HUB / "scripts"))
import backfill_sme_spec_tags as eng  # noqa

orig_content = eng.CONTENT
eng.CONTENT = str(tmp_content)
try:
    res = eng.backfill_course(SLUG, str(tmp_content), SME, "main@4e3a1c6843b0", dry=False)
finally:
    eng.CONTENT = orig_content
print("engine result:", json.dumps(res))

orig = json.loads((HUB / "content" / SLUG / "questions.json").read_text())
new = json.loads((tmp_content / SLUG / "questions.json").read_text())
cur = json.loads((HUB / "content" / SLUG / "curriculum.json").read_text())
spine = {n["code"] for n in cur["nodes"] if n["family"] == "SPEC_POINT"}

def key(s): return s.get("slug")
omap = {key(s): s for s in (orig if isinstance(orig, list) else orig.get("sets", []))}
nmap = {key(s): s for s in (new if isinstance(new, list) else new.get("sets", []))}

out_census = {"engine": res, "sets": [], "violations": []}
for slug_s, ns in nmap.items():
    os_ = omap[slug_s]
    tb = (ns.get("source") or {}).get("tagBackfill")
    diffs = []
    oq = os_.get("questions") or []
    nq = ns.get("questions") or []
    for qi, (qo, qn) in enumerate(zip(oq, nq)):
        for pi, (po, pn) in enumerate(zip(qo.get("parts") or [], qn.get("parts") or [])):
            if po.get("specPointCodes") != pn.get("specPointCodes") or \
               po.get("specPointIds") != pn.get("specPointIds"):
                for c in pn.get("specPointCodes") or []:
                    if c not in spine:
                        out_census["violations"].append(
                            {"set": slug_s, "part": pn.get("id"), "codeOutsideSpine": c})
                diffs.append({"q": qi, "partId": pn.get("id"),
                              "was": po.get("specPointCodes"), "now": pn.get("specPointCodes"),
                              "idsWas": po.get("specPointIds"), "idsNow": pn.get("specPointIds"),
                              "sme": pn.get("smeSpecPointIds")})
    if diffs or tb:
        out_census["sets"].append({"set": slug_s, "subtopicCode": ns.get("subtopicCode"),
                                   "tagBackfill": tb, "partWrites": diffs})

print("\n== per-set census ==")
for s in out_census["sets"]:
    codes = collections.Counter()
    for w in s["partWrites"]:
        codes[tuple(w["now"] or [])] += 1
    print(f"  {s['set'][:60]:60s} sub={str(s['subtopicCode'])[:45]:45s} writes={len(s['partWrites'])} via={s['tagBackfill']['via'][:30]} home={s['tagBackfill']['home']}")
    for cs, n in codes.most_common(6):
        print(f"      {cs} x{n}")

# serialization law check: engine dump_like on indented file
raw_new = (tmp_content / SLUG / "questions.json").read_text()
print("\nquestions.json sandbox: head", raw_new[:40].replace(chr(10), ' '), "endsNL=", raw_new.endswith("\n"))
mnew = json.loads((tmp_content / SLUG / "manifest.json").read_text())
print("manifest tagBackfill block now:", json.dumps(mnew.get("tagBackfill"), ensure_ascii=False)[:400])

# untouched-fields check: every part identical except specPointCodes
diff_fields = collections.Counter()
for slug_s, ns in nmap.items():
    os_ = omap[slug_s]
    for qo, qn in zip(os_.get("questions") or [], ns.get("questions") or []):
        for po, pn in zip(qo.get("parts") or [], qn.get("parts") or []):
            for k in set(po) | set(pn):
                if po.get(k) != pn.get(k): diff_fields[k] += 1
print("changed part fields:", dict(diff_fields))
# set-level field diffs
set_fields = collections.Counter()
for slug_s, ns in nmap.items():
    os_ = omap[slug_s]
    for k in set(os_) | set(ns):
        if k == "questions": continue
        if os_.get(k) != ns.get(k): set_fields[k] += 1
print("changed set-level fields:", dict(set_fields))

Path("/tmp/rn12_engine_census.json").write_text(json.dumps(out_census, indent=1))
print("\nviolations:", out_census["violations"])
print("census -> /tmp/rn12_engine_census.json")
