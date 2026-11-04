#!/usr/bin/env python3
"""RN-DEBRIS-11 run-003 — finish verification (decoded-walk, fail-closed).

Checks:
  1  sweep pre3/post3 unique failure-set diff == {STEP_B corrupted} exactly
  2  A: intended present at the 3 planned jpaths; corrupted absent corpus-wide
  3  B: repaired seg present x6; corrupted absent corpus-wide
  4  C2/C5/C6: joined forms present at planned sites; spaced forms absent
     (scoped: dollar for C2, backtick for C5/C6)
  5  run-002 of-record: R1 30 corrupted absent; R3b/R3c/R2a/R2c repaired
     segs present (decoded-walk; supersedes the raw-bytes false alarm)
  6  C3 documentation inventory: the 2 hybrid potential-divider segs remain
     x2 sites each (intentional keeps for the human-editor pass)
Writes /tmp/rn11/run3_verify.json; exit 1 on any failure.
"""
import json, re, sys
from pathlib import Path
from collections import Counter

REPO = Path("/home/z/my-project/work/sv2-rn11")
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11"
sys.path.insert(0, str(Path(__file__).resolve().parent))

import run3_convert as RC  # frozen tables

res = {"checks": {}, "fail": []}
def check(name, ok, detail=""):
    res["checks"][name] = {"ok": bool(ok), "detail": detail}
    if not ok:
        res["fail"].append(name)

# ---- 1: sweep diff ----
pre = json.load(open("/tmp/rn11/sweep_pre3.json"))
post = json.load(open("/tmp/rn11/sweep_post3.json"))
pre_u = {f["seg"] for f in pre["failures"]}
post_u = {f["seg"] for f in post["failures"]}
healed = pre_u - post_u
new = post_u - pre_u
check("sweep_heal_exactly_B", healed == {RC.STEP_B_CORRUPTED} and not new,
      f"healed={len(healed)} new={len(new)}")
check("sweep_counts", (pre["failUnique"] - post["failUnique"] == 1
                       and pre["failOcc"] - post["failOcc"] == 6),
      f"{pre['failUnique']}u/{pre['failOcc']}occ -> {post['failUnique']}u/{post['failOcc']}occ")

# ---- corpus walk ----
def walk(node, jpath):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{jpath}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{jpath}[{i}]")
    elif isinstance(node, str):
        yield jpath, node

MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")
blob_by_file = {}
all_strings = []
for p in sorted(REPO.glob("apps/hub/**/*.json")):
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        continue
    strs = [s for _jp, s in walk(data, "$")]
    blob_by_file[str(p.relative_to(REPO))] = "\n".join(strs)
    all_strings.extend(strs)
corpus_blob = "\n".join(all_strings)

# ---- 2: A ----
a_hits = 0
for rel in ("apps/hub/content/ial-maths-20-pure-1/curriculum.json",
            "apps/hub/content/ial-maths-20-pure-1/ugm-resources.json",
            "apps/hub/spines/ial-maths-20-pure-1.json"):
    if RC.STEP_A_INTENDED in blob_by_file[rel]:
        a_hits += 1
check("A_intended_present_x3", a_hits == 3, f"found {a_hits}/3")
check("A_corrupted_absent", RC.STEP_A_CORRUPTED not in corpus_blob)

# ---- 3: B ----
b_present = sum(blob.count(RC.STEP_B_REPAIRED) for blob in blob_by_file.values())
check("B_repaired_present_x6", b_present == 6, f"found {b_present}/6")
check("B_corrupted_absent", RC.STEP_B_CORRUPTED not in corpus_blob)

# ---- 4: C scoped ----
def scoped_count(blob, needle, scope):
    n = 0
    rx = re.compile(r"`[^`]+`") if scope == "backtick" else re.compile(r"\$[^$]+\$")
    for sm in rx.finditer(blob):
        n += sm.group(0).count(needle)
    return n

c2_checks = [
    ("I_{bm}", "I_{b m}", "dollar", "apps/hub/content/cie-a-level-physics-25/questions.json"),
    ("\\Delta E_{el}", "\\Delta E_{e l}", "dollar", "apps/hub/content/ial-physics-19/questions.json"),
]
for joined, spaced, scope, rel in c2_checks:
    blob = blob_by_file[rel]
    check(f"C2_joined[{joined[:14]}]", scoped_count(blob, joined, scope) >= 1)
    check(f"C2_spaced_gone[{spaced[:14]}]", scoped_count(blob, spaced, scope) == 0)
