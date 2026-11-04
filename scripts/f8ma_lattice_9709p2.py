"""9709 Paper 2 (Pure Mathematics 2) concept lattice — T-KG-PRE-7
(F8 rollout batch five, cie-as-maths-20-pure-2 + cie-a-level-maths-20-pure-2).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 9709
2020-2025 syllabus Pure Mathematics 2 paper (6 topics, 17 spec points),
anchored to the served spine's point ids. The AS and A-level P2 served spines
carry identical point sets (same paper), so one lattice serves both courses
fresh; every anchor is verified against each spine before any byte is written
(0-unmapped pass law, enforced in kg_f8ma_generate.py).

P2 sits between P1 (landed, batch four) and P3 (this batch): every P2 topic
extends a P1 topic, so the web below is authored as the delta over P1 — the
edges record only dependencies that are INTERNAL to the P2 point set.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 2.1 Algebra (modulus + polynomial division share the OCR-merged point)
    "MAP2-CON-MODULUS": ["2.1.1", "2.1.2"],
    "MAP2-CON-POLY-DIVISION-FACTOR": ["2.1.2"],
    # 2.2 Logarithmic and exponential functions
    "MAP2-CON-LOGS": ["2.2.1"],
    "MAP2-CON-EXP-LN": ["2.2.2"],
    "MAP2-CON-LOG-EQUATIONS": ["2.2.3"],
    "MAP2-CON-LOG-LINEARISE": ["2.2.4"],
    # 2.3 Trigonometry
    "MAP2-CON-SEC-CSC-COT": ["2.3.1"],
    "MAP2-CON-TRIG-IDENTITIES": ["2.3.2"],
    # 2.4 Differentiation
    "MAP2-CON-DIFF-STD": ["2.4.1"],
    "MAP2-CON-DIFF-PROD-QUOT": ["2.4.2"],
    "MAP2-CON-DIFF-PARAM-IMPLICIT": ["2.4.3"],
    # 2.5 Integration
    "MAP2-CON-INT-REVERSE": ["2.5.1"],
    "MAP2-CON-INT-TRIG": ["2.5.2"],
    "MAP2-CON-TRAPEZIUM": ["2.5.3"],
    # 2.6 Numerical solution of equations
    "MAP2-CON-ROOT-LOCATION": ["2.6.1"],
    "MAP2-CON-ITERATION": ["2.6.2", "2.6.3"],
}

EDGES = [
    # Logs and exponentials
    ("MAP2-CON-LOGS", "MAP2-CON-EXP-LN", UWR),
    ("MAP2-CON-LOGS", "MAP2-CON-LOG-EQUATIONS", DD),
    ("MAP2-CON-EXP-LN", "MAP2-CON-LOG-EQUATIONS", UWR),
    ("MAP2-CON-LOGS", "MAP2-CON-LOG-LINEARISE", DD),
    ("MAP2-CON-EXP-LN", "MAP2-CON-LOG-LINEARISE", UWR),
    # Trigonometry
    ("MAP2-CON-SEC-CSC-COT", "MAP2-CON-TRIG-IDENTITIES", DD),
    # Into calculus: the new derivatives need the new functions
    ("MAP2-CON-EXP-LN", "MAP2-CON-DIFF-STD", UWR),
    ("MAP2-CON-SEC-CSC-COT", "MAP2-CON-DIFF-STD", UWR),
    # Differentiation chain
    ("MAP2-CON-DIFF-STD", "MAP2-CON-DIFF-PROD-QUOT", DD),
    ("MAP2-CON-DIFF-STD", "MAP2-CON-DIFF-PARAM-IMPLICIT", UWR),
    ("MAP2-CON-DIFF-PROD-QUOT", "MAP2-CON-DIFF-PARAM-IMPLICIT", UWR),
    # Integration chain
    ("MAP2-CON-DIFF-STD", "MAP2-CON-INT-REVERSE", DD),
    ("MAP2-CON-INT-REVERSE", "MAP2-CON-INT-TRIG", UWR),
    ("MAP2-CON-SEC-CSC-COT", "MAP2-CON-INT-TRIG", UWR),
    ("MAP2-CON-TRIG-IDENTITIES", "MAP2-CON-INT-TRIG", UWR),
    ("MAP2-CON-INT-REVERSE", "MAP2-CON-TRAPEZIUM", UWR),
    # Numerical solution of equations
    ("MAP2-CON-ROOT-LOCATION", "MAP2-CON-ITERATION", DD),
]
