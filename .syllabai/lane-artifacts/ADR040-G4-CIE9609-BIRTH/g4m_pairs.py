#!/usr/bin/env python3
"""G-4 mirror stage 3 — pair builder + pre-ingest oracle (r1-mirror, ruling A).

Per paper of the 6-paper tranche:
  - canonical docs (r1 canonical_doc mirror; P-6 derivedDocumentId with the
    r0 identity proof asserted before any build)
  - qpDraft (stage 2) + msDraft (the single-axis entries of the verbatim
    drafts of record; multi-axis entries HELD, disclosed per entry)
  - reconciliation (the GlmReconciliation shape validateBundle pins)
  - ORACLE (fail-closed): every band grid binds a QP part with the SAME
    printed marks; band ordinals 1..n; bottom marksMin 0-or-1; top band
    marksMax == grid marks; descriptors non-blank; F-form level-less
    grids excluded loudly (none exist in the tranche)
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

import fitz

ROOT = "/home/z/my-project/g3-9609"
MS_DRAFTS = f"{ROOT}/glm-ms-drafts/9609"
QP_DRAFTS = f"{ROOT}/qp-drafts"
PAIRS = f"{ROOT}/pairs"
PP_ROOT = "past-papers/cambridge-international/ial/business/9609/past-papers"

TRANCHE = ["9609-W21-QP-11", "9609-W21-QP-12", "9609-W21-QP-13",
           "9609-S22-QP-11", "9609-S22-QP-12", "9609-S22-QP-13"]

QP_ENGINE = "textlayer-qp-adr040-g4-cie9609-r0"
MS_ENGINE = "textlayer-ms-adr040-g4-cie9609-r0"
ENGINE_VERSION = "1.0.0"
APPLICATION = "T-SM-ROLLOUT adr040-g4-cie9609-levels-birth-r0"

MULTI_AXIS_GRAMMARS = {"C1-two-axis", "C-multi-axis", "C-AO-matrix"}
SINGLE_AXIS_GRAMMARS = {"E-unlabeled", "D-prose", "B", "C2-single"}

# branch of record per file class (pastpapers repo)
URI_MS = "SyllabAI/syllabai-pastpapers@main:"           # held ms.pdf (PR #5 corpus, merged)
URI_QP = "SyllabAI/syllabai-pastpapers@t-sm-rollout/cie-wave1-qppair-r0:"  # held qp.pdf (PR #6, open)


def derived_document_id(checksum: str, engine: str, engine_version: str) -> str:
    """Byte-exact port of the P-6 mirror (content-writes.ts derivedDocumentId)."""
    def comp(v):
        return (v or "").strip().lower()
    material = "sha256:" + comp(checksum) + "|engine:" + comp(engine) + "|version:" + comp(engine_version)
    h = hashlib.sha256(material.encode("utf-8")).digest()
    b = bytearray(h[:16])
    b[6] = (b[6] & 0x0F) | 0x50
    b[8] = (b[8] & 0x3F) | 0x80
    hx = b.hex()
    return f"{hx[0:8]}-{hx[8:12]}-{hx[12:16]}-{hx[16:20]}-{hx[20:]}"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def canonical_doc(pdf_path, uri, engine, now_iso):
    checksum = sha256_file(pdf_path)
    doc_id = derived_document_id(checksum, engine, ENGINE_VERSION)
    pdf = fitz.open(pdf_path)
    text_blocks = []
    pages = []
    for i in range(pdf.page_count):
        page = pdf[i]
        text = page.get_text("text")
        text_blocks.append({
            "element_id": f"p{i + 1:03d}",
            "element_type": "TEXT_BLOCK",
            "page_number": i + 1,
            "bounding_box": None,
            "text": text,
            "reading_order": i + 1,
            "confidence": 1,
            "group_key": None,
            "heading_level": None,
            "role": None,
            "source_engine": engine,
            "source_engine_version": ENGINE_VERSION,
        })
        pages.append({"pageNumber": i + 1, "width": float(page.rect.width), "height": float(page.rect.height)})
    n = pdf.page_count
    pdf.close()
    return {
        "schemaVersion": "1.0",
        "version": 1,
        "documentId": doc_id,
        "pageCount": n,
        "source": {
            "uri": uri,
            "checksum": checksum,
            "checksumAlgorithm": "SHA-256",
            "mimeType": "application/pdf",
            "fileName": uri.rsplit("/", 1)[-1],
        },
        "provenance": {
            "engine": engine,
            "engineVersion": ENGINE_VERSION,
            "extractedAt": now_iso,
            "extractionParams": None,
            "application": APPLICATION,
            "schemaVersion": "1.0",
        },
        "retrieval": None,
        "textBlocks": text_blocks,
        "tables": [],
        "equations": [],
        "figures": [],
        "pages": pages,
        "sections": None,
    }


def build_pair(stem, now_iso):
    code = stem.split("-QP-")[0].replace("9609-", "")   # W21 / S22
    session = {"W21": "2021-11", "S22": "2022-06"}[code]  # drafts-of-record session dir
    ms_draft_of = json.load(open(f"{MS_DRAFTS}/{session}/{stem}/ms.draft.json"))
    qp_pdf = f"{ROOT}/qp-holdings/{stem}__qp.pdf"
    ms_pdf = f"{ROOT}/pp-holdings/{stem}__ms.pdf"
    qp_draft = json.load(open(f"{QP_DRAFTS}/{stem}.qp.json"))

    qp_can = canonical_doc(qp_pdf, f"{URI_QP}{PP_ROOT}/{session}/{stem}/qp.pdf", QP_ENGINE, now_iso)
    ms_can = canonical_doc(ms_pdf, f"{URI_MS}{PP_ROOT}/{session}/{stem}/ms.pdf", MS_ENGINE, now_iso)
    qp_draft["paper"]["canonicalDocumentId"] = qp_can["documentId"]

    # ── msDraft: single-axis entries only; multi-axis held, disclosed ──
    entries = ms_draft_of["entries"]
    birth_entries = []
    held = []
    for e in entries:
        g = e.get("bandGrammar")
        if e.get("bands"):
            birth_entries.append(e)
        elif e.get("bandRows"):
            held.append(f"held multi-axis grid {e['label']} grammar={g} levels={len(e['bandRows'])} "
                        f"axes={[a['name'] for a in e.get('axes', [])]} (per-axis cells verbatim in the "
                        f"drafts of record; mark_bands schema holds one range per level — per-axis lane pending)")
        else:
            held.append(f"held band-less entry {e['label']} grammar={g} (no bands/bandRows)")

    ms_draft = {
        "schemaVersion": "glm-ocr-ms-v1+adr040-g3-cie9609-r1",
        "extractionMethod": ms_draft_of["extractionMethod"],
        "reviewRequired": ms_draft_of["reviewRequired"],
        "paper": {
            "board": "Cambridge International",
            "qualification": None,
            "subject": None,
            "paperReference": f"9609/{stem.split('-QP-')[1]}",
            "logNumber": None,
            "publicationCode": None,
            "session": qp_draft["paper"]["session"],
            "examDate": None,
            "duration": None,
            "canonicalDocumentId": ms_can["documentId"],
        },
        "entries": birth_entries,
        "questionTotals": qp_draft["questionTotals"],
        "paperTotal": qp_draft["paperTotal"],
        "icTable": None,
        "figureRefs": None,
        "warnings": [
            "paperTotal is the QP-cover printed total (CIE MS covers carry no printed paper total)",
            f"the drafts of record carry {len(entries)} entries; this bridge carries the "
            f"{len(birth_entries)} single-axis LEVELS grids only — {len(held)} entries held:",
        ] + held,
    }

    # ── ORACLE (ruling A, fail-closed) ──
    report = []
    if not birth_entries:
        raise SystemExit(f"FAIL-CLOSED [{stem}]: no single-axis band grids in the birth tranche")
    for g in birth_entries:
        m = re.match(r"^(\d+)\(([a-z]+)\)$", g["label"])
        if not m:
            raise SystemExit(f"FAIL-CLOSED [{stem}]: unparseable grid ref {g['label']}")
        qn, plabel = int(m.group(1)), m.group(2)
        q = next((q for q in qp_draft["questions"] if q["number"] == qn), None)
        if q is None:
            raise SystemExit(f"FAIL-CLOSED [{stem}]: grid {g['label']} has no QP question {qn}")
        p = next((p for p in q["parts"] if p["label"] == plabel), None)
        if p is None:
            raise SystemExit(f"FAIL-CLOSED [{stem}]: grid {g['label']} has no QP part '{plabel}' "
                             f"(parts: {[x['label'] for x in q['parts']]})")
        if p["marks"] != g["marks"]:
            raise SystemExit(f"FAIL-CLOSED [{stem}]: grid {g['label']} top {g['marks']} != QP part marks "
                             f"{p['marks']} (ruling-A tiling law)")
        bands = sorted(g["bands"], key=lambda b: b["level"])
        if [b["level"] for b in bands] != list(range(1, len(bands) + 1)):
            raise SystemExit(f"FAIL-CLOSED [{stem}]: grid {g['label']} band ordinals not 1..n")
        for b in bands:
            if b["marksMin"] is None or b["marksMax"] is None or not (b["descriptor"] or "").strip():
                raise SystemExit(f"FAIL-CLOSED [{stem}]: grid {g['label']} level {b['level']} incomplete")
        if bands[0]["marksMin"] not in (0, 1):
            raise SystemExit(f"FAIL-CLOSED [{stem}]: grid {g['label']} bottom marksMin {bands[0]['marksMin']} not 0-or-1")
        if bands[-1]["marksMax"] != g["marks"]:
            raise SystemExit(f"FAIL-CLOSED [{stem}]: grid {g['label']} top band max {bands[-1]['marksMax']} != entry marks")
        report.append(f"{g['label']}: QP {p['marks']} == grid top {g['marks']} ({len(bands)} bands) OK")

    reconciliation = {
        "findings": [],
        "qpPaperTotal": qp_draft["paperTotal"],
        "msPaperTotal": ms_draft["paperTotal"],
        "paperTotalConflict": False,
        "mismatchCount": 0,
    }

    pair = {
        "qpCanonical": qp_can,
        "msCanonical": ms_can,
        "qpDraft": qp_draft,
        "msDraft": ms_draft,
        "reconciliation": reconciliation,
        "meta": {
            "key": stem,
            "session": qp_draft["paper"]["session"],
            "session_source": "qp cover printed series",
            "paper_reference": f"9609/{stem.split('-QP-')[1]}",
            "qp_uri": qp_can["source"]["uri"],
            "ms_uri": ms_can["source"]["uri"],
            "qp_sha256": qp_can["source"]["checksum"],
            "ms_sha256": ms_can["source"]["checksum"],
            "oracle": report,
            "held_entries": held,
            "ms_staged_of_record": f"{MS_DRAFTS}/{session}/{stem}/ms.draft.json",
        },
    }
    return pair


def main():
    os.makedirs(PAIRS, exist_ok=True)
    now_iso = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    # identity proof of the documentId derivation against the r0 row of record
    proof = derived_document_id(
        "f59c113cdb75458dc9a5f8a4021a62597591b8c7b29caf223489faabb261bf5e",
        "textlayer-qp-adr040-g4-r0", "1.0.0")
    assert proof == "052aa749-461a-55fd-ba99-89de1302a9b8", f"derivation proof failed: {proof}"
    print(f"documentId derivation proof vs r0 of record: {proof} OK")

    total_grids = 0
    for stem in TRANCHE:
        pair = build_pair(stem, now_iso)
        out = f"{PAIRS}/pair-{stem}.json"
        with open(out, "w") as f:
            json.dump(pair, f, ensure_ascii=False, indent=1)
        grids = len(pair["msDraft"]["entries"])
        bands = sum(len(e["bands"]) for e in pair["msDraft"]["entries"])
        total_grids += grids
        print(f"== {stem}: session={pair['meta']['session']!r} grids={grids} bands={bands} "
              f"held={len(pair['meta']['held_entries'])}")
        for r in pair["meta"]["oracle"]:
            print("   OK", r)
    print(f"\n{len(TRANCHE)} pairs written -> {PAIRS} | total LEVELS grids to birth: {total_grids}")


if __name__ == "__main__":
    main()
