#!/usr/bin/env python3
"""
ADR-040 band-shape fit audit — the conv53 band-shape design vs the REAL
printed tables staged by the G-1 lane (comment 6404570222, receipt
adr040-g1-msfetch-r0 @ 9a085fef).

READ-ONLY over the staged drafts. Mirrors the design surface of record:

  - migration 0015 mark_bands DDL (level_index >= 1, marks_min >= 0,
    marks_max >= marks_min, UNIQUE(scheme, level_index), descriptor NOT NULL)
  - bandCoverageViolations() (apps/api/src/services/ingestion/band-coverage.ts):
    ordinals exactly 1..n, ascending-with-marks, contiguity
    b[i].max + 1 = b[i+1].min, bottom 0-or-1, zero-mark rows refused,
    descriptor non-blank, top band reaches the awarded range
  - ingest LEVELS birth (past-paper.ts): bandsForQuestion = union by
    questionRef prefix law -> ONE scheme per question number ->
    UNIQUE(scheme, level_index) collision if >= 2 band entries share a number;
    both-kinds ConflictException if sibling point entries share the number
  - R4 tiling (review-writes.ts): partMarks = single part -> its marks,
    multi-part -> SUM of the version's parts (band-coverage.ts header law)
  - LEVELS prompt law (ADR-040 2.2): descriptors + guidance sent verbatim;
    converter hardcodes generalGuidance null and drops entry.guidance for
    band entries -> quantified here as the guidance-carry gap
"""
import json, os, re, sys, collections, statistics

ROOT = "/home/z/my-project/repo/.syllabai/lane-artifacts/ADR040-G1-WAVE1-MS/glm-ms-drafts"
OUT = "/home/z/my-project/tmp/bandshape_fit.json"

papers = []
for code in sorted(os.listdir(ROOT)):
    cdir = os.path.join(ROOT, code)
    if not os.path.isdir(cdir):
        continue
    for session in sorted(os.listdir(cdir)):
        sdir = os.path.join(cdir, session)
        for paper in sorted(os.listdir(sdir)):
            p = os.path.join(sdir, paper, "ms.draft.json")
            if os.path.isfile(p):
                papers.append((code, session, paper, p))

AO_RE = re.compile(r"\bAO\d\b", re.IGNORECASE)

stats = collections.Counter()
per_spec = collections.defaultdict(lambda: collections.Counter())
top_marks = collections.Counter()
per_spec_top = collections.defaultdict(collections.Counter)
levels_hist = collections.Counter()
per_entry_findings = collections.Counter()
papers_affected = collections.defaultdict(set)

band_entries = []      # (code, session, paper, label, number, marks, bands)
desc_lens = []
guid_nonnull = 0
entry_guidance_lines = 0
entry_guidance_entries = 0
ao_hits = 0
bullet_hits = 0
newline_hits = 0
array_order_breaks = 0

findings = collections.defaultdict(list)  # finding kind -> list of loci

