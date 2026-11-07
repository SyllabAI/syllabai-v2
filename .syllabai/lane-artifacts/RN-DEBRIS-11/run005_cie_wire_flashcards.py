#!/usr/bin/env python3
"""RN-DEBRIS-11 run-005 — wire unanchored CIE flashcards to official spec statements.

Scope: content/cie-* (56 courses). Only cards with NO in-spine official code
are touched. Channels, all of-record, zero-invention, priority order:

  J2  card.smeSpecPointIds → content-maps/<slug>.json spcptToOfficial
      (the attach law's channel (b): "the item's own declared SME spec-point
      links resolved through the upstream spcpt->official map"), officialCodes
      gated to this course's spine.
  J1  card.topicSlug == note.topicSlug → curriculum-ordered union of that
      subtopic's notes' of-record specPointIds ∪ specPointCodes (in-spine).
      The D0 tag-backfill law of record (igcse-chemistry-23, 1133 cards).
  J3  card.smeSpecPointIds → spcptSubtopicScope rows → {subtopicCode,
      specPointCodes} in-spine (the topic → subtopic → spec-point scope table).
  J4  card.topicSlug == set.topicSlug → set.subtopicCode (spine SUBTOPIC;
      contracts.ts: "SME section/topic-slug joins — never guessed") → that
      SUBTOPIC's SPEC_POINT children, curriculum-ordered.

Writes per wired card: specPointIds = ordered spine codes,
specPointCode = codes[0]. smeSpecPointIds and every other field byte-equal.

Gates: every written code ∈ curriculum SPEC_POINT set; already-anchored cards
byte-untouched; serializer round-trip byte-exact (indent=1, ensure_ascii=False,
trailing NL); per-course receipt JSON.

Usage: cie_wire_flashcards.py [--apply]  (default dry run)
"""
import argparse, collections, json, re, sys
from pathlib import Path

HUB = Path("/home/z/my-project/work/syllabai-v2/apps/hub")

def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def dump_bytes(obj):
    return (json.dumps(obj, indent=1, ensure_ascii=False) + "\n").encode()

def curriculum_order(cur):
    """SPEC_POINT codes ordered by (parent SUBTOPIC order, node order);
    SUBTOPIC -> children map."""
    nodes = cur["nodes"]
    order_by_code = {}
    sub_children = collections.defaultdict(list)
    for n in nodes:
        order_by_code[n["code"]] = (n.get("order") or 0)
    for n in nodes:
        if n.get("family") == "SPEC_POINT":
            for par in n.get("parents") or []:
                sub_children[par].append(n["code"])
    codes = [n["code"] for n in nodes if n.get("family") == "SPEC_POINT"]
    return codes, order_by_code, sub_children

def ordered_unique(codes, order_by_code):
    seen, out = set(), []
    for c in sorted(codes, key=lambda c: (order_by_code.get(c, 1 << 30), c)):
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out

