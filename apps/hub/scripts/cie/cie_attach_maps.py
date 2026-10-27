#!/usr/bin/env python3
"""Phase 2 step 2 (FINAL ladder): CIE official attachment layer — content-maps/<slug>.json.

Lineage law (NO-GUESS, carried from attach_official_map.py + CIE extensions):
  MAP rows (spcpt -> official), first match wins, each deterministic:
    R1  index subtopic_slug numeric prefix == spine SPEC_POINT code
    R2  R1 + family prefix letter (scopeRule code_prefix C/E, scope_eq strand
        initial B/C/P)
    R3  normalized index name == normalized spine SPEC_POINT title
    R4  normalized name+definition CONTAINS exactly one normalized SP title
        (topic-scoped when the slug carries a section number)
    R5  normalized slug/name == normalized SUBTOPIC title (or glue-trimmed
        prefix-of), unique -> SUBTOPIC determined; NOTES attach to the
        subtopic's SPEC_POINT children (subtopic_title_scope — the SME page IS
        the subtopic's teaching page); question parts / flashcards are NEVER
        expanded (learner-analytics honesty)
  ITEM codes: the item's OWN declared SME spec-point ids resolved through the
  map -> sme_declared_link_rekey. Upstream map rows rank over declared-only.
  Everything else stays UNMAPPED and listed — never dropped, never guessed.

Output schema: syllabai.official-attachment/1.0 (same shape as the 49 Edexcel maps).
"""
import hashlib
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
HUB = os.environ.get("CIE_HUB", os.path.join(REPO, "apps", "hub"))
CACHE = os.environ.get("CIE_CACHE", "/home/z/my-project/work/cie-corpus-cache")
STAGING = os.environ.get("CIE_STAGING", "/home/z/my-project/work/cie-content")
MANIFEST = os.environ.get("CIE_PHASE0_MANIFEST", os.path.join(REPO, ".syllabai", "receipts", "CIE-INTEGRATION", "cie-phase0-roster-manifest-r0.json"))
sys.path.insert(0, os.path.join(HUB, "scripts"))
import attach_official_map as AOM  # noqa: E402  (resolve_spine_code + course_ctx reused verbatim)

PIN = json.load(open(os.path.join(CACHE, "_pin.json")))["pin"]
SPCPT_RE = re.compile(r"spcpt_[A-Za-z0-9]+")
NUM_PREFIX_RE = re.compile(r"^((?:\d+)(?:-\d+)+)-")
GLUE = re.compile(r"\s*notes and examples\s*", re.I)
SCHEMA = "syllabai.official-attachment/1.0"
REPORT_SCHEMA = "syllabai.official-attachment-report-cie/1.0"
L_UPSTREAM, L_DECLARED = AOM.L_UPSTREAM, AOM.L_DECLARED


def norm(t):
    if not t:
        return ""
    t = t.lower().replace("&", " and ")
    t = t.replace("\x07", " ")
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def merged_index(slug):
    p = os.path.join(CACHE, f"SME-ExamQuestion/{slug}/spec_point_index.json")
    if not os.path.exists(p):
        return {}, {}
    idx = json.load(open(p, encoding="utf8"))
    sp = dict(idx.get("spec_points", {}))
    xl = idx.get("cross_lane_join") or {}
    for sid, e in (xl.get("resolved") or {}).items():
        if sid not in sp or sp[sid].get("definition") in (None, "nan"):
            sp[sid] = {k: v for k, v in e.items() if k not in ("grade", "via_lanes")}
    return sp, (xl.get("resolved") or {})


