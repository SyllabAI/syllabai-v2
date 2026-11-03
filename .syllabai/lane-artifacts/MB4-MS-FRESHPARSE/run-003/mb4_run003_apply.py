#!/usr/bin/env python3
"""run-003 apply — T-CONTENT-MB4-PBLOCK-001 (fence: ONE part, ONE token).

Eyes-on of record (2021-01 4MB1/02 ms.pdf p13, crops + coords): Q8(d) is ONE
grid row with mark cell "3" at (472.9, 41.6); the 'M2 Show either...' /
'M1 for showing...' lines are inline subdivision guidance INSIDE the Notes
cell (x0=515.4), not code-column rows. The applied solutionMd therefore must
carry the row's cell value (3) in its heading — the run-002 fold-emission
printed the leading pseudo-row's value (2) instead of the group sum.

FIX = minimal diff: '**P7** (2 marks) ' -> '**P7** (3 marks) ' on that ONE
heading line of qstnprt_44ZeXONRp3mA1ojbLLET0U. Every other byte of the file
is preserved by raw-substring surgery (no re-serialization drift).
"""
import json, hashlib, sys

BUNDLE = "/home/z/my-project/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json"
PID = "qstnprt_44ZeXONRp3mA1ojbLLET0U"
OLD_HEAD = "**P7** (2 marks) Show either by argument or calculation that 2"
NEW_HEAD = "**P7** (3 marks) Show either by argument or calculation that 2"

def jstr(s):
    return json.dumps(s, ensure_ascii=False)[1:-1]  # in-file escaped form, no quotes

def main():
    raw = open(BUNDLE, "rb").read().decode("utf-8")
    before_sha = hashlib.sha256(raw.encode()).hexdigest()

    old_esc, new_esc = jstr(OLD_HEAD), jstr(NEW_HEAD)
    n = raw.count(old_esc)
    assert n == 1, f"expected exactly 1 occurrence of the old heading, found {n} — abort"

    # locate the containing part object pre-change for the fence assertions
    data = json.loads(raw)
    tgt = [p for t in data for q in t["questions"] for p in q["parts"] if p["id"] == PID]
    assert len(tgt) == 1, "part not found"
    assert tgt[0]["solutionMd"].startswith(OLD_HEAD), "part does not start with the old heading"
    assert tgt[0]["marks"] == 3, f"hub marks changed? {tgt[0]['marks']}"

    new_raw = raw.replace(old_esc, new_esc, 1)

    # byte-minimality proof: the only difference is the one-character span
    assert len(new_raw) == len(raw)
    diffs = [i for i, (a, b) in enumerate(zip(raw, new_raw)) if a != b]
    assert len(diffs) == 1, f"expected 1 changed byte, got {len(diffs)}"
    i = diffs[0]
    print(f"byte-level diff: 1 byte at offset {i}: {raw[i]!r} -> {new_raw[i]!r}")

    # semantic diff: exactly 1 part / 1 field / and the field delta is only the token
    nd = json.loads(new_raw)
    changed = []
    for t_old, t_new in zip(data, nd):
        assert t_old["topicSlug"] == t_new["topicSlug"]
        for q_old, q_new in zip(t_old["questions"], t_new["questions"]):
            assert q_old["id"] == q_new["id"]
            for p_old, p_new in zip(q_old["parts"], q_new["parts"]):
                assert p_old.keys() == p_new.keys()
                for k in p_old:
                    if p_old[k] != p_new[k]:
                        changed.append((p_new["id"], k))
    assert changed == [(PID, "solutionMd")], f"semantic diff wider than fence: {changed}"
    s_old, s_new = tgt[0]["solutionMd"], nd_flat(nd, PID)
    assert s_new.replace("(3 marks)", "(2 marks)", 1) == s_old, "field delta != the one token"
    assert s_old.replace("(2 marks)", "(3 marks)", 1) == s_new

    # P-sum + numbering law on the fixed part
    import re
    blocks = re.findall(r"\*\*P(\d+)\*\* \((\d+) marks?\)", s_new)
    msum = sum(int(m) for _, m in blocks)
    nums = [int(x) for x, _ in blocks]
    assert msum == 3, f"P-sum still wrong: {msum}"
    assert nums == sorted(nums), f"P-numbering not increasing: {nums}"
    print(f"post-fix: P-blocks {blocks} sum={msum} == hub marks 3; numbering increasing OK")

    with open(BUNDLE, "wb") as f:
        f.write(new_raw.encode("utf-8"))
    after_sha = hashlib.sha256(new_raw.encode()).hexdigest()
    print(f"bundle sha256: {before_sha[:16]} -> {after_sha[:16]}")
    print("APPLY OK: 1 byte, fence intact, zero deletion")

def nd_flat(data, pid):
    return [p for t in data for q in t["questions"] for p in q["parts"] if p["id"] == pid][0]["solutionMd"]

if __name__ == "__main__":
    sys.exit(main())