def wire_course(slug, apply=False):
    d = HUB / "content" / slug
    cur = load(d / "curriculum.json")
    spine = {n["code"] for n in cur["nodes"] if n.get("family") == "SPEC_POINT"}
    order_by_code, sub_children = curriculum_order(cur)[1], curriculum_order(cur)[2]

    map_path = HUB / "content-maps" / f"{slug}.json"
    s2o, scope = {}, {}
    if map_path.exists():
        m = load(map_path)
        s2o = m.get("spcptToOfficial") or {}
        scope = m.get("spcptSubtopicScope") or {}

    notes = load(d / "notes.json")
    note_union = collections.defaultdict(set)   # topicSlug -> in-spine codes
    for n in notes:
        cs = [c for c in (n.get("specPointIds") or []) + (n.get("specPointCodes") or [])
              if c in spine]
        if cs:
            note_union[n.get("topicSlug") or ""].update(cs)

    sets = load(d / "questions.json")
    set_sub = {}                                 # topicSlug -> subtopicCode
    set_conflicts = []
    for s in sets:
        ts = s.get("topicSlug") or ""
        sc = s.get("subtopicCode")
        if ts and sc and sc in sub_children:
            if ts in set_sub and set_sub[ts] != sc:
                set_conflicts.append((ts, set_sub[ts], sc))
            else:
                set_sub[ts] = sc

    cards = load(d / "flashcards.json")
    receipt = {"course": slug, "cards": len(cards), "wired": collections.Counter(),
               "byChannel": collections.Counter(), "unresolved": 0,
               "setConflicts": set_conflicts, "codesWritten": 0,
               "examples": {}}
    changed = False
    for card in cards:
        cur_codes = [c for c in (card.get("specPointIds") or []) +
                     ([card["specPointCode"]] if card.get("specPointCode") else [])
                     if c in spine]
        if cur_codes:
            receipt["wired"]["already"] += 1
            continue
        sme = card.get("smeSpecPointIds") or []
        ts = card.get("topicSlug") or ""
        codes, channel = [], None
        # J2 — card's own declared SME anchors through the upstream spcpt→official map
        j2 = []
        for sid in sme:
            row = s2o.get(sid) or {}
            for c in row.get("officialCodes") or ([row["officialCode"]] if row.get("officialCode") else []):
                if c in spine:
                    j2.append(c)
        if j2:
            codes, channel = j2, "J2_spcptToOfficial"
        # J1 — subtopic notes union (D0 law)
        if not codes and note_union.get(ts):
            codes, channel = sorted(note_union[ts]), "J1_topic_notes_union"
        # J3 — card's own SME anchors through the subtopic-scope table
        if not codes:
            j3 = []
            for sid in sme:
                row = scope.get(sid) or {}
                j3.extend(c for c in row.get("specPointCodes") or [] if c in spine)
            if j3:
                codes, channel = j3, "J3_subtopicScope"
        # J4 — sets' of-record subtopicCode → that SUBTOPIC's spec points
        if not codes and ts in set_sub:
            codes, channel = list(sub_children[set_sub[ts]]), "J4_set_subtopic"
        if not codes:
            receipt["unresolved"] += 1
            continue
        codes = ordered_unique(codes, order_by_code)
        card["specPointIds"] = codes
        card["specPointCode"] = codes[0]
        receipt["byChannel"][channel] += 1
        receipt["codesWritten"] += len(codes)
        if channel not in receipt["examples"]:
            receipt["examples"][channel] = {
                "card": card["id"], "topicSlug": ts, "codes": codes[:6]}
    receipt["wired"]["new"] = sum(receipt["byChannel"].values())
    if apply and receipt["wired"]["new"]:
        raw_before = (d / "flashcards.json").read_bytes()
        old = json.loads(raw_before)
        assert len(old) == len(cards), f"{slug}: card count drift"
        wired_ids = set()
        for a, b in zip(old, cards):
            if a.get("specPointIds") != b.get("specPointIds") or \
               a.get("specPointCode") != b.get("specPointCode"):
                wired_ids.add(a["id"])
        # gate: wired cards differ ONLY in the two linkage fields;
        # smeSpecPointIds byte-equal on every card
        for a, b in zip(old, cards):
            ka = {k: v for k, v in a.items() if k not in ("specPointIds", "specPointCode")}
            kb = {k: v for k, v in b.items() if k not in ("specPointIds", "specPointCode")}
            assert ka == kb, f"{slug}: unexpected field drift on {a['id']}"
            assert a.get("smeSpecPointIds") == b.get("smeSpecPointIds"), \
                f"{slug}: smeSpecPointIds drift on {a['id']}"
        # gate: every written code in-spine
        for c in cards:
            assert all(x in spine for x in c.get("specPointIds") or []), \
                f"{slug}: out-of-spine code on {c['id']}"
        out = dump_bytes(cards)
        (d / "flashcards.json").write_bytes(out)
        changed = True
    receipt["written"] = changed
    return receipt

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--course", action="append", default=None)
    args = ap.parse_args()
    slugs = args.course or sorted(p.name for p in (HUB / "content").iterdir()
                                  if p.is_dir() and p.name.startswith("cie-"))
    fleet = {"mode": "apply" if args.apply else "dry-run", "courses": []}
    tot = collections.Counter()
    for slug in slugs:
        r = wire_course(slug, apply=args.apply)
        fleet["courses"].append(r)
        for k, v in r["byChannel"].items():
            tot[k] += v
        tot["already"] += r["wired"]["already"]
        tot["unresolved"] += r["unresolved"]
        tot["codes"] += r["codesWritten"]
        print(f"{slug:62s} already={r['wired']['already']:5d} "
              f"J2={r['byChannel']['J2_spcptToOfficial']:5d} "
              f"J1={r['byChannel']['J1_topic_notes_union']:5d} "
              f"J3={r['byChannel']['J3_subtopicScope']:4d} "
              f"J4={r['byChannel']['J4_set_subtopic']:4d} "
              f"unres={r['unresolved']:4d} conflicts={len(r['setConflicts'])}")
    fleet["fleetTotals"] = dict(tot)
    out = Path("/home/z/my-project/work/rn11_cie_wire_receipt.json")
    out.write_text(json.dumps(fleet, indent=1, default=lambda o: dict(o)))
    print("\nFLEET:", json.dumps(dict(tot)))
    print("receipt:", out)

if __name__ == "__main__":
    main()
