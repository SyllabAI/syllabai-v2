#!/usr/bin/env python3
"""
T-SM-SD0-FIX-R0 carried repair (cross-lane, disclosed): the cie-igcse-economics-25
MathML speech-text pollution (T-RULE-T3-SME-COVERAGE-1 run-007 re-harvest class)
transcribed to KaTeX per the corpus 23a gate law — the same re-transcription the
T-CONSUME-EDX-1/2 + UIUX-TIER-B lanes performed on their planes. Restores the
fleet prebuild gate to green. Span-indexed replacement: each polluted span is
located by the 23a vocabulary regex, order-verified against a signature prefix,
then replaced with the authored KaTeX of the same math.
"""
import json
import re
import sys
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("apps/hub/content/cie-igcse-economics-25")

SPAN_RE = re.compile(r"`[^`]*(?:fraction numerator|end text|percent sign|open parentheses|cross times)[^`]*`")

# (signature prefix, replacement) — in file occurrence order
NOTES_REPAIRS = [
    ("`text PED =  end text fraction numerator percent sign",
     "`\\text{PED} = \\dfrac{\\%\\ \\text{change in quantity demanded}}{\\%\\ \\text{change in price}} = \\dfrac{\\%\\Delta QD}{\\%\\Delta P}`"),
    ("`percent sign space Change space equals space fraction numerator new space value",
     "`\\%\\ \\text{Change} = \\dfrac{\\text{new value} - \\text{old value}}{\\text{old value}} \\times 100`"),
    ("`percent sign triangle QD space equals space fraction numerator 40 minus 100",
     "`\\%\\Delta QD = \\dfrac{40 - 100}{100} \\times 100\n>\n> \\%\\Delta QD = -60\\%`"),
    ("`percent sign triangle straight P space equals space fraction numerator 15 space minus space 10",
     "`\\%\\Delta P = \\dfrac{15 - 10}{10} \\times 100\n>\n> \\%\\Delta P = 50\\%`"),
    ("`PED space equals space fraction numerator percent sign triangle space in thin space QD",
     "`PED = \\dfrac{\\%\\Delta QD}{\\%\\Delta P}\n>\n> PED = \\dfrac{-60}{50}\n>\n> PED = -1.2\n> `"),
    ("`text PES =  end text fraction numerator percent sign",
     "`\\text{PES} = \\dfrac{\\%\\ \\text{change in quantity supplied}}{\\%\\ \\text{change in price}} = \\dfrac{\\%\\Delta QS}{\\%\\Delta P}`"),
    ("`percent sign space Change space equals space fraction numerator new space value",
     "`\\%\\ \\text{Change} = \\dfrac{\\text{new value} - \\text{old value}}{\\text{old value}} \\times 100`"),
    ("`percent sign triangle Q S space equals space fraction numerator 120 minus 110",
     "`\\%\\Delta QS = \\dfrac{120 - 110}{110} \\times 100\n>\n> \\%\\Delta QS = 9.1\\%`"),
    ("`percent sign triangle straight P space equals space fraction numerator 1.45 space minus space 0.90",
     "`\\%\\Delta P = \\dfrac{1.45 - 0.90}{0.90} \\times 100\n>\n> \\%\\Delta P = 61\\%`"),
    ("`PE S space equals space fraction numerator percent sign triangle space in thin space Q S",
     "`PES = \\dfrac{\\%\\Delta QS}{\\%\\Delta P}\n>\n> PES = \\dfrac{9.1\\%}{61\\%}\n>\n> PES = 0.15\n> `"),
    ("`Total space revenue space open parentheses TR close parentheses",
     "`\\text{Total revenue (TR)} = \\text{Selling price (P)} \\times \\text{Quantity sold (Q)}`"),
    ("`equals fraction numerator Number space actively space seeking",
     "`= \\dfrac{\\text{Number actively seeking}}{\\text{Total labour force}} \\times 100\n>\n> = \\dfrac{600{,}000}{2{,}400{,}000} \\times 100\n>\n> = 25\\%`"),
    ("`Unemployment space rate space equals space fraction numerator 2.3 over denominator 30",
     "`\\text{Unemployment rate} = \\dfrac{2.3}{30} \\times 100\n>\n> = 7.7\\%`"),
    ("`Inflation space rate space equals space fraction numerator New space CPI",
     "`\\text{Inflation rate} = \\dfrac{\\text{New CPI} - \\text{Old CPI}}{\\text{Old CPI}} \\times 100\n>\n> = \\dfrac{136.01 - 108.75}{108.75} \\times 100\n>\n> = 25.07\\%`"),
]

