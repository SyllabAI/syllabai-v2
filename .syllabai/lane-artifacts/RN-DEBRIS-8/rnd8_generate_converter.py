#!/usr/bin/env python3
"""RN-DEBRIS-8 run-001 patch generator — hyphen-lost compounds lane.

Generates the lane converter from the of-record RN-DEBRIS-7 prose converter
(.syllabai/lane-artifacts/RN-DEBRIS-7/rnd7_convert_prose.py) by EXACT-STRING
patches; every patch asserts exactly one match (zero-drift law: the of-record
surgery mechanics arrive byte-verbatim — raw-byte occurrence surgery, dual-
form JSON-escape anchoring, MARK window post-filter, per-file json.loads
gate; only the firing filter, the repair law and the adjudicated refusal
ledger are lane-specific, each disclosed inline).
"""
import sys

SRC = "/tmp/rnd7_convert_prose.py"
OUT = "/home/z/my-project/scripts/rnd8_convert_hyphen.py"

s = open(SRC, encoding="utf-8").read()

PATCHES = [
    # 1 — title + law delta disclosure
    ('"""RN-DEBRIS-7 run-001 prose converter — outside-span scope (NEW machinery).',
     '''"""RN-DEBRIS-8 run-001 converter — the hyphen-lost compounds lane (53-item
class of record from RN-DEBRIS-7's hyphen-twin guard; operator order trace
1a19ac0790484275 "proceed with 53 hyphen-lost compounds").
Generated from the of-record RN-DEBRIS-7 prose converter by exact-string
patches (this generator asserts one match per patch); the surgery mechanics
are byte-verbatim. Law delta (disclosed): fires ONLY guard=='hyphen-twin'
items; the repair is the HYPHEN form "-".join(split) — corpus-attested by
the guard's own hyphen_freq membership (zero-invention by construction) —
instead of the space split. ADJUDICATED REFUSALS of record (eyes-on pass
over all 53 contexts, fail-closed): 'walkin' (literary dialect quote
"walkin' wavy" = g-dropped 'walking'; the apostrophe after the run proves
the form; the 'walk-in' attestation is not occurrence-twin evidence),
'reexport' (internal-record manifest ledger note $.note with PR/ADR/trace
references — not learner-facing prose), 'useof' (target form's ONLY corpus
attestation is a URL asset path ...use-of.webp — the url-asset trap; the
prose occurrence needs a space split, out of this lane's law). 50 fire,
3 refused.'''),
    # 2 — firing filter
    ('         and i.get("guard") == "pass"]',
     '         and i.get("guard") == "hyphen-twin"]'),
    # 3 — label
    ('print(f"prose firing items (guard=pass, ctxClass={SCOPE}):", len(items))',
     'print(f"hyphen firing items (guard=hyphen-twin, ctxClass={SCOPE}):", len(items))'),
    # 4 — refusal ledger constant (prepended to the WIN law line)
    ('WIN = 40',
     '''# ADJUDICATED REFUSALS of record (see header) — keyed by run.lower()
REFUSE_LEDGER = {
    "walkin": "literary dialect quote (\\"walkin' wavy\\" = g-dropped walking); "
              "hyphen twin not occurrence-twin evidence — fail-closed keep",
    "reexport": "internal-record manifest ledger note ($.note, PR/ADR/trace "
                "references) — not learner-facing prose",
    "useof": "target form's only corpus attestation is a URL asset path "
             "(...use-of.webp) — url-asset trap; prose needs a space split "
             "(out of lane law)",
}
WIN = 40'''),
    # 5 — splice law: adjudicated refusal + hyphen repair (titlecase -> fail-closed)
    ('''        toks = splits.get(run.lower())
        if not toks:
            continue
        a, b = m.start(), m.end()
        if run[0].isupper():
            repl = toks[0].capitalize() + " " + " ".join(toks[1:])
            kind = "titlecase-split"
        else:
            repl = " ".join(toks)
            kind = "phrase-evidenced-split"''',
     '''        toks = splits.get(run.lower())
        if not toks:
            continue
        a, b = m.start(), m.end()
        if run.lower() in REFUSE_LEDGER:
            refusals.append({"run": run, "to": "-".join(toks), "pos": a,
                             "why": REFUSE_LEDGER[run.lower()]})
            continue
        if run[0].isupper():
            refusals.append({"run": run, "to": None, "pos": a,
                             "why": "non-lowercase run (fail-closed)"})
            continue
        repl = "-".join(toks)
        kind = "hyphen-twin-restore"'''),
    # 6 — ledger refused-only anchors too (of-record code logged refusals
    # only when the same string also fired; the adjudicated refusals are
    # refused-only anchors and must appear in the report ledger)
    ('''    for s, splits in pairs:
        fixed, log, refusals = splice_string(s, splits)
        if not log:
            continue
        for r in refusals:
            mark_refusals.append({"file": rel, **r})''',
     '''    for s, splits in pairs:
        fixed, log, refusals = splice_string(s, splits)
        for r in refusals:
            mark_refusals.append({"file": rel, **r})
        if not log:
            continue'''),
]

for i, (old, new) in enumerate(PATCHES, 1):
    n = s.count(old)
    assert n == 1, f"patch {i}: {n} matches (want 1) for: {old[:60]!r}"
    s = s.replace(old, new)
open(OUT, "w", encoding="utf-8").write(s)
print(f"OK: {len(PATCHES)} patches applied (1 match each) -> {OUT}")
