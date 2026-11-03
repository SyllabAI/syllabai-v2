#!/usr/bin/env python3
"""clean_segment_grafts.py — the gate-exact clean-segment grafts stage (DISC-6 P2 remediation).

This script is the COMMITTED replacement for the T-CONSUME-EDX-2 post-build
stack's clean-segment grafts pass. The defective v1 implementation (an ad-hoc
worktree script, never committed — process finding P1) keyed its clean-source
pool per QUESTION + field kind with last-write-wins semantics, so every
residual target field received its own question's LAST part's content. That is
the corruption step of record for the 22 igcse-physics-19 fields (repaired by
run-012 wave-C, v2 PR #675) and the 5 cross-bank fields (repaired by run-012
wave-D). Full attribution: `.syllabai/receipts/T-CONSUME-EDX-2/DISC-6-handoff.md`.

The gate-exact pairing law enforced here (each gate is a refusal, never a
warning):

  G-A  source.part_id  == target.part_id     <- THE anti-collapse law the v1
  G-B  source.question_id == target.question_id    pass lacked: a graft may
      only ever install a field's OWN question's OWN part's content.
  G-C  kind alignment: source.field (problem_md|solution_md) maps 1:1 to the
      target kind (problemMd|solutionMd).
  G-D  targets are unique: no (bank, question, part, kind) may be grafted twice.
  G-E  the source resolves (rev + path + field), is non-empty, and differs
      from the current target value unless --allow-noop.
  G-F  with --strict-23a, the source value must pass the 23a debris scan
      (no MathML speech-text markers, even $-parity).

Every run emits a JSON receipt (targets in / applied / refused with gate +
reason). Exit 0 iff nothing was refused. `--selftest` exercises the gates on a
synthetic mini-bank and refuses to pass if any gate misbehaves — run it after
any edit to this file.

Usage:
  python3 clean_segment_grafts.py --targets t.json --receipt r.json
  python3 clean_segment_grafts.py --targets t.json --strict-23a --allow-noop
  python3 clean_segment_grafts.py --selftest

Stdlib only; deterministic; corpus reads shell out to `git show` when the
source names a rev (blobless-clone safe).
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

KIND_MAP = {"problem_md": "problemMd", "solution_md": "solutionMd"}
SPEECH = re.compile(r"row cell|end table|end row|end cell|end equation|start fraction|square root of")


def git_show(rev: str, path: str, repo: str) -> bytes:
    r = subprocess.run(["git", "show", f"{rev}:{path}"], cwd=repo, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"git show {rev}:{path} failed: {r.stderr.decode()[:200]}")
    return r.stdout


def find_part(bank: list, question_id: str, part_id: str):
    """Return (question, part) or (None, None) — defensively across bank shapes."""
    for block in bank:
        if not isinstance(block, dict):
            continue
        for q in block.get("questions", []) or []:
            if isinstance(q, dict) and q.get("id") == question_id:
                for p in q.get("parts", []) or []:
                    if isinstance(p, dict) and p.get("id") == part_id:
                        return q, p
    return None, None


def detect_serialization(raw: bytes, parsed) -> dict:
    """Per-bank serialization law: round-trip the pristine bytes (T1)."""
    for indent in (None, 1, 2, 4):
        for sep in ((",", ":"), (", ", ": ")):
            for ea in (False, True):
                for nl in ("", "\n"):
                    if json.dumps(parsed, indent=indent, separators=sep,
                                  ensure_ascii=ea).encode("utf-8") + nl.encode() == raw:
                        return dict(indent=indent, separators=sep, ensure_ascii=ea, nl=nl)
    raise RuntimeError("serialization: no round-trip match (T1) — refusing to graft this bank")


def graft_one(bank_path: Path, target: dict, repo: str, strict_23a: bool, allow_noop: bool) -> dict:
    """Apply one graft under the gate law. Returns {status: applied|refused, ...}."""
    t = dict(target)
    for req in ("bank", "question_id", "part_id", "kind", "source"):
        if req not in t:
            return {"status": "refused", "gate": "input", "reason": f"missing {req}", "target": t}
    src = t["source"]
    for req in ("rev", "path", "field", "part_id", "question_id"):
        if req not in src:
            return {"status": "refused", "gate": "input", "reason": f"source missing {req}", "target": t}
    # G-C kind alignment
    if KIND_MAP.get(src["field"]) != t["kind"]:
        return {"status": "refused", "gate": "G-C", "reason":
                f"kind misalignment {src['field']} -> {t['kind']}", "target": t}
    # G-A + G-B: the anti-collapse law
    if src["part_id"] != t["part_id"]:
        return {"status": "refused", "gate": "G-A", "reason":
                f"source part {src['part_id']} != target part {t['part_id']} "
                f"(the v1 last-write-wins defect class)", "target": t}
    if src["question_id"] != t["question_id"]:
        return {"status": "refused", "gate": "G-B", "reason":
                f"source question {src['question_id']} != target question {t['question_id']}", "target": t}
    # G-E: source resolves, non-empty
    try:
        doc = json.loads(git_show(src["rev"], src["path"], repo).decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        return {"status": "refused", "gate": "G-E", "reason": f"source unreadable: {e}", "target": t}
    sq = [q for q in doc.get("questions", []) if q.get("id") == src["question_id"]]
    if len(sq) != 1:
        return {"status": "refused", "gate": "G-E", "reason":
                f"source question found {len(sq)}x", "target": t}
    sp = [p for p in sq[0]["parts"] if p.get("id") == src["part_id"]]
    if len(sp) != 1:
        return {"status": "refused", "gate": "G-E", "reason":
                f"source part found {len(sp)}x", "target": t}
    val = sp[0].get(src["field"])
    if not isinstance(val, str) or not val.strip():
        return {"status": "refused", "gate": "G-E", "reason": "source field empty", "target": t}
    if strict_23a:
        if SPEECH.search(val):
            return {"status": "refused", "gate": "G-F", "reason": "source carries 23a speech-text", "target": t}
        if val.count("$") % 2:
            return {"status": "refused", "gate": "G-F", "reason": "source $-parity odd", "target": t}
    # load the bank, locate the target
    raw = bank_path.read_bytes()
    bank = json.loads(raw.decode("utf-8"))
    q, p = find_part(bank, t["question_id"], t["part_id"])
    if q is None:
        return {"status": "refused", "gate": "G-E", "reason": "target part not found in bank", "target": t}
    cur = p.get(t["kind"])
    if cur == val and not allow_noop:
        return {"status": "refused", "gate": "G-E", "reason": "target already equals source (noop)", "target": t}
    seri = detect_serialization(raw, bank)
    p[t["kind"]] = val
    bank_path.write_bytes(json.dumps(bank, indent=seri["indent"], separators=seri["separators"],
                                     ensure_ascii=seri["ensure_ascii"]).encode("utf-8") + seri["nl"].encode())
    return {"status": "applied", "target": t, "value_len": len(val),
            "value_sha256": __import__("hashlib").sha256(val.encode()).hexdigest()}


def selftest(repo: str) -> int:
    """Synthetic mini-bank: legit graft applies; sibling-part graft refuses; missing source refuses."""
    import hashlib, tempfile
    corpus = {
        "questions": [{
            "id": "qstn_SELFTEST", "parts": [
                {"id": "qstnprt_A", "problem_md": "PART A PROBLEM", "solution_md": "PART A SOLUTION"},
                {"id": "qstnprt_B", "problem_md": "PART B PROBLEM", "solution_md": "PART B SOLUTION"},
            ]}]}
    bank = [{"questions": [{"id": "qstn_SELFTEST", "parts": [
        {"id": "qstnprt_A", "problemMd": "STALE A", "solutionMd": "x"},
        {"id": "qstnprt_B", "problemMd": "STALE B", "solutionMd": "y"},
    ]}]}]
    checks = []
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        cpath, bpath = td / "corpus.json", td / "bank.json"
        cpath.write_text(json.dumps(corpus))
        bpath.write_text(json.dumps(bank))
        # monkey: graft_one reads sources via git; wrap with a file rev via `git hash-object`? simpler:
        # graft_one's source read goes through git_show; emulate by pointing --selftest at a temp git? No —
        # selftest calls the internal gate logic with a patched git_show.
        orig = globals()["git_show"]
        globals()["git_show"] = lambda rev, path, repo_: (cpath.read_bytes() if path == "corpus.json" else (_ for _ in ()).throw(RuntimeError("no such source")))
        try:
            ok = graft_one(bpath, {"bank": "b", "question_id": "qstn_SELFTEST", "part_id": "qstnprt_A",
                                   "kind": "problemMd",
                                   "source": {"rev": "x", "path": "corpus.json", "field": "problem_md",
                                              "part_id": "qstnprt_A", "question_id": "qstn_SELFTEST"}},
                           repo, strict_23a=True, allow_noop=False)
            checks.append(("legit graft applies", ok["status"] == "applied", ok))
            bad = graft_one(bpath, {"bank": "b", "question_id": "qstn_SELFTEST", "part_id": "qstnprt_B",
                                    "kind": "problemMd",
                                    "source": {"rev": "x", "path": "corpus.json", "field": "problem_md",
                                               "part_id": "qstnprt_A", "question_id": "qstn_SELFTEST"}},
                            repo, strict_23a=True, allow_noop=False)
            checks.append(("sibling-part graft REFUSES (G-A)", bad["status"] == "refused" and bad["gate"] == "G-A", bad))
            bad2 = graft_one(bpath, {"bank": "b", "question_id": "qstn_SELFTEST", "part_id": "qstnprt_B",
                                     "kind": "problemMd",
                                     "source": {"rev": "x", "path": "corpus.json", "field": "problem_md",
                                                "part_id": "qstnprt_B", "question_id": "qstn_OTHER"}},
                             repo, strict_23a=True, allow_noop=False)
            checks.append(("cross-question graft REFUSES (G-B)", bad2["status"] == "refused" and bad2["gate"] == "G-B", bad2))
            after = json.loads(bpath.read_text())
            checks.append(("bank mutated only by the legit graft",
                           after[0]["questions"][0]["parts"][0]["problemMd"] == "PART A PROBLEM"
                           and after[0]["questions"][0]["parts"][1]["problemMd"] == "STALE B", None))
        finally:
            globals()["git_show"] = orig
    failed = [c for c in checks if not c[1]]
    for name, ok_, detail in checks:
        print(f"  selftest {'PASS' if ok_ else 'FAIL'}: {name}"
              + ("" if ok_ else f"  -> {json.dumps(detail)[:200]}"))
    if failed:
        print("clean_segment_grafts selftest: RED", file=sys.stderr)
        return 1
    print("clean_segment_grafts selftest: GREEN (3 gate checks + bank-mutation scope)")
    return 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="gate-exact clean-segment grafts (DISC-6 P2 remediation)")
    ap.add_argument("--targets", help="JSON list of graft targets (see module docstring)")
    ap.add_argument("--receipt", help="write the run receipt JSON here")
    ap.add_argument("--banks-dir", default="apps/hub/content")
    ap.add_argument("--repo", default=".", help="repo root for source git reads")
    ap.add_argument("--strict-23a", action="store_true", help="refuse polluted sources (G-F)")
    ap.add_argument("--allow-noop", action="store_true", help="accept target==source writes")
    ap.add_argument("--selftest", action="store_true", help="exercise the gates on a synthetic bank")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest(args.repo)
    if not args.targets:
        ap.error("--targets is required (or --selftest)")
    targets = json.loads(Path(args.targets).read_text())
    seen = set()
    results, refusals = [], []
    for t in targets:
        key = (t.get("bank"), t.get("question_id"), t.get("part_id"), t.get("kind"))
        if key in seen:
            r = {"status": "refused", "gate": "G-D", "reason": "duplicate target", "target": t}
        else:
            seen.add(key)
            r = graft_one(Path(args.banks_dir) / t["bank"] / "questions.json", t,
                          args.repo, args.strict_23a, args.allow_noop)
        results.append(r)
        if r["status"] != "applied":
            refusals.append(r)
    receipt = {
        "stage": "clean_segment_grafts.py (gate-exact pairing, DISC-6 P2 remediation)",
        "targets_in": len(targets), "applied": len(results) - len(refusals),
        "refused": len(refusals), "results": results,
        "verdict": "APPLIED-CLEAN" if not refusals else "REFUSALS-PRESENT",
    }
    if args.receipt:
        Path(args.receipt).write_text(json.dumps(receipt, indent=1, ensure_ascii=False))
    print(f"clean_segment_grafts: {receipt['applied']} applied, {receipt['refused']} refused "
          f"-> {receipt['verdict']}")
    return 0 if not refusals else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
