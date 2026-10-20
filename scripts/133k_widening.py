#!/usr/bin/env python3
"""
T-MIG-133 band 133k run-004 — the widened LO-box matcher (span sweep) and
the promotion set of record.

ROOT CAUSE (established by runs 001-003 + OCR ground truth):
the printed LO box is TWO-COLUMN; the of-record docling v3 parse typed the
right-column box bullets (and some repeat instances) as body/exam_hint/
key_point chunks. The of-record join consumed ONLY content_type ==
learning_objectives, so those bullets never matched — 39 spine codes of
182 are uncovered (35 of them carried by notes = the live join's orphans).

WIDENING LAW (additive-only, deterministic, evidence-first):
  per chapter, the WIDENED LO CORPUS = included chunks of the chapter whose
  content_type == learning_objectives OR whose pdf pages intersect the
  chapter's LO pages of record (the pages that carry a learning_objectives
  chunk). The of-record exclusion laws (front_matter/index/divider groups)
  stay untouched.
  For each spine code: best contiguous token span of the corpus stream with
  span_len <= official_len * 1.8 + 8; promotion when containment >= 0.90
  (tier "2", method "widened") — the official wording physically present
  in the chapter's LO-box corpus modulo bounded glue.
  Of-record refs are NEVER touched (regression guard: the 145 live refs
  must remain byte-identical; promotions land only for uncovered codes).

Every promotion carries span provenance (chunk id, span text) for the
operator audit. Read-only on every plane.
"""

import json
import re
import sys
import types
from pathlib import Path

BASE = Path("/home/z/my-project")
REPO = BASE / "upstream" / "syllabai-v2"
RES = BASE / "upstream" / "resources" / "books/pearson-edexcel/international-gcse/chemistry/4ch1"
SPINE_YAML = REPO / "apps/api/src/services/teacher/concept-graph/specification_points.yaml"
PARSE_V3 = RES / "parsed/edexcel_igcse_chemistry_chunks_v3.jsonl"
LIVE_TMP = Path("/tmp/chapters.json")
NOTES_JSON = REPO / "apps/hub/content/igcse-chemistry-19/notes.json"
OUT = BASE / "download/133k_widening_run004.json"

sys.path.insert(0, str(BASE / "scripts"))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("census", str(BASE / "scripts/133k_census.py"))
cm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cm)

src = (BASE / "scripts/133k_diagnose.py").read_text().split("def main()")[0]
dmod = types.ModuleType("diag")
exec(src, dmod.__dict__)

SPINE = cm.load_spine(SPINE_YAML)
for i, s in enumerate(SPINE):
    s["globalOrder"] = i
ROWS = [json.loads(l) for l in PARSE_V3.read_text().splitlines() if l.strip()]

EXCLUDED_TYPES = {"index", "front_matter"}


def is_excluded_group(title: str) -> bool:
    t = (title or "").lower()
    return "divider and chapter map" in t or t.startswith("front matter") or t == "divider"


def norm(s: str) -> str:
    """Sweep-only normalization v2: the of-record fold + the letter-digit
    boundary split (spine OCR glue '7in' vs book '7 in'; ion sub/superscripts
    'NH4+' vs 'NH 4'). Applied ONLY inside this sweep — the of-record join
    and the spine YAML stay byte-frozen."""
    n = dmod.normalize_statement(s)
    n = re.sub(r"([a-z])(\d)", r"\1 \2", n)
    n = re.sub(r"(\d)([a-z])", r"\1 \2", n)
    return re.sub(r"\s+", " ", n).strip()


