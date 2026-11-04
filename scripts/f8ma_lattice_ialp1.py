"""IAL Pure Mathematics 1 (WMA11) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, ial-maths-20-pure-1).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel International Advanced Level Pure Mathematics 1 unit content
(5 topics, 22 spec points), anchored to the served spine's point ids.
Every anchor is machine-verified against the spine before any byte is
written (0-unmapped pass law, enforced in kg_f8ma_generate.py).

The IAL P1 spine is the entry paper of the YMA01 award: every concept
below is internal to the P1 point set — cross-paper dependencies (P2
building on P1) are carried by the per-paper lattices of this tranche,
not duplicated here.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Algebra and functions
    "IAP1-CON-INDICES": ["1.1"],
    "IAP1-CON-SURDS": ["1.2"],
    "IAP1-CON-QUAD-GRAPHS": ["1.3"],
    "IAP1-CON-DISCRIMINANT": ["1.4"],
    "IAP1-CON-COMPLETE-SQUARE": ["1.5"],
    "IAP1-CON-SIMULT-EQ": ["1.6"],
    "IAP1-CON-INEQ-INTERPRET": ["1.7"],
    "IAP1-CON-INEQ-REPRESENT": ["1.8"],
    "IAP1-CON-INEQ-SOLVE": ["1.9"],
    "IAP1-CON-POLY-FACTOR": ["1.10"],
    "IAP1-CON-SKETCH": ["1.11"],
    "IAP1-CON-TRANSFORM": ["1.12"],
    # 2 Coordinate geometry
    "IAP1-CON-LINE-EQ": ["2.1"],
    "IAP1-CON-PARALLEL-PERP": ["2.2"],
    # 3 Trigonometry
    "IAP1-CON-SINE-COSINE-RULE": ["3.1"],
    "IAP1-CON-RADIANS": ["3.2"],
    "IAP1-CON-TRIG-GRAPHS": ["3.3"],
    # 4 Differentiation
    "IAP1-CON-DERIV-DEF": ["4.1"],
    "IAP1-CON-DIFF-POW": ["4.2"],
    "IAP1-CON-TANGENT-NORMAL": ["4.3"],
    # 5 Integration
    "IAP1-CON-INT-REVERSE": ["5.1"],
    "IAP1-CON-INT-POW": ["5.2"],
}

EDGES = [
    # Number foundations into algebra
    ("IAP1-CON-INDICES", "IAP1-CON-SURDS", UWR),
    # Quadratics cluster
    ("IAP1-CON-QUAD-GRAPHS", "IAP1-CON-DISCRIMINANT", UWR),
    ("IAP1-CON-DISCRIMINANT", "IAP1-CON-COMPLETE-SQUARE", UWR),
    ("IAP1-CON-QUAD-GRAPHS", "IAP1-CON-COMPLETE-SQUARE", UWR),
    ("IAP1-CON-QUAD-GRAPHS", "IAP1-CON-SIMULT-EQ", UWR),
    ("IAP1-CON-DISCRIMINANT", "IAP1-CON-INEQ-SOLVE", UWR),
    ("IAP1-CON-QUAD-GRAPHS", "IAP1-CON-INEQ-INTERPRET", UWR),
    ("IAP1-CON-INEQ-INTERPRET", "IAP1-CON-INEQ-REPRESENT", UWR),
    # Polynomials into sketching
    ("IAP1-CON-POLY-FACTOR", "IAP1-CON-SKETCH", UWR),
    ("IAP1-CON-QUAD-GRAPHS", "IAP1-CON-SKETCH", UWR),
    ("IAP1-CON-SKETCH", "IAP1-CON-TRANSFORM", DD),
    # Coordinate geometry
    ("IAP1-CON-LINE-EQ", "IAP1-CON-PARALLEL-PERP", DD),
    # Trigonometry
    ("IAP1-CON-RADIANS", "IAP1-CON-TRIG-GRAPHS", UWR),
    # Calculus chain
    ("IAP1-CON-QUAD-GRAPHS", "IAP1-CON-DERIV-DEF", UWR),
    ("IAP1-CON-DERIV-DEF", "IAP1-CON-DIFF-POW", DD),
    ("IAP1-CON-DIFF-POW", "IAP1-CON-TANGENT-NORMAL", DD),
    ("IAP1-CON-LINE-EQ", "IAP1-CON-TANGENT-NORMAL", UWR),
    ("IAP1-CON-DIFF-POW", "IAP1-CON-INT-REVERSE", DD),
    ("IAP1-CON-INT-REVERSE", "IAP1-CON-INT-POW", DD),
]
