#!/usr/bin/env python3
"""extract_edexcel_titles.py — evidence pass for the run-014 Edexcel batch
(25 rows / 5 docs). Wreck-anchored title-column capture per doc template.
Prints candidates for review; zero content writes."""
import json, re

TXT = "/home/z/my-project/work/run014/txt"

def norm(s):
    s = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", " ", s).replace("\t", " ")
    return re.sub(r"\s+", " ", s).strip()

def load(tag):
    raw = open(f"{TXT}/{tag}.txt").read()
    raw = raw.replace("\x0c", "\n").replace("\x0b", "\n").replace("\x07", " ")
    return raw.split("\n")

def left(line):
    return re.split(r"\s{3,}", line.strip(), maxsplit=1)[0]

def capture_from(lines, i, num_re):
    """title-column capture starting at line i; strips the leading number token,
    then takes pre-3+-gap text on the anchor + continuation lines."""
    stripped = lines[i].strip()
    m0 = num_re.match(stripped)
    rest = stripped[m0.end():] if m0 else stripped
    first = norm(re.split(r"\s{3,}", rest.strip(), maxsplit=1)[0])
    parts = [first] if first else []
    anchor_indent = len(lines[i]) - len(lines[i].lstrip())
    j = i + 1
    while j < len(lines):
        l = lines[j]
        if not l.strip():
            break
        ind = len(l) - len(l.lstrip())
        if ind >= 38:
            j += 1
            continue                     # right-column-only line: skip, keep scanning
        ln = norm(left(l))
        if not ln:
            break
        if num_re.match(ln):
            break
        if re.match(r"^(Understand|Know|Recall|Be able|Use the|Calculate|Solve|Construct|Apply|Translate|Recognise|Present|Interpret|Compare|Describe|Discuss|Explain|Evaluate|Derive|Sketch|Plot|Find|Carry|Generate|Identify|Determine|Show)\b", ln):
            break
        if re.match(r"^(What learners|Notes|Skills|Learning|Back to|www\.)", ln):
            break
        parts.append(ln)
        j += 1
    return " ".join(parts), j

results = {}

# ---- 4IT1: numbered sections 2.2 2.3 2.4 2.5 3.2 3.3 3.4 3.5 3.9 ----
lines = load("4it1")
num_re = re.compile(r"^\d+\.\d+(?=\s)")
sec_re = re.compile(r"^(\d+\.\d+)\s")
it_codes = ["2.2", "2.3", "2.4", "2.5", "3.2", "3.3", "3.4", "3.5", "3.9"]
res4 = {}
for code in it_codes:
    cands = []
    i = 0
    while i < len(lines):
        m = sec_re.match(lines[i].strip())
        if m and m.group(1) == code:
            t, j = capture_from(lines, i, num_re)
            cands.append((i + 1, t))
            i = max(j, i + 1)
        else:
            i += 1
    res4[code] = cands
results["igcse-ict-17"] = res4

# ---- 4HI1: wreck-anchored (sub-topic number tokens vary) ----
lines = load("4hi1")
anchors = {
    "Venice and Rome and": None,
    "Setting up the United": None,
    "The creation of Israel": None,
}
res_h = {}
for a in anchors:
    num_re_h = re.compile(r"^([A-Z]?\d+(?:\.\d+)?)?(?=\s)")
    cands = []
    for i, l in enumerate(lines):
        if a.split(" 1948")[0] in l and re.match(r"^\s*[A-Z]?\d+\s", l):
            t, j = capture_from(lines, i, re.compile(r"^[A-Z]?\d+(?=\s)"))
            cands.append((i + 1, t))
    res_h[a] = cands
results["igcse-history-17"] = res_h

# ---- WCH T8: direct ----
lines = load("wch")
cands = [(i + 1, norm(l.split(":", 1)[1])) for i, l in enumerate(lines)
         if l.strip().startswith("Topic 8: Redox")]
results["ial-chemistry-17"] = {"T8": cands}

# ---- WBI (i) ----
lines = load("wbi")
cands = []
for i, l in enumerate(lines):
    if "light microscope to make observations" in l:
        t, j = capture_from(lines, i, re.compile(r"^\([ivx]+\)(?=\s)"))
        cands.append((i + 1, t))
results["ial-biology-18"] = {"T3:SUBi": cands}

# ---- 4XMA1 6.1: vertical stack ----
lines = load("4xma1")
cands = []
for i, l in enumerate(lines):
    if l.strip() == "Graphical":
        stack = [l.strip()]
        j = i + 1
        while j < len(lines) and lines[j].strip() and len(lines[j].strip()) < 30 \
                and len(lines[j]) - len(lines[j].lstrip()) < 25 \
                and not re.match(r"^(What|Notes|\d)", lines[j].strip()):
            stack.append(lines[j].strip())
            j += 1
        cands.append((i + 1, " ".join(stack)))
results["igcse-maths-a-modular-24-foundation-unit-2"] = {"T6:SUB6.1": cands}

out = "/home/z/my-project/work/run014/edexcel_extract_candidates.json"
json.dump(results, open(out, "w"), ensure_ascii=False, indent=1)
print(f"-> {out}\n")
for slug, d in results.items():
    print(f"== {slug} ==")
    for code, cands in d.items():
        print(f"  [{code}]")
        for ln, t in cands:
            print(f"      L{ln}: {t!r}")
