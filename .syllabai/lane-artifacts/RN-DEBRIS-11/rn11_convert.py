#!/usr/bin/env python3
"""RN-DEBRIS-11 run-002 — the apply converter (frozen-table surgical repair).

Families (all from the run-001 adjudication, byte-anchored at this tip):
  R1  30 de-zipper pairs (official-spec-attested; 1 text refused) — 79 sites
  R2a 4 corrupt-brace seg pairs (of-record RN-DEBRIS-9 refused set) — 6 sites
  R2b V_{i n} -> V_{in} label join (of-record grounding x17)
  R2c the spacecraf re-zipper seg — 1 site
  R3b 26 paren-brace-swap seg pairs (derived + KaTeX-verified) — 28 sites
  R3c 8 gathered-& seg pairs (derived + KaTeX-verified; 1 seg refused) — 31 sites
  R3a 21 twin-gated sub-floor label joins, dollar segments only — 89 sites
      (keeps: _{b m} x2, _{e l} x1, backtick x6)

Laws (pre-registered at run-001):
  - whole-string/whole-seg surgical units; raw-byte anchoring with dual JSON
    escape forms (raw UTF-8 and \\u-escaped); a replacement only fires on an
    exact byte match of the frozen corrupted form;
  - per-file JSON-parse fail-closed (a parse failure aborts that file);
  - post-surgery re-parse: the tree must differ from the original ONLY by the
    planned string replacements (every changed jpath accounted);
  - idempotence: second run performs 0 conversions;
  - scope: exactly the planned files; zero code files; backtick segments
    never touched.

Modes:
  --plan   dry run; prints the full per-family plan, writes /tmp/rn11/plan.json
  --apply  performs the edits and writes the files
"""
import json, re, sys
from pathlib import Path
from collections import Counter, defaultdict

REPO = Path("/home/z/my-project/work/sv2-rn9")
OUT = Path("/tmp/rn11")
APPLY = "--apply" in sys.argv

R1 = json.load(open(OUT / "r1_pairs.json"))
R3 = json.load(open(OUT / "r3_pairs.json"))

R1_PAIRS = [(p["corrupted"], p["intended"]) for p in R1 if not p.get("refused")]
R1_REFUSED = [p for p in R1 if p.get("refused")]
R3B_PAIRS = [(p["seg"], p["repaired"]) for p in R3["R3b"]
             if "lambda_{m a x}" not in p["seg"]]  # lambda seg owned by R2a (label+structure)
R3C_PAIRS = [(p["seg"], p["repaired"]) for p in R3["R3c"]]

# R2a — derived & KaTeX-verified of-record pairs (potential-divider + lambda)
R2A_PAIRS = [
 ("$V_{o u t} = ( \\frac{R_{1}{R_{1} + R_{2} } ) V_{i} n}$",
  "$V_{out} = ( \\frac{R_{1}}{R_{1} + R_{2}} ) V_{in}$"),
 ("$V_{o u t} = ( \\frac{R_{2 + R_{3} }{R_{1} + R_{2} + R_{3} } ) V_{i} n}$",
  "$V_{out} = ( \\frac{R_{2} + R_{3} }{R_{1} + R_{2} + R_{3} } ) V_{in}$"),
 ("$R_{2 = ( \\frac{R_{1} \\times V_{i} n} }{V_{o u t} } ) - R_{1}$",
  "$R_{2} = ( \\frac{R_{1} \\times V_{in} }{V_{out} } ) - R_{1}$"),
 ("$\\lambda_{m a x} = \\frac{( 6.63 \\times 10^{- 34} ) ( 3.0 \\times 10^{8 )}{( 80 \\times 10^{3} ) ( 1.6 \\times 10^{-19} } )}$",
  "$\\lambda_{max} = \\frac{( 6.63 \\times 10^{- 34} ) ( 3.0 \\times 10^{8} )}{( 80 \\times 10^{3} ) ( 1.6 \\times 10^{-19} )}$"),
]
# R2b — of-record label join. Grounding = 17 raw hits; 5 of them sit inside
# BACKTICK segments (the 23a protected class, named in the run-001 stays:
# "incl. `V_{o u t} = V_{i n} ...` backtick forms") -> those 5 KEEP; the 12
# dollar-segment sites FIRE. Dollar-context guard enforced below.
R2B_PAIRS = [("V_{i n}", "V_{in}")]
# R2c — the spacecraf re-zipper (ial-physics-19 questions $[43].questions[0].parts[3].solutionMd)
R2C_PAIRS = [
 ("$v_{\\uparrow = \\frac{M o m e n t u m a f t e r}{( m_{s} p a c e c r a f t} + m_{a s t e r o i d} )} = \\frac{p_{s p a c e c r a f t} }{( m_{s p a c e c r a f t} + m_{a s t e r o i d} )}$",
  "$v_{\\uparrow} = \\frac{Momentum after}{( m_{spacecraft} + m_{asteroid} )} = \\frac{p_{spacecraft}}{( m_{spacecraft} + m_{asteroid} )}$"),
]
# R3a — twin-gated label joins (dollar only; keeps b m / e l excluded; backtick never touched)
R3A_CLASSES = {
 "i n": "in", "I N": "IN", "A l": "Al", "a v": "av", "e m": "em", "p i": "pi",
 "A B": "AB", "P Q": "PQ", "P R": "PR", "B C": "BC", "A C": "AC", "C M": "CM",
 "S C": "SC", "C X": "CX", "C Y": "CY", "D X": "DX", "D Y": "DY", "C D": "CD",
 "x x": "xx", "y y": "yy", "h h": "hh", "C P": "CP",
}
# prose-twin attestation (same-file) for classes with no corpus _{joined} twin
PROSE_TWIN = {"CM": "**CM**"}
# corpus-wide joined-twin presence (computed this session; gate fires only if >=1)
TWIN_COUNTS = {"in": 35, "IN": 14, "Al": 10, "av": 8, "em": 4, "pi": 8, "AB": 92,
               "PQ": 6, "PR": 4, "BC": 42, "AC": 7, "CM": 0, "SC": 2, "CX": 1,
               "CY": 1, "DX": 1, "DY": 1, "CD": 5, "xx": 27, "yy": 10, "hh": 2,
               "CP": 4, "bm": 0, "el": 0}
