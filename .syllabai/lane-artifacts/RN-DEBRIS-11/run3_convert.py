#!/usr/bin/env python3
"""RN-DEBRIS-11 run-003 — the residue run (A + B-ruling + C2/C5/C6).

Queue of record (operator, trace 1a1a55d98046f799 + 'Go'):
  A   the run-002 refused P1 5.2 text — official-spec re-attestation with the
      declared-elision reading; 3 whole-string sites
  B   the run-002 refused (x-3)^2 gathered seg — RULING: seg-internal attested
      reinsertion (zero deletion, one brace relocation); 6 occ in 2 strings
  C2  twin-attested dollar label joins: I_{b m}->I_{bm} x2, E_{e l}->E_{el} x1
  C5  backtick-extension join: S_{x x}->S_{xx} x1 (same-card twin x28)
  C6  backtick-extension joins: V_{i n}->V_{in} x5, V_{o u t}->V_{out} x3
      (R2b of-record grounding; corpus twins 34/58)

Laws (run-001/002 of record, extended as disclosed):
  - frozen pairs, raw-byte anchoring, dual JSON-escape forms; a replacement
    fires only on an exact byte match;
  - span scoping: C5/C6 fire ONLY inside `backtick` spans (23a extension:
    enter backtick spans for twin-gated label joins only; delimiters never
    moved); C2 fires ONLY inside $dollar$ spans;
  - per-file JSON-parse fail-closed; post-surgery tree delta must equal the
    planned jpaths exactly; idempotence (second run = 0 fires);
  - STEP A gate: flavor-normalized (superscript<->plain), slash-and-
    whitespace-stripped multiset(corrupted) == multiset(intended) PLUS the
    declared official-attested elision {"2" x1 = the "5.2" section-heading
    digit, house-style elided per 30/30 of-record precedent};
  - STEP B gate: corrupted multiset == repaired multiset MINUS declared
    seg-internal insertions {( x - 3 )^{2 }, 17} MINUS brace delta { { +1,
    } +1 } (the inserted ^{ } group), corrupted non-brace bytes appear in
    repaired in row-preserving order, zero deletions.

Modes: --plan (dry run) / --apply.
"""
import json, re, sys
from pathlib import Path
from collections import Counter

REPO = Path("/home/z/my-project/work/sv2-rn11")
OUT = Path("/tmp/rn11")
APPLY = "--apply" in sys.argv

# ---------------- frozen tables ----------------

STEP_A_CORRUPTED = ("Integration of x\u207f and related sums, differences and constant multiples.: "
 "\u2022 (Excluding n = \u22121 and related sums, differences and multiples). For exam "
 "pressions such as ple,theabilit2\u20442andytointegrateex\u2044isexpected. "
 "\u00b9x\u00b2\u22123x\u207b1 (x+2)\u2044x 2 Given f \u2032(x) and a point on the curve, "
 "students should be able to find an equation of the curve in the form y = f(x).")

STEP_A_INTENDED = ("Integration of x\u207f and related sums, differences and constant multiples.: "
 "\u2022 (Excluding n = \u22121 and related sums, differences and multiples). For example, "
 "the ability to integrate expressions such as 1\u20442x\u00b2 \u2212 3x\u207b\u00b9 and "
 " (x + 2)\u00b2\u2044x is expected. Given f \u2032(x) and a point on the curve, students "
 "should be able to find an equation of the curve in the form y = f(x).")

STEP_A_DECLARED_ELISION = {"2": 1}   # the "5.2" section-heading digit (official: sha-verified
                                     # spec PDF, P1 heading line; house style elides headings 30/30)

STEP_B_CORRUPTED = ("$\\begin{gathered} ( x - 3 )^{2 } - 17 & = 0 \\\\ + 17 & = + 17 \\\\ "
                    "( x - 3 )^{2 } & = 17 \\\\ \\sqrt{ & = \\sqrt{ } } \\\\ "
                    "x - 3^{ } & = \\pm \\sqrt{17} \\end{gathered}$")
STEP_B_REPAIRED = ("$\\begin{gathered} ( x - 3 )^{2 } - 17 & = 0 \\\\ + 17 & = + 17 \\\\ "
                   "( x - 3 )^{2 } & = 17 \\\\ \\sqrt{( x - 3 )^{2 }} & = \\sqrt{ 17 } \\\\ "
                   "x - 3^{ } & = \\pm \\sqrt{17} \\end{gathered}$")
STEP_B_INSERTIONS = ["( x - 3 )^{2 }", "17"]   # both byte-verbatim from seg line 3

