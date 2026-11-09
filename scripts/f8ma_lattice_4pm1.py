"""IGCSE Further Pure Mathematics (4PM1) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, igcse-further-maths-19).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel International GCSE Further Pure Mathematics specification (2019)
content (10 topics, 43 spec points), anchored to the served spine's point
ids. Every anchor is machine-verified against the spine before any byte
is written (0-unmapped pass law, enforced in kg_f8ma_generate.py).

Further Pure sits between IGCSE and A Level: logarithms and indices,
quadratic root theory, the factor theorem, series and the binomial,
vectors, coordinate geometry and the single-variable calculus block —
the web records the internal chains.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Logarithms, indices and surds
    "4PM-CON-LOGS": ["1A", "1B"],
    "4PM-CON-SURDS": ["1C", "1D"],
    # 2 Quadratic functions
    "4PM-CON-QUAD-MANIP": ["2A"],
    "4PM-CON-QUAD-ROOTS": ["2B", "2C"],
    # 3 Algebra
    "4PM-CON-ALG-DIVISION": ["3A"],
    "4PM-CON-FACTOR-REMAINDER": ["3B"],
    "4PM-CON-SIMULT-QUAD": ["3C"],
    "4PM-CON-INEQUALITIES": ["3D", "3E"],
    # 4 Graphs
    "4PM-CON-POLY-GRAPHS": ["4A"],
    "4PM-CON-GRAPHICAL-TRANSCENDENTAL": ["4B"],
    # 5 Series
    "4PM-CON-SERIES": ["5A", "5B"],
    # 6 Binomial
    "4PM-CON-BINOMIAL-SERIES": ["6A"],
    # 7 Vectors
    "4PM-CON-VECTORS": ["7A", "7B", "7C", "7D", "7E", "7F"],
    # 8 Coordinate geometry
    "4PM-CON-COORD-GEOM": ["8A", "8B", "8C", "8D", "8E"],
    # 9 Calculus
    "4PM-CON-CALCULUS": ["9A", "9B"],
    "4PM-CON-CALCULUS-APPLY": ["9C"],
    "4PM-CON-STATIONARY": ["9D", "9E"],
    "4PM-CON-TANGENTS-NORMALS": ["9F"],
    "4PM-CON-RATES": ["9G"],
    # 10 Trigonometry
    "4PM-CON-TRIG": ["10A", "10B", "10E", "10F"],
    "4PM-CON-TRIG-PROBLEMS": ["10C", "10D"],
    "4PM-CON-TRIG-ADDITION": ["10G"],
    "4PM-CON-TRIG-EQUATIONS": ["10H"],
}

EDGES = [
    # Quadratic cluster
    ("4PM-CON-QUAD-MANIP", "4PM-CON-QUAD-ROOTS", DD),
    # Algebra cluster
    ("4PM-CON-ALG-DIVISION", "4PM-CON-FACTOR-REMAINDER", DD),
    ("4PM-CON-QUAD-ROOTS", "4PM-CON-SIMULT-QUAD", UWR),
    ("4PM-CON-QUAD-MANIP", "4PM-CON-INEQUALITIES", UWR),
    # Graphs cluster
    ("4PM-CON-FACTOR-REMAINDER", "4PM-CON-POLY-GRAPHS", UWR),
    ("4PM-CON-QUAD-MANIP", "4PM-CON-POLY-GRAPHS", UWR),
    ("4PM-CON-LOGS", "4PM-CON-GRAPHICAL-TRANSCENDENTAL", UWR),
    ("4PM-CON-POLY-GRAPHS", "4PM-CON-GRAPHICAL-TRANSCENDENTAL", DD),
    # Series and binomial
    ("4PM-CON-SERIES", "4PM-CON-BINOMIAL-SERIES", UWR),
    # Calculus cluster
    ("4PM-CON-COORD-GEOM", "4PM-CON-CALCULUS", UWR),
    ("4PM-CON-CALCULUS", "4PM-CON-CALCULUS-APPLY", DD),
    ("4PM-CON-CALCULUS", "4PM-CON-STATIONARY", DD),
    ("4PM-CON-CALCULUS", "4PM-CON-TANGENTS-NORMALS", DD),
    ("4PM-CON-CALCULUS", "4PM-CON-RATES", DD),
    # Trigonometry cluster
    ("4PM-CON-TRIG", "4PM-CON-TRIG-PROBLEMS", DD),
    ("4PM-CON-TRIG", "4PM-CON-TRIG-ADDITION", UWR),
    ("4PM-CON-TRIG-ADDITION", "4PM-CON-TRIG-EQUATIONS", UWR),
    ("4PM-CON-TRIG", "4PM-CON-TRIG-EQUATIONS", DD),
]
