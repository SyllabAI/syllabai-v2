#!/usr/bin/env python3
"""
T-MIG-133 band 133k run-002 — LO-box widening DIAGNOSIS (read-only).

Stage A: verbatim port of the of-record join engine (spine-join.ts +
toc.ts LO assembly) to Python; must reproduce the of-record 145 refs
across 29 chapters EXACTLY (else the port is wrong — fail loudly).

Stage B: for each of the 39 uncovered spine codes (census run-001),
a containment scan across widening-relevant search spaces:
  S1  per-chapter of-record LO text (the join's own input)
  S2  each LO chunk individually (chunk-boundary fragmentation check)
  S3  ALL included chapter chunks (body/other types — LO-box content the
      docling parser may have mistyped)
  S4  the full 1234-row parse (incl. law-excluded front_matter/index/
      divider rows — hits here are DISCLOSE-ONLY, out of ingest scope)

Stage C: the 133b receipt's 31 review-lane bullets re-matched against the
spine at widened thresholds (who points at an uncovered code?).

Output: download/133k_diagnose_run002.json — the evidence file the
widened-matcher design will cite per code. Zero writes on any plane.
"""

import json
import re
import unicodedata
from pathlib import Path

BASE = Path("/home/z/my-project")
REPO = BASE / "upstream" / "syllabai-v2"
RES = BASE / "upstream" / "resources" / "books/pearson-edexcel/international-gcse/chemistry/4ch1"
SPINE_YAML = REPO / "apps/api/src/services/teacher/concept-graph/specification_points.yaml"
PARSE_V3 = RES / "parsed/edexcel_igcse_chemistry_chunks_v3.jsonl"
RECEIPT_133B = REPO / ".syllabai/receipts/T-MIG-133/band-133b-prod-apply-run-001-r0.json"
CENSUS = BASE / "download/133k_census_run001.json"
OUT = BASE / "download/133k_diagnose_run002.json"

sys_path = str(BASE / "scripts")
if sys_path not in __import__("sys").path:
    __import__("sys").path.append(sys_path)
from importlib import import_module  # noqa: E402

# ── port of spine-join.ts ─────────────────────────────────────────────────────


def normalize_statement(s: str) -> str:
    s = s.replace("\u2010", "-").replace("\u2011", "-").replace("\u2012", "-") \
         .replace("\u2013", "-").replace("\u2014", "-").replace("\u2015", "-")
    s = s.replace("\u2018", "'").replace("\u2019", "'")
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return s.strip()


TOP_LEVEL_VERBS = [
    "understand", "recall", "describe", "explain", "be able", "state",
    "write", "draw", "plot", "calculate", "compare", "investigate", "use",
    "know", "practical", "suggest", "discuss", "evaluate", "carry out",
]

CAPTION_PREFIX = re.compile(r"^(figure|table|photo|photograph|graph|chart)\b", re.I)


def split_bullets(lo_text: str):
    pieces = [re.sub(r"\s+", " ", p).strip() for p in lo_text.split("•")]
    pieces = [p for p in pieces if p and p.lower() != "learning objectives"]
    bullets = []  # each: {index, text, subs, matchText}
    current = None
    for piece in pieces:
        first_upper = bool(piece) and piece[0].isupper()
        lowered = piece.lower()
        starts_verb = any(lowered.startswith(v) for v in TOP_LEVEL_VERBS)
        if current is not None and not (first_upper or starts_verb):
            current["subs"].append(piece)
            current["matchText"] = current["matchText"] + " " + piece
        else:
            current = {"index": len(bullets) + 1, "text": piece, "subs": [], "matchText": piece}
            bullets.append(current)
    return bullets


def containment(official_tokens, bullet_tokens: set) -> float:
    if not official_tokens:
        return 0.0
    return sum(1 for t in official_tokens if t in bullet_tokens) / len(official_tokens)