SUBFLOOR = re.compile(r"_ ?\{([A-Za-z] [A-Za-z])\}")
DOLLAR = re.compile(r"\$[^$]+\$")

def walk(node, jpath):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{jpath}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{jpath}[{i}]")
    elif isinstance(node, str):
        yield jpath, node

def raw_forms(s):
    """dual JSON-escape forms of a parsed string as it may appear in raw bytes"""
    a = json.dumps(s, ensure_ascii=False)[1:-1]
    b = json.dumps(s, ensure_ascii=True)[1:-1]
    return (a, b) if a != b else (a,)

def plan_string(s):
    """return list of (corrupted, repaired, family) for one parsed string"""
    out = []
    # whole-string R1 (exact full-string match)
    for cor, rep in R1_PAIRS:
        if s == cor:
            out.append((cor, rep, "R1"))
            return out
    # seg-level pairs (R2a/R2c/R3b/R3c): exact substring on the parsed string
    for cor, rep in R2A_PAIRS + R2C_PAIRS + R3B_PAIRS + R3C_PAIRS:
        n = s.count(cor)
        if n:
            out.append((cor, rep, "segpair"))
    # R2b plain label join — dollar-segment occurrences only (backtick 23a stays)
    for cor, rep in R2B_PAIRS:
        fired = 0
        for sm in DOLLAR.finditer(s):
            fired += sm.group(0).count(cor)
        if fired:
            out.append((cor, rep, "R2b"))
    return out

def plan_r3a(s, file_raw):
    """R3a joins on the string state AFTER seg-pair surgery"""
    hits = []
    for m in SUBFLOOR.finditer(s):
        pos, content = m.start(), m.group(1)
        if content not in R3A_CLASSES:
            continue
        # dollar-only (backtick/prose never touched)
        in_dollar = False
        for sm in DOLLAR.finditer(s):
            if sm.start() <= pos and pos < sm.end():
                in_dollar = True
                break
        if not in_dollar:
            continue
        joined = R3A_CLASSES[content]
        ok_twin = TWIN_COUNTS.get(joined, 0) >= 1
        if not ok_twin and joined in PROSE_TWIN:
            ok_twin = PROSE_TWIN[joined] in file_raw  # same-file prose twin (CM law)
        if not ok_twin:
            continue
        if content == "A l" and "A l O" in s:
            continue  # 'A l O' Al2O3-truncation refuse family (of-record stay)
        old = m.group(0)
        new = "_{" + joined + "}"
        hits.append((old, new, content, pos))
    return hits

def apply_hits(s, hits):
    """apply non-overlapping replacement hits left-to-right"""
    hits = sorted(hits, key=lambda h: h[3])
    out, last, fired = [], 0, 0
    for old, new, content, pos in hits:
        if pos < last:
            continue
        if s[pos:pos + len(old)] != old:
            continue
        out.append(s[last:pos]); out.append(new)
        last = pos + len(old)
        fired += 1
    out.append(s[last:])
    return "".join(out), fired

