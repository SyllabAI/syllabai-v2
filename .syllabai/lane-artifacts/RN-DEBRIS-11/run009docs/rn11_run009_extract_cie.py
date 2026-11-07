#!/usr/bin/env python3
"""RN-DEBRIS-11 run-009 — official-doc extraction + cross-validation (CIE families).

Families:
  F1 0500 2024-2026 (cie-igcse-english-language-20)  subject-content blocks
  F2 0500 2027-2029 (cie-igcse-english-language-25)  subject-content blocks
  F3 0490 2025-2027 (cie-igcse-religious-studies-23) C/I/J topics + subsections
  F4 0264 2027-2029 (cie-igcse-business-25)          topics + subsections + points
  F5 9709 2023-2025 (maths components)               topics + subsections

Sources of record: the pinned PDFs in work/run009 (byte-verified against the
upstream parsed.json source.pdf_sha1 pins) via pdftotext -layout text geometry.
Cross-check: the upstream independently-parsed <pdf>.parsed.json topic/subsection
titles (prefix-consistency law, the run-008 verifier's G4-upstream shape).
"""
import json, os, re, hashlib, sys

RUN = "/home/z/my-project/work/run009"
HUB = "/home/z/my-project/work/syllabai-v2/apps/hub/content"

PDFS = {
    "0500-2024": ("0500-2024-2026-syllabus.pdf", "parsed/cie-igcse-english-language-2024-2026/635230-2024-2026-syllabus.parsed.json"),
    "0500-2027": ("0500-2027-2029-syllabus.pdf", "parsed/cie-igcse-english-language-2027-2029/718783-2027-2029-syllabus.parsed.json"),
    "0490": ("0490-2025-2027-syllabus.pdf", "parsed/cie-igcse-religious-studies-2025-2027/663158-2025-2027-syllabus.parsed.json"),
    "0264": ("0264-2027-2029-syllabus.pdf", "parsed/cie-igcse-business-2027-2029/718123-2027-2029-syllabus.parsed.json"),
    "9709": ("9709-2023-2025-syllabus.pdf", "parsed/cie-a-level-maths-2023-2025/597421-2023-2025-syllabus.parsed.json"),
}

def sha1(p):
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 16), b""):
            h.update(b)
    return h.hexdigest()

TXT = {
    "0500-2024-2026-syllabus.pdf": "0500-2024.txt",
    "0500-2027-2029-syllabus.pdf": "0500b.txt",
    "0490-2025-2027-syllabus.pdf": "0490.txt",
    "0264-2027-2029-syllabus.pdf": "0264.txt",
    "9709-2023-2025-syllabus.pdf": "9709.txt",
}

def lines_of(pdf):
    txt = open(os.path.join(RUN, TXT[pdf])).read()
    return txt.splitlines()

CONT_RE = re.compile(r"\s*\(*continued\)*\s*$", re.I)
CTRL_RE = re.compile(r"[\x00-\x1f]")

def norm_title(s):
    return CTRL_RE.sub("", CONT_RE.sub("", s)).strip()

# ---------------- F3: 0490 ----------------
def extract_0490():
    lines = lines_of("0490-2025-2027-syllabus.pdf")
    # in-body subject content start = the line that is exactly the heading (no dotted leaders)
    start = end = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if start is None and re.match(r"^3 Subject content$", s):
            start = i
        elif start is not None and re.match(r"^4 Details of the assessment$", s):
            end = i
            break
    assert start and end, (start, end)
    religion = None
    topics = {}        # (religion, n) -> title
    subsections = {}   # (religion, t, s) -> title
    topic_re = re.compile(r"^ *(C|I|J)([1-6])\s+(\S.*\S|\S) *$")
    sub_re = re.compile(r"^ *(C|I|J)([1-6])\.([0-9]+)\s+(\S.*?) *$")
    rel_re = re.compile(r"^(Christianity|Islam|Judaism) *$")
    for ln in lines[start:end]:
        s = ln.rstrip()
        m = rel_re.match(s.strip())
        if m:
            religion = m.group(1)
            continue
        m = topic_re.match(s)
        if m and religion:
            topics[(religion, m.group(2))] = norm_title(m.group(3))
            continue
        m = sub_re.match(s)
        if m and religion:
            subsections[(religion, m.group(2), m.group(3))] = norm_title(m.group(4))
    ri = {"Christianity": "C", "Islam": "I", "Judaism": "J"}
    return {"topics": {f"{ri[r]}{n}": t for (r, n), t in topics.items()},
            "subsections": {f"{ri[r]}{t}.{s}": t_ for (r, t, s), t_ in subsections.items()}}