def match_bullet_vs_spine(bullet_match_text: str, spine):
    """Widened scan: return ALL spine points with cOff (sorted), not just the
    of-record tiers — for diagnosis. Mirrors matchBullet tier math when
    filtered to the of-record thresholds. cBul is ARRAY-based (the TS law:
    containment(bulletTokenArray, officialSet) counts duplicate tokens)."""
    bn = normalize_statement(bullet_match_text)
    if bn == "":
        return []
    bt = set(bn.split(" "))
    bn_tokens = bn.split(" ")
    out = []
    for sp in spine:
        on = normalize_statement(sp["wording"])
        if on == "":
            continue
        ot = on.split(" ")
        c_off = containment(ot, bt)
        c_bul = containment(bn_tokens, set(ot)) if ot else 0.0
        if bn == on:
            tier, score = 1, 1.0
        elif (c_off >= 0.9 and c_bul >= 0.5) or (c_off >= 1.0 and len(ot) >= 6):
            tier, score = 2, c_off
        elif c_off >= 0.75 and c_bul >= 0.35:
            tier, score = 3, c_off
        else:
            tier, score = None, c_off
        out.append({"code": sp["code"], "tier": tier, "cOff": round(c_off, 4),
                    "cBul": round(c_bul, 4)})
    out.sort(key=lambda x: (-x["cOff"], x["code"]))
    return out


def join_chapter_lo(lo_text: str, spine):
    """Port of joinChapterLearningObjectives — returns refs (spineCode, tier,
    method, bullet index) + review bullets, using the of-record tier law."""
    all_bullets = split_bullets(lo_text)
    bullets = [b for b in all_bullets if not CAPTION_PREFIX.match(b["text"])]
    dropped = len(all_bullets) - len(bullets)
    by_spine = {}
    seen = set()
    review = []
    matched = 0
    for b in bullets:
        key = normalize_statement(b["matchText"])
        if key in seen:
            continue
        seen.add(key)
        bn = normalize_statement(b["matchText"])
        if bn == "":
            continue
        bt = set(bn.split(" "))
        bn_tokens = bn.split(" ")
        best_tier, best_score, best_point = 10**9, 0.0, None
        for sp in spine:
            on = normalize_statement(sp["wording"])
            if on == "":
                continue
            ot = on.split(" ")
            c_off = containment(ot, bt)
            c_bul = containment(bn_tokens, set(ot))
            if bn == on:
                tier, score = 1, 1.0
            elif (c_off >= 0.9 and c_bul >= 0.5) or (c_off >= 1.0 and len(ot) >= 6):
                tier, score = 2, c_off
            elif c_off >= 0.75 and c_bul >= 0.35:
                tier, score = 3, c_off
            else:
                continue
            better = (
                tier < best_tier
                or (tier == best_tier and score > best_score)
                or (tier == best_tier and score == best_score and best_point is not None
                    and sp["globalOrder"] < best_point["globalOrder"])
            )
            if better:
                best_tier, best_score, best_point = tier, score, sp
        if best_point is None:
            review.append({"index": b["index"], "text": b["text"][:200]})
            continue
        matched += 1
        method = {1: "verbatim", 2: "normalized", 3: "fuzzy"}[best_tier]
        prev = by_spine.get(best_point["code"])
        rank = {"verbatim": 0, "normalized": 1, "fuzzy": 2}
        if prev is None or (rank[method], -best_score) < (rank[prev["method"]], -prev["score"]):
            by_spine[best_point["code"]] = {
                "spineCode": best_point["code"], "method": method,
                "score": round(best_score, 4), "b": b["index"],
            }
    refs = sorted(by_spine.values(), key=lambda r: official_order(r["spineCode"]))
    return {"refs": refs, "matchedBullets": matched, "droppedCaptions": dropped, "review": review}


def official_order(code: str):
    m = re.match(r"4CH1-(\d+)\.(\d+)(C?)", code)
    return (int(m.group(1)), int(m.group(2)), 0 if m.group(3) == "" else 1)


def load_spine():
    """Reuse the census loader (same fold law)."""
    mod = import_module("133k_census")
    return mod.load_spine(SPINE_YAML)