c5blob = blob_by_file["apps/hub/content/ial-maths-20-statistics-1/flashcards.json"]
check("C5_joined[S_xx]", scoped_count(c5blob, "S_{xx}", "backtick") >= 1)
check("C5_spaced_gone", scoped_count(c5blob, "S_{x x}", "backtick") == 0)
vin_total = vout_total = 0
for rel in ("apps/hub/content/cie-a-level-physics-25/questions.json",
            "apps/hub/content/cie-as-physics-25/questions.json"):
    blob = blob_by_file[rel]
    tag = rel.split("/")[3]
    vin = scoped_count(blob, "V_{in}", "backtick")
    vout = scoped_count(blob, "V_{out}", "backtick")
    vin_total += vin; vout_total += vout
    ok_joined = vin >= 1 and vout >= 1
    ok_spaced = all(scoped_count(blob, s, "backtick") == 0
                    for s in ("V_{i n}", "V_{i n }", "V_{o u t}"))
    check(f"C6[{tag}]_joined_and_spaced_gone", ok_joined and ok_spaced,
          f"vin={vin} vout={vout}")
check("C6_corpus_totals", vin_total == 6 and vout_total == 6,
      f"vin={vin_total} vout={vout_total}")
check("C6_spaced_absent_corpuswide_backtick",
      all(scoped_count(b, s, "backtick") == 0
          for b in blob_by_file.values() for s in ("V_{i n}", "V_{i n }", "V_{o u t}", "S_{x x}")))

# ---- 5: run-002 of-record integrity (decoded walk) ----
R3 = json.load(open(ART / "r3_pairs.json"))
R1 = json.load(open(ART / "r1_pairs.json"))
missing_repaired = []
for p in R3["R3b"] + R3["R3c"]:
    if "lambda_{m a x}" in p["seg"]:
        continue  # lambda seg owned by R2a (label+structure), of-record
    if p["repaired"] not in corpus_blob:
        missing_repaired.append(p["repaired"][:60])
R2A = ["$V_{out} = ( \\frac{R_{1}}{R_{1} + R_{2}} ) V_{in}$",
       "$V_{out} = ( \\frac{R_{2} + R_{3} }{R_{1} + R_{2} + R_{3} } ) V_{in}$",
       "$R_{2} = ( \\frac{R_{1} \\times V_{in} }{V_{out} } ) - R_{1}$",
       "$\\lambda_{max} = \\frac{( 6.63 \\times 10^{- 34} ) ( 3.0 \\times 10^{8} )}{( 80 \\times 10^{3} ) ( 1.6 \\times 10^{-19} )}$"]
for seg in R2A:
    if seg not in corpus_blob:
        missing_repaired.append(seg[:60])
r1_corrupt_seen = sum(1 for p in R1 if not p.get("refused") and p["corrupted"] in corpus_blob)
check("run2_repaired_all_present", not missing_repaired,
      f"missing={missing_repaired[:3]}")
check("run2_r1_corrupted_absent", r1_corrupt_seen == 0, f"seen={r1_corrupt_seen}")

# ---- 6: C3 keeps inventory (must REMAIN) ----
hybrid1 = "$V_{in} = \\frac{V_{out} }{( \\frac{R_{1}{R_{1} + R_{2} } )} = ( \\frac{R_{1} + R_{2} }{R_{1} } ) V_{o} u t}$"
hybrid2 = "$V_{in} = V_{out} \\div ( \\frac{R_{1}{R_{1} + R_{2} } ) = V_{o} u t} \\times ( \\frac{R_{1} + R_{2} }{R_{1} } )$"
h1 = sum(blob.count(hybrid1) for blob in blob_by_file.values())
h2 = sum(blob.count(hybrid2) for blob in blob_by_file.values())
check("C3_hybrid_keeps_intact", h1 == 2 and h2 == 2, f"hybrid1={h1} hybrid2={h2}")

json.dump(res, open("/tmp/rn11/run3_verify.json", "w"), ensure_ascii=False, indent=1)
n_ok = sum(1 for v in res["checks"].values() if v["ok"])
print(f"VERIFY: {n_ok}/{len(res['checks'])} checks pass")
for name, v in res["checks"].items():
    if not v["ok"]:
        print("  FAIL:", name, v["detail"])
print("wrote /tmp/rn11/run3_verify.json")
sys.exit(1 if res["fail"] else 0)
