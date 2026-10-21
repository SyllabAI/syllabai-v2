#!/usr/bin/env python3
"""T-CONSUME-EDX-2: fetch per-subtree recursive trees for SME-RevisionNotes /
SME-ExamQuestion / SME-Flashcards from SyllabAI/syllabai-resources, PINNED to the
exact commit the manifests will claim (pin-discipline law, T-CONSUME-EDX-1).

Variant of fetch_trees_21e.py with two hardening changes required by law:
  - the tree source is a PINNED commit sha (not the moving `main` ref), so the
    fetched sizes validate exactly the content the build consumes;
  - the optional token comes from the GH_TOKEN environment variable only
    (bash-inline single line; never read from / never written to disk).

Fail-closed: aborts (exit 1) if any subtree response is truncated.
"""
import json
import os
import sys
import urllib.request

GH = "https://api.github.com"
REPO = "SyllabAI/syllabai-resources"
PIN = "aa0b4de1b732738b4d02dabdd02d9ead85522907"  # T-CONSUME-EDX-2 pin of record
WORK = "/home/z/my-project/work"

SUBTREES = ["SME-RevisionNotes", "SME-ExamQuestion", "SME-Flashcards"]


def api(url):
    h = {"User-Agent": "syllabai-demo-importer"}
    tok = os.environ.get("GH_TOKEN", "")
    if tok:
        h["Authorization"] = f"token {tok}"
    req = urllib.request.Request(url, headers=h)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001 - retry then fail-closed
            if attempt == 3:
                raise
            print(f"  retry {attempt + 1} after error: {e}", flush=True)
    raise RuntimeError("unreachable")


def main() -> int:
    os.makedirs(WORK, exist_ok=True)
    root = api(f"{GH}/repos/{REPO}/git/trees/{PIN}")
    if root.get("truncated"):
        print("FATAL: root tree truncated", file=sys.stderr)
        return 1
    sha_by_name = {t["path"]: t["sha"] for t in root["tree"] if t["type"] == "tree"}
    failed = False
    for name in SUBTREES:
        if name not in sha_by_name:
            print(f"!! {name}: NOT FOUND at pin {PIN[:7]}", file=sys.stderr)
            failed = True
            continue
        d = api(f"{GH}/repos/{REPO}/git/trees/{sha_by_name[name]}?recursive=1")
        trunc = d.get("truncated", False)
        out = os.path.join(WORK, f"tree_{name}.json")
        with open(out, "w", encoding="utf8") as f:
            json.dump(d, f)
        n = len(d["tree"])
        print(f"{name} @ {PIN[:7]}: {n} entries, truncated={trunc} -> {out}", flush=True)
        if trunc:
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