def main():
    sys = __import__("sys")
    sys.setrecursionlimit(10000)
    spine = load_spine()
    for i, sp in enumerate(spine):
        sp["globalOrder"] = i
    assert len(spine) == 182

    rows = [json.loads(l) for l in PARSE_V3.read_text().splitlines() if l.strip()]
    assert len(rows) == 1234

    # ── Stage A: replicate deriveToc LO assembly + the join ──────────────────
    EXCLUDED_TYPES = {"index", "front_matter"}
    included = []
    excluded_groups = 0
    for r in rows:
        if r["content_type"] in EXCLUDED_TYPES:
            continue
        if r["chapter_no"] is None:
            t = (r["chapter_title"] or "").lower()
            if "divider and chapter map" in t or t.startswith("front matter") or t == "divider":
                excluded_groups += 1
                continue
        included.append(r)

    chapter_rows = {}
    for r in included:
        if r["chapter_no"] is None:
            continue
        key = f"u{r['unit_no']}:c{r['chapter_no']}"
        chapter_rows.setdefault(key, []).append(r)

    def page_span(bucket):
        vals = [tuple(r["pdf_pages"]) for r in bucket]
        return [min(v[0] for v in vals), max(v[1] for v in vals)]

    chapters = {}
    for key, bucket in chapter_rows.items():
        lo_chunks = sorted(
            (r for r in bucket if r["content_type"] == "learning_objectives"),
            key=lambda r: (r["pdf_pages"][0], r["id"]),
        )
        lo_text = "\n\n".join(r["text"] for r in lo_chunks) if lo_chunks else None
        if lo_text is not None:
            lo_text = re.sub(r"\n{3,}", "\n\n", lo_text).strip()
        chapters[key] = {
            "loText": lo_text,
            "loChunkIds": [r["id"] for r in lo_chunks],
            "pdfPages": page_span(bucket),
            "allChunks": bucket,
        }

    # run the of-record join and compare to the 133b receipt
    receipt = json.loads(RECEIPT_133B.read_text())
    receipt_by_key = {c["key"]: c for c in receipt["toc"]["chapters"]}
    stageA = {"chapters": {}, "refsTotal": 0, "mismatches": []}
    for key, ch in sorted(chapters.items()):
        joined = join_chapter_lo(ch["loText"] or "", spine)
        stageA["chapters"][key] = {
            "refs": len(joined["refs"]),
            "matchedBullets": joined["matchedBullets"],
            "droppedCaptions": joined["droppedCaptions"],
            "review": len(joined["review"]),
            "refCodes": [r["spineCode"] for r in joined["refs"]],
        }
        stageA["refsTotal"] += len(joined["refs"])
        rc = receipt_by_key.get(key)
        if rc is None:
            stageA["mismatches"].append({"key": key, "issue": "missing in receipt"})
            continue
        want = [r["spineCode"] for r in rc["refs"]]
        got = [r["spineCode"] for r in joined["refs"]]
        if want != got:
            stageA["mismatches"].append({"key": key, "receipt": want, "port": got})
        if rc["matchedBullets"] != joined["matchedBullets"] or len(rc["review"]) != len(joined["review"]):
            stageA["mismatches"].append({
                "key": key, "issue": "counts",
                "receipt": {"matchedBullets": rc["matchedBullets"], "review": len(rc["review"])},
                "port": {"matchedBullets": joined["matchedBullets"], "review": len(joined["review"])},
            })
    print(f"Stage A: port refs={stageA['refsTotal']} (of-record 145), "
          f"mismatched chapters={len(stageA['mismatches'])}")
    for m in stageA["mismatches"]:
        print("  MISMATCH:", json.dumps(m)[:400])
    if stageA["refsTotal"] != 145 or stageA["mismatches"]:
        print("FATAL: the port does not reproduce the of-record join — aborting before Stage B")
        OUT.write_text(json.dumps({"stageA": stageA, "aborted": True}, indent=1) + "\n")
        return 1

    # ── Stage B: containment scans for the 39 uncovered codes ────────────────
    census = json.loads(CENSUS.read_text())
    uncovered = census["census"]["uncoveredCodes"]
    sp_by_code = {sp["code"]: sp for sp in spine}

    def scan(text: str):
        """Best spine hits of the 39 target codes inside one text blob."""
        hits = []
        for b in split_bullets(text):
            if CAPTION_PREFIX.match(b["text"]):
                continue
            scored = match_bullet_vs_spine(b["matchText"], spine)
            for s in scored:
                if s["code"] in uncovered_set:
                    hits.append({"bulletIndex": b["index"], "bulletText": b["text"][:160],
                                 **s, "matchTextLen": len(b["matchText"])})
                    break  # top hit for this bullet among targets
        return hits

    uncovered_set = set(uncovered)
    stageB = {}
    for code in uncovered:
        sp = sp_by_code[code]
        entry = {"wording": sp["wording"], "hits": {"S1_loText": [], "S2_loChunk": [],
                                                   "S3_chapterBody": [], "S4_anywhere": []}}
        # S1: per-chapter of-record LO text
        for key, ch in sorted(chapters.items()):
            for h in scan(ch["loText"] or ""):
                if h["code"] == code:
                    entry["hits"]["S1_loText"].append({"chapter": key, **h})
        # S2: individual LO chunks
        for key, ch in sorted(chapters.items()):
            for r in ch["allChunks"]:
                if r["content_type"] == "learning_objectives":
                    for h in scan(r["text"]):
                        if h["code"] == code:
                            entry["hits"]["S2_loChunk"].append(
                                {"chapter": key, "chunkId": r["id"], "pdfPages": r["pdf_pages"], **h})
        # S3: all included chapter chunks (body etc.)
        for key, ch in sorted(chapters.items()):
            for r in ch["allChunks"]:
                if r["content_type"] == "learning_objectives":
                    continue
                if r["chapter_no"] is None:
                    continue
                for h in scan(r["text"]):
                    if h["code"] == code:
                        entry["hits"]["S3_chapterBody"].append(
                            {"chapter": key, "chunkId": r["id"], "type": r["content_type"],
                             "pdfPages": r["pdf_pages"], **h})
        # S4: anywhere (all 1234 rows incl. law-excluded)
        for r in rows:
            if r["chapter_no"] is not None:
                continue  # chapter rows already scanned in S3 (included) — S4 covers structural rows
            for h in scan(r["text"]):
                if h["code"] == code:
                    entry["hits"]["S4_anywhere"].append(
                        {"group": r["chapter_title"], "chunkId": r["id"],
                         "type": r["content_type"], "pdfPages": r["pdf_pages"], **h})
            # also raw containment on structural rows WITHOUT bullet splitting
            # (bullet markers may be absent in prose)
        stageB[code] = entry

    # raw-substring sweep for S4 (non-bullet text: index/front_matter/divider)
    def norm(s):
        return normalize_statement(s)
    for code in uncovered:
        sp = sp_by_code[code]
        wn = norm(sp["wording"])
        toks = wn.split()
        best = []
        for r in rows:
            if r["chapter_no"] is not None:
                continue
            rn = norm(r["text"])
            if not rn:
                continue
            rset = set(rn.split())
            c = containment(toks, rset)
            if c >= 0.6:
                best.append({"group": r["chapter_title"], "chunkId": r["id"],
                             "type": r["content_type"], "cOff": round(c, 4)})
        best.sort(key=lambda x: -x["cOff"])
        stageB[code]["hits"]["S4_rawStructural"] = best[:5]

    # ── Stage C: review-lane bullets re-matched (widened thresholds) ─────────
    stageC = []
    for key, ch in sorted(chapters.items()):
        joined = join_chapter_lo(ch["loText"] or "", spine)
        for rb in joined["review"]:
            scored = match_bullet_vs_spine(
                next(b["matchText"] for b in split_bullets(ch["loText"] or "")
                     if b["index"] == rb["index"]), spine)
            stageC.append({"chapter": key, "bulletIndex": rb["index"],
                           "bulletText": rb["text"], "top": scored[:3]})

    result = {
        "band": "T-MIG-133 band 133k run-002 — LO-box widening diagnosis",
        "date": "2026-10-20",
        "stageA": {"portReproducesOfRecord": True, "refs": stageA["refsTotal"],
                   "perChapter": stageA["chapters"]},
        "stageB": stageB,
        "stageC_reviewLane": stageC,
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    print(f"artifact: {OUT}")
    # quick console digest
    for code in uncovered:
        h = stageB[code]["hits"]
        best_s1 = max((x["cOff"] for x in h["S1_loText"]), default=0)
        best_s2 = max((x["cOff"] for x in h["S2_loChunk"]), default=0)
        best_s3 = max((x["cOff"] for x in h["S3_chapterBody"]), default=0)
        best_s4 = max([x["cOff"] for x in h["S4_rawStructural"]] + [0])
        print(f"{code:12s} S1={best_s1:.2f} S2={best_s2:.2f} S3={best_s3:.2f} S4={best_s4:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
