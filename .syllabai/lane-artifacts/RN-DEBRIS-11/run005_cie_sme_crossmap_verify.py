#!/usr/bin/env python3
"""RN-DEBRIS-11 run-005 part 3 — verify the SME-native cross-mapping among the
three imported planes (SME revision notes / exam questions / flashcards).

Checks:
  V1  sets.relatedNoteIds resolve to course notes        (fleet, in-repo)
  V2  cards.sourceNoteId vs UPSTREAM SME-Flashcards      (3 sampled courses —
      does the corpus carry card->note links at source, or is null honest?)
  V3  note inline `spcpt_*` body annotations ⊆ note.smeSpecPointIds
      (SME's own spec annotations carried into the structured field, fleet)
  V4  topic-namespace sharing: cards' topicSlug universe vs notes' and
      sets' (the planes' SME join key, fleet)
  V5  upstream input re-verification: content-maps/<slug>.json inputs
      sha256 re-fetched at the current resources tip (byte-frozen inputs)

GitHub reads use the operator PAT from work/.pat.0600 (env only, never
printed/committed).
"""
import hashlib, json, os, re, sys, time, urllib.request
from pathlib import Path

HUB = Path("/home/z/my-project/work/syllabai-v2/apps/hub")
SPCPT = re.compile(r"spcpt_[A-Za-z0-9]+")
SAMPLE_V2 = ["cie-a-level-chemistry-25", "cie-igcse-physics-23", "cie-a-level-maths-20-pure-1"]

def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def token():
    raw = Path("/home/z/my-project/work/.pat.0600").read_text().strip()
    m = re.search(r"[A-Za-z0-9_]{40,}", raw)
    if not m:
        sys.exit("no PAT found")
    return m.group(0)

TOK = token()
PIN = {"sha": None}

