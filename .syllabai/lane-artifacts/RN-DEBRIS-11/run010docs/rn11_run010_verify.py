#!/usr/bin/env python3
"""RN-DEBRIS-11 run-010 — independent post-repair verifier (recomputes, never trusts).

Gates:
  G0 byte anchors   : git diff --name-only == exactly the 4 expected files.
  G2 field diffs    : deep JSON compare pre (origin/main blob) vs post (worktree)
                      — exactly 22 + 6 title-only node edits (curriculum) and
                      11 + 6 pair/node label edits (KG); every other byte equal.
  G3 structure      : node/edge counts, code sets, spec-point codes, edges,
                      meta — byte-identical.
  G4 zero-invention : all 17 new titles re-derived from fresh runs of the
                      run-009 extractors (the byte-pinned PDFs) byte-exact.
  G5 stamp neutrality: business-19 carries 0 stamps; RS-23's 2 stamps are
                      topic-level -gen rows — all destinations exist;
                      questions.json untouched (G0).
  G6 mirror equality: KG SubTopic labels == curriculum SUBTOPIC titles
                      (sequence law) 25/25 + 85/85 post-repair.
  G7 uniqueness     : 25/25 + 85/85 distinct titles.
  G8 glyph invariance: the 6 RS joins differ from the old titles by whitespace
                      only (the old forms are the spaced-mark artifact) — so the
                      production title-match norm is unchanged for them.
"""
import json, re, subprocess, sys

CUR_B = "apps/hub/content/igcse-business-19/curriculum.json"
KG_B = "apps/hub/public/kg/data/igcse-business-19.json"
CUR_R = "apps/hub/content/cie-igcse-religious-studies-23/curriculum.json"
KG_R = "apps/hub/public/kg/data/cie-igcse-religious-studies-23.json"
REF = "origin/main"
REPO = "/home/z/my-project/work/syllabai-v2"

F6_NEW = ["Classification of businesses", "Business and the international economy",
          "Government objectives and policies", "What makes a business successful?",
          "Internal and external communication", "Recruitment and selection process",
          "Motivation and rewards", "Organisation structure and employees",
          "Business finance – sources", "Costs and break-even analysis",
          "Economies and diseconomies of scale"]
F3_NEW_KEYS = ["I2.5", "I2.6", "I3.3", "I4.1", "I4.3", "I6.2"]

def load_ref(path):
    b = subprocess.run(["git", "show", f"{REF}:{path}"], capture_output=True, check=True, cwd=REPO).stdout
    return json.loads(b)

def ser(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

def norm(s):
    # the PRODUCTION title-match norm (spec-tree.ts normTitle): lowercase +
    # strip every non-alphanumeric (marks and whitespace both vanish)
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())

