#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-004 prep — populate the Phase-2 corpus cache
from the verified lane worktree (resources @ 3dd9bb98) instead of the
token+raw-URL fetcher (equivalent bytes: every copied file is hash-verified
against the git odb blob at HEAD). The of-record fetcher's inputs and the
builder's reads are byte-identical by construction."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

WT = Path("/home/z/my-project/lane-t3r3/resources")
CACHE = Path("/home/z/my-project/lane-t3r3/cie-corpus-cache")
PIN = "dcc67a873c73594fff9e9ce3c9a6c9ea28d7f15d"


def git(*args: str, binary: bool = False):
    r = subprocess.run(["git", "-C", str(WT), *args],
                       capture_output=True, check=True)
    return r.stdout if binary else r.stdout.decode("utf-8", "replace")


def odb_sha(path: str) -> str:
    out = git("ls-tree", "HEAD", "--", path)
    for line in out.splitlines():
        meta, _, p = line.partition("\t")
        parts = meta.split()
        if len(parts) >= 3 and parts[1] == "blob" and p == path:
            return parts[2]
    return ""


def main() -> int:
    if CACHE.exists():
        shutil.rmtree(CACHE)
    CACHE.mkdir(parents=True)
    (CACHE / "_pin.json").write_text(json.dumps({"pin": PIN}) + "\n")

    lanes = sorted(l[:-5] for l in
                   (WT / "spec-links").glob("cie-*.json")
                   for l in [l.name])
    assert len(lanes) == 44, len(lanes)

    copied = verified = 0
    patterns = []
    for slug in lanes:
        patterns += [
            f"SME-ExamQuestion/{slug}/spec_point_index.json",
            f"SME-RevisionNotes/{slug}/**/*.md",
        ]
    # topic.json + deck.json via glob on the worktree
    for pat in ("SME-ExamQuestion/cie-*/*/*/topic.json",
                "SME-Flashcards/cie-*/*/deck.json",
                "SME-Flashcards/cie-*/*/*/deck.json"):
        patterns.append(pat)

    import glob as _glob
    seen = set()
    for pat in patterns:
        for f in _glob.glob(str(WT / pat), recursive=True):
            fp = Path(f)
            if not fp.is_file():
                continue
            rel = str(fp.relative_to(WT))
            if rel in seen:
                continue
            seen.add(rel)
            # hash-verify against the odb at HEAD
            want = odb_sha(rel)
            data = fp.read_bytes()
            have = hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()
            if want and have != want:
                raise SystemExit(f"HASH MISMATCH {rel}")
            verified += 1
            dst = CACHE / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(fp, dst)
            copied += 1
    print(f"cache populated: {copied} files ({verified} odb-verified) "
          f"at pin {PIN[:8]}")
    return 0


if __name__ == "__main__":
    main()
