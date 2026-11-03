#!/usr/bin/env python3
"""census_guard.py — DISC-6 standing guard for SME question banks (v2 serving plane).

Mandate (run-012 DISC-6, ledger scripts/oeq_phys_run012/ledger.json in
SyllabAI/syllabai-resources): ANY rebuild of a content question bank
(build_bundles.py output, or any post-build stack re-application) MUST re-run
this census guard and land it exit-0 BEFORE the rebuilt bank is committed or
shipped, and the guard JSON receipt MUST be pasted into the run's receipt
verification block.

What it detects — the T-CONSUME-EDX-2 collapse signature: a part's md field
carrying a SIBLING part's md content within the same question. The EDX-2
clean-segment grafts (v1 pass, 2026-10-21) keyed its clean-source pool per
QUESTION instead of per PART, so every grafted field received the question's
LAST part's content (22 fields / 20 parts / 17 questions corrupted in
igcse-physics-19; repaired by the run-012 wave-C serving leg, v2 PR #675).

Exit codes: 0 = clean (or only allowlisted findings), 1 = findings, 2 = usage.

Usage:
  python3 census_guard.py                          # scan worktree apps/hub/content
  python3 census_guard.py --content-dir <dir>      # explicit bank root
  python3 census_guard.py --git-rev HEAD           # scan a commit without checkout
  python3 census_guard.py --course igcse-physics-19
  python3 census_guard.py --json receipt.json --serialization-check

Stdlib only; deterministic; no network (git mode shells out to `git show`).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

MD_KINDS = ("problemMd", "solutionMd")


class BankSource:
    """Reads bank files either from a worktree dir or from a git rev."""

    def __init__(self, content_dir: str | None, git_rev: str | None, repo: Path):
        self.content_dir = content_dir.rstrip("/") if content_dir else None
        self.git_rev = git_rev
        self.repo = repo

    def list_banks(self) -> list[str]:
        if self.git_rev:
            out = subprocess.run(
                ["git", "-C", str(self.repo), "ls-tree", "-r", "--name-only", self.git_rev,
                 "apps/hub/content"],
                capture_output=True, text=True, check=True).stdout
            return [l.strip() for l in out.splitlines() if l.strip().endswith("questions.json")]
        root = Path(self.content_dir or "apps/hub/content")
        return sorted(str(p) for p in root.rglob("questions.json"))

    def read(self, path: str) -> bytes:
        if self.git_rev:
            r = subprocess.run(
                ["git", "-C", str(self.repo), "show", f"{self.git_rev}:{path}"],
                capture_output=True, check=True)
            return r.stdout
        return (Path(self.content_dir or "apps/hub/content") / _rel(path)).read_bytes()


def _rel(path: str) -> str:
    # filesystem mode paths come from rglob under the root; git mode paths are repo-relative
    root = "apps/hub/content"
    return path.split(root + "/", 1)[1] if root + "/" in path else path


def iter_questions(bank: dict):
    """Yield (topic_key, question) defensively across known bank shapes."""
    if not isinstance(bank, list):
        return
    for block in bank:
        if not isinstance(block, dict):
            continue
        key = block.get("topicSlug") or block.get("slug") or block.get("topicId") or "?"
        qs = block.get("questions")
        if isinstance(qs, list):
            for q in qs:
                if isinstance(q, dict) and isinstance(q.get("parts"), list):
                    yield key, q


def scan_bank(path: str, raw: bytes, serialization_check: bool) -> dict:
    rep: dict = {"file": path, "sha256": hashlib.sha256(raw).hexdigest(),
                 "questions": 0, "md_fields": 0, "findings": [], "errors": [],
                 "serialization_ok": None}
    try:
        bank = json.loads(raw.decode("utf-8"))
    except Exception as e:  # noqa: BLE001 - guard must never crash on content
        rep["errors"].append(f"json parse failed: {e}")
        return rep
    if serialization_check:
        canon = json.dumps(bank, indent=1, ensure_ascii=False).encode("utf-8")
        rep["serialization_ok"] = (canon == raw)
    for topic, q in iter_questions(bank):
        rep["questions"] += 1
        parts = q.get("parts") or []
        qid = q.get("id") or "?"
        for kind in MD_KINDS:
            seen: dict[str, list[int]] = {}
            for i, p in enumerate(parts):
                if not isinstance(p, dict):
                    continue
                val = p.get(kind)
                if not isinstance(val, str) or not val.strip():
                    continue
                seen.setdefault(val, []).append(i)
            last = len(parts) - 1
            last_val = parts[last].get(kind) if isinstance(parts[last], dict) else None
            for val, idxs in seen.items():
                if len(idxs) < 2:
                    continue
                holders = [i for i in idxs if i != last]
                for i in holders:
                    pa = parts[i]
                    rep["findings"].append({
                        "class": "collapse_signature" if val == last_val else "sibling_copy",
                        "course_file": path,
                        "topic": topic,
                        "question_id": qid,
                        "kind": kind,
                        "holder_pid": pa.get("id"), "holder_order": pa.get("order", i),
                        "shared_with": [{"pid": (parts[j].get("id") if isinstance(parts[j], dict) else None),
                                         "order": (parts[j].get("order", j) if isinstance(parts[j], dict) else j)}
                                        for j in idxs if j != i],
                        "value_sha256": hashlib.sha256(val.encode("utf-8")).hexdigest(),
                        "value_len": len(val),
                    })
    # md_fields total: recount properly (the loop above only counts duplicated groups)
    total = 0
    for topic, q in iter_questions(bank):
        for p in q.get("parts") or []:
            if isinstance(p, dict):
                for kind in MD_KINDS:
                    if isinstance(p.get(kind), str) and p.get(kind).strip():
                        total += 1
    rep["md_fields"] = total
    return rep


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="DISC-6 census guard for SME question banks")
    ap.add_argument("--content-dir", default=None)
    ap.add_argument("--git-rev", default=None, help="scan banks at a git rev (no checkout)")
    ap.add_argument("--repo", default=".", help="repo root for --git-rev mode")
    ap.add_argument("--course", default=None, help="restrict to one course slug substring")
    ap.add_argument("--json", dest="json_out", default=None, help="write the guard receipt JSON")
    ap.add_argument("--allowlist", default=None, help="JSON list of {question_id,kind,value_sha256} to accept")
    ap.add_argument("--serialization-check", action="store_true",
                    help="also verify the T1 serialization law (indent=1, ensure_ascii=False, no trailing newline)")
    args = ap.parse_args(argv)
    if bool(args.content_dir) == bool(args.git_rev):
        print("census_guard: exactly one of --content-dir / --git-rev is required", file=sys.stderr)
        return 2

    allow = []
    if args.allowlist:
        allow = json.loads(Path(args.allowlist).read_text())

    src = BankSource(args.content_dir, args.git_rev, Path(args.repo))
    rev_full = None
    if args.git_rev:
        rev_full = subprocess.run(["git", "-C", str(args.repo), "rev-parse", args.git_rev],
                                  capture_output=True, text=True, check=True).stdout.strip()
    banks = src.list_banks()
    if args.course:
        banks = [b for b in banks if args.course in b]
    if not banks:
        print("census_guard: no questions.json banks found", file=sys.stderr)
        return 2

    reports = []
    for path in banks:
        raw = src.read(path)
        rep = scan_bank(path, raw, args.serialization_check)
        rep["findings"] = [f for f in rep["findings"] if not any(
            f["question_id"] == a.get("question_id") and f["kind"] == a.get("kind")
            and f["value_sha256"] == a.get("value_sha256") for a in allow)]
        reports.append(rep)

    findings = [f for r in reports for f in r["findings"]]
    receipt = {
        "guard": "census_guard.py (DISC-6 standing guard)",
        "mode": {"git_rev": args.git_rev, "git_rev_full": rev_full,
                 "content_dir": args.content_dir, "course": args.course},
        "banks_scanned": len(reports),
        "questions_scanned": sum(r["questions"] for r in reports),
        "md_fields_scanned": sum(r["md_fields"] for r in reports),
        "serialization": ({r["file"]: r["serialization_ok"] for r in reports if r["serialization_ok"] is not None}
                          if args.serialization_check else "skipped"),
        "errors": [{"file": r["file"], "error": e} for r in reports for e in r["errors"]],
        "findings": findings,
        "verdict": "CLEAN" if not findings and not receipt_errors(reports) else "RED",
    }
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(receipt, indent=1, ensure_ascii=False))
    print(f"census_guard: {receipt['verdict']} — {receipt['banks_scanned']} banks, "
          f"{receipt['questions_scanned']} questions, {receipt['md_fields_scanned']} md fields, "
          f"{len(findings)} finding(s)")
    for f in findings[:40]:
        print(f"  [{f['class']}] {f['course_file']} {f['question_id']} {f['kind']} "
              f"holder={f['holder_pid']}(#{f['holder_order']}) source={f['source_pid']}(#{f['source_order']})")
    if receipt["errors"]:
        for e in receipt["errors"]:
            print(f"  [error] {e['file']}: {e['error']}")
    return 0 if receipt["verdict"] == "CLEAN" else 1


def receipt_errors(reports: list[dict]) -> list:
    return [e for r in reports for e in r["errors"]]


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