def build_map(sp_index, spine):
    """Deterministic spcpt -> official rows. Returns (leaf_map, sub_map, unmapped, stats)."""
    nodes = spine["curriculum"]["nodes"]
    sp_rows = [n for n in nodes if n["family"] == "SPEC_POINT"]
    sp_codes = {n["code"] for n in sp_rows}
    sp_title = {n["code"]: GLUE.sub(" ", n["title"] or "") for n in sp_rows}
    sub_title = {n["code"]: GLUE.sub(" ", n["title"] or "") for n in nodes if n["family"] == "SUBTOPIC"}
    children_of_sub = defaultdict(list)
    for n in sp_rows:
        for p in n["parents"]:
            children_of_sub[p].append(n["code"])
    rule = spine["meta"].get("scopeRule") or {}
    pref = None
    if rule.get("kind") == "code_prefix":
        pref = rule.get("value") or rule.get("code")
    elif rule.get("kind") == "scope_eq":
        pref = (rule.get("value") or "")[:1]

    leaf_map, sub_map, unmapped = OrderedDict(), OrderedDict(), []
    st = defaultdict(int)
    for sid in sorted(sp_index):
        e = sp_index[sid] or {}
        name = e.get("name") or ""
        slugs_ = e.get("subtopic_slugs") or []
        prefixes = []
        for sl in slugs_:
            m = NUM_PREFIX_RE.match(sl or "")
            if m:
                prefixes.append(m.group(1).replace("-", "."))
        hit = None
        for p in prefixes:
            if p in sp_codes:
                hit = ("R1", p, None)
                break
        if not hit and pref:
            for p in prefixes:
                c = f"{pref}{p}"
                if c in sp_codes:
                    hit = ("R2", c, None)
                    break
        if not hit:
            nn = norm(name)
            if nn:
                eq = [c for c, t in sp_title.items() if norm(t) == nn]
                if len(eq) == 1:
                    hit = ("R3", eq[0], None)
                elif len(eq) > 1:
                    st["r3_amb"] += 1
        if not hit:
            nd = norm(f"{name} {e.get('definition') or ''}")
            scope = None
            for sl in slugs_:
                m = re.match(r"^(\d+)-", sl or "")
                if m:
                    scope = m.group(1)
                    break
            if nd:
                cands = []
                for c, t in sp_title.items():
                    nt = norm(t)
                    if len(nt) > 12 and nt in nd:
                        if scope and not c.startswith(scope + "."):
                            continue
                        cands.append(c)
                if len(cands) == 1:
                    hit = ("R4", cands[0], None)
                elif len(cands) > 1:
                    st["r4_amb"] += 1
        if not hit:
            cands = []
            nn_slug = [norm(s.replace("-", " ")) for s in slugs_]
            nn_name = norm(name)
            for code, t in sub_title.items():
                nt = norm(t)
                if not nt:
                    continue
                if any(a == nt for a in nn_slug) or (nn_name and nn_name == nt):
                    cands.append(code)
                elif any(nt.startswith(a) and len(a) > 8 for a in nn_slug) or (
                        nn_name and len(nn_name) > 8 and nt.startswith(nn_name)):
                    cands.append(code)
            if len(cands) == 1:
                hit = ("R5", cands[0], children_of_sub.get(cands[0], []))
            elif len(cands) > 1:
                st["r5_amb"] += 1
        if not hit:
            unmapped.append(sid)
            continue
        rule_id, primary, extra = hit
        st[rule_id] += 1
        if rule_id == "R5":
            sub_map[sid] = OrderedDict(subtopicCode=primary, specPointCodes=sorted(extra) if extra else [])
        else:
            leaf_map[sid] = OrderedDict(
                officialId=None, officialCode=primary,
                officialCodes=[primary] if not extra else sorted(set([primary] + extra)),
                unit=None, tier=None, method=None, score=None,
                lineage=L_UPSTREAM, via=rule_id)
    return leaf_map, sub_map, unmapped, dict(st)