QUESTIONS_REPAIRS = [
    ("`P E D space equals fraction numerator percent sign increment Q D",
     "`PED = \\dfrac{\\%\\Delta QD}{\\%\\Delta P}\n\\%\\Delta QD = \\dfrac{280 - 200}{200} \\times 100 = 40\\%\n\\%\\Delta P = \\dfrac{40 - 50}{50} \\times 100 = -20\\%\nPED = \\dfrac{40}{-20} = -2.0`"),
    ("`text PED =  end text fraction numerator percent sign space change space in space quantity space demanded over denominator percent sign spac",
     "`\\text{PED} = \\dfrac{\\%\\ \\text{change in quantity demanded}}{\\%\\ \\text{change in price}} = \\dfrac{\\%\\Delta QD}{\\%\\Delta P}\n\n\\%\\Delta QD = \\dfrac{150 - 200}{200} \\times 100 = -25\\%\n\n\\%\\Delta P = \\dfrac{120 - 80}{80} \\times 100 = 50\\%\n\n\\text{PED} = \\dfrac{25\\%}{50\\%} = 0.5`"),
    ("`text PED =  end text fraction numerator percent sign space change space in space quantity space demanded over denominator percent sign spac",
     "`\\text{PED} = \\dfrac{\\%\\ \\text{change in quantity demanded}}{\\%\\ \\text{change in price}} = \\dfrac{\\%\\Delta QD}{\\%\\Delta P}\n\n\\%\\Delta QD = 8\\%\n\n\\%\\Delta P = \\dfrac{90 - 80}{80} \\times 100 = 12.5\\%\n\n\\text{PED} = \\dfrac{8\\%}{12.5\\%} = 0.64`"),
]


def repair_value(val, repairs, counter):
    if isinstance(val, str):
        spans = SPAN_RE.findall(val)
        if not spans:
            return val
        for span in spans:
            idx = counter["i"]
            assert idx < len(repairs), f"more polluted spans than repairs ({idx})"
            sig, new = repairs[idx]
            assert span.startswith(sig[:60]), f"span {idx} signature mismatch:\n  got: {span[:90]!r}\n  want: {sig[:90]!r}"
            val = val.replace(span, new, 1)
            counter["i"] += 1
        return val
    if isinstance(val, list):
        return [repair_value(x, repairs, counter) for x in val]
    if isinstance(val, dict):
        return {k: repair_value(v, repairs, counter) for k, v in val.items()}
    return val


def main():
    for fname, repairs, expected in (
        ("notes.json", NOTES_REPAIRS, 14),
        ("questions.json", QUESTIONS_REPAIRS, 3),
    ):
        p = BASE / fname
        d = json.load(open(p))
        counter = {"i": 0}
        d = repair_value(d, repairs, counter)
        assert counter["i"] == expected, f"{fname}: repaired {counter['i']} != expected {expected}"
        raw = json.dumps(d, separators=(",", ":"), ensure_ascii=False)
        p.write_text(raw)
        # verify clean
        txt = p.read_text()
        residual = len(SPAN_RE.findall(txt))
        print(f"{fname}: {counter['i']} spans repaired, residual polluted spans: {residual}")
        assert residual == 0
    print("ECON-25 REPAIR COMPLETE")


if __name__ == "__main__":
    main()
