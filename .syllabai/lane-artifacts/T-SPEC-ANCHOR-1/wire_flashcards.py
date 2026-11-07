#!/usr/bin/env python3
"""T-SPEC-ANCHOR-1 run-001 — wire unanchored flashcards to official spec
statements + repair the geography id-space bug. Zero-invention, fail-closed.

Sources of record:
  A. upstream spec-links bundles (work/upstream-snap/spec-links/<course>.json)
     — card-level joins (kind=flashcard, tiers excluding S2_name_ambiguous /
     T4_fuzzy which are flagged upstream) and note/part topic joins.
  B. the course's own verified anchors — union of official codes over anchored
     notes + question parts sharing the same (sectionSlug, topicSlug).

Rules:
  1. GEOGRAPHY BUG FIX: hub cards/parts carry parsed-spec ids
     (IGCSE_GEOGRAPHY:S3.042) while the spine codes are 4GE1-S3.042 —
     deterministic prefix-swap, every target verified in the spine set
     (fail-closed: any unmapped ref aborts that file).
  2. CARD-LEVEL WIRING (precise): empty card + upstream coded join ->
     specPointCode/Ids = official codes (sorted); smeSpecPointIds = the
     card's upstream spcpt_* ids (coded via_spcpt + pending, verbatim).
  3. TOPIC-LEVEL WIRING (user directive: topic -> subtopic -> spec-point):
     still-empty card -> union of (A)-topic codes and (B)-topic codes.
     specPointCode = codes[0], specPointIds = sorted codes,
     smeSpecPointIds stays [] (honest: no upstream SME anchor exists).
  4. Cards with no derivable target stay untouched and are listed.

Only cards that are FULLY empty (no specPointCode, no specPointIds, no
smeSpecPointIds) are wiring candidates. Already-anchored cards are never
touched except by the geography prefix fix. Notes and their JSON formatting
(byte-compact, per-file trailing newline) are preserved.
"""
import json, os, sys, collections

HUB = "/home/z/my-project/work/syllabai-v2/apps/hub/content"
UP = "/home/z/my-project/work/upstream-snap/spec-links"
RECEIPT = "/home/z/my-project/work/wire_receipt.json"

EXCLUDED_TIERS = {"S2_name_ambiguous", "T4_fuzzy"}  # flagged upstream — never authoritative

def load(p):
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)

def dump_bytes(obj, had_nl):
    return (json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + ("\n" if had_nl else "")).encode("utf-8")

def card_anchor_fields(c):
    ids = c.get("specPointIds") or []
    code = c.get("specPointCode")
    sme = c.get("smeSpecPointIds") or []
    return bool(code or ids or sme)

def official_codes_of_card(c, spine):
    out = set()
    if isinstance(c.get("specPointCode"), str) and c["specPointCode"].strip():
        out.add(c["specPointCode"])
    for v in c.get("specPointIds") or []:
        out.add(v)
    return {x for x in out if x in spine}

def official_codes_of_part(p, spine):
    out = set()
    for f in ("specPointIds", "specPointCodes"):
        for v in p.get(f) or []:
            if v in spine:
                out.add(v)
    return out