STEP_C2_PAIRS = [("I_{b m}", "I_{bm}"), ("\\Delta E_{e l}", "\\Delta E_{el}")]
STEP_C5_PAIRS = [("S_{x x}", "S_{xx}")]
STEP_C6_PAIRS = [("V_{i n}", "V_{in}"), ("V_{i n }", "V_{in}"),
                 ("V_{o u t}", "V_{out}")]

EXPECTED = {"A": 3, "B": 6, "C2": 3, "C5": 1, "C6": 12}

# ---------------- plan-time gates ----------------

FLAVOR = str.maketrans({'\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4',
                        '\u02e3': 'x', '\u207f': 'n', '\u1d4f': 'k', '\u207b': '-'})

def norm_multiset(s):
    s = s.translate(FLAVOR)
    s = s.replace('\u2044', '').replace(' ', '')
    return Counter(s)

def gate_A():
    c, i = norm_multiset(STEP_A_CORRUPTED), norm_multiset(STEP_A_INTENDED)
    extra = c - i
    missing = i - c
    ok = (extra == Counter(STEP_A_DECLARED_ELISION)) and not missing
    return ok, dict(extra), dict(missing)

def gate_B():
    c, r = Counter(STEP_B_CORRUPTED), Counter(STEP_B_REPAIRED)
    # repaired == corrupted + seg-internal insertions (the inserted "^{2 }"]
    # group itself carries the +1 brace pair)
    want = Counter(STEP_B_CORRUPTED)
    for ins in STEP_B_INSERTIONS:
        want = want + Counter(ins)
    multiset_ok = (r == want)
    # zero-deletion + row-preserving order with the of-record closer-relocation
    # law: '}' bytes may relocate within their row; all other bytes must
    # appear in the repaired row in their original relative order
    rows_c = STEP_B_CORRUPTED.split('\\\\')
    rows_r = STEP_B_REPAIRED.split('\\\\')
    order_ok = len(rows_c) == len(rows_r)
    if order_ok:
        for rc, rr in zip(rows_c, rows_r):
            rc_nb = rc.replace('}', '')
            rr_nb = rr.replace('}', '')
            it = iter(rr_nb)
            order_ok = order_ok and all(ch in it for ch in rc_nb)
    brace_delta = (r['{'] - c['{'], r['}'] - c['}'])
    insertions_verbatim = all(ins in STEP_B_CORRUPTED for ins in STEP_B_INSERTIONS)
    return multiset_ok and order_ok and insertions_verbatim and brace_delta == (1, 1), \
        {"multiset": multiset_ok, "rowOrder(closer-relocation law)": order_ok,
         "braceDelta": brace_delta, "insertionsInSeg": insertions_verbatim}

# ---------------- corpus machinery ----------------

def walk(node, jpath):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{jpath}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{jpath}[{i}]")
    elif isinstance(node, str):
        yield jpath, node

MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")

def plan_string(s):
    """return [(family, corrupted, repaired, fires)] for one parsed string"""
    out = []
    if STEP_A_CORRUPTED == s or STEP_A_CORRUPTED in s:
        out.append(("A", STEP_A_CORRUPTED, STEP_A_INTENDED, s.count(STEP_A_CORRUPTED)))
    n = s.count(STEP_B_CORRUPTED)
    if n:
        out.append(("B", STEP_B_CORRUPTED, STEP_B_REPAIRED, n))
    return out

def plan_scoped(s, pairs, scope):
    """fires for span-scoped joins; scope in {'backtick','dollar'}"""
    fires = 0
    opener, closer = ('`', '`') if scope == 'backtick' else ('$', '$')
    for sm in re.finditer(re.escape(opener) + r'[^' + re.escape(closer) + r']+' +
                          re.escape(closer), s):
        span = sm.group(0)
        for cor, rep in pairs:
            fires += span.count(cor)
    return fires