def api(path):
    req = urllib.request.Request("https://api.github.com" + path,
                                 headers={"Authorization": "token " + TOK,
                                          "Accept": "application/vnd.github+json",
                                          "User-Agent": "rn11-run005-verify"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 + 2 * attempt)
        except Exception:
            time.sleep(2 + 2 * attempt)
    raise RuntimeError(f"api failed: {path}")

def fetch_raw(rel):
    url = f"https://raw.githubusercontent.com/SyllabAI/syllabai-resources/{PIN['sha']}/{urllib.request.quote(rel)}"
    req = urllib.request.Request(url, headers={"Authorization": "token " + TOK,
                                               "User-Agent": "rn11-run005-verify"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 + 2 * attempt)
        except Exception:
            time.sleep(2 + 2 * attempt)
    raise RuntimeError(f"raw failed: {rel}")

def main():
    tip = api("/repos/SyllabAI/syllabai-resources/commits/main")
    PIN["sha"] = tip["sha"]
    print("resources tip:", PIN["sha"], tip["commit"]["committer"]["date"], flush=True)

    out = {"resourcesTip": PIN["sha"], "v1": {}, "v2": {}, "v3": {}, "v4": {}, "v5": {}}
    slugs = sorted(p.name for p in (HUB / "content").iterdir()
                   if p.is_dir() and p.name.startswith("cie-"))

    v1 = {"courses": 0, "links": 0, "resolved": 0}
    v3 = {"notes": 0, "withInline": 0, "inlineTokens": 0, "subset": 0, "violations": []}
    v4 = {"courses": 0, "cardTopics": 0, "inNotes": 0, "inSets": 0, "neither": 0,
          "neitherSamples": {}}
    v5 = {"courses": 0, "files": 0, "match": 0, "drift": [], "missing": []}

    for slug in slugs:
        d = HUB / "content" / slug
        try:
            notes = load(d / "notes.json")
            sets = load(d / "questions.json")
            cards = load(d / "flashcards.json")
        except FileNotFoundError:
            continue
        note_ids = {n["noteId"] for n in notes}
        # V1
        rel = [r for s in sets for r in (s.get("relatedNoteIds") or [])]
        v1["courses"] += 1
        v1["links"] += len(rel)
        v1["resolved"] += sum(1 for r in rel if r in note_ids)
        # V3 — inline spcpt tokens vs smeSpecPointIds
        for n in notes:
            v3["notes"] += 1
            toks = set(SPCPT.findall(n.get("bodyMd") or ""))
            sme = set(n.get("smeSpecPointIds") or [])
            if toks:
                v3["withInline"] += 1
                v3["inlineTokens"] += len(toks)
                if toks <= sme:
                    v3["subset"] += 1
                else:
                    v3["violations"].append({"course": slug, "noteId": n["noteId"],
                                             "outside": sorted(toks - sme)[:4]})
        # V4 — topic-namespace sharing
        card_ts = {c.get("topicSlug") or "" for c in cards}
        card_ts.discard("")
        note_ts = {n.get("topicSlug") or "" for n in notes} - {""}
        set_ts = {s.get("topicSlug") or "" for s in sets} - {""}
        if card_ts:
            v4["courses"] += 1
            v4["cardTopics"] += len(card_ts)
            inn = card_ts & note_ts
            ins = card_ts & set_ts
            v4["inNotes"] += len(inn)
            v4["inSets"] += len(ins)
            neither = card_ts - note_ts - set_ts
            v4["neither"] += len(neither)
            if neither:
                v4["neitherSamples"][slug] = sorted(neither)[:5]
        # V5 — re-fetch recorded upstream inputs, sha256 compare
        mp = HUB / "content-maps" / f"{slug}.json"
        if not mp.exists():
            continue
        m = load(mp)
        v5["courses"] += 1
        for rel, meta in (m.get("inputs") or {}).items():
            if not isinstance(meta, dict) or "sha256" not in meta:
                continue
            v5["files"] += 1
            data = fetch_raw(rel)
            if data is None:
                v5["missing"].append({"course": slug, "file": rel})
                continue
            h = hashlib.sha256(data).hexdigest()
            if h == meta["sha256"]:
                v5["match"] += 1
            else:
                v5["drift"].append({"course": slug, "file": rel,
                                    "recorded": meta["sha256"][:12], "now": h[:12]})

    # V2 — upstream ground truth for card->note links (3 sampled courses)
    for slug in SAMPLE_V2:
        tree = api(f"/repos/SyllabAI/syllabai-resources/git/trees/{PIN['sha']}%3ASME-Flashcards/{slug}?recursive=1")
        files = [(e["path"], e.get("size", 0)) for e in (tree or {}).get("tree", [])
                 if e["type"] == "blob" and not e["path"].startswith("assets/")]
        info = {"upstreamFiles": [f for f, _ in files][:8], "cards": 0,
                "noteLinkFields": {}, "sample": None}
        for rel, size in files:
            if size > 8_000_000:
                continue
            data = fetch_raw(rel)
            if not data:
                continue
            try:
                j = json.loads(data)
            except Exception:
                continue
            rows = j if isinstance(j, list) else j.get("cards") or j.get("flashcards") or []
            if not isinstance(rows, list) or not rows:
                continue
            info["cards"] += len(rows)
            keys = {}
            for r in rows:
                if isinstance(r, dict):
                    for k in r:
                        if "note" in k.lower() or "source" in k.lower() or "spec" in k.lower():
                            keys[k] = keys.get(k, 0) + 1
            info["noteLinkFields"] = keys
            info["sample"] = {k: r.get(k) for k in list(r)[:8]} if rows else None
            break
        out["v2"][slug] = info

    out["v1"] = v1
    out["v3"] = {**v3, "violations": v3["violations"][:10],
                 "violationCount": len(v3["violations"])}
    out["v4"] = v4
    out["v5"] = {**v5, "drift": v5["drift"][:20], "missing": v5["missing"][:20],
                 "driftCount": len(v5["drift"]), "missingCount": len(v5["missing"])}
    dst = Path("/home/z/my-project/work/rn11_sme_crossmap_verification.json")
    dst.write_text(json.dumps(out, indent=1))
    print(json.dumps({k: out[k] for k in ("v1", "v3", "v4", "v5")}, indent=1)[:2400])
    print("v2:", json.dumps(out["v2"], indent=1)[:1200])
    print("receipt:", dst)

if __name__ == "__main__":
    main()
