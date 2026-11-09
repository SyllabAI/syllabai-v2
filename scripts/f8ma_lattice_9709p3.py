"""9709 Paper 3 (Pure Mathematics 3) concept lattice — T-KG-PRE-7
(F8 rollout batch five, cie-a-level-maths-20-pure-3).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 9709
2020-2025 syllabus Pure Mathematics 3 paper (9 topics, 43 spec points),
anchored to the served spine's point ids. P3 is A-level-only (no AS P3 spine
exists in the corpus). P3 re-caps P2's algebra/logs/trig/calculus at depth and
adds vectors, differential equations and complex numbers; edges record only
dependencies INTERNAL to the P3 point set.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 3.1 Algebra
    "MAP3-CON-MODULUS": ["3.1.1", "3.1.2"],
    "MAP3-CON-POLY-FACTOR": ["3.1.3", "3.1.4"],
    "MAP3-CON-PARTIAL-FRAC": ["3.1.5"],
    "MAP3-CON-BINOMIAL-SERIES": ["3.1.6"],
    # 3.2 Logarithmic and exponential functions
    "MAP3-CON-LOGS": ["3.2.1"],
    "MAP3-CON-EXP-LN": ["3.2.2"],
    "MAP3-CON-LOG-EQUATIONS": ["3.2.3"],
    "MAP3-CON-LOG-LINEARISE": ["3.2.4"],
    # 3.3 Trigonometry
    "MAP3-CON-SEC-CSC-COT": ["3.3.1"],
    "MAP3-CON-TRIG-IDENTITIES": ["3.3.2"],
    # 3.4 Differentiation
    "MAP3-CON-DIFF-STD": ["3.4.1"],
    "MAP3-CON-DIFF-PROD-QUOT": ["3.4.2"],
    "MAP3-CON-DIFF-PARAM-IMPLICIT": ["3.4.3"],
    # 3.5 Integration
    "MAP3-CON-INT-REVERSE": ["3.5.1"],
    "MAP3-CON-INT-TRIG": ["3.5.2"],
    "MAP3-CON-INT-PARTIAL-FRAC": ["3.5.3"],
    "MAP3-CON-INT-F-FPRIME": ["3.5.4"],
    "MAP3-CON-INT-BY-PARTS": ["3.5.5"],
    "MAP3-CON-INT-SUBSTITUTION": ["3.5.6"],
    # 3.6 Numerical solution of equations
    "MAP3-CON-ROOT-LOCATION": ["3.6.1"],
    "MAP3-CON-ITERATION": ["3.6.2", "3.6.3"],
    # 3.7 Vectors
    "MAP3-CON-VECTORS-OPS": ["3.7.1", "3.7.2", "3.7.3"],
    "MAP3-CON-LINE-EQUATION-3D": ["3.7.4"],
    "MAP3-CON-LINE-INTERSECT": ["3.7.5"],
    "MAP3-CON-SCALAR-PRODUCT": ["3.7.6", "3.7.7"],
    # 3.8 Differential equations
    "MAP3-CON-DE-FORMULATE": ["3.8.1"],
    "MAP3-CON-DE-SOLVE": ["3.8.2", "3.8.3"],
    "MAP3-CON-DE-INTERPRET": ["3.8.4"],
    # 3.9 Complex numbers
    "MAP3-CON-COMPLEX-BASICS": ["3.9.1"],
    "MAP3-CON-COMPLEX-CARTESIAN-OPS": ["3.9.2"],
    "MAP3-CON-COMPLEX-CONJ-ROOTS": ["3.9.3"],
    "MAP3-CON-ARGAND": ["3.9.4"],
    "MAP3-CON-COMPLEX-POLAR": ["3.9.5"],
    "MAP3-CON-COMPLEX-ROOTS": ["3.9.6"],
    "MAP3-CON-COMPLEX-GEOMETRY": ["3.9.7", "3.9.8"],
}

EDGES = [
    # Algebra
    ("MAP3-CON-POLY-FACTOR", "MAP3-CON-PARTIAL-FRAC", UWR),
    # Logs and exponentials
    ("MAP3-CON-LOGS", "MAP3-CON-EXP-LN", UWR),
    ("MAP3-CON-LOGS", "MAP3-CON-LOG-EQUATIONS", DD),
    ("MAP3-CON-EXP-LN", "MAP3-CON-LOG-EQUATIONS", UWR),
    ("MAP3-CON-LOGS", "MAP3-CON-LOG-LINEARISE", DD),
    ("MAP3-CON-EXP-LN", "MAP3-CON-LOG-LINEARISE", UWR),
    # Trigonometry
    ("MAP3-CON-SEC-CSC-COT", "MAP3-CON-TRIG-IDENTITIES", DD),
    # Into calculus
    ("MAP3-CON-EXP-LN", "MAP3-CON-DIFF-STD", UWR),
    ("MAP3-CON-SEC-CSC-COT", "MAP3-CON-DIFF-STD", UWR),
    # Differentiation chain
    ("MAP3-CON-DIFF-STD", "MAP3-CON-DIFF-PROD-QUOT", DD),
    ("MAP3-CON-DIFF-STD", "MAP3-CON-DIFF-PARAM-IMPLICIT", UWR),
    ("MAP3-CON-DIFF-PROD-QUOT", "MAP3-CON-DIFF-PARAM-IMPLICIT", UWR),
    # Integration chain
    ("MAP3-CON-DIFF-STD", "MAP3-CON-INT-REVERSE", DD),
    ("MAP3-CON-INT-REVERSE", "MAP3-CON-INT-TRIG", UWR),
    ("MAP3-CON-SEC-CSC-COT", "MAP3-CON-INT-TRIG", UWR),
    ("MAP3-CON-TRIG-IDENTITIES", "MAP3-CON-INT-TRIG", UWR),
    ("MAP3-CON-PARTIAL-FRAC", "MAP3-CON-INT-PARTIAL-FRAC", DD),
    ("MAP3-CON-DIFF-STD", "MAP3-CON-INT-F-FPRIME", UWR),
    ("MAP3-CON-DIFF-PROD-QUOT", "MAP3-CON-INT-BY-PARTS", DD),
    ("MAP3-CON-DIFF-STD", "MAP3-CON-INT-SUBSTITUTION", UWR),
    # Numerical solution of equations
    ("MAP3-CON-ROOT-LOCATION", "MAP3-CON-ITERATION", DD),
    # Vectors
    ("MAP3-CON-VECTORS-OPS", "MAP3-CON-LINE-EQUATION-3D", DD),
    ("MAP3-CON-VECTORS-OPS", "MAP3-CON-LINE-INTERSECT", UWR),
    ("MAP3-CON-LINE-EQUATION-3D", "MAP3-CON-LINE-INTERSECT", DD),
    ("MAP3-CON-VECTORS-OPS", "MAP3-CON-SCALAR-PRODUCT", DD),
    # Differential equations
    ("MAP3-CON-DIFF-STD", "MAP3-CON-DE-FORMULATE", UWR),
    ("MAP3-CON-DIFF-PARAM-IMPLICIT", "MAP3-CON-DE-FORMULATE", UWR),
    ("MAP3-CON-INT-REVERSE", "MAP3-CON-DE-SOLVE", DD),
    ("MAP3-CON-DE-FORMULATE", "MAP3-CON-DE-SOLVE", DD),
    ("MAP3-CON-DE-SOLVE", "MAP3-CON-DE-INTERPRET", DD),
    # Complex numbers
    ("MAP3-CON-COMPLEX-BASICS", "MAP3-CON-COMPLEX-CARTESIAN-OPS", DD),
    ("MAP3-CON-COMPLEX-CARTESIAN-OPS", "MAP3-CON-COMPLEX-CONJ-ROOTS", UWR),
    ("MAP3-CON-COMPLEX-BASICS", "MAP3-CON-ARGAND", DD),
    ("MAP3-CON-COMPLEX-BASICS", "MAP3-CON-COMPLEX-POLAR", DD),
    ("MAP3-CON-COMPLEX-POLAR", "MAP3-CON-COMPLEX-ROOTS", DD),
    ("MAP3-CON-ARGAND", "MAP3-CON-COMPLEX-GEOMETRY", DD),
    ("MAP3-CON-COMPLEX-POLAR", "MAP3-CON-COMPLEX-GEOMETRY", UWR),
    ("MAP3-CON-COMPLEX-CARTESIAN-OPS", "MAP3-CON-COMPLEX-GEOMETRY", UWR),
]
