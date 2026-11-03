#!/usr/bin/env python3
"""MB4-MS-FRESHPARSE run-002 — fail-closed apply (v2).

Attach paths (all partition-proven): ATTACH-UNIQUE (PDF rows),
ATTACH-MSMD-UNIQUE (ms.md blocks of record), ATTACH-EYESON (hand attribution).

Serialization chain of record: glyphs() (RATTACH empirical PUA map) ->
latex1() (UIUX-LATEX-1 law of record, 376/376 reproduction).

P-id law: question-continuous over main rows; each row = one P-block EXCEPT
merged half-mark sub-rows (in-group predecessor code-mark > 1 AND group
full-mark sum > need) which fold into the parent block as '- Note: <code> <text>'
rows. Banner (deterministic-parse-flag) iff printed total missing or != the
question's parsed point-sum. Zero-deletion: only solutionMd fields on
solutionless parts are written. Compact single-line JSON, no EOF newline.
"""
import json, re, sys, os
sys.path.insert(0, "/home/z/my-project/scripts")
from mb4_transform import glyphs, fmt_block, q_banner
from mb4_latex1_norm import latex1

HUB = "/home/z/my-project/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json"
PLAN = json.load(open("/home/z/my-project/scripts/mb4_deep_plan.json"))
EYES = json.load(open("/home/z/my-project/scripts/mb4_eyeson.json"))

def code_mark(code):
    m = re.match(r"^(?:B|M|A)([123])", code or "")
    return int(m.group(1)) if m else None

def mword(m):
    return "mark" if m == 1 else "marks"

def T(s):
    """text chain of record"""
    return latex1(glyphs(s or ""))

def sub_text(s):
    for k in ("n", "a", "w"):
        if s.get(k):
            return s[k]
    return s.get("text") or ""

def ser_sub_lines(subs):
    out = []
    for s in subs:
        raw = s if isinstance(s, str) else sub_text(s)
        t = T(raw).strip()
        if not t:
            continue
        kind = "Note"
        mm = re.match(r"^(Allow|Reject|Ignore)\b", t)
        if mm:
            kind = mm.group(1)
            t = t[len(kind):].lstrip()
        if out and out[-1][0] == kind and kind != "Note":
            out[-1][1] += "; " + t
        else:
            out.append([kind, t])
    return out

def ser_question_pdf(groups, needs_by_part):
    """-> dict part_index -> solutionMd (P-ids question-continuous over rows)"""
    counters = {"pid": 0}
    part_blocks = {gi: [] for gi in range(len(groups))}
    for gi, g in enumerate(groups):
        need = needs_by_part[gi]
        rows = g
        full = sum(code_mark(r.get("code")) or r.get("markv") or 0 for r in rows)
        has_sub = full > need
        for ri, r in enumerate(rows):
            m = code_mark(r.get("code")) or r.get("markv") or 0
            if ri == 0 or not has_sub:
                counters["pid"] += 1
                pid = counters["pid"]
                head = T(r.get("head") or "").strip()
                block = [f"**P{pid}** ({m} {mword(m)})" + (f" {head}" if head else "")]
                for kind, t in ser_sub_lines(r.get("subs") or []):
                    block.append(f"- {kind}: {t}")
                part_blocks[gi].append("\n".join(block))
            else:
                # merged half-mark guidance row -> Note inside the open block
                code = r.get("code") or ""
                head = T(r.get("head") or "").strip()
                line = f"- Note: {code} {head}".rstrip()
                part_blocks[gi][-1] += "\n" + line
                for kind, t in ser_sub_lines(r.get("subs") or []):
                    part_blocks[gi][-1] += f"\n- {kind}: {t}"
    return {pi: "\n\n".join(bs) for pi, bs in part_blocks.items()}

hub = json.load(open(HUB, encoding="utf8"))
topics = {t.get("topicSlug") or t.get("slug"): t for t in hub}

from collections import defaultdict
byq = defaultdict(list)
for x in PLAN:
    byq[(x["topic"], x["q"])].append(x)

writes = []   # (topic, qi, pi, solutionMd, path)
issues = []

for (topic, qi), xs in sorted(byq.items()):
    att = [x for x in xs if x["verdict"].startswith("ATTACH")]
    if not att:
        continue
    ev0 = next(x for x in att if x["evidence"])["evidence"]
    hubt = topics[topic]
    hq = hubt["questions"][qi]
    hub_marks = [p.get("marks") for p in hq["parts"]]
    hub_sum = sum(m or 0 for m in hub_marks)

    if ev0.get("path") == "PDF" or ev0.get("tag"):
        printed = ev0.get("printed_total")
        groups = ev0["groups"]
        needs = []
        for gi in range(len(groups)):
            m = hub_marks[gi] if gi < len(hub_marks) else None
            needs.append(m)
        if None in needs:
            issues.append(f"{topic} q{qi}: hub mark missing for a group")
            continue
        part_sol = ser_question_pdf(groups, needs)
        banner = q_banner(printed, hub_sum) if (printed is None or printed != hub_sum) else None
        for x in att:
            pi = x["p"]
            sol = part_sol[pi]
            if banner:
                sol += "\n\n" + banner
            writes.append((topic, qi, pi, sol, "PDF"))
    elif ev0.get("path") == "MSMD":
        for x in att:
            pi = x["p"]
            blocks = [T(fmt_block(b)) for b in x["evidence"]["groups"][pi]]
            sol = "\n\n".join(blocks)
            if x["evidence"].get("banner"):
                sol += "\n\n" + x["evidence"]["banner"]
            writes.append((topic, qi, pi, sol, "MSMD"))

def eyes_block(b):
    body = [f"- {kind}: {t}" for kind, t in ser_sub_lines(b["subs"])]
    head = T(b["head"]).strip()
    return "\n".join([f"**P{b['pid']}** ({b['mark']} {mword(b['mark'])})" +
                      (f" {head}" if head else "")] + body)

for e in sorted(EYES["items"], key=lambda e: (e["topic"], e["q"], e["p"])):
    topic, qi, pi = e["topic"], e["q"], e["p"]
    sol = "\n\n".join(eyes_block(b) for b in e["blocks"])
    if e.get("banner"):
        sol += "\n\n" + e["banner"]
    writes.append((topic, qi, pi, sol, "EYESON"))

# ── apply with assertions ────────────────────────────────────────────────
DRY = "--dry" in sys.argv
seen = set()
n_written = 0
previews = []
for topic, qi, pi, sol, path in writes:
    key = (topic, qi, pi)
    assert key not in seen, f"duplicate write {key}"
    seen.add(key)
    t = topics[topic]
    p = t["questions"][qi]["parts"][pi]
    assert not (p.get("solutionMd") or "").strip(), f"solutionMd already set: {key}"
    assert sol.strip(), f"empty solution {key}"
    previews.append({"key": list(key), "path": path, "solutionMd": sol})
    if not DRY:
        p["solutionMd"] = sol
    n_written += 1

if DRY:
    with open("/home/z/my-project/scripts/mb4_apply_preview.json", "w", encoding="utf8") as f:
        json.dump(previews, f, ensure_ascii=False, indent=1)
    print(f"DRY-RUN: {n_written} solutions previewed -> mb4_apply_preview.json (hub untouched)")
else:
    out = json.dumps(hub, ensure_ascii=False, separators=(",", ":"))
    with open(HUB, "w", encoding="utf8") as f:
        f.write(out)
    print(f"APPLIED: {n_written} solutionMd additions")
from collections import Counter
print("paths:", dict(Counter(w[4] for w in writes)))
for i in issues:
    print("ISSUE:", i)
