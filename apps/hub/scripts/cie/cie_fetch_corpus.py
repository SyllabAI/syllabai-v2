#!/usr/bin/env python3
"""Phase 2 fetcher: CIE corpus text data at a pinned resources sha, zero clone.

Fetches per bank slug (44, from the Phase-0 join matrix):
  SME-RevisionNotes/<slug>/manifest.json + notes/**/*.md
  SME-ExamQuestion/<slug>/spec_point_index.json + **/topic.json
  SME-Flashcards/<slug>/**/deck.json
  Official-Specifications/<spec>/spec.json (33 unique)

Cache-aware (skip existing with correct size), resumable across invocations,
pinned-sha raw URLs, threaded. Never prints the token.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

CACHE = os.environ.get("CIE_CACHE", "/home/z/my-project/work/cie-corpus-cache")
PIN_FALLBACK = "0fe5f77210f74aaeb3f6c491dfe0263d12db738c"  # resolved live at step 0
# repo-relative: the Phase-0 roster manifest receipt (works from any clone depth)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
MANIFEST = os.environ.get("CIE_PHASE0_MANIFEST", os.path.join(REPO, ".syllabai", "receipts", "CIE-INTEGRATION", "cie-phase0-roster-manifest-r0.json"))
DEADLINE = float(os.environ.get("P2_FETCH_DEADLINE", "0"))  # epoch secs; 0 = run to completion


def token():
    """GH_TOKEN env first, else an existing clone's remote config (runtime-only)."""
    t = os.environ.get("GH_TOKEN", "")
    if t:
        return t
    src = os.environ.get("CIE_TOKEN_CLONE", "/home/z/my-project/work/syllabai-v2")
    r = subprocess.run(["git", "-C", src, "config", "--get", "remote.origin.url"],
                       capture_output=True, text=True)
    m = re.match(r"^https?://(?:[^/@]+:)?([^@/]+)@github\.com/", (r.stdout or "").strip())
    if not m:
        sys.exit("token parse failed")
    return m.group(1)


TOK = token()
PIN = {"sha": None}


def api(path):
    req = urllib.request.Request("https://api.github.com" + path,
                                 headers={"Authorization": "token " + TOK,
                                          "Accept": "application/vnd.github+json",
                                          "User-Agent": "superz-cie-p2-fetch"})
    last = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
            time.sleep(6 + 4 * attempt)
        except Exception as e:
            last = e
            time.sleep(4 + 2 * attempt)
    raise RuntimeError(f"api failed: {path}: {last}")


def fetch_raw(rel, size=None):
    dest = os.path.join(CACHE, rel)
    if os.path.exists(dest) and (size is None or os.path.getsize(dest) == size):
        return "cached"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    url = f"https://raw.githubusercontent.com/SyllabAI/syllabai-resources/{PIN['sha']}/{urllib.request.quote(rel)}"
    req = urllib.request.Request(url, headers={"Authorization": "token " + TOK,
                                               "User-Agent": "superz-cie-p2-fetch"})
    last = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            tmp = dest + ".tmp"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, dest)
            return "fetched"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return "404"
            last = e
            time.sleep(5 + 3 * attempt)
        except Exception as e:
            last = e
            time.sleep(4 + 2 * attempt)
    raise RuntimeError(f"raw failed: {rel}: {last}")


def subtree_files(prefix):
    """Recursive blob list [(relpath, size)] under prefix at the pinned sha."""
    t = api(f"/repos/SyllabAI/syllabai-resources/git/trees/{PIN['sha']}%3A{urllib.request.quote(prefix, safe='')}?recursive=1")
    if not t or "tree" not in t:
        return None
    return [(e["path"], e.get("size", 0)) for e in t["tree"] if e["type"] == "blob" and not e["path"].startswith("assets/")]