for (code, session, paper, path) in papers:
    d = json.load(open(path))
    stats["files"] += 1
    per_spec[code]["files"] += 1
    entries = d.get("entries", [])
    # paper-level maps for the ingest-seam analysis
    pts_by_num = collections.Counter()
    band_by_num = collections.defaultdict(list)
    qt = d.get("questionTotals") or {}

    def refnum(e):
        # markPointRef law: label wins; "1(g)" -> number 1 via prefix split
        printed = e.get("label") if e.get("label") is not None else str(e.get("number"))
        if printed is None:
            return None
        s = str(printed)
        if s.startswith("*"):
            s = s[1:]
        paren = s.find("(")
        if paren < 0:
            return s.strip() or str(e.get("number"))
        return str(e.get("number"))

    for e in entries:
        num = refnum(e)
        bands = e.get("bands") or []
        has_pts = len(e.get("markPoints") or []) > 0
        # count points rows under this number (converter pushes one row per markPoint)
        if has_pts and not bands:
            pts_by_num[num] += len(e["markPoints"])
        elif not has_pts and not bands:
            # converter whole-entry fallback: one point row per such entry
            pts_by_num[num] += 1
        elif has_pts and bands:
            # converter: band entries win, points NOT pushed (continue) — but note the entry shape
            per_entry_findings["entry_both_kinds_bands_win"] += 1
        if not bands:
            continue

        stats["band_entries"] += 1
        per_spec[code]["band_entries"] += 1
        band_by_num[num].append(e)
        top_marks[e.get("marks")] += 1
        per_spec_top[code][e.get("marks")] += 1
        levels_hist[len(bands)] += 1

        # entry-guidance carry gap (converter `continue` skips entry.guidance)
        gl = e.get("guidance") or []
        gl_non = [g for g in gl if (g or {}).get("text")]
        if gl_non:
            entry_guidance_entries += 1
            entry_guidance_lines += len(gl_non)
            papers_affected["guidance_gap"].add(f"{code}/{session}/{paper}")

        # per-entry structural checks (bandCoverageViolations mirror, draft stage)
        idxs = [b.get("level") for b in bands]
        exp = list(range(1, len(bands) + 1))
        if idxs != exp:
            per_entry_findings["ordinals_not_1n"] += 1
            findings["ordinals_not_1n"].append(f"{code}/{session}/{paper} {e.get('label')}")
        # array order monotonic ascending by level
        lv = [b.get("level") for b in bands]
        if lv != sorted(lv):
            array_order_breaks += 1
        bym = sorted(bands, key=lambda b: (b.get("marksMin"), b.get("marksMax")))
        byi = sorted(bands, key=lambda b: b.get("level"))
        if [b.get("level") for b in bym] != [b.get("level") for b in byi]:
            per_entry_findings["order_not_asc_with_marks"] += 1
            findings["order_not_asc_with_marks"].append(f"{code}/{session}/{paper} {e.get('label')}")
        for i in range(len(bym) - 1):
            c, n = bym[i], bym[i + 1]
            if c.get("marksMax") is None or n.get("marksMin") is None:
                continue
            if c["marksMax"] + 1 != n["marksMin"]:
                kind = "overlap" if n["marksMin"] <= c["marksMax"] else "gap"
                per_entry_findings[f"contiguity_{kind}"] += 1
                findings[f"contiguity_{kind}"].append(f"{code}/{session}/{paper} {e.get('label')} L{c.get('level')}-L{n.get('level')}")
        if bym:
            bot = bym[0]
            if bot.get("marksMin") not in (0, 1):
                per_entry_findings["bottom_not_0_or_1"] += 1
                findings["bottom_not_0_or_1"].append(f"{code}/{session}/{paper} {e.get('label')} min={bot.get('marksMin')}")
        for b in bands:
            if b.get("marksMax") == 0:
                per_entry_findings["zero_mark_band"] += 1
                findings["zero_mark_band"].append(f"{code}/{session}/{paper} {e.get('label')} L{b.get('level')}")
            if b.get("marksMin") is not None and b.get("marksMin") < 0:
                per_entry_findings["negative_min"] += 1
            if (b.get("marksMin") is not None and b.get("marksMax") is not None
                    and b["marksMax"] < b["marksMin"]):
                per_entry_findings["inverted_range"] += 1
                findings["inverted_range"].append(f"{code}/{session}/{paper} {e.get('label')} L{b.get('level')}")
            desc = b.get("descriptor")
            if desc is None or str(desc).strip() == "":
                per_entry_findings["blank_descriptor"] += 1
                findings["blank_descriptor"].append(f"{code}/{session}/{paper} {e.get('label')} L{b.get('level')}")
            else:
                desc_lens.append(len(str(desc)))
                if "•" in desc:
                    bullet_hits += 1
                if "\n" in desc:
                    newline_hits += 1
                if AO_RE.search(str(desc)):
                    ao_hits += 1
            if b.get("guidance") is not None and str(b.get("guidance")).strip() != "":
                guid_nonnull += 1

        # entry-level tiling: top band reaches the printed entry marks
        top = bym[-1]
        if e.get("marks") is not None and top.get("marksMax") is not None and top["marksMax"] != e["marks"]:
            per_entry_findings["entry_tiling_mismatch"] += 1
            findings["entry_tiling_mismatch"].append(f"{code}/{session}/{paper} {e.get('label')} top={top['marksMax']} marks={e.get('marks')}")

        stats["band_rows"] += len(bands)
        per_spec[code]["band_rows"] += len(bands)
        band_entries.append((code, session, paper, e.get("label"), num, e.get("marks"), bands))

    # ---- ingest-seam analysis (per paper) ----
    for num, ents in band_by_num.items():
        if len(ents) >= 2:
            stats["collide_numbers"] += 1
            papers_affected["union_collision"].add(f"{code}/{session}/{paper}")
            findings["union_collision"].append(
                f"{code}/{session}/{paper} Q{num}: {len(ents)} band entries "
                + ", ".join(f"{e.get('label')}({e.get('marks')})" for e in ents))
        if pts_by_num.get(num, 0) > 0:
            stats["both_kinds_numbers"] += 1
            papers_affected["both_kinds_refusal"].add(f"{code}/{session}/{paper}")
            findings["both_kinds_refusal"].append(
                f"{code}/{session}/{paper} Q{num}: band entry {ents[0].get('label')} + "
                f"{pts_by_num[num]} sibling point rows")
        # R4 tiling vs question total (part-sum law proxy: the MS-side question
        # total = sum of ALL entry marks under the number; questionTotals when present)
        top = max((b.get("marksMax") or 0) for e in ents for b in (e.get("bands") or []))
        total = qt.get(str(num), qt.get(num))
        if not isinstance(total, int) or total <= 0:
            total = sum(e.get("marks") or 0 for e in d.get("entries", []) if refnum(e) == num) or None
        if isinstance(total, int) and total > 0 and top != total:
            stats["r4_tiling_mismatch_numbers"] += 1
            papers_affected["r4_tiling_mismatch"].add(f"{code}/{session}/{paper}")
            findings["r4_tiling_mismatch"].append(
                f"{code}/{session}/{paper} Q{num}: grid top {top} vs question total {total}")
        elif isinstance(total, int) and total > 0 and top == total and len(ents) == 1 and pts_by_num.get(num, 0) == 0:
            stats["clean_birth_numbers"] += 1
            papers_affected["clean_birth"].add(f"{code}/{session}/{paper}")