def main():
    files = sorted(REPO.glob("apps/hub/**/*.json"))
    plan = {}
    fam_totals = Counter()
    for path in files:
        rel = str(path.relative_to(REPO))
        raw = path.read_text(encoding="utf-8")
        try:
            data = json.loads(raw)
        except Exception as e:
            print(f"[SKIP parse-fail] {rel}: {e}")
            continue
        edits = []   # (jpath, family, corrupted, repaired, n)
        tree = json.loads(raw)
        # pass 1: R1 whole-string + seg pairs + R2b (planned on the original strings)
        for jp, s in walk(tree, "$"):
            for cor, rep, fam in plan_string(s):
                edits.append([jp, fam, cor, rep, s.count(cor)])
        # pass 2: R3a on the post-surgery string state
        file_raw = raw
        for jp, s in walk(tree, "$"):
            cur = s
            for jp2, fam, cor, rep, n in edits:
                if jp2 == jp:
                    cur = cur.replace(cor, rep)
            hits = plan_r3a(cur, file_raw)
            # merge same-content adjacent? apply per occurrence
            for old, new, content, pos in hits:
                edits.append([jp, "R3a", old, new, 1])
        if not edits:
            continue
        plan[rel] = edits
        for e in edits:
            fam_totals[e[1]] += e[4]
    print("planned families:", dict(fam_totals))
    print("planned files:", len(plan))
    for rel, edits in sorted(plan.items()):
        kinds = Counter(e[1] for e in edits)
        print(f"  {rel}: {dict(kinds)}")
    json.dump({"famTotals": dict(fam_totals), "files": {k: v for k, v in plan.items()}},
              open(OUT / "plan.json", "w"), ensure_ascii=False, indent=1)
    if not APPLY:
        print("PLAN ONLY (use --apply to write)")
        return

    # ---- apply ----
    FAM_ORDER = {"R1": 0, "segpair": 1, "R2b": 2, "R3a": 3}

    def replace_outside_backticks(text, cor, rep):
        """surgical replace that never fires inside `backtick` spans (23a)"""
        out, i, n, in_bt, fires = [], 0, len(text), False, 0
        while i < n:
            c = text[i]
            if c == "`":
                in_bt = not in_bt
                out.append(c); i += 1; continue
            if not in_bt and text.startswith(cor, i):
                out.append(rep); i += len(cor); fires += 1; continue
            out.append(c); i += 1
        return "".join(out), fires

    report = {}
    for rel, edits in sorted(plan.items()):
        path = REPO / rel
        raw = path.read_text(encoding="utf-8")
        before_tree = json.loads(raw)
        new_raw = raw
        per_fam = Counter()
        # group by (family, corrupted, repaired) preserving family order
        groups = {}
        for jp, fam, cor, rep, n in edits:
            key = (FAM_ORDER[fam], fam, cor, rep)
            g = groups.setdefault(key, 0)
            groups[key] = g + n
        for order, fam, cor, rep in sorted(groups, key=lambda k: k[0]):
            expected = groups[(order, fam, cor, rep)]
            # dual escape forms: this repo stores raw UTF-8; \u-escaped fallback
            fired_total = 0
            for enc in (False, True):
                cor_raw = json.dumps(cor, ensure_ascii=enc)[1:-1]
                rep_raw = json.dumps(rep, ensure_ascii=enc)[1:-1]
                if enc is False and cor_raw not in new_raw and expected > 0:
                    continue  # try the \u-escaped form
                new_raw, fires = replace_outside_backticks(new_raw, cor_raw, rep_raw)
                fired_total += fires
                if fires:
                    break
            if fired_total != expected:
                raise SystemExit(
                    f"FAIL-CLOSED {rel}: {fam} expected {expected} fires, got {fired_total} "
                    f"for {cor[:60]!r}")
            per_fam[fam] += fired_total
        # parse-fail-closed
        try:
            after_tree = json.loads(new_raw)
        except Exception as e:
            raise SystemExit(f"FAIL-CLOSED {rel}: result does not parse: {e}")
        # verify tree delta exactly equals the planned jpaths
        orig_strings = dict(walk(before_tree, "$"))
        new_strings = dict(walk(after_tree, "$"))
        assert orig_strings.keys() == new_strings.keys(), f"{rel}: jpath set changed"
        changed = {jp for jp in orig_strings if orig_strings[jp] != new_strings[jp]}
        planned_jps = {e[0] for e in edits}
        if not changed <= planned_jps:
            raise SystemExit(f"FAIL-CLOSED {rel}: unexpected jpaths changed: {changed - planned_jps}")
        path.write_text(new_raw, encoding="utf-8")
        report[rel] = dict(per_fam)
        print(f"[APPLIED] {rel}: {dict(per_fam)}")
    json.dump(report, open(OUT / "apply_report.json", "w"), ensure_ascii=False, indent=1)
    print("wrote", OUT / "apply_report.json")

if __name__ == "__main__":
    main()
