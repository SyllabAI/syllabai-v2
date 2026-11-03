#!/usr/bin/env python3
"""MB4-MS-FRESHPARSE run-002 — marks-partition attribution planner v2.

LAW OF RECORD (run-001 receipt, deep-lane extended):
- hub part-marks sequence = structure of record
- the question's MAIN PDF row-mark sequence partitions into consecutive groups
  whose sums equal the hub per-part marks (DP); within a group a row may MERGE
  (contribute 0) when its in-group predecessor's code-mark > 1 (half-mark
  sub-row law, e.g. B2ft + B1-guidance = one 2-mark block)
- attach iff EXACTLY ONE partition survives; markv alignment only disambiguates
  (never kills a unique partition — spurious-markv class)
- alt rows (Alternative / Method>=2 sections) attach as Notes to their part
"""
import json, re, sys, os
sys.path.insert(0, "/home/z/my-project/scripts")
from mb4_deep_extract import extract_pdf
from mb4_transform import parse_ms, fmt_block, q_banner

HUB = "/home/z/my-project/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json"
PP = "/home/z/my-project/pp-4mb1"
ROWS = "/home/z/my-project/scripts/mb4_rows"

TARGETS = json.load(open("/home/z/my-project/scripts/mb4_targets.json"))

def code_mark(code):
    m = re.match(r"^(?:B|M|A)([123])", code)
    return int(m.group(1)) if m else None

def count_partitions(marks_seq, hub_marks):
    sols = []
    n = len(marks_seq)

    def walk2(i, gi, acc):
        if gi == len(hub_marks):
            if i == n:
                sols.append([list(g) for g in acc])
            return
        need = hub_marks[gi]
        results = []

        def extend(rows, s, last_mark):
            j = rows[-1] + 1
            if s == need:
                results.append((rows, j))
            if j >= n:
                return
            w = marks_seq[j]
            if s + w <= need:
                extend(rows + [j], s + w, w)
            if (last_mark or 0) > 1 and s <= need:
                extend(rows + [j], s, last_mark)

        if i < n:
            extend([i], marks_seq[i], marks_seq[i])
        for rows, j in results:
            walk2(j, gi + 1, acc + [rows])

    walk2(0, 0, [])
    return sols

hub = json.load(open(HUB, encoding="utf8"))
topics = {t.get("topicSlug") or t.get("slug"): t for t in hub}

