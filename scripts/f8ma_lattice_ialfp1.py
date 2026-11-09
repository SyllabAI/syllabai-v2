"""IAL Further Pure Mathematics 1 (YFM01) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3,
ial-further-maths-18-further-pure-1).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel IAL Further Pure Mathematics 1 unit content (8 topics, 25 spec
points), anchored to the served spine's point ids. Every anchor is
machine-verified against the spine before any byte is written
(0-unmapped pass law, enforced in kg_f8ma_generate.py).

FP1 opens the further core: complex numbers, roots of quadratics, the
conic sections, 2x2 matrices with their transformations, series and
induction — the web records the internal definitional chains.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Complex numbers
    "IAF1-CON-COMPLEX-NUMBERS": ["1.1"],
    "IAF1-CON-COMPLEX-ARITHMETIC": ["1.2"],
    "IAF1-CON-ARGAND": ["1.3"],
    "IAF1-CON-QUADRATIC-ROOTS": ["1.4"],
    "IAF1-CON-POLY-ROOTS": ["1.5", "1.6"],
    # 2 Roots of quadratics
    "IAF1-CON-ROOT-SUM-PRODUCT": ["2.1"],
    "IAF1-CON-ROOT-MANIPULATION": ["2.2", "2.3"],
    # 3 Numerical methods
    "IAF1-CON-NUMERICAL-NR": ["3.1"],
    # 4 Conics
    "IAF1-CON-CONICS-CARTESIAN": ["4.1"],
    "IAF1-CON-CONICS-PARAMETRIC": ["4.2", "4.3"],
    "IAF1-CON-CONIC-TANGENTS": ["4.4"],
    # 5 Matrices
    "IAF1-CON-MATRIX-ALGEBRA": ["5.1", "5.2", "5.3"],
    "IAF1-CON-DETERMINANTS": ["5.4"],
    "IAF1-CON-INVERSES": ["5.5"],
    # 6 Transformations
    "IAF1-CON-LINEAR-TRANSFORMS": ["6.1"],
    "IAF1-CON-TRANSFORM-MATRICES": ["6.2"],
    "IAF1-CON-TRANSFORM-COMBO": ["6.3", "6.4"],
    # 7 Series
    "IAF1-CON-FINITE-SERIES": ["7.1"],
    # 8 Induction
    "IAF1-CON-INDUCTION": ["8.1"],
}

EDGES = [
    # Complex numbers cluster
    ("IAF1-CON-COMPLEX-NUMBERS", "IAF1-CON-COMPLEX-ARITHMETIC", DD),
    ("IAF1-CON-COMPLEX-NUMBERS", "IAF1-CON-ARGAND", DD),
    ("IAF1-CON-COMPLEX-NUMBERS", "IAF1-CON-QUADRATIC-ROOTS", DD),
    ("IAF1-CON-QUADRATIC-ROOTS", "IAF1-CON-POLY-ROOTS", DD),
    # Roots of quadratics
    ("IAF1-CON-ROOT-SUM-PRODUCT", "IAF1-CON-ROOT-MANIPULATION", DD),
    # Conics cluster
    ("IAF1-CON-CONICS-CARTESIAN", "IAF1-CON-CONICS-PARAMETRIC", DD),
    ("IAF1-CON-CONICS-CARTESIAN", "IAF1-CON-CONIC-TANGENTS", DD),
    # Matrix cluster
    ("IAF1-CON-MATRIX-ALGEBRA", "IAF1-CON-DETERMINANTS", DD),
    ("IAF1-CON-MATRIX-ALGEBRA", "IAF1-CON-INVERSES", DD),
    ("IAF1-CON-DETERMINANTS", "IAF1-CON-INVERSES", DD),
    ("IAF1-CON-MATRIX-ALGEBRA", "IAF1-CON-LINEAR-TRANSFORMS", DD),
    ("IAF1-CON-LINEAR-TRANSFORMS", "IAF1-CON-TRANSFORM-MATRICES", DD),
    ("IAF1-CON-TRANSFORM-MATRICES", "IAF1-CON-TRANSFORM-COMBO", DD),
    ("IAF1-CON-DETERMINANTS", "IAF1-CON-TRANSFORM-COMBO", UWR),
    ("IAF1-CON-INVERSES", "IAF1-CON-TRANSFORM-COMBO", UWR),
    # Series into induction
    ("IAF1-CON-FINITE-SERIES", "IAF1-CON-INDUCTION", UWR),
]
