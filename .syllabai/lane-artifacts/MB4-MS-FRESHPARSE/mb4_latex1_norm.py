#!/usr/bin/env python3
"""UIUX-LATEX-1 normalizer of record — reconstruction from the 6bedab62 pairs
(376/376 byte-exact reproduction of record).

Laws (commit 6bedab62 + run-001 receipt), in order:
  1. currency $ escape (before spans)
  2. math-italic run-collapse + fate table (unknown italic cps pass through)
  3. angle-debris control glyphs before 3-uppercase -> angle
  4. triangle-quote 'ABC -> delta ABC
  5. set-complement U+02B9 -> '
  6. inverse-notation X-en-dash-1: -> $X^{-1}$:
  7. function-arrow ': x 6 ' -> ': x mapsto '
  8. flattened units (?<=m)[23] -> superscripts (no right guard)
  9. standard-form SINGLE-digit N (sibling artifact) + paren-exponent + paren-closed
 10. sqrt: paren-content / digit-run / single-letter
 11. pi -> $\pi$
 12. inline same-line ×/÷ -> $\times$/$\div$ (at most one space each side;
     neighbours never consumed — chains convert; ÷ pre-set includes ']')
 13. disclaimer strips
"""
import json, re, sys

FATE = json.load(open("/home/z/my-project/scripts/mb4_ital_fate.json"))
FATE = {int(k, 16): v for k, v in FATE.items()}
GREEK_ITAL = {0x1D70B: "\u03c0", 0x1D706: "\u03bb", 0x1D707: "\u03bc", 0x1D703: "\u03b8"}
for g, plain in GREEK_ITAL.items():
    FATE.setdefault(g, plain)

def ital_runs(s):
    """collapse runs of the same math-italic codepoint -> fate char (or keep cp)"""
    out = []
    last_src = None
    for ch in s:
        o = ord(ch)
        if 0x1D400 <= o <= 0x1D7FF:
            if last_src == o:
                continue
            out.append(FATE.get(o, ch))
            last_src = o
        else:
            out.append(ch)
            last_src = None
    return "".join(out)

def currency(s):
    return re.sub(r"(?<!\\)\$", r"\\$", s)

def angle_debris(s):
    return re.sub(r"[\x00-\x1f\x7f-\x9f]+(?=[A-Z]{3})", "\u2220", s)

def triangle_quote(s):
    return re.sub(r"'(?=[A-Z]{3})", "\u2206", s)

def set_complement(s):
    return s.replace("\u02b9", "'")

def inverse(s):
    return re.sub(r"\b([A-Za-z])\u20131:", r"$\1^{-1}$:", s)

def arrow_debris(s):
    return re.sub(r"(: x )6( )", lambda m: m.group(1) + "\u21a6" + m.group(2), s)

def units(s):
    return re.sub(r"(?<=m)2", "\u00b2", s)

def units3(s):
    return re.sub(r"(?<=m)3", "\u00b3", s)

def std_form(s):
    pat = re.compile(r"(\d) ?\u00d7 ?10(\d\d+)(?![\d.%])")
    s = pat.sub(lambda m: f"${m.group(1)} \\times 10^{{{m.group(2)}}}$", s)
    patA = re.compile(r" ?\u00d7 ?10\((\d+(?:\u2212\d+)?)\)")
    s = patA.sub(lambda m: "$\\times 10^{" + m.group(1).replace("\u2212", "-") + "}$", s)
    patB = re.compile(r"\) ?\u00d7 ?10(\d\d+)(?![\d.%])")
    s = patB.sub(lambda m: f"$) \\times 10^{{{m.group(1)}}}$", s)
    return s

def sqrt_law(s):
    s = re.sub(r"\u221a\(([^()]+)\)", r"$\\sqrt{\1}$", s)
    s = re.sub(r"\u221a(\d+)", r"$\\sqrt{\1}$", s)
    s = re.sub(r"\u221a([a-z])", r"$\\sqrt{\1}$", s)
    return s

def pi_law(s):
    return s.replace("\u03c0", "$\\pi$")

OP_PRE = set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz)\u03c0$")
OP_TGT = set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz($")
OP_PRE_DIV = OP_PRE | {"]"}
OP_RE = re.compile(r" ?([\u00d7\u00f7]) ?")

def op_law(s):
    def repl(m):
        i1, i2 = m.start(), m.end()
        pre = s[i1 - 1] if i1 > 0 else ""
        tgt = s[i2] if i2 < len(s) else ""
        preok = OP_PRE if m.group(1) == "\u00d7" else OP_PRE_DIV
        if pre in preok and tgt in OP_TGT:
            return "$\\times$" if m.group(1) == "\u00d7" else "$\\div$"
        return m.group(0)
    return OP_RE.sub(repl, s)

DISCLAIMER = re.compile(r"(?:\n\n)?Diagram NOT\n\naccurately drawn\n\n")

def disclaim(s):
    return DISCLAIMER.sub("\n\n", s)

def latex1(s):
    s = currency(s)
    s = ital_runs(s)
    s = angle_debris(s)
    s = triangle_quote(s)
    s = set_complement(s)
    s = inverse(s)
    s = arrow_debris(s)
    s = units(s)
    s = units3(s)
    s = std_form(s)
    s = sqrt_law(s)
    s = pi_law(s)
    s = op_law(s)
    s = disclaim(s)
    return s

if __name__ == "__main__":
    pairs = json.load(open("/home/z/my-project/scripts/mb4_latex1_pairs.json"))
    ok = 0
    fails = []
    for p in pairs:
        got = latex1(p["before"])
        if got == p["after"]:
            ok += 1
        else:
            fails.append((p["key"], p["before"], p["after"], got))
    print(f"REPRODUCTION: {ok}/{len(pairs)}")
    json.dump([{"key": f, "before": b, "after": a, "got": g}
               for f, b, a, g in fails[:40]],
              open("/home/z/my-project/scripts/mb4_latex1_fails.json", "w"), ensure_ascii=False)
    print(f"fails dumped: {min(40, len(fails))}")