plan = []
report = []
for slug in sorted(TARGETS):
    t = topics[slug]
    m = re.match(r"(\d{4}-\d{2})-4mb1-(\d{2})(r?)$", slug)
    sess, paper, r = m.groups()
    pdfdir = os.path.join(PP, sess, f"4MB1-{paper.upper()}{r.upper()}")
    rowsfile = os.path.join(ROWS, f"{sess}-4MB1-{paper.upper()}{r.upper()}.json")
    if not os.path.exists(rowsfile):
        d = extract_pdf(os.path.join(pdfdir, "ms.pdf"))
        os.makedirs(ROWS, exist_ok=True)
        json.dump(d, open(rowsfile, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    d = json.load(open(rowsfile, encoding="utf8"))
    qs = d["questions"]
    hqs = t["questions"]
    rep = [f"===== {slug}  hub-questions={len(hqs)} pdf-questions={len(qs)} "
           f"anomalies={len(d['anomalies'])}"]
    if len(qs) != len(hqs):
        rep.append(f"  !! question-count mismatch ({len(hqs)} vs {len(qs)})")
    for hq, aq in zip(hqs, qs):
        hq_idx = hqs.index(hq)
        tgt = [(pi, p) for pi, p in enumerate(hq["parts"])
               if not (p.get("solutionMd") or "").strip()
               and not (p.get("choices") and any((c.get("label") or c.get("text")) for c in p["choices"]))]
        if not tgt:
            continue
        hub_marks = [p.get("marks") for p in hq["parts"]]
        main_rows = [r for r in aq["rows"] if not r.get("alt")]
        marks_seq = [code_mark(r["code"]) if r.get("code") else r.get("markv")
                     for r in main_rows]
        rep.append(f"  Q{aq['printed']} printed-total={aq['total']} hub-marks={hub_marks} "
                   f"main-rows={len(main_rows)} marks_seq={marks_seq}")
        if None in marks_seq or None in hub_marks or not marks_seq:
            for pi, p in tgt:
                plan.append({"topic": slug, "q": hq_idx, "p": pi,
                             "need": p.get("marks"), "verdict": "NO-badseq",
                             "evidence": None})
                rep.append(f"    -> p{pi} need={p.get('marks')}: NO-badseq")
            continue
        sols = count_partitions(marks_seq, hub_marks)

        def mv_ok(sol):
            for g, need in zip(sol, hub_marks):
                first = main_rows[g[0]]
                if first.get("markv") is not None and first["markv"] != need:
                    return False
            return True
        filtered = [s for s in sols if mv_ok(s)]
        if filtered:
            use, tag = filtered, f"all={len(sols)}/mv-filtered={len(filtered)}"
        elif len(sols) == 1:
            use, tag = sols, f"all={len(sols)}/mv-conflict-ignored"
        else:
            use, tag = [], f"all={len(sols)}/mv-filtered=0"
        for pi, p in tgt:
            if len(use) == 1:
                sol = use[0]
                alts_by_after = [r for r in aq["rows"] if r.get("alt")]
                verdict = "ATTACH-UNIQUE"
                ev = {"groups": [[main_rows[i] for i in g] for g in sol],
                      "alts": alts_by_after, "tag": tag,
                      "printed_total": aq["total"], "path": "PDF"}
            else:
                verdict = f"NO-partition({tag})"
                ev = None
            plan.append({"topic": slug, "q": hq_idx, "p": pi,
                         "need": p.get("marks"), "verdict": verdict, "evidence": ev})
            rep.append(f"    -> p{pi} need={p.get('marks')}: {verdict}")
        # PATH M fallback: ms.md blocks of record + same partition law
        still = [pi for pi, x in enumerate(plan[-len(tgt):])
                 if x["verdict"].startswith("NO")]
        if still:
            mdfile = os.path.join(pdfdir, "parsed", "ms.md")
            try:
                mqs = parse_ms(mdfile)
                printed = hq_idx + 1
                aqm = next((q for q in mqs if q["n"] == printed), None)
            except FileNotFoundError:
                aqm = None
            if aqm is not None:
                blocks = [b for s in aqm["sections"] for b in s["blocks"]]
                bmarks = []
                for b in blocks:
                    mm2 = b["label"].split()[0]
                    bmarks.append(int(mm2) if mm2.isdigit() else 0)
                psum = sum(bmarks)
                msols = count_partitions(bmarks, hub_marks) \
                    if None not in hub_marks and bmarks else []
                tag_m = f"blocks={bmarks} psum={psum} printed={aqm['marks']} sols={len(msols)}"
                rep.append(f"    [PathM] {tag_m}")
                for off, pi in enumerate(still):
                    if len(msols) == 1:
                        sol = msols[0]
                        verdict = "ATTACH-MSMD-UNIQUE"
                        ev = {"path": "MSMD",
                              "groups": [[blocks[i] for i in g] for g in sol],
                              "printed": aqm["marks"], "psum": psum,
                              "banner": q_banner(aqm["marks"], psum)}
                    else:
                        verdict = f"NO-msmd({tag_m})"
                        ev = None
                    plan[-len(tgt) + off].update({"verdict": verdict, "evidence": ev})
                    rep.append(f"    -> p{pi} [PathM] need={tgt[off][1].get('marks')}: {verdict}")
    report.append("\n".join(rep))

open("/home/z/my-project/scripts/mb4_deep_plan.txt", "w", encoding="utf8").write("\n\n".join(report))
json.dump(plan, open("/home/z/my-project/scripts/mb4_deep_plan.json", "w", encoding="utf8"),
          ensure_ascii=False, indent=1)
n_att = sum(1 for x in plan if x["verdict"] == "ATTACH-UNIQUE")
print(f"plan: {len(plan)} target parts, ATTACH-UNIQUE={n_att}")
