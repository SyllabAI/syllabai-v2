#!/usr/bin/env python3
"""run-006 fleet map sample validation: render QP pages for sampled verdict rows,
eyes-on confirmation recorded into fleet-sample.json."""
import json, re, os, fitz

PDFDIR = os.path.expanduser("~/my-project/scripts/run006/pdf")
SRC = os.path.expanduser("~/my-project/scripts/run005/pdf")
REN = os.path.expanduser("~/my-project/scripts/run006/render")
BUNDLE = "/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json"
os.makedirs(REN, exist_ok=True)

d = json.load(open(BUNDLE))
sets = d if isinstance(d, list) else d.get("sets", d)
idx = {}
for s in sets:
    for q in s["questions"]:
        for p in q["parts"]:
            idx[(s["slug"], q["order"], p["order"])] = p

def set_paper(slug):
    m = re.match(r"(\d{4}-\d{2})-4mb1-(\d{2}r?)--exam-questions", slug)
    return m.group(1), m.group(2).upper()

def qp_path(slug):
    sess, pap = set_paper(slug)
    for base in (PDFDIR, SRC):
        cand = os.path.join(base, f"{sess}-4MB1-{pap}-qp.pdf")
        if os.path.isfile(cand):
            return cand
    return None

v = json.load(open("/home/z/my-project/scripts/run006/work/fleet-verdicts.json"))
verds = v["verdicts"]

def pick(verdict, cls=None, n=1, avoid=()):
    out = []
    for x in verds:
        if x["verdict"] != verdict: continue
        if cls and x.get("class") != cls: continue
        key = (x["row"][0], x["row"][1], x["row"][2])
        if key in avoid: continue
        out.append(x)
    return out[:n]

SAMPLES = []
SAMPLES += pick("DEBRIS", n=3)
SAMPLES += pick("LEGIT", cls="axes-embedded", n=2)
SAMPLES += pick("LEGIT", cls="diagram-disclaimer", n=1)
SAMPLES += pick("LEGIT", cls="grid-table-cells", n=1)
SAMPLES += pick("LEGIT", cls="venn-labels", n=1)

results = []
for x in SAMPLES:
    slug, q1, po = x["row"][0], x["row"][1], x["row"][2]
    p = idx.get((slug, q1 - 1, po))
    if p is None: continue
    pm = p.get("problemMd") or ""
    needle = re.sub(r"\s+", " ", pm)[:60].strip()
    qp = qp_path(slug)
    if not qp:
        results.append({"row": x["row"], "verdict": x["verdict"], "class": x.get("class"), "qp": "NO-PDF"})
        continue
    doc = fitz.open(qp)
    page = None
    for i in range(doc.page_count):
        t = re.sub(r"\s+", " ", doc[i].get_text())
        # match on a distinctive fragment of the stem (skip tokens before first alpha run)
        frag = re.search(r"[A-Za-z][A-Za-z ,:'\-]{25,}", needle)
        if frag and frag.group(0)[:35] in t:
            page = i + 1
            break
    if page:
        sess, pap = set_paper(slug)
        name = f"fleet-{sess}-{pap}-Q{q1}p{po}-{x['verdict'].lower()}{'-'+x['class'] if x.get('class') else ''}.png"
        pix = doc[page - 1].get_pixmap(matrix=fitz.Matrix(2.4, 2.4), colorspace=fitz.csGRAY)
        pix.save(os.path.join(REN, name))
        results.append({"row": x["row"], "verdict": x["verdict"], "class": x.get("class"),
                        "qp": os.path.basename(qp), "page": page, "render": name,
                        "pmHead": re.sub(r"\s+", " ", pm)[:220]})
        print("rendered", name, "page", page)
    else:
        results.append({"row": x["row"], "verdict": x["verdict"], "class": x.get("class"),
                        "qp": os.path.basename(qp), "page": None, "pmHead": needle})
        print("PAGE-NOT-FOUND", slug, "Q%d" % q1, "p%d" % po)
    doc.close()

json.dump(results, open("/home/z/my-project/scripts/run006/work/fleet-sample.json", "w"),
          indent=1, ensure_ascii=False)
print("\nsampled:", len(results))