def main():
    os.makedirs(CACHE, exist_ok=True)
    tip = api("/repos/SyllabAI/syllabai-resources/commits/main")
    PIN["sha"] = tip["sha"]
    print("RESOURCES PIN:", PIN["sha"], tip["commit"]["committer"]["date"], flush=True)

    rows = json.load(open(MANIFEST))["deliverable1_bankSpecJoin"]["matrix"]
    banks = {r["slug"]: r for r in rows}
    specs = {r["spec"] for r in rows}
    print(f"banks={len(banks)} specs={len(specs)}", flush=True)

    # ---- pin-diff vs the Phase-1 pin a4ce9f5: do the CIE-relevant subtrees move?
    OLD = "a4ce9f5559990a97950355d8f4cc85d30a796301"
    drift = {}
    for sub in ["Official-Specifications/parsed", "SME-ExamQuestion", "SME-RevisionNotes", "SME-Flashcards"]:
        new_t = api(f"/repos/SyllabAI/syllabai-resources/git/trees/{PIN['sha']}%3A{urllib.request.quote(sub, safe='')}")
        old_t = api(f"/repos/SyllabAI/syllabai-resources/git/trees/{OLD}%3A{urllib.request.quote(sub, safe='')}")
        ns = new_t.get("sha") if new_t else "MISSING"
        os_ = old_t.get("sha") if old_t else "MISSING"
        drift[sub] = "SAME" if ns == os_ else f"MOVED {os_} -> {ns}"
    print("PIN_DIFF vs a4ce9f5:", json.dumps(drift, indent=1), flush=True)
    json.dump({"pin": PIN["sha"], "diffVsPhase1Pin": drift},
              open(os.path.join(CACHE, "_pin.json"), "w"), indent=1)

    # ---- build the fetch list ------------------------------------------------
    jobs = []  # (rel, size)
    for slug in sorted(banks):
        rn = subtree_files(f"SME-RevisionNotes/{slug}")
        if rn:
            for p, s in rn:
                if p == "manifest.json" or (p.startswith("notes/") and p.endswith(".md")):
                    jobs.append((f"SME-RevisionNotes/{slug}/{p}", s))
        eq = subtree_files(f"SME-ExamQuestion/{slug}")
        if eq:
            for p, s in eq:
                if p == "spec_point_index.json" or p.endswith("/topic.json"):
                    jobs.append((f"SME-ExamQuestion/{slug}/{p}", s))
        fc = subtree_files(f"SME-Flashcards/{slug}")
        if fc:
            for p, s in fc:
                if p.endswith("/deck.json"):
                    jobs.append((f"SME-Flashcards/{slug}/{p}", s))
    for spec in sorted(specs):
        jobs.append((f"Official-Specifications/{spec}/spec.json", None))

    print(f"fetch jobs: {len(jobs)}", flush=True)
    json.dump(sorted(j[0] for j in jobs), open(os.path.join(CACHE, "_jobs.json"), "w"), indent=1)

    done = {"fetched": 0, "cached": 0, "404": 0}
    errors = []
    t0 = time.time()

    def work(job):
        rel, size = job
        r = fetch_raw(rel, size if size else None)
        return r, rel

    with ThreadPoolExecutor(max_workers=18) as ex:
        futs = {ex.submit(work, j): j for j in jobs}
        for fut in as_completed(futs):
            try:
                r, rel = fut.result()
                done[r] = done.get(r, 0) + 1
                if r == "404":
                    print("MISSING:", rel, flush=True)
            except Exception as e:
                errors.append((futs[fut][0], str(e)[:200]))
            if DEADLINE and time.time() > DEADLINE:
                print("DEADLINE reached — resumable; rerun to continue", flush=True)
                for f in futs:
                    f.cancel()
                break

    n_cache = sum(1 for j in jobs if os.path.exists(os.path.join(CACHE, j[0])))
    print(f"progress: {n_cache}/{len(jobs)} files cached | this run: {json.dumps(done)} | errors: {len(errors)}", flush=True)
    for rel, e in errors[:10]:
        print("ERR:", rel, e, flush=True)
    if errors:
        json.dump(errors, open(os.path.join(CACHE, "_errors.json"), "w"), indent=1)
    if n_cache == len(jobs):
        print("FETCH_COMPLETE", flush=True)


if __name__ == "__main__":
    main()