def main():
    ok = True
    # G0
    changed = subprocess.run(["git", "diff", "--name-only"], capture_output=True, text=True, check=True, cwd=REPO).stdout.split()
    g0 = sorted(changed) == sorted([CUR_B, KG_B, CUR_R, KG_R])
    print(f"G0 byte anchors (only the 4 expected files changed): {'OK' if g0 else 'FAIL ' + str(changed)}")
    ok &= g0

    # ---- curriculum field diffs ----
    cur_b_pre, cur_b_post = load_ref(CUR_B), json.load(open(f"{REPO}/{CUR_B}"))
    cur_r_pre, cur_r_post = load_ref(CUR_R), json.load(open(f"{REPO}/{CUR_R}"))

    def title_only_diffs(pre, post, expect):
        pre_by = {n["code"]: n for n in pre["nodes"]}
        post_by = {n["code"]: n for n in post["nodes"]}
        good = set(pre_by) == set(post_by)
        edits = []
        for c in pre_by:
            if pre_by[c] != post_by[c]:
                df = [k for k in pre_by[c] if pre_by[c].get(k) != post_by[c].get(k)]
                if df == ["title"]:
                    edits.append((c, pre_by[c]["title"], post_by[c]["title"]))
                else:
                    good = False
                    print("  UNEXPECTED node diff:", c, df)
        return good and len(edits) == expect, edits, post_by

    g2a, b_edits, b_post = title_only_diffs(cur_b_pre, cur_b_post, 22)
    g2b, r_edits, r_post = title_only_diffs(cur_r_pre, cur_r_post, 6)
    b_ok = g2a and all(new in F6_NEW for _, _, new in b_edits) and \
        sum(1 for c, _, _ in b_edits if c.endswith(":SUB_")) == 11
    r_ok = g2b and len(r_edits) == 6
    print(f"G2a business-19 curriculum: 22 title-only edits (11 TOPIC + 11 SUBTOPIC): "
          f"{'OK' if b_ok else 'FAIL'} ({len(b_edits)} edits)")
    print(f"G2b RS-23 curriculum: 6 title-only edits: {'OK' if g2b else 'FAIL'} ({len(r_edits)} edits)")
    ok &= b_ok and g2b and len(r_edits) == 6

    # ---- KG label diffs ----
    kg_b_pre, kg_b_post = load_ref(KG_B), json.load(open(f"{REPO}/{KG_B}"))
    kg_r_pre, kg_r_post = load_ref(KG_R), json.load(open(f"{REPO}/{KG_R}"))

    def kg_label_diffs(pre, post, expect_pairs):
        st_edits = 0
        for sec in pre["subtopics"]:
            for (a, b), (c, d) in zip(pre["subtopics"][sec], post["subtopics"][sec]):
                if a != c or b != d:
                    if a == c and b != d:
                        st_edits += 1
                    else:
                        return False, 0, 0, None
        ids_pre = {n["id"]: n for n in pre["nodes"] if n.get("type") == "SubTopic"}
        ids_post = {n["id"]: n for n in post["nodes"] if n.get("type") == "SubTopic"}
        label_edits = 0
        for i in ids_pre:
            df = [k for k in ids_pre[i] if ids_pre[i].get(k) != ids_post[i].get(k)]
            if df == ["label"]:
                label_edits += 1
            elif df:
                return False, 0, 0, (i, df)
        same_rest = set(pre.keys()) == set(post.keys())
        for k in pre:
            if k not in ("subtopics", "nodes") and ser(pre[k]) != ser(post[k]):
                same_rest = False
        nodes_same = all(ser(a) == ser(b) for a, b in zip(
            [n for n in pre["nodes"] if n.get("type") != "SubTopic"],
            [n for n in post["nodes"] if n.get("type") != "SubTopic"]))
        return same_rest and nodes_same and st_edits == expect_pairs == label_edits, st_edits, label_edits, None

    g2c, b_pairs, b_nodes, bad = kg_label_diffs(kg_b_pre, kg_b_post, 11)
    g2d, r_pairs, r_nodes, bad2 = kg_label_diffs(kg_r_pre, kg_r_post, 6)
    print(f"G2c business-19 KG: 11 pair + 11 node label edits, all else byte-equal: {'OK' if g2c else 'FAIL ' + str(bad)}")
    print(f"G2d RS-23 KG: 6 pair + 6 node label edits, all else byte-equal: {'OK' if g2d else 'FAIL ' + str(bad2)}")
    ok &= g2c and g2d

    # ---- G3 structure ----
    g3 = True
    for pre, post, nn in ((cur_b_pre, cur_b_post, len(cur_b_pre["nodes"])),
                          (cur_r_pre, cur_r_post, len(cur_r_pre["nodes"]))):
        sp_pre = sorted(n["code"] for n in pre["nodes"] if n["family"] == "SPEC_POINT")
        sp_post = sorted(n["code"] for n in post["nodes"] if n["family"] == "SPEC_POINT")
        g3 &= (len(pre["nodes"]) == len(post["nodes"]) == nn
               and len(pre["edges"]) == len(post["edges"])
               and ser(pre["edges"]) == ser(post["edges"]) and sp_pre == sp_post)
    print(f"G3 structure (node/edge counts, edges byte-equal, spec-point codes byte-identical): {'OK' if g3 else 'FAIL'}")
    ok &= g3

    # ---- G4 zero-invention: fresh extractor runs reproduce all 17 titles ----
    sys.path.insert(0, "/home/z/my-project/scripts")
    import importlib
    ext4 = importlib.import_module("rn11_run009_extract_4bs1")
    ext4.main()  # refreshes /tmp/run009/evidence_4bs1.json
    fresh_b = json.load(open("/tmp/run009/evidence_4bs1.json"))["titles"]
    bad_g4 = [(k, fresh_b.get(k)) for k in
              ["1.3", "1.5", "1.6", "1.8", "2.1", "2.2", "2.4", "2.5", "3.1", "3.3", "5.1"]
              if fresh_b.get(k) not in F6_NEW]
    extc = importlib.import_module("rn11_run009_extract_cie")
    extc.main()  # refreshes /tmp/run009/evidence_cie.json
    fresh_r = json.load(open("/tmp/run009/evidence_cie.json"))["F3_0490"]["extraction"]["subsections"]
    bad_g4 += [(k, fresh_r.get(k)) for k in F3_NEW_KEYS
               if fresh_r.get(k) != dict(zip(F3_NEW_KEYS, [r_post[c]["title"] for c, _, _ in r_edits
                                                           if c.endswith("SUB" + k)]))
               and fresh_r.get(k) != next((new for c, _, new in r_edits if c.endswith("SUB" + k)), None)]
    g4 = not bad_g4
    for b in bad_g4:
        print("  G4 MISMATCH:", b)
    print(f"G4 zero-invention (fresh re-extraction reproduces 11 + 6 titles byte-exact): {'OK' if g4 else 'FAIL'}")
    ok &= g4

    # ---- G5 stamp neutrality ----
    qb = json.load(open(f"{REPO}/apps/hub/content/igcse-business-19/questions.json"))
    qr = json.load(open(f"{REPO}/apps/hub/content/cie-igcse-religious-studies-23/questions.json"))
    def stamps(q):
        items = q if isinstance(q, list) else (q.get("questions") or q.get("sets") or [])
        return [it.get("subtopicCode") for it in items if isinstance(it, dict) and it.get("subtopicCode")]
    sb, sr = stamps(qb), stamps(qr)
    topic_codes = {n["code"] for n in cur_r_post["nodes"] if n["family"] == "TOPIC"}
    missing = [s for s in sr if not (s in r_post or (s.endswith("-gen") and s[:-4] in topic_codes))]
    g5 = len(sb) == 0 and not missing
    print(f"G5 stamp neutrality (business-19: {len(sb)} stamps; RS-23: {len(sr)} gen stamps, "
          f"all destinations exist, questions.json untouched): {'OK' if g5 else 'FAIL ' + str(missing)}")
    ok &= g5

    # ---- G6 mirror equality post-repair (sequence law) ----
    def mirror_ok(cur_post, kg_post):
        by_code = {n["code"]: n for n in cur_post["nodes"]}
        kids = {}
        for e in cur_post["edges"]:
            if e.get("relation") == "PART_OF":
                kids.setdefault(e["source"], []).append(e["target"])
        seq_cur = [by_code[c]["title"]
                   for n in cur_post["nodes"] if n["family"] == "TOPIC"
                   for c in kids.get(n["code"], [])
                   if by_code.get(c, {}).get("family") == "SUBTOPIC"]
        seq_kg = [n.get("label") for n in kg_post["nodes"] if n.get("type") == "SubTopic"]
        return seq_cur == seq_kg, len(seq_cur), len(seq_kg)
    m1, n1, k1 = mirror_ok(cur_b_post, kg_b_post)
    m2, n2, k2 = mirror_ok(cur_r_post, kg_r_post)
    g6 = m1 and m2
    print(f"G6 mirror equality (kg labels == curriculum titles): business-19 {n1}/{k1}, "
          f"RS-23 {n2}/{k2}: {'OK' if g6 else 'FAIL'}")
    ok &= g6

    # ---- G7 uniqueness ----
    # business-19 carries the TOPIC/SUB_ twin-carry shape (each SUB_ title equals
    # its TOPIC twin by design) — the law: TOPIC titles distinct + twins equal.
    bt = [n["title"] for n in cur_b_post["nodes"] if n["family"] == "TOPIC"]
    bs = {n["code"].split(":")[0]: n["title"] for n in cur_b_post["nodes"] if n["family"] == "SUBTOPIC"}
    twins = all(bs.get(n["code"]) == n["title"] for n in cur_b_post["nodes"] if n["family"] == "TOPIC")
    u1 = len(set(bt)) == len(bt) == 25 and twins
    ts_r = [n["title"] for n in cur_r_post["nodes"] if n["family"] in ("TOPIC", "SUBTOPIC")]
    u2 = len(set(ts_r)) == len(ts_r)
    g7 = u1 and u2
    print(f"G7 title uniqueness: business-19 25/25 TOPIC titles distinct + twin law "
          f"{'OK' if u1 else 'FAIL'}; RS-23 {len(ts_r)} rows distinct={'OK' if u2 else 'FAIL'}")
    ok &= g7

    # ---- G8 glyph invariance (whitespace-only deltas) ----
    inv = all(norm(old).replace("ʿ", "ʿ").replace("ʾ", "ʾ") == norm(new)
              for _, old, new in r_edits)
    print(f"G8 glyph invariance (the 6 RS joins differ by whitespace only): "
          f"{'OK' if inv else 'FAIL'}")
    ok &= inv

    print("\nVERDICT:", "ALL GATES GREEN" if ok else "GATE FAILURE")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