n_files = len(papers)
desc_lens.sort()

# collision top-pairs distribution (grid tops under colliding numbers)
coll_pairs = collections.Counter()
group = collections.defaultdict(list)
for (code, session, paper, lbl, num, marks, bands) in band_entries:
    group[(code, session, paper, num)].append(marks)
for key, lst in group.items():
    if len(lst) >= 2:
        coll_pairs[tuple(sorted(lst))] += 1
collision_top_pairs = {"+".join(str(x) for x in k): v for k, v in sorted(coll_pairs.items())}

# per-spec seam numbers
spec_seam = {}
for spec in ("4bs1", "4ge1"):
    g2 = collections.defaultdict(list)
    for (code, session, paper, lbl, num, marks, bands) in band_entries:
        if code == spec:
            g2[(code, session, paper, num)].append(marks)
    spec_seam[spec] = {
        "collide_numbers": sum(1 for v in g2.values() if len(v) >= 2),
    }

summary = {
    "root": ROOT,
    "files": n_files,
    "by_spec": {k: dict(v) for k, v in sorted(per_spec.items())},
    "band_entries_total": stats["band_entries"],
    "band_rows_total": stats["band_rows"],
    "top_marks_distribution": {str(k): v for k, v in sorted(top_marks.items(), key=lambda kv: (kv[0] is None, kv[0]))},
    "per_spec_top": {k: {str(a): b for a, b in sorted(v.items(), key=lambda kv: (kv[0] is None, kv[0]))} for k, v in sorted(per_spec_top.items())},
    "levels_per_entry_hist": {str(k): v for k, v in sorted(levels_hist.items())},
    "structural_findings": {k: v for k, v in sorted(per_entry_findings.items())},
    "descriptor_len": {"min": desc_lens[0] if desc_lens else None,
                       "median": statistics.median(desc_lens) if desc_lens else None,
                       "max": desc_lens[-1] if desc_lens else None},
    "descriptor_bullet_rows": bullet_hits,
    "descriptor_newline_rows": newline_hits,
    "descriptor_ao_rows": ao_hits,
    "band_guidance_nonnull_rows": guid_nonnull,
    "entry_guidance_entries_dropped": entry_guidance_entries,
    "entry_guidance_lines_dropped": entry_guidance_lines,
    "array_order_breaks": array_order_breaks,
    "collision_top_pairs": collision_top_pairs,
    "spec_seam": spec_seam,
    "ingest_seams": {
        "union_collision_numbers": stats["collide_numbers"],
        "both_kinds_numbers": stats["both_kinds_numbers"],
        "r4_tiling_mismatch_numbers": stats["r4_tiling_mismatch_numbers"],
        "clean_birth_numbers": stats["clean_birth_numbers"],
        "papers_with_union_collision": len(papers_affected["union_collision"]),
        "papers_with_both_kinds": len(papers_affected["both_kinds_refusal"]),
        "papers_with_r4_tiling_mismatch": len(papers_affected["r4_tiling_mismatch"]),
        "papers_clean_birth": len(papers_affected["clean_birth"]),
    },
}
json.dump({"summary": summary, "findings": {k: v[:40] for k, v in findings.items()}},
          open(OUT, "w"), indent=1)

print(json.dumps(summary, indent=1))
print("\n--- finding samples (first few each) ---")
for k, v in sorted(findings.items()):
    print(f"\n[{k}] n={len(v)}")
    for x in v[:6]:
        print("   ", x)