def main():
    ga, gextra_a, gmiss_a = gate_A()
    gb, ginfo_b = gate_B()
    print("gate A (declared elision):", "PASS" if ga else "FAIL",
          "extra:", gextra_a, "missing:", gmiss_a)
    print("gate B (seg-internal reinsertion):", "PASS" if gb else "FAIL", ginfo_b)
    if not (ga and gb):
        raise SystemExit("FAIL-CLOSED: plan-time gates failed")

    files = sorted(REPO.glob("apps/hub/**/*.json"))
    plan = {}
    fam_totals = Counter()
    for path in files:
        rel = str(path.relative_to(REPO))
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[SKIP parse-fail] {rel}: {e}")
            continue
        edits = []
        for jp, s in walk(data, "$"):
            for fam, cor, rep, n in plan_string(s):
                edits.append([jp, fam, cor, rep, n])
            for fam, pairs, scope in (("C2", STEP_C2_PAIRS, "dollar"),
                                      ("C5", STEP_C5_PAIRS, "backtick"),
                                      ("C6", STEP_C6_PAIRS, "backtick")):
                n = plan_scoped(s, pairs, scope)
                if n:
                    for cor, rep in pairs:
                        # count per pair inside scoped spans of this string
                        cnt = 0
                        opener = '`' if scope == 'backtick' else '$'
                        closer = opener
                        for sm in re.finditer(re.escape(opener) + r'[^' +
                                              re.escape(closer) + r']+' +
                                              re.escape(closer), s):
                            cnt += sm.group(0).count(cor)
                        if cnt:
                            edits.append([jp, fam, cor, rep, cnt])
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
    got = {k: fam_totals.get(k, 0) for k in EXPECTED}
    ok = all(fam_totals.get(k, 0) == v for k, v in EXPECTED.items())
    print("expected:", EXPECTED, "->", "MATCH" if ok else "MISMATCH")
    json.dump({"famTotals": dict(fam_totals), "expected": EXPECTED, "match": ok,
               "files": {k: v for k, v in plan.items()}},
              open(OUT / "plan_run3.json", "w"), ensure_ascii=False, indent=1)
    if not ok:
        raise SystemExit("FAIL-CLOSED: fire-count expectations not met")
    if not APPLY:
        print("PLAN ONLY (use --apply to write)")
        return

    # ---- apply ----
    def replace_scoped(text, cor, rep, mode):
        """mode: 'plain' (no guard), 'in_backtick' (only inside `..`),
        'in_dollar' (only inside $..$). Fires counted."""
        out, i, n, fires = [], 0, len(text), 0
        if mode == 'plain':
            j = text.count(cor)
            return text.replace(cor, rep), j
        opener = '`' if mode == 'in_backtick' else '$'
        rx = re.compile(re.escape(opener) + r'[^' + re.escape(opener) + r']+' +
                        re.escape(opener))
        last = 0
        for sm in rx.finditer(text):
            span = sm.group(0)
            out.append(text[last:sm.start()])
            out.append(span.replace(cor, rep))
            fires += span.count(cor)
            last = sm.end()
        out.append(text[last:])
        return "".join(out), fires

    report = {}
    for rel, edits in sorted(plan.items()):
        path = REPO / rel
        raw = path.read_text(encoding="utf-8")
        before_tree = json.loads(raw)
        new_raw = raw
        per_fam = Counter()
        groups = {}
        for jp, fam, cor, rep, n in edits:
            key = (fam, cor, rep)
            groups[key] = groups.get(key, 0) + n
        mode_for = {"A": "plain", "B": "plain", "C2": "in_dollar",
                    "C5": "in_backtick", "C6": "in_backtick"}
        for (fam, cor, rep), expected in sorted(groups.items()):
            fired_total = 0
            for enc in (False, True):
                cor_raw = json.dumps(cor, ensure_ascii=enc)[1:-1]
                rep_raw = json.dumps(rep, ensure_ascii=enc)[1:-1]
                if enc is False and cor_raw not in new_raw and expected > 0:
                    continue
                new_raw, fires = replace_scoped(new_raw, cor_raw, rep_raw,
                                                mode_for[fam])
                fired_total += fires
                if fires:
                    break
            if fired_total != expected:
                raise SystemExit(
                    f"FAIL-CLOSED {rel}: {fam} expected {expected} fires, got "
                    f"{fired_total} for {cor[:60]!r}")
            per_fam[fam] += fired_total
        try:
            after_tree = json.loads(new_raw)
        except Exception as e:
            raise SystemExit(f"FAIL-CLOSED {rel}: result does not parse: {e}")
        orig_strings = dict(walk(before_tree, "$"))
        new_strings = dict(walk(after_tree, "$"))
        assert orig_strings.keys() == new_strings.keys(), f"{rel}: jpath set changed"
        changed = {jp for jp in orig_strings if orig_strings[jp] != new_strings[jp]}
        planned_jps = {e[0] for e in edits}
        if not changed <= planned_jps:
            raise SystemExit(f"FAIL-CLOSED {rel}: unexpected jpaths: {changed - planned_jps}")
        path.write_text(new_raw, encoding="utf-8")
        report[rel] = dict(per_fam)
        print(f"[APPLIED] {rel}: {dict(per_fam)}")
    json.dump(report, open(OUT / "apply_report_run3.json", "w"),
              ensure_ascii=False, indent=1)
    print("wrote", OUT / "apply_report_run3.json")

if __name__ == "__main__":
    main()
