#!/usr/bin/env python3
"""Semantic diff of record: HEAD vs working bundle — only solutionMd additions."""
import json, subprocess

F = "apps/hub/content/igcse-maths-b-16/questions.json"
raw = subprocess.run(["git", "-C", "/home/z/my-project/syllabai-v2", "show", f"HEAD:{F}"],
                     capture_output=True).stdout.decode("utf8")
head = json.loads(raw)
work = json.load(open("/home/z/my-project/syllabai-v2/" + F, encoding="utf8"))

assert len(head) == len(work), "topic count changed"
adds = 0
other = 0
samples = []
for ti, (th, tw) in enumerate(zip(head, work)):
    assert (th.get("topicSlug") or th.get("slug")) == (tw.get("topicSlug") or tw.get("slug"))
    assert len(th["questions"]) == len(tw["questions"]), f"q count changed in topic {ti}"
    for qi, (qh, qw) in enumerate(zip(th["questions"], tw["questions"])):
        assert len(qh["parts"]) == len(qw["parts"]), f"part count changed {ti}/{qi}"
        for pi, (ph, pw) in enumerate(zip(qh["parts"], qw["parts"])):
            for k in ph:
                if k == "solutionMd":
                    continue
                if ph.get(k) != pw.get(k):
                    other += 1
                    samples.append(("FIELD", th.get("topicSlug"), qi, pi, k))
            for k in pw:
                if k not in ph:
                    other += 1
                    samples.append(("NEWKEY", th.get("topicSlug"), qi, pi, k))
            sh, sw = (ph.get("solutionMd") or ""), (pw.get("solutionMd") or "")
            if sh != sw:
                if not sh.strip() and sw.strip():
                    adds += 1
                else:
                    other += 1
                    samples.append(("SOL-MOD", th.get("topicSlug"), qi, pi, ""))

print(f"solutionMd additions: {adds}")
print(f"other changes: {other}")
for s in samples[:10]:
    print("  ", s)
print("VERDICT:", "CLEAN" if adds == 45 and other == 0 else "FAIL")
