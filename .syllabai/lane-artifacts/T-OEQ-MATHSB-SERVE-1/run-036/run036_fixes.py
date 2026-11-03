#!/usr/bin/env python3
"""run-036 FIX SET aggregator: FIXES = A + B + C + D (77 parts)."""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, attr):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return getattr(mod, attr)


FIXES = (_load("run036_fixes_a.py", "FIXES_A")
         + _load("run036_fixes_b.py", "FIXES_B")
         + _load("run036_fixes_c.py", "FIXES_C")
         + _load("run036_fixes_d.py", "FIXES_D"))

assert len(FIXES) == 77, len(FIXES)
assert len({f["pid"] for f in FIXES}) == 77

if __name__ == "__main__":
    from collections import Counter
    kinds = Counter(f["kind"] for f in FIXES)
    drops = sum(len(f["drop_assets"]) for f in FIXES)
    assets_only = sum(1 for f in FIXES if f["new"] is None)
    kept = sum(1 for f in FIXES if not f["drop_assets"] and f["new"] is not None)
    print(f"fixes: {len(FIXES)} | kinds: {dict(kinds)}")
    print(f"asset-drop tuples: {drops} | assets-only fixes: {assets_only} | keep-crop (relabel) fixes: {kept}")
    # dollar parity pre-check on every NEW text
    bad = []
    for f in FIXES:
        if f["new"] is None:
            continue
        t = f["new"].replace("\\$", "")
        if t.count("$") % 2:
            bad.append(f["pid"])
    print("dollar-parity pre-check:", "OK all even" if not bad else f"ODD: {bad}")
    # duplicate-path drop expectations
    for f in FIXES:
        n = len(f["drop_assets"])
        assert len(set(f["drop_assets"])) == n, (f["pid"], "duplicate paths in drop_assets")
        if n and "drop_expect" not in f:
            f["drop_expect"] = 1
    print("drop_expect defaults: OK")