def build_chapters():
    included = []
    for r in ROWS:
        if r["content_type"] in EXCLUDED_TYPES:
            continue
        if r["chapter_no"] is None and is_excluded_group(r["chapter_title"]):
            continue
        included.append(r)
    chapters = {}
    for r in included:
        if r["chapter_no"] is None:
            continue
        key = f"u{r['unit_no']}:c{r['chapter_no']}"
        chapters.setdefault(key, []).append(r)
    out = {}
    for key, bucket in chapters.items():
        lo_pages = set()
        for r in bucket:
            if r["content_type"] == "learning_objectives":
                lo_pages.update(range(r["pdf_pages"][0], r["pdf_pages"][1] + 1))
        corpus = []
        for r in bucket:
            pages = set(range(r["pdf_pages"][0], r["pdf_pages"][1] + 1))
            if r["content_type"] == "learning_objectives" or (pages & lo_pages):
                corpus.append(r)
        corpus.sort(key=lambda r: (r["pdf_pages"][0], r["id"]))
        out[key] = {"loPages": sorted(lo_pages), "corpus": corpus}
    return out


def corpus_stream(corpus):
    """token stream with provenance; tokens in chunk order."""
    tokens = []  # (token, chunkId)
    for r in corpus:
        n = norm(r["text"])
        for t in n.split():
            tokens.append((t, r["id"]))
    return tokens


def best_span(tokens, official_tokens, slack_bound=None):
    """best contiguous span containment of official tokens; span len bound.
    Engine semantics: containment = (# official token OCCURRENCES, duplicates
    counted, found in the window's token SET) / len(official array)."""
    T = list(official_tokens)
    L = len(T)
    tset = set(T)
    mult = {}
    for t in T:
        mult[t] = mult.get(t, 0) + 1
    n = len(tokens)
    best = {"cOff": 0.0, "start": -1, "end": -1}
    max_len = int(L * 1.8 + 8)
    for i in range(n):
        if tokens[i][0] not in tset:
            continue
        seen = set()
        shared = 0
        hi = min(n, i + max_len)
        for j in range(i, hi):
            tok = tokens[j][0]
            if tok in tset and tok not in seen:
                seen.add(tok)
                shared += mult[tok]
            c = shared / L
            if c > best["cOff"]:
                best = {"cOff": c, "start": i, "end": j + 1}
                if c == 1.0:
                    return best
    return best


