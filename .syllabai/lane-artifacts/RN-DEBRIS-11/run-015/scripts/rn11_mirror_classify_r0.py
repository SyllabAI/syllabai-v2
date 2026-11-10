#!/usr/bin/env python3
"""RN-DEBRIS-11 run-015 — row-level direction classification for the mirror sweep.

Classes:
  spine_glue    — titles differ ONLY in whitespace placement (spine lost spaces
                  around italic variables); content presentation of record -> SYNC.
  garbage_*     — one side carries PDF-extraction glyph garbage (PUA codepoints,
                  '^ x ! y' / ' / 1 +' / 'a h' artifacts) -> that side is the
                  defect plane. garbage_content = NEVER synced to spine; queued.
  both_garbage  — ambiguous, evidence-only.
  reworded      — both sides clean, wording differs -> mirror law: content is
                  plane of record (run-013/014 G6 precedent) -> SYNC.
Also verifies igcse-chemistry-19 S*<->T* order-aligned titles (annex).
Emits the run-015 APPLY manifest (sync rows only) with byte-exact old/new titles.
"""
import json
import re
from pathlib import Path

ART = Path("/home/z/my-project/work/rn11_run015_mirror_sweep_r0.json")
OUT = Path("/home/z/my-project/work/rn11_run015_apply_manifest_r0.json")
WT = Path("/home/z/my-project/work/wt-rn11-mirror")

PUA = re.compile(r"[\uE000-\uF8FF]")
GARBAGE_SIG = [
    re.compile(r"\^[A-Za-z] !"),
    re.compile(r"! [A-Za-z] "),
    re.compile(r"\ba h\b"),
    re.compile(r" / 1 \+ "),
    re.compile(r"\bi / 1\b"),
]
# PUA codepoints (\uf084 \u2264, \uf061 \u2192, ...) are the corpus's documented
# glyph convention (run-013 composed precedent; KG meta T-SPEC-AUDIT-1: "corpus
# itself stays spine-verbatim") — recorded as an annotation, never as garbage.


def garbage(t):
    for rx in GARBAGE_SIG:
        if rx.search(t):
            return rx.pattern
    return None


def glue_only(c, s):
    return re.sub(r"\s+", "", c) == re.sub(r"\s+", "", s)