# ---------------- F4: 0264 ----------------
def extract_0264():
    lines = lines_of("0264-2027-2029-syllabus.pdf")
    start = end = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if start is None and re.match(r"^3 Subject content$", s):
            start = i
        elif start is not None and re.match(r"^4 Details of the assessment$", s):
            end = i
            break
    assert start and end, (start, end)
    topics = {}       # n -> title
    subsections = {}  # (t, s) -> title
    points = {}       # t -> list of point numbers
    topic_re = re.compile(r"^ {6,}([1-6]) {2,}([A-Z]\w.*?) *$")
    sub_re = re.compile(r"^ {6,}([1-6])\.([1-9]) {2,}(\S.*?) *$")
    pt_re = re.compile(r"^ {6,}([1-6])\.([1-9])\.([0-9]+)\s+(\S.*?) *$")
    for ln in lines[start:end]:
        s = ln.rstrip()
        m = topic_re.match(s)
        if m and m.group(1) not in topics and not re.match(r"^\d+\.\d", m.group(2)):
            topics[m.group(1)] = norm_title(m.group(2))
            continue
        m = sub_re.match(s)
        if m:
            subsections[(m.group(1), m.group(2))] = norm_title(m.group(3))
            continue
        m = pt_re.match(s)
        if m:
            points.setdefault(m.group(1), []).append(
                f"{m.group(1)}.{m.group(2)}.{m.group(3)}")
    return {"topics": topics, "subsections": {f"{t}.{s}": x for (t, s), x in subsections.items()},
            "pointNumbersByTopic": {k: v for k, v in sorted(points.items())}}

# ---------------- F5: 9709 ----------------
def extract_9709():
    lines = lines_of("9709-2023-2025-syllabus.pdf")
    toc_full = {}     # n -> "Pure Mathematics 1 (for Paper 1)"
    topics = {}       # n -> content-page short name
    subsections = {}  # (t, s) -> title
    toc_re = re.compile(r"^ *([1-6]) +(Pure Mathematics [123]|Mechanics|Probability & Statistics [12]) \(for Paper ([1-6])\) ")
    body_re = re.compile(r"^ *([1-6]) +(Pure Mathematics [123]|Mechanics|Probability & Statistics [12]) +Paper [1-6] ")
    sub_re = re.compile(r"^ *([1-6])\.([0-9]+) +(\S.*?) *$")
    dots_re = re.compile(r" *\.{3,} *\d+$")
    for ln in lines:
        s = ln.rstrip()
        m = toc_re.match(s)
        if m:
            toc_full[m.group(1)] = f"{m.group(2)} (for Paper {m.group(3)})"
            topics[m.group(1)] = m.group(2)
            continue
        m = body_re.match(s)
        if m:
            topics[m.group(1)] = m.group(2)
            continue
        m = sub_re.match(s)
        if m:
            title = dots_re.sub("", norm_title(m.group(3)))
            key = (m.group(1), m.group(2))
            if key not in subsections:
                subsections[key] = title
    return {"tocFullNames": toc_full, "topicShortNames": topics,
            "subsections": {f"{t}.{s}": x for (t, s), x in subsections.items()}}

# ---------------- F1/F2: 0500 blocks ----------------
def extract_0500(pdf):
    lines = lines_of(pdf)
    start = end = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if start is None and re.match(r"^3 Subject content$", s):
            start = i
        elif start is not None and re.match(r"^4 Details of the assessment$", s):
            end = i
            break
    assert start and end, (pdf, start, end)
    blocks = {}
    order = []
    cur = None
    bullet_re = re.compile(r"^ *• *(\S.*?) *$")
    for ln in lines[start:end]:
        s = ln.strip()
        if s in ("Reading", "Writing", "Speaking and Listening"):
            cur = s
            if s not in blocks:
                blocks[s] = []
                order.append(s)
            continue
        m = bullet_re.match(ln.rstrip())
        if m and cur:
            blocks[cur].append(m.group(1))
    return {"contentBlocks": blocks, "blockOrder": order}

