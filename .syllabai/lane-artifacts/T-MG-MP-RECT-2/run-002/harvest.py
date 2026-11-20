#!/usr/bin/env python3
"""
T-MG-MP-RECT-2 run-002 — the slice harvest.

For each paper slug of the 20-paper validation slice: fetch MG's public
paper page, parse the RSC payload (paperLabel, session, paperUrl, asset ids),
fetch the PUBLIC pdfMarking.getRegions oracle (the run-001-verified endpoint),
download the QP + MS PDFs and sha256-pin them. Everything lands sandbox-local
under /tmp/rect2-slice/<slug>/ — no third-party document bytes are committed.

Read-only GETs of public assets only (the dossier precedent; zero writes to
the target site).
"""
import hashlib
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = Path("/tmp/rect2-slice")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120"}

SLUGS = [
    # 2025 June (the run-001 paper 1f is EXCLUDED — already of record)
    "gcse-maths-2025-june-1ma1-1h",
    "gcse-maths-2025-june-1ma1-2f",
    "gcse-maths-2025-june-1ma1-2h",
    "gcse-maths-2025-june-1ma1-3f",
    "gcse-maths-2025-june-1ma1-3h",
    # 2024 November
    "gcse-edexcel-maths-2024-november-paper-1-non-calculator-1ma1-1f-b2996ca9a8",
    "gcse-edexcel-maths-2024-november-paper-1-non-calculator-1ma1-1h-29f7bf0900",
    "gcse-edexcel-maths-2024-november-paper-2-calculator-1ma1-2f-40344671f8",
    "gcse-edexcel-maths-2024-november-paper-2-calculator-1ma1-2h-ebd25eac2e",
    "gcse-edexcel-maths-2024-november-paper-3-calculator-1ma1-3f-9200be1e89",
    "gcse-edexcel-maths-2024-november-paper-3-calculator-1ma1-3h-1fbda5a1f9",
    # 2024 June
    "gcse-edexcel-maths-2024-june-paper-1-non-calculator-1ma1-1f-e818c6cdd6",
    "gcse-edexcel-maths-2024-june-paper-1-non-calculator-1ma1-1h-556256941b",
    "gcse-edexcel-maths-2024-june-paper-2-calculator-1ma1-2f-248f90e581",
    "gcse-edexcel-maths-2024-june-paper-2-calculator-1ma1-2h-47695e7fb8",
    "gcse-edexcel-maths-2024-june-paper-3-calculator-1ma1-3f-28b05751a4",
    "gcse-edexcel-maths-2024-june-paper-3-calculator-1ma1-3h-09b4be6c6a",
    # 2023 November (3 of 6 — the slice cap)
    "gcse-edexcel-maths-2023-november-paper-1-non-calculator-1ma1-1f-840cf6049c",
    "gcse-edexcel-maths-2023-november-paper-1-non-calculator-1ma1-1h-72c212fac4",
    "gcse-edexcel-maths-2023-november-paper-3-calculator-1ma1-3f-07deadaacc",
]


def get(url, timeout=60, binary=False):
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            raw = urllib.request.urlopen(req, timeout=timeout).read()
            return raw if binary else raw.decode("utf-8", errors="ignore")
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(3)


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def unescape_rsc(s: str) -> str:
    # the RSC payload embeds JSON-in-JSON (\" → " etc.)
    return s.replace('\\"', '"').replace("\\\\", "\\")


def parse_page(html: str) -> dict:
    """Pull the paper metadata out of the RSC payload."""
    out = {}
    for key in ("paperLabel", "session", "paperUrl", "markSchemeUrl", "paperAssetId", "markSchemeAssetId", "year", "board", "subject", "variant"):
        m = re.search(r'\\?"' + key + r'\\?":\\?"([^"\\]+)\\?"', html)
        if m:
            out[key] = m.group(1)
    # uuids: the paper asset id is the one preceding/near paperUrl
    uuids = re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", html)
    out["_uuids"] = sorted(set(uuids))
    return out


def fetch_oracle(asset_id: str) -> dict:
    inp = urllib.parse.quote(json.dumps(
        {"json": {"documentRef": {"type": "paper_asset", "id": asset_id, "variant": "pdf"}}},
        separators=(",", ":")))
    url = f"https://mathsgenie.co.uk/api/trpc/pdfMarking.getRegions?input={inp}"
    raw = get(url, timeout=40)
    d = json.loads(raw)
    j = d["result"]["data"]["json"]
    return j


def main():
    BASE.mkdir(exist_ok=True)
    log = []
    for slug in SLUGS:
        d = BASE / slug
        d.mkdir(exist_ok=True)
        entry = {"slug": slug}
        try:
            html = get(f"https://mathsgenie.co.uk/paper/gcse/maths/edexcel/{slug}")
            meta = parse_page(html)
            entry["meta"] = {k: v for k, v in meta.items() if not k.startswith("_")}
            qp_url = meta.get("paperUrl", "")
            ms_url = meta.get("markSchemeUrl", "")
            asset_id = meta.get("paperAssetId", "")
            if not (qp_url and ms_url and asset_id):
                # fall back: any content-hashed asset urls + the first uuid
                if not qp_url:
                    m = re.search(r'(https://[^"\\ ]*question-paper-[0-9a-f]{8}\.pdf)', html)
                    qp_url = m.group(1) if m else ""
                if not ms_url:
                    m = re.search(r'(https://[^"\\ ]*mark-scheme-[0-9a-f]{8}\.pdf)', html)
                    ms_url = m.group(1) if m else ""
                if not asset_id and meta["_uuids"]:
                    asset_id = meta["_uuids"][0]
                entry["fallback"] = True
            entry["qp_url"], entry["ms_url"], entry["asset_id"] = qp_url, ms_url, asset_id
            # PDFs (sandbox-local)
            qp_raw = get(qp_url, timeout=120, binary=True)
            (d / "qp.pdf").write_bytes(qp_raw)
            entry["qp_sha256"], entry["qp_bytes"] = sha256(qp_raw), len(qp_raw)
            ms_raw = get(ms_url, timeout=120, binary=True)
            (d / "ms.pdf").write_bytes(ms_raw)
            entry["ms_sha256"], entry["ms_bytes"] = sha256(ms_raw), len(ms_raw)
            # oracle
            oj = fetch_oracle(asset_id)
            (d / "oracle.json").write_text(json.dumps(oj, ensure_ascii=False))
            entry["oracle_regions"] = len(oj.get("regions", []))
            entry["oracle_grounding"] = oj.get("groundingComplete")
            entry["ok"] = True
        except Exception as e:
            entry["ok"] = False
            entry["error"] = f"{type(e).__name__}: {e}"[:200]
        log.append(entry)
        print(("OK  " if entry["ok"] else "FAIL"), slug,
              "| qp", entry.get("qp_bytes"), "ms", entry.get("ms_bytes"),
              "| oracle", entry.get("oracle_regions"), flush=True)
        time.sleep(1.2)
    (BASE / "harvest-log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1))
    ok = sum(1 for e in log if e["ok"])
    print(f"DONE {ok}/{len(SLUGS)}")


if __name__ == "__main__":
    sys.exit(main())