def main():
    rows = {r["slug"]: r for r in json.load(open(MANIFEST))["deliverable1_bankSpecJoin"]["matrix"]}
    slugs = sorted(rows)
    out_dir = os.path.join(HUB, "content-maps")
    report_rows, fam_stats = [], defaultdict(lambda: defaultdict(int))

    for slug in slugs:
        spine = json.load(open(os.path.join(HUB, "spines", f"{slug}.json")))
        spine_nodes = spine["curriculum"]["nodes"]
        spine_codes = sorted({n["code"] for n in spine_nodes if n["family"] == "SPEC_POINT"})
        spine_set = set(spine_codes)
        qual = spine["meta"]["qual"]
        ctx = AOM.course_ctx(spine["meta"].get("scopeRule") or {}, spine_set)

        sp_index, resolved = merged_index(slug)
        leaf_map, sub_map, spcpt_unmapped, mstats = build_map(sp_index, spine)
        spcpt_map = leaf_map  # item resolution uses leaf rows only

        items = OrderedDict()

        def attach(item_id, kind, declared_ids, allow_sub_scope):
            declared = sorted(set(declared_ids or []))
            codes, missing, sub_scope = [], [], []
            for s in declared:
                mrow = spcpt_map.get(s)
                if mrow:
                    for oc in ([mrow["officialCode"]] + (mrow.get("officialCodes") or [])):
                        c = OrderedDict(officialId=mrow["officialId"], officialCode=oc,
                                        unit=None, tier=mrow["tier"], method=mrow["method"],
                                        score=mrow["score"], lineage=L_DECLARED, viaSpcpt=s)
                        c["spineCode"] = AOM.resolve_spine_code(
                            c["officialCode"], c["officialId"], c["unit"], ctx, spine_set)
                        codes.append(c)
                elif allow_sub_scope and s in sub_map:
                    sub_scope.append(s)
                else:
                    missing.append(s)
            seen, merged = set(), []
            for c in codes:
                k = (c.get("spineCode"), c["officialCode"], c["viaSpcpt"])
                if k in seen:
                    continue
                seen.add(k)
                merged.append(c)
            if merged:
                rec = OrderedDict(kind=kind, codes=merged)
                if sub_scope:
                    rec["subtopicScopedIds"] = sub_scope
                if missing:
                    rec["declaredUnresolved"] = missing
                items[item_id] = rec
            elif sub_scope and allow_sub_scope:
                # note with ONLY subtopic-scope rows: attach the subtopic's children
                codes2, seen2 = [], set()
                for s in sub_scope:
                    for oc in sub_map[s]["specPointCodes"]:
                        if oc in seen2:
                            continue
                        seen2.add(oc)
                        c = OrderedDict(officialId=None, officialCode=oc, unit=None, tier=None,
                                        method=None, score=None, lineage="subtopic_title_scope",
                                        viaSpcpt=s)
                        c["spineCode"] = AOM.resolve_spine_code(oc, None, None, ctx, spine_set)
                        codes2.append(c)
                if codes2:
                    items[item_id] = OrderedDict(kind=kind, codes=codes2,
                                                 subtopicScopedIds=sub_scope,
                                                 **({"declaredUnresolved": missing} if missing else {}))
                else:
                    items[item_id] = OrderedDict(kind=kind, codes=[], unmapped=True,
                                                 subtopicScopedIds=sub_scope)
            else:
                rec = OrderedDict(kind=kind, codes=[], unmapped=True)
                if sub_scope:
                    rec["subtopicScopedIds"] = sub_scope
                if missing:
                    rec["declaredUnresolved"] = missing
                items[item_id] = rec

        bundle = os.path.join(STAGING, slug)
        notes = json.load(open(os.path.join(bundle, "notes.json"), encoding="utf8"))
        qsets = json.load(open(os.path.join(bundle, "questions.json"), encoding="utf8"))
        cards = json.load(open(os.path.join(bundle, "flashcards.json"), encoding="utf8"))

        notes_inline_refs, notes_inline_unmapped = 0, set()
        for n in notes:
            inline = SPCPT_RE.findall(n.get("bodyMd") or "")
            notes_inline_refs += len(inline)
            notes_inline_unmapped.update(r for r in inline if r not in spcpt_map)
            attach(n["noteId"], "note", n.get("specPointIds") or [], True)

        qp_total = 0
        for s in qsets:
            for q in s.get("questions", []):
                for p in q.get("parts", []):
                    qp_total += 1
                    attach(p["id"], "question_part", p.get("specPointIds") or [], False)

        for f in cards:
            attach(f["id"], "flashcard", f.get("specPointIds") or [], False)

        # ---- reconciliation ---------------------------------------------------
        attached_codes = {}
        for iid, rec in items.items():
            for c in rec["codes"]:
                attached_codes.setdefault(c.get("spineCode"), []).append(iid)
        spine_hit = {c for c in attached_codes if c is not None}
        outside_count = len(attached_codes.get(None, []))
        uncovered = sorted(spine_set - spine_hit)

        def cov(kind, total):
            ids = [i for i, r in items.items() if r["kind"] == kind]
            coded = [i for i in ids if items[i]["codes"]]
            subsc = [i for i in ids if items[i].get("subtopicScopedIds")]
            return OrderedDict(total=total, coded=len(coded), unmapped=len(ids) - len(coded),
                               viaSubtopicScope=len(subsc))

        coverage = OrderedDict(notes=cov("note", len(notes)),
                               questionParts=cov("question_part", qp_total),
                               flashcards=cov("flashcard", len(cards)))

        inputs = OrderedDict()
        idx_rel = f"SME-ExamQuestion/{slug}/spec_point_index.json"
        if os.path.exists(os.path.join(CACHE, idx_rel)):
            inputs[idx_rel] = OrderedDict(sha256=hashlib.sha256(
                open(os.path.join(CACHE, idx_rel), "rb").read()).hexdigest())
        inputs["spine"] = OrderedDict(file=f"spines/{slug}.json")

        lvl = spine["curriculum"]["level"]
        subj_fam = re.sub(r"-\d.*$", "", qual)
        fs = fam_stats[f"{lvl}/{subj_fam}"]
        for k, v in mstats.items():
            fs[k] = fs.get(k, 0) + v
        fs["indexEntries"] = fs.get("indexEntries", 0) + len(sp_index)

        attachment = OrderedDict(
            schema=SCHEMA, course=slug, qual=qual, resourcesSha=PIN, generatedUtc=None,
            inputs=inputs,
            sources=OrderedDict(
                specPointMap=OrderedDict(
                    regime="cie_reconciliation_derived",
                    derivation="deterministic ladder R1-R4 (leaf) + R5 (subtopic scope, notes only) over the upstream spec_point_index incl. cross_lane_join resolutions; every row carries its rule id",
                    smeEntries=len(sp_index), crossLaneResolved=len(resolved),
                    leafMapped=len(leaf_map), subtopicScoped=len(sub_map), unmapped=len(spcpt_unmapped),
                    ruleCounts=mstats),
                specLinks=None, resolution=None, flashcardMap=None),
            spcptToOfficial={k: leaf_map[k] for k in sorted(leaf_map)},
            spcptSubtopicScope={k: sub_map[k] for k in sorted(sub_map)},
            spcptUnmapped=sorted(spcpt_unmapped),
            items={k: items[k] for k in sorted(items)},
            reconciliation=OrderedDict(
                spineSpecPoints=len(spine_set),
                distinctCodesAttached=len(spine_hit),
                spineHitCodes=len(spine_hit),
                codesOutsideSpine=([OrderedDict(items=outside_count,
                                                note="declarations whose derived code has no verbatim match in this course's spine — kept, not dropped")] if outside_count else []),
                itemsOutsideSpine=outside_count,
                uncoveredSpineCodes=len(uncovered),
                uncoveredSpineCodeList=uncovered),
            contentCoverage=coverage,
            notesInlineRefs=OrderedDict(total=notes_inline_refs,
                                        unmappedToMap=sorted(notes_inline_unmapped)))

        with open(os.path.join(out_dir, f"{slug}.json"), "w", encoding="utf8") as f:
            f.write(json.dumps(attachment, indent=1, sort_keys=True) + "\n")

        report_rows.append(OrderedDict(
            course=slug, level=lvl, subject=spine["curriculum"]["subject"],
            indexEntries=len(sp_index), crossLaneResolved=len(resolved),
            leafMapped=len(leaf_map), subtopicScoped=len(sub_map), spcptUnmapped=len(spcpt_unmapped),
            ruleCounts=mstats, spineSpecPoints=len(spine_set), spineHitCodes=len(spine_hit),
            uncoveredSpineCodes=len(uncovered),
            notes=coverage["notes"], questionParts=coverage["questionParts"],
            flashcards=coverage["flashcards"], inlineRefs=notes_inline_refs))
        print(f"{slug}: leaf {len(leaf_map)}/{len(sp_index)} sub {len(sub_map)} | "
              f"spineHit {len(spine_hit)}/{len(spine_set)} | notes {coverage['notes']['coded']}/{coverage['notes']['total']} "
              f"(+sub{coverage['notes']['viaSubtopicScope']}) parts {coverage['questionParts']['coded']}/{coverage['questionParts']['total']} "
              f"cards {coverage['flashcards']['coded']}/{coverage['flashcards']['total']}", flush=True)

    report = OrderedDict(
        schema=REPORT_SCHEMA, resourcesSha=PIN,
        lineageLaw="upstream_item_join (deterministic ladder R1-R4 over the upstream index) > sme_declared_link_rekey (declared ids via map) > subtopic_title_scope (R5, NOTES only: the SME subtopic page teaches its spine subtopic's statements); NO-GUESS — everything unresolved stays unmapped and listed",
        courses={r["course"]: r for r in report_rows},
        familyStats=fam_stats,
        totals=OrderedDict(courses=len(report_rows),
                           indexEntries=sum(r["indexEntries"] for r in report_rows),
                           leafMapped=sum(r["leafMapped"] for r in report_rows),
                           subtopicScoped=sum(r["subtopicScoped"] for r in report_rows),
                           spcptUnmapped=sum(r["spcptUnmapped"] for r in report_rows),
                           spineHitCodes=sum(r["spineHitCodes"] for r in report_rows),
                           uncoveredSpineCodes=sum(r["uncoveredSpineCodes"] for r in report_rows),
                           notesCoded=sum(r["notes"]["coded"] for r in report_rows),
                           notesViaSubtopic=sum(r["notes"]["viaSubtopicScope"] for r in report_rows),
                           questionPartsCoded=sum(r["questionParts"]["coded"] for r in report_rows),
                           flashcardsCoded=sum(r["flashcards"]["coded"] for r in report_rows)))
    # SME-WAVE2 r1: report filename env-overridable (lane-worktree pattern) —
    # the of-record 44-bank _report_cie_maps.json stays byte-untouched on
    # wave-2 re-runs; default unchanged.
    report_name = os.environ.get("CIE_MAPS_REPORT", "_report_cie_maps.json")
    with open(os.path.join(out_dir, report_name), "w", encoding="utf8") as f:
        f.write(json.dumps(report, indent=1, sort_keys=True) + "\n")
    print("TOTALS:", json.dumps(report["totals"], indent=1), flush=True)


if __name__ == "__main__":
    main()