def main():
    only = sys.argv[1:] or None
    receipt = {"courses": {}, "rules": [
        "geography prefix-swap (verified targets only)",
        "card-level upstream joins (tiers excl S2_name_ambiguous/T4_fuzzy)",
        "topic-union: hub sibling anchors + upstream note/part authoritative joins",
        "fail-closed: cards without a derivable target stay untouched"],
        "excluded_tiers": sorted(EXCLUDED_TIERS)}

    courses = sorted(d for d in os.listdir(HUB)
                     if os.path.isdir(os.path.join(HUB, d))
                     and os.path.exists(os.path.join(HUB, d, "curriculum.json")))
    edexcel = [c for c in courses if not c.startswith("cie-")]
    if only:
        edexcel = [c for c in edexcel if c in only]

    for course in edexcel:
        base = os.path.join(HUB, course)
        cur = load(os.path.join(base, "curriculum.json"))
        spine = {n["code"] for n in cur.get("nodes", []) if n.get("family") == "SPEC_POINT"}
        rec = {"cards_fixed_idspace": 0, "parts_fixed_idspace": 0,
               "wired_card_join": 0, "wired_topic": 0, "left_empty": 0,
               "left_empty_ids": [], "code_set_sizes": collections.Counter(),
               "dangling_after": 0}

        # ---------- topic code maps ----------
        topic_codes = collections.defaultdict(set)  # (section, topic) -> official codes
        for n in load(os.path.join(base, "notes.json")):
            cs = set()
            for f in ("specPointIds", "specPointCodes"):
                cs |= {v for v in (n.get(f) or []) if v in spine}
            if cs:
                topic_codes[(n.get("sectionSlug"), n.get("topicSlug"))] |= cs
        for s in load(os.path.join(base, "questions.json")):
            key = (s.get("sectionSlug"), s.get("topicSlug"))
            for q in s.get("questions", []):
                for p in q.get("parts", []):
                    cs = official_codes_of_part(p, spine)
                    if cs:
                        topic_codes[key] |= cs

        # upstream authoritative note/part topic codes (ALL topics)
        up_items = {}
        up_topic = collections.defaultdict(set)
        up_path = os.path.join(UP, course + ".json")
        if os.path.exists(up_path):
            up_items = load(up_path).get("items", {})
            for v in up_items.values():
                if v.get("kind") not in ("note", "question_part"):
                    continue
                key = (v.get("section"), v.get("topic"))
                cs = {e.get("official_code") or e.get("official_id")
                      for e in v.get("codes") or []
                      if e.get("tier") not in EXCLUDED_TIERS}
                cs = {c for c in cs if c and c in spine}
                if cs:
                    up_topic[key] = up_topic.get(key, set()) | cs

        # ---------- geography id-space fix ----------
        is_geo = course == "igcse-geography-19"
        if is_geo:
            for fname, kind in (("flashcards.json", "card"), ("questions.json", "part")):
                path = os.path.join(base, fname)
                raw = open(path, "rb").read()
                had_nl = raw.endswith(b"\n")
                data = json.loads(raw)
                nfix = 0
                if kind == "card":
                    for c in data:
                        for f in ("specPointCode", "specPointIds", "smeSpecPointIds"):
                            if f == "specPointCode" and isinstance(c.get(f), str) and c[f].startswith("IGCSE_GEOGRAPHY:"):
                                tgt = "4GE1-" + c[f].split(":", 1)[1]
                                assert tgt in spine, f"unmapped {c[f]}"
                                c[f] = tgt; nfix += 1
                            elif f in ("specPointIds", "smeSpecPointIds") and isinstance(c.get(f), list):
                                nv = []
                                changed = False
                                for v in c[f]:
                                    if isinstance(v, str) and v.startswith("IGCSE_GEOGRAPHY:"):
                                        tgt = "4GE1-" + v.split(":", 1)[1]
                                        assert tgt in spine, f"unmapped {v}"
                                        nv.append(tgt); changed = True
                                    else:
                                        nv.append(v)
                                if changed:
                                    c[f] = nv; nfix += 1
                else:
                    for s in data:
                        for q in s.get("questions", []):
                            for p in q.get("parts", []):
                                for f in ("specPointCode", "specPointIds", "specPointCodes", "smeSpecPointIds"):
                                    if f == "specPointCode" and isinstance(p.get(f), str) and p[f].startswith("IGCSE_GEOGRAPHY:"):
                                        tgt = "4GE1-" + p[f].split(":", 1)[1]
                                        assert tgt in spine, f"unmapped {p[f]}"
                                        p[f] = tgt; nfix += 1
                                    elif f in ("specPointIds", "specPointCodes", "smeSpecPointIds") and isinstance(p.get(f), list):
                                        nv = []
                                        changed = False
                                        for v in p[f]:
                                            if isinstance(v, str) and v.startswith("IGCSE_GEOGRAPHY:"):
                                                tgt = "4GE1-" + v.split(":", 1)[1]
                                                assert tgt in spine, f"unmapped {v}"
                                                nv.append(tgt); changed = True
                                            else:
                                                nv.append(v)
                                        if changed:
                                            p[f] = nv; nfix += 1
                if nfix:
                    open(path, "wb").write(dump_bytes(data, had_nl))
                if kind == "card":
                    rec["cards_fixed_idspace"] = nfix
                else:
                    rec["parts_fixed_idspace"] = nfix

        # re-load flashcards (possibly fixed above)
        fpath = os.path.join(base, "flashcards.json")
        raw = open(fpath, "rb").read()
        had_nl = raw.endswith(b"\n")
        cards = json.loads(raw)

        # ---------- wiring ----------
        for c in cards:
            if card_anchor_fields(c):
                continue
            cid = c["id"]
            entry = up_items.get(cid)
            codes_card = set()
            spcpt = set()
            if entry and entry.get("kind") == "flashcard":
                codes_card = {e.get("official_code") or e.get("official_id")
                              for e in entry.get("codes") or []
                              if e.get("tier") not in EXCLUDED_TIERS}
                codes_card = {x for x in codes_card if x and x in spine}
                spcpt = {e.get("via_spcpt") for e in entry.get("codes") or [] if e.get("via_spcpt")}
                spcpt |= set(entry.get("pending") or [])
                spcpt = {x for x in spcpt if x}
            if codes_card:
                ordered = sorted(codes_card)
                c["specPointCode"] = ordered[0]
                c["specPointIds"] = ordered
                c["smeSpecPointIds"] = sorted(spcpt) if spcpt else []
                rec["wired_card_join"] += 1
                rec["code_set_sizes"][len(ordered)] += 1
                continue
            key = (c.get("sectionSlug"), c.get("topicSlug"))
            codes_topic = topic_codes.get(key, set()) | up_topic.get(key, set())
            if codes_topic:
                ordered = sorted(codes_topic)
                c["specPointCode"] = ordered[0]
                c["specPointIds"] = ordered
                # honest: no upstream SME anchor exists for these cards
                c["smeSpecPointIds"] = c.get("smeSpecPointIds") or []
                rec["wired_topic"] += 1
                rec["code_set_sizes"][len(ordered)] += 1
            else:
                rec["left_empty"] += 1
                rec["left_empty_ids"].append({"id": cid, "course": course,
                                              "topicSlug": c.get("topicSlug")})

        # dangling after (self-check)
        for c in cards:
            for v in (c.get("specPointIds") or []) + ([c["specPointCode"]] if isinstance(c.get("specPointCode"), str) and c["specPointCode"] else []):
                if not str(v).startswith("spcpt_") and v not in spine:
                    rec["dangling_after"] += 1

        open(fpath, "wb").write(dump_bytes(cards, had_nl))
        rec["code_set_sizes"] = dict(sorted(rec["code_set_sizes"].items()))
        receipt["courses"][course] = rec

    with open(RECEIPT, "w") as fh:
        json.dump(receipt, fh, indent=1, default=str)
    tot = collections.Counter()
    for c, r in receipt["courses"].items():
        for k in ("cards_fixed_idspace", "parts_fixed_idspace", "wired_card_join", "wired_topic", "left_empty", "dangling_after"):
            tot[k] += r[k]
    print("GLOBAL:", dict(tot))
    for c, r in receipt["courses"].items():
        if r["wired_card_join"] or r["wired_topic"] or r["left_empty"] or r["cards_fixed_idspace"]:
            print(f"{c:58s} idfix {r['cards_fixed_idspace']:5d}/{r['parts_fixed_idspace']:5d} "
                  f"card-join {r['wired_card_join']:5d} topic {r['wired_topic']:5d} left {r['left_empty']:4d} dang {r['dangling_after']}")

if __name__ == "__main__":
    main()