def main():
    chapters = build_chapters()
    live = json.loads(LIVE_TMP.read_text())
    live_by_key = {c["chapterKey"]: c for c in live}
    covered = set()
    for c in live:
        for r in c["specCodes"]:
            covered.add(r["spineCode"])
    uncovered = [sp["code"] for sp in SPINE if sp["code"] not in covered]

    def chapter_order(key: str):
        m = re.match(r"u(\d+):c(\d+)", key)
        return (int(m.group(1)), int(m.group(2)))

    # global best-wins: collect candidates across ALL chapters, rank per code
    cands = {}  # code -> list of candidate promotions
    for key in sorted(chapters, key=chapter_order):
        ch = chapters[key]
        toks = corpus_stream(ch["corpus"])
        chunk_bounds = {}
        stream_order = []  # chunk ids in stream order (for the contiguity law)
        idx = 0
        for r in ch["corpus"]:
            cnt = len(norm(r["text"]).split())
            if cnt:
                pages = set(range(r["pdf_pages"][0], r["pdf_pages"][1] + 1))
                chunk_bounds[r["id"]] = {
                    "a": idx, "b": idx + cnt, "pages": pages,
                    "isLoPage": bool(pages & set(ch["loPages"])),
                    "ctype": r["content_type"], "page0": r["pdf_pages"][0],
                    "pageEnd": r["pdf_pages"][1],
                }
                stream_order.append(r["id"])
                idx += cnt

        def page_contiguous(span_chunks: list) -> bool:
            """multi-chunk spans must not cross excised book pages: the chunk
            sequence (stream order) must be page-adjacent in the book."""
            for a, b in zip(span_chunks, span_chunks[1:]):
                if chunk_bounds[b]["page0"] > chunk_bounds[a]["pageEnd"] + 1:
                    return False
            return True

        # candidate space 1: raw token-stream spans
        for code in uncovered:
            sp = next(s for s in SPINE if s["code"] == code)
            T = norm(sp["wording"]).split()
            if not T:
                continue
            best = best_span(toks, T, None)
            if best["cOff"] < 0.9 or best["start"] < 0:
                continue
            crossing = [cid for cid, cb in chunk_bounds.items()
                        if cb["a"] < best["end"] and best["start"] < cb["b"]]
            crossing.sort(key=lambda cid: chunk_bounds[cid]["a"])
            all_lo_page = all(chunk_bounds[cid]["isLoPage"] for cid in crossing)
            contiguous = page_contiguous(crossing)
            s_chunk = crossing[0] if crossing else None
            e_chunk = crossing[-1] if crossing else None
            span_text = " ".join(t[0] for t in toks[best["start"]:best["end"]])
            cands.setdefault(code, []).append({
                "chapterKey": key,
                "spineCode": code,
                "officialCode": sp["official_code"],
                "officialId": code,
                "tier": "2",
                "score": round(best["cOff"], 4),
                "method": "widened",
                "lineage": f"widen:{s_chunk}#{best['start']}",
                "evidence": {
                    "spanChunks": [s_chunk, e_chunk],
                    "spanTokens": best["end"] - best["start"],
                    "officialTokens": len(T),
                    "spanText": span_text[:400],
                    "wording": sp["wording"],
                    "loPages": ch["loPages"],
                    "allChunksOnLoPages": all_lo_page,
                    "pageContiguous": contiguous,
                    "chunkTypes": sorted({chunk_bounds[cid]["ctype"] for cid in crossing}),
                },
            })

        # candidate space 2: the engine's own bullet fold, per corpus chunk
        # (recovers compounds whose items the box prints as sub-bullets but
        # whose stem/item distance in the raw stream exceeds the span cap)
        for r in ch["corpus"]:
            for b in dmod.split_bullets(r["text"]):
                if dmod.CAPTION_PREFIX.match(b["text"]):
                    continue
                bn = norm(b["matchText"])
                if not bn:
                    continue
                bt = set(bn.split())
                for code in uncovered:
                    sp = next(s for s in SPINE if s["code"] == code)
                    T = norm(sp["wording"]).split()
                    if not T:
                        continue
                    shared = sum(1 for t in T if t in bt)
                    c = shared / len(T)
                    if c >= 0.9:
                        cands.setdefault(code, []).append({
                            "chapterKey": key,
                            "spineCode": code,
                            "officialCode": sp["official_code"],
                            "officialId": code,
                            "tier": "2",
                            "score": round(c, 4),
                            "method": "widened",
                            "lineage": f"widen:{r['id']}#b{b['index']}",
                            "evidence": {
                                "spanChunks": [r["id"], r["id"]],
                                "spanTokens": len(bn.split()),
                                "officialTokens": len(T),
                                "spanText": bn[:400],
                                "wording": sp["wording"],
                                "loPages": ch["loPages"],
                                "allChunksOnLoPages": True,
                                "pageContiguous": True,
                                "chunkTypes": [r["content_type"]],
                            },
                        })

    # rank per code: score desc, span len asc, validity flags, chapter order
    promotions = []
    disclosures = []
    for code, lst in cands.items():
        lst.sort(key=lambda p: (
            -p["score"],
            p["evidence"]["spanTokens"],
            0 if p["evidence"]["allChunksOnLoPages"] else 1,
            0 if p["evidence"]["pageContiguous"] else 1,
            chapter_order(p["chapterKey"]),
        ))
        top = lst[0]
        if top["evidence"]["allChunksOnLoPages"] and top["evidence"]["pageContiguous"]:
            promotions.append(top)
        else:
            disclosures.append({
                "code": code, "disposition": "invalid-span",
                "reason": "best candidate crosses excised pages or non-LO-page chunks",
                "bestScore": top["score"], "evidence": top["evidence"],
            })
    promotions.sort(key=lambda p: (chapter_order(p["chapterKey"]), p["spineCode"]))

    # disclosures for codes with NO valid candidate: best near-miss evidence
    promoted_codes = {p["spineCode"] for p in promotions}
    for code in uncovered:
        if code in promoted_codes or any(d["code"] == code for d in disclosures):
            continue
        sp = next(s for s in SPINE if s["code"] == code)
        best_all = {"score": 0.0, "where": None}
        for key in chapters:
            ch = chapters[key]
            toks = corpus_stream(ch["corpus"])
            T = norm(sp["wording"]).split()
            if not T:
                continue
            best = best_span(toks, T, None)
            if best["cOff"] > best_all["score"] and best["start"] >= 0:
                best_all = {
                    "score": round(best["cOff"], 4),
                    "where": {"chapterKey": key,
                              "spanText": " ".join(t[0] for t in toks[best["start"]:best["end"]])[:220]},
                }
        disposition = "below-floor" if best_all["score"] >= 0.75 else "no-trace"
        disclosures.append({
            "code": code, "disposition": disposition,
            "reason": ("best LO-corpus containment below the 0.90 promotion floor"
                       if disposition == "below-floor"
                       else "no LO-corpus span reaches the 0.75 evidence floor — honest-absent"),
            "bestScore": best_all["score"], "evidence": best_all["where"],
            "wording": sp["wording"],
        })
    disclosures.sort(key=lambda d: d["code"])

    # regression guard: promotions must be additive only
    promoted_codes = {p["spineCode"] for p in promotions}
    guard = {
        "promotions": len(promotions),
        "allWereUncovered": promoted_codes.issubset(set(uncovered)),
        "chaptersAffected": sorted({p["chapterKey"] for p in promotions}, key=chapter_order),
    }

    # per-code audit table
    audit = [
        {
            "code": p["spineCode"],
            "chapter": p["chapterKey"],
            "score": p["score"],
            "wording": p["evidence"]["wording"],
            "spanText": p["evidence"]["spanText"],
            "spanChunks": p["evidence"]["spanChunks"],
        }
        for p in promotions
    ]

    # post-widening notes census
    notes = json.loads(NOTES_JSON.read_text())
    if isinstance(notes, dict):
        notes = notes.get("notes") or notes.get("rows") or []
    new_covered = covered | promoted_codes
    orphans_after = 0
    for n in notes:
        codes = n.get("specPointCodes") or []
        if codes and not (set(codes) & new_covered):
            orphans_after += 1

    # uncovered after widening
    uncovered_after = sorted(set(uncovered) - promoted_codes)

    result = {
        "band": "T-MIG-133 band 133k run-004 — widened LO-box matcher (span sweep)",
        "date": "2026-10-20",
        "law": {
            "corpus": "chapter LO chunks + included chunks intersecting the chapter's LO pages of record",
            "match": "best contiguous token span, span_len <= official_len*1.8+8",
            "promote": "containment >= 0.90, tier 2, method widened, additive-only",
            "regression": "the of-record 145 refs stay byte-identical; no covered code touched",
        },
        "guard": guard,
        "censusBefore": {"uncovered": len(uncovered), "covered": len(covered), "spine": len(SPINE)},
        "censusAfter": {
            "uncovered": len(uncovered_after),
            "uncoveredCodes": uncovered_after,
            "promoted": len(promoted_codes),
            "orphanNotesBefore": 25,
            "orphanNotesAfter": orphans_after,
        },
        "promotions": promotions,
        "audit": audit,
        "disclosures": disclosures,
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    print(f"artifact: {OUT}")
    print(f"promotions: {len(promotions)} across {len(guard['chaptersAffected'])} chapters "
          f"(additive-only: {guard['allWereUncovered']})")
    print(f"uncovered: {len(uncovered)} -> {len(uncovered_after)}")
    print(f"orphanNotes: 25 -> {orphans_after}")
    for p in promotions:
        print(f"  {p['chapterKey']:7s} {p['spineCode']:12s} {p['score']:.3f} {p['evidence']['spanChunks']}")


if __name__ == "__main__":
    main()