# ---------------- cross-checks ----------------
def prefix_stats(mine, upstream):
    consistent = divergent = 0
    divs = []
    for k, up in upstream.items():
        my = mine.get(k)
        if my is None:
            continue
        if my == up or my.startswith(up) or up.startswith(my):
            consistent += 1
        else:
            divergent += 1
            divs.append({"key": k, "upstream": up, "extraction": my})
    return {"consistent": consistent, "divergent": divergent, "divergences": divs}

def main():
    ev = {}
    # pin verification
    pins = {}
    for key, (pdf, parsed_rel) in PDFS.items():
        got = sha1(os.path.join(RUN, pdf))
        up = json.load(open(os.path.join(RUN, parsed_rel)))["source"]
        pins[key] = {"pdf": pdf, "extractionSha1": got,
                     "upstreamParsedSha1": up["pdf_sha1"], "match": got == up["pdf_sha1"]}
        print(f"PIN {key}: {got} vs upstream {up['pdf_sha1']} -> {'MATCH' if got == up['pdf_sha1'] else 'MISMATCH'}")
    ev["pins"] = pins

    # F3 0490
    e3 = extract_0490()
    up3 = json.load(open(os.path.join(RUN, PDFS["0490"][1])))
    up_topics = {}
    for t in up3["topics"]:
        if t.get("number") and not t["title"].endswith("."):
            up_topics[t["number"]] = t["title"]
    up_subs = {i: s.get("title") for i, s in enumerate(up3["subsections"])}
    ev["F3_0490"] = {"extraction": e3,
                     "topicTitles": sorted(set(e3["topics"].values())),
                     "subCount": len(e3["subsections"]),
                     "upstreamSubCount": len(up3["subsections"]),
                     "upstreamSubTitlesDirty": sum(1 for s in up3["subsections"] if "\x07" in (s.get("title") or ""))}
    print(f"\nF3 0490: topics extracted={len(e3['topics'])} subsections={len(e3['subsections'])} (upstream subsections={len(up3['subsections'])}, {ev['F3_0490']['upstreamSubTitlesDirty']} dirty)")
    print("   official topic titles (religion-agnostic):", sorted(set(e3["topics"].values())))

    # F4 0264
    e4 = extract_0264()
    up4 = json.load(open(os.path.join(RUN, PDFS["0264"][1])))
    up4_topics = {t["number"]: t["title"] for t in up4["topics"]}
    ev["F4_0264"] = {"extraction": e4, "upstreamTopicNumbers": sorted(up4_topics)}
    print(f"\nF4 0264: topics extracted={e4['topics']}")
    print(f"   subsections extracted={len(e4['subsections'])}: ", dict(sorted(e4['subsections'].items())[:6]), "...")
    print(f"   topic-1 points extracted={len(e4['pointNumbersByTopic'].get('1', []))} (hub T1 spec points=0)")
    print(f"   upstream parsed topic numbers={sorted(up4_topics)} (T1 absent from upstream parse)")

    # F5 9709
    e5 = extract_9709()
    up5 = json.load(open(os.path.join(RUN, PDFS["9709"][1])))
    ev["F5_9709"] = {"extraction": e5, "upstreamTopicTitles": {t["number"]: t["title"] for t in up5["topics"]}}
    print(f"\nF5 9709: short names={e5['topicShortNames']}")
    print(f"   subsections extracted={len(e5['subsections'])}; T4={ {k:v for k,v in e5['subsections'].items() if k.startswith('4.')} }")

    # F1/F2 0500
    for key, fam in (("0500-2024", "F1_0500_2024"), ("0500-2027", "F2_0500_2027")):
        eb = extract_0500(PDFS[key][0])
        ev[fam] = {"blocks": {k: len(v) for k, v in eb["contentBlocks"].items()},
                   "blockOrder": eb["blockOrder"], "bullets": eb["contentBlocks"]}
        print(f"\n{fam}: blocks={ {k: len(v) for k, v in eb['contentBlocks'].items()} } order={eb['blockOrder']}")

    json.dump(ev, open("/tmp/run009/evidence_cie.json", "w"), indent=1, ensure_ascii=False)
    print("\nwrote /tmp/run009/evidence_cie.json")

if __name__ == "__main__":
    main()