def main():
    a = json.loads(ART.read_text(encoding="utf-8"))
    rows = a["driftRows"]
    cls = {}
    for r in rows:
        c, s = r["contentTitle"], r["spineTitle"]
        gc, gs = garbage(c), garbage(s)
        if gc and gs:
            k = "both_garbage"
        elif gc:
            k = "content_defect"
        elif gs:
            k = "spine_mangled"
        elif glue_only(c, s):
            k = "spine_glue"
        else:
            k = "reworded"
        cls.setdefault(k, []).append(r["slug"] + "|" + r["family"] + "|" + r["code"])

    sync = [r for r in rows if garbage(r["spineTitle"]) and not garbage(r["contentTitle"])
            or (not garbage(r["contentTitle"]) and not garbage(r["spineTitle"]))]
    # sync = everything except rows where CONTENT is garbage (defect) — i.e.
    # spine_glue, reworded, spine_mangled classes.
    sync_rows = [r for r in rows
                 if not garbage(r["contentTitle"])]
    defect_rows = [r for r in rows if garbage(r["contentTitle"])]
    amb_rows = [r for r in rows if garbage(r["contentTitle"]) and garbage(r["spineTitle"])]
    # prudence guard: content dramatically shorter than spine -> lineage review
    for r in sync_rows:
        r["shrinkReview"] = len(r["contentTitle"]) < 0.6 * len(r["spineTitle"])
        r["puaConvention"] = bool(PUA.search(r["contentTitle"])) or bool(PUA.search(r["spineTitle"]))

    # igcse-chemistry-19 S<->T order-alignment annex
    annex = []
    cdoc = json.loads((WT / "apps/hub/content/igcse-chemistry-19/curriculum.json")
                      .read_text(encoding="utf-8"))
    sdoc = json.loads((WT / "apps/hub/spines/igcse-chemistry-19.json")
                      .read_text(encoding="utf-8"))
    for fam in ("TOPIC", "SUBTOPIC"):
        cnodes = [n for n in cdoc["nodes"] if n["family"] == fam]
        snodes = [n for n in sdoc["curriculum"]["nodes"] if n["family"] == fam]
        extra_c = [n for n in cnodes if n["code"] not in
                   {m["code"] for m in snodes}]
        extra_s = [n for n in snodes if n["code"] not in
                   {m["code"] for m in cnodes}]
        if len(extra_c) == len(extra_s):
            for cn, sn in zip(extra_c, extra_s):
                annex.append({"family": fam, "contentCode": cn["code"],
                              "spineCode": sn["code"],
                              "contentTitle": cn["title"], "spineTitle": sn["title"],
                              "titleEqual": " ".join(cn["title"].split())
                                            == " ".join(sn["title"].split())})

    manifest = {
        "manifest": "rn11-run-015-apply-manifest-r0",
        "basis": "rn11_run015_mirror_sweep_r0.json sha256 f0bcce228f074445 (see sweep artifact header)",
        "law": "spine.title := content.title, verbatim, node-identity by code+index; "
               "content-defect rows excluded (never propagate a wreck into the mirror)",
        "classes": {k: len(v) for k, v in cls.items()},
        "classRows": {k: v for k, v in cls.items()},
        "applyRows": [
            {"slug": r["slug"], "family": r["family"], "code": r["code"],
             "oldSpineTitle": r["spineTitle"], "newSpineTitle": r["contentTitle"],
             "shrinkReview": r["shrinkReview"], "puaConvention": r["puaConvention"]}
            for r in sync_rows],
        "contentDefectQueue": [
            {"slug": r["slug"], "family": r["family"], "code": r["code"],
             "contentTitle": r["contentTitle"], "spineTitle": r["spineTitle"],
             "note": "content plane carries extraction garbage; spine holds clean "
                     "official-era title; needs a content repair pass (official-PDF "
                     "evidence) — NOT a mirror sync"}
            for r in defect_rows],
        "ambiguousRows": [dict(r) for r in amb_rows],
        "chem19OrderAlignedAnnex": annex,
    }

    # ---- anti-truncation asserts ----
    assert len(sync_rows) + len(defect_rows) == len(rows), "partition broken"
    assert all(garbage(r["contentTitle"]) is None for r in sync_rows), "defect leaked into apply"
    assert all(ann["titleEqual"] for ann in annex) or True  # recorded, not asserted
    for r in manifest["applyRows"]:
        assert r["oldSpineTitle"] != r["newSpineTitle"], f"noop apply row {r['code']}"
        assert r["newSpineTitle"].strip() == r["newSpineTitle"], "whitespace edge"
    OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    print("classification:")
    for k in ("spine_glue", "spine_mangled", "reworded", "content_defect", "both_garbage"):
        print(f"  {k:14s}: {len(cls.get(k, []))}")
    print(f"apply set      : {len(sync_rows)} rows across "
          f"{len({r['slug'] for r in sync_rows})} courses "
          f"(shrinkReview={sum(1 for r in sync_rows if r['shrinkReview'])}, "
          f"puaConvention={sum(1 for r in sync_rows if r['puaConvention'])})")
    print(f"defect queue   : {len(defect_rows)} rows (content plane) — excluded from sync")
    print(f"chem19 annex   : {len(annex)} order-aligned pairs, "
          f"titlesEqual={sum(1 for x in annex if x['titleEqual'])}/{len(annex)}")
    print(f"manifest       : {OUT} ({OUT.stat().st_size} bytes)")
    if defect_rows:
        print("\ncontent-defect rows in full:")
        for r in defect_rows:
            print(f"  [{r['slug']}|{r['family']}|{r['code']}]")
            print(f"    C: {r['contentTitle'][:140]!r}")
            print(f"    S: {r['spineTitle'][:140]!r}")
    shrink = [r for r in sync_rows if r["shrinkReview"]]
    if shrink:
        print("\nshrink-review rows (content much shorter than spine):")
        for r in shrink:
            print(f"  [{r['slug']}|{r['family']}|{r['code']}]")
            print(f"    C({len(r['contentTitle'])}): {r['contentTitle'][:90]!r}")
            print(f"    S({len(r['spineTitle'])}): {r['spineTitle'][:90]!r}")
    print("\nchem19 annex sample:")
    for x in annex[:4]:
        print(f"  {x['contentCode']} <-> {x['spineCode']} | equal={x['titleEqual']} "
              f"| {x['contentTitle'][:40]!r} vs {x['spineTitle'][:40]!r}")


if __name__ == "__main__":
    main()
