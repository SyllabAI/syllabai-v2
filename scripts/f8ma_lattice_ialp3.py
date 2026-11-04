"""IAL Pure Mathematics 3 (WMA13) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, ial-maths-20-pure-3).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel IAL Pure Mathematics 3 unit content (6 topics, 18 spec points),
anchored to the served spine's point ids. Every anchor is machine-verified
against the spine before any byte is written (0-unmapped pass law,
enforced in kg_f8ma_generate.py).

P3 introduces the transcendental toolkit (sec/cosec/cot, e^x, ln x) and
the calculus that consumes it — the edges below record those internal
dependencies; P3's debts to P1/P2 live in their own lattices.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Algebra and functions
    "IAP3-CON-RATIONAL-FNS": ["1.1"],
    "IAP3-CON-FUNCTIONS": ["1.2"],
    "IAP3-CON-MODULUS": ["1.3"],
    "IAP3-CON-TRANSFORMATIONS": ["1.4"],
    # 2 Trigonometry
    "IAP3-CON-SEC-CSC-COT": ["2.1"],
    "IAP3-CON-TRIG-IDENTITIES": ["2.2", "2.3"],
    # 3 Exponentials and logarithms
    "IAP3-CON-EXP-FN": ["3.1"],
    "IAP3-CON-LN-FN": ["3.2"],
    "IAP3-CON-LOG-GRAPHS": ["3.3"],
    # 4 Differentiation
    "IAP3-CON-DIFF-STD": ["4.1"],
    "IAP3-CON-DIFF-PROD-QUOT": ["4.2"],
    "IAP3-CON-DIFF-PARAM": ["4.3"],
    "IAP3-CON-EXP-GROWTH": ["4.4"],
    # 5 Integration
    "IAP3-CON-INT-STD": ["5.1"],
    "IAP3-CON-INT-RECOGNITION": ["5.2"],
    # 6 Numerical methods
    "IAP3-CON-ROOT-LOCATION": ["6.1"],
    "IAP3-CON-ITERATION": ["6.2"],
}

EDGES = [
    # Functions cluster
    ("IAP3-CON-FUNCTIONS", "IAP3-CON-MODULUS", DD),
    ("IAP3-CON-FUNCTIONS", "IAP3-CON-TRANSFORMATIONS", UWR),
    # Trigonometry identities
    ("IAP3-CON-SEC-CSC-COT", "IAP3-CON-TRIG-IDENTITIES", DD),
    # Exponentials and logarithms
    ("IAP3-CON-EXP-FN", "IAP3-CON-LN-FN", DD),
    ("IAP3-CON-EXP-FN", "IAP3-CON-LOG-GRAPHS", UWR),
    ("IAP3-CON-LN-FN", "IAP3-CON-LOG-GRAPHS", UWR),
    # Into calculus: the new derivatives need the new functions
    ("IAP3-CON-EXP-FN", "IAP3-CON-DIFF-STD", UWR),
    ("IAP3-CON-LN-FN", "IAP3-CON-DIFF-STD", UWR),
    ("IAP3-CON-DIFF-STD", "IAP3-CON-DIFF-PROD-QUOT", DD),
    ("IAP3-CON-SEC-CSC-COT", "IAP3-CON-DIFF-PROD-QUOT", UWR),
    ("IAP3-CON-DIFF-PROD-QUOT", "IAP3-CON-DIFF-PARAM", UWR),
    # Growth and decay models
    ("IAP3-CON-EXP-FN", "IAP3-CON-EXP-GROWTH", DD),
    ("IAP3-CON-LN-FN", "IAP3-CON-EXP-GROWTH", UWR),
    # Integration chain
    ("IAP3-CON-DIFF-STD", "IAP3-CON-INT-STD", DD),
    ("IAP3-CON-INT-STD", "IAP3-CON-INT-RECOGNITION", UWR),
    ("IAP3-CON-DIFF-PROD-QUOT", "IAP3-CON-INT-RECOGNITION", UWR),
    # Numerical methods
    ("IAP3-CON-ROOT-LOCATION", "IAP3-CON-ITERATION", DD),
]
