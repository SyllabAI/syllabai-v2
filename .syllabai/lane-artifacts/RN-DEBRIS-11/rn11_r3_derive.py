#!/usr/bin/env python3
"""RN-DEBRIS-11 run-002 — R3b/R3c derivation engine.

R3b (paren-brace-swap, 26 segs): the superscript-closing `}` of a `10^{N }`
group was displaced to a later position (typically the seg tail or after the
next paren group). Repair = MOVE `}` bytes only (never invent/drop): a
two-pass walk records (a) debt positions — where a `)` arrives while the
innermost open group expects `}` (the `}` is inserted immediately after the
group's last non-space byte) and (b) surplus `}` — closers that arrive when
the stack is empty or the innermost expects `)`. k debts must pair with k
surpluses; the i-th surplus travels to the i-th debt.

R3c (gathered-&, 9 segs): inside \\begin{gathered} rows, a `\\sqrt{X` group's
`}` was displaced past the row content to the row end. Repair = at the `&`
mismatch (innermost `{` expects `}`), move the LAST `}` before the next row
terminator (`\\\\` or `\\end{gathered}`) to immediately before the `&`.

Every derived pair is verified by the INVERTED KaTeX heal gate (katex
0.16.22 throwOnError): the corrupted seg FAILS (or, for render-OK segs, is
structurally corrupt) and the repaired seg MUST render clean. Refusal is
the default on any ambiguity.
"""
import json, re, subprocess, sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/sv2-rn9")
ADJ = json.load(open(REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/rn11_adjudication.json"))

def walk(n, jp):
    if isinstance(n, dict):
        for k, v in n.items(): yield from walk(v, jp + "." + k)
    elif isinstance(n, list):
        for i, v in enumerate(n): yield from walk(v, jp + "[" + str(i) + "]")
    elif isinstance(n, str): yield jp, n

# ---------------- R3b relocation repair ----------------
def r3b_repair(seg):
    """Return repaired seg or (None, reason). Body without the outer $...$."""
    assert seg.startswith("$") and seg.endswith("$")
    body = seg[1:-1]
    s = list(body)
    # pass 1: walk with virtual repairs, collecting debts (insert-before positions)
    debts = []   # (index_in_original, insert_after_index)  insert `}` after this index
    surpluses = []  # indices of `}` to relocate
    i = 0
    stack = []
    n = len(s)
    while i < n:
        c = s[i]
        if c == "{":
            stack.append("}"); i += 1
        elif c == "(":
            stack.append(")"); i += 1
        elif c in "})":
            if stack and stack[-1] == c:
                stack.pop(); i += 1
            elif c == ")" and stack and stack[-1] == "}":
                # debt: need `}` before this `)`. Insert after last non-space byte
                j = i - 1
                while j >= 0 and s[j] == " ":
                    j -= 1
                debts.append(j)      # insert after position j (in original indexing)
                stack.pop()          # `}` closes the group
                # now the `)` closes the next opener if it is `(`, else keep
                if stack and stack[-1] == ")":
                    stack.pop()
                    i += 1
                else:
                    return None, f"post-debt stack mismatch at {i}"
            elif c == "}" and (not stack or stack[-1] == ")"):
                # surplus `}` — mark for relocation, do not consume
                surpluses.append(i)
                i += 1
            else:
                return None, f"unmatched closer {c!r} at {i} stack={stack}"
        else:
            i += 1
    if stack:
        return None, f"stack not empty at end: {stack}"
    if len(debts) != len(surpluses):
        return None, f"debts={len(debts)} != surpluses={len(surpluses)}"
    if not debts:
        return None, "no corruption found"
    out = list(body)
    # relocate: i-th surplus `}` -> i-th debt position (remove surplus chars, then insert)
    take = set(surpluses)
    kept = [(ch, idx) for idx, ch in enumerate(body) if idx not in take]
    # compute insert positions in kept-coordinates: insert after the debt byte
    # debt positions are original indices; map to kept coordinates
    orig2kept = {}
    for k2, (ch, oi) in enumerate(kept):
        orig2kept[oi] = k2
    inserts = sorted(orig2kept[d] + 1 for d in debts)
    res = []
    ki = 0
    ins = set(inserts)
    for k2, (ch, oi) in enumerate(kept):
        res.append(ch)
        ki += 1
    # rebuild with insertions (insert AFTER each mapped position, all `}`)
    out2 = []
    for k2, (ch, oi) in enumerate(kept):
        out2.append(ch)
        if k2 in ins:
            out2.append("}")
    # debts for the same group insert one `}` each; if two debts share a position, both insert
    return "$" + "".join(out2) + "$", f"moved {len(debts)} braces"

# ---------------- R3c gathered-& repair ----------------
ROWTERM = re.compile(r"\\\\|\\end\{gathered\}")

def r3c_repair(seg):
    """Unified whole-body walk: groups must not span a `&` or a row
    terminator. Debt fires at `&` (open non-env group) or at `\\\\`/\\end
    (open group); the closer = the LAST `}` before the NEXT row terminator,
    relocated to just after the group's last non-space content byte.
    Refuses when the repaired group content is empty (content-loss class)
    or no closer is available."""
    assert seg.startswith("$") and seg.endswith("$")
    body = seg[1:-1]
    if "\\begin{gathered}" not in body:
        return None, "not a gathered seg"
    s = list(body)
    notes = []
    changed = True
    guard = 0
    while changed:
        changed = False
        guard += 1
        if guard > 20:
            return None, "walk guard"
        # term positions (recomputed each pass on the current string)
        terms = [m for m in ROWTERM.finditer("".join(s))]
        term_starts = [m.start() for m in terms]
        # walk with stack
        stack = []   # (open_brace_idx)
        i = 0
        n = len(s)
        debt = None  # (group_open_idx, debt_fire_idx)
        while i < n:
            c = s[i]
            if c == "\\":
                # check row terminator / \end
                rest = "".join(s[i:i + 14])
                if rest.startswith("\\\\") or rest.startswith("\\end{gathered}"):
                    if stack:
                        debt = (stack[-1], i)
                        break
                    i += 2 if rest.startswith("\\\\") else 2
                    continue
                i += 2
                continue
            if c == "{":
                # skip \begin{gathered} env group itself
                before = "".join(s[max(0, i - 6):i])
                if before.endswith("begin"):
                    # find its close and jump
                    depth = 1
                    j = i + 1
                    while j < n and depth:
                        if s[j] == "{": depth += 1
                        elif s[j] == "}": depth -= 1
                        j += 1
                    i = j
                    continue
                stack.append(i); i += 1; continue
            if c == "}":
                if stack: stack.pop()
                i += 1; continue
            if c == "&" and stack:
                debt = (stack[-1], i)
                break
            i += 1
        if debt is None:
            if stack:
                return None, f"open groups at end: {stack}"
            break
        gopen, fire = debt
        # closer candidate: last `}` before the next terminator after fire
        nxt = min([t for t in term_starts if t > fire], default=len(s))
        closes = [j for j in range(fire, nxt) if s[j] == "}"]
        if not closes:
            return None, f"debt at {fire}: no closer before next terminator"

        def pure_clean(buf):
            """walk with NO repairs: True iff no group spans &/terminator and
            the stack ends empty (the \\begin{gathered} env group skipped)."""
            st = []
            i2 = 0
            n2 = len(buf)
            while i2 < n2:
                c = buf[i2]
                if c == "\\":
                    rest = "".join(buf[i2:i2 + 14])
                    if rest.startswith("\\\\") or rest.startswith("\\end{gathered}"):
                        if st:
                            return False
                        i2 += 2
                        continue
                    i2 += 2
                    continue
                if c == "{":
                    before = "".join(buf[max(0, i2 - 6):i2])
                    if before.endswith("begin"):
                        depth = 1
                        j2 = i2 + 1
                        while j2 < n2 and depth:
                            if buf[j2] == "{": depth += 1
                            elif buf[j2] == "}": depth -= 1
                            j2 += 1
                        i2 = j2
                        continue
                    st.append(i2); i2 += 1; continue
                if c == "}":
                    if st: st.pop()
                    i2 += 1; continue
                if c == "&" and st:
                    return False
                i2 += 1
            return not st

        accepted = None
        for take in reversed(closes):
            ins = fire
            while ins - 1 > gopen and s[ins - 1] == " ":
                ins -= 1
            cand = s[:ins] + ["}"] + s[ins:take] + s[take + 1:]
            if pure_clean(cand):
                # content-loss refusal: group content (gopen+1..ins minus spaces)
                if not [s[j] for j in range(gopen + 1, ins) if s[j] not in "& "]:
                    return None, f"debt at {fire}: empty group content (content-loss class)"
                accepted = (cand, take, ins)
                break
        if accepted is None:
            return None, f"debt at {fire}: no closer candidate yields a clean walk"
        cand, take, ins = accepted
        s = cand
        notes.append(f"debt@{fire}: close from {take} to {ins}")
        changed = True
    return "$" + "".join(s) + "$", "; ".join(notes)

# ---------------- KaTeX gate ----------------
KATEX_PROBE = r"""
const katex = require('/tmp/rn11/node_modules/katex');
const segs = JSON.parse(process.argv[1]);
for (const s of segs) {
  let ok = false, err = '';
  try { katex.renderToString(s.slice(1, -1), {throwOnError: true, output: 'html'}); ok = true; }
  catch (e) { err = String(e.message).slice(0, 90); }
  console.log(JSON.stringify({seg: s, ok, err}));
}
"""

def katex_check(segs):
    p = subprocess.run(["node", "-e", KATEX_PROBE, json.dumps(segs)],
                       capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError("katex probe failed: " + p.stderr[:300])
    return [json.loads(l) for l in p.stdout.strip().splitlines()]

def main():
    pairs_b, pairs_c = [], []
    fails = []
    # R3b
    for x in ADJ["R3b_paren_brace_swap"]["items"]:
        seg = x["seg"]
        rep, note = r3b_repair(seg)
        if rep is None:
            fails.append(("R3b", seg, note))
            continue
        pairs_b.append({"seg": seg, "repaired": rep, "note": note, "ledgerCount": x["count"]})
    # R3c
    for x in ADJ["R3c_gathered_amp"]["items"]:
        seg = x["seg"]
        rep, note = r3c_repair(seg)
        if rep is None:
            fails.append(("R3c", seg, note))
            continue
        pairs_c.append({"seg": seg, "repaired": rep, "note": note, "ledgerCount": x["count"]})

    # KaTeX: repaired must render clean; corrupted should fail (or is the known R2c-style)
    allrep = [p["repaired"] for p in pairs_b + pairs_c]
    allcor = [p["seg"] for p in pairs_b + pairs_c]
    res_rep = {r["seg"]: r for r in katex_check(allrep)}
    res_cor = {r["seg"]: r for r in katex_check(allcor)}
    print("==== R3b pairs ====")
    for p in pairs_b:
        rr, rc = res_rep[p["repaired"]], res_cor[p["seg"]]
        heal = rr["ok"] and not rc["ok"]
        print(f"[{'HEAL' if heal else ('OKOK' if rr['ok'] and rc['ok'] else 'FAIL')}] "
              f"count={p['ledgerCount']} {p['note']}")
        print(f"   cor: {p['seg'][:120]}")
        print(f"   rep: {p['repaired'][:120]}")
        if not rr["ok"]:
            print(f"   rep-err: {rr['err']}")
    print("==== R3c pairs ====")
    for p in pairs_c:
        rr, rc = res_rep[p["repaired"]], res_cor[p["seg"]]
        heal = rr["ok"] and not rc["ok"]
        print(f"[{'HEAL' if heal else ('OKOK' if rr['ok'] and rc['ok'] else 'FAIL')}] "
              f"count={p['ledgerCount']} {p['note']}")
        print(f"   cor: {p['seg'][:120]}")
        print(f"   rep: {p['repaired'][:120]}")
        if not rr["ok"]:
            print(f"   rep-err: {rr['err']}")
    print("==== derivation failures (refused) ====")
    for fam, seg, note in fails:
        print(f"[REFUSED] {fam} {note}: {seg[:110]}")
    json.dump({"R3b": pairs_b, "R3c": pairs_c, "refused": fails},
              open("/tmp/rn11/r3_pairs.json", "w"), ensure_ascii=False, indent=1)
    print("wrote /tmp/rn11/r3_pairs.json")

if __name__ == "__main__":
    main()
