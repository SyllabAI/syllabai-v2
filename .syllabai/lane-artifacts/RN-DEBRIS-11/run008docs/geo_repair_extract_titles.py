#!/usr/bin/env python3
"""RN-DEBRIS-11 geography repair — coordinate-exact key-idea title extraction (v2).

Source of record: the official Pearson Edexcel International GCSE Geography (4GE1)
specification PDF pinned upstream (sha1 fa6a75d1197e23a8c6f75a54d9d7e04e3a408718 ==
resources Official-Specifications/igcse-geography pin; sha256
a5ff19bd10182ce739b3f2eae6e94ab543ea3df31b418def965d184ad245aa0f), via
`pdftotext -bbox-layout` word coordinates.

Geometry of record (measured, not assumed):
  * a "Key ideas | Detailed content" table row places the key-idea NUMBER at x<100,
    its TITLE in the left column (85 <= x0 < 205), bullet markers a)-e) at ~x=211,
    bullet text at x>=235 — all as separate <line> elements sharing one baseline y.
  * doc-section headers ("1.1 Description", "1.4 Assessment of fieldwork skills –
    Section B", ...) share the same number geometry but have NO same-y bullet marker.
  * title wrap fragments appear as left-column-confined rows on later baselines.
"""
import re, json

BBOX = "/home/z/my-project/work/4ge1_bbox.html"
PAGE_RE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
LINE_RE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD_RE = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')

KEY_NUM_RE = re.compile(r"^\d\.\d$")
BULLET_RE = re.compile(r"^[a-e]\)$")

TITLE_X0, TITLE_X1 = 85.0, 208.0   # measured: title text x0=91 … xMax<205; bullets at 211

def rows_of_page(body):
    lines = []
    for m in LINE_RE.finditer(body):
        words = [(float(w.group(1)), float(w.group(3)), w.group(5)) for w in WORD_RE.finditer(m.group(5))]
        if words:
            lines.append((float(m.group(2)), words))
    lines.sort(key=lambda t: t[0])
    rows = []
    for y, ws in lines:
        if rows and abs(rows[-1][0] - y) <= 2.0:
            rows[-1][1].extend(ws)
        else:
            rows.append([y, list(ws)])
    for r in rows:
        r[1].sort(key=lambda w: w[0])
    return rows

def main():
    html = open(BBOX).read()
    key_ideas = {}     # num -> [title words]
    idea_order = []    # (num) in document order
    doc_sections = {}  # num -> title text
    for pm in PAGE_RE.finditer(html):
        rows = rows_of_page(pm.group(3))
        cur = None
        for y, ws in rows:
            texts = [w[2] for w in ws]
            joined = " ".join(texts)
            if "Pearson Edexcel International GCSE" in joined:
                continue
            # number word at x<100?
            num = None
            for w in ws:
                if w[0] < 100 and KEY_NUM_RE.match(w[2]):
                    num = w[2]
                    break
            bullets = [w for w in ws if BULLET_RE.match(w[2]) and 195 < w[0] < 235]
            title_words = [w[2] for w in ws if TITLE_X0 <= w[0] < TITLE_X1]
            if num and bullets:
                if cur:
                    key_ideas.setdefault(cur[0], cur[1])
                    idea_order.append(cur[0])
                cur = (num, list(title_words))
                continue
            if num and not bullets:
                # doc-section header: title = words right of the number on this row
                after = [w[2] for w in ws if w[0] >= 100]
                doc_sections.setdefault(num, " ".join(after))
                cur = None
                continue
            if cur is not None:
                first_x0 = ws[0][0]
                if first_x0 < 100 and not KEY_NUM_RE.match(texts[0]):
                    # topic header / table end / integrated skills / case-study rows: close block
                    if re.match(r"^Topic \d:$", joined.strip()) or joined.strip() in (
                            "Key ideas", "What students need to learn") or joined.startswith("Integrated skills"):
                        key_ideas.setdefault(cur[0], cur[1])
                        idea_order.append(cur[0])
                        cur = None
                        continue
                # left-column rows only: full-width paragraphs start at x=62, title wraps at >=91
                if title_words and first_x0 >= TITLE_X0:
                    cur[1].extend(title_words)
        if cur:
            key_ideas.setdefault(cur[0], cur[1])
            idea_order.append(cur[0])

    print("== key-idea titles ==")
    out = {}
    for num in sorted(key_ideas, key=lambda x: (int(x.split(".")[0]), int(x.split(".")[1]))):
        title = " ".join(key_ideas[num])
        out[num] = title
        print(f"  {num}  «{title}»")
    print("\n== doc section headers ==")
    for k in sorted(doc_sections):
        print(f"  §{k}: «{doc_sections[k]}»")
    json.dump({"key_ideas": out, "doc_sections": doc_sections},
              open("/tmp/geo_keyideas.json", "w"), indent=1, ensure_ascii=False)
    print("\nwrote /tmp/geo_keyideas.json")

if __name__ == "__main__":
    main()
