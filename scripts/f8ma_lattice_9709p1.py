"""9709 Paper 1 (Pure Mathematics 1) concept lattice — T-KG-PRE-6
(F8 rollout batch four, cie-a-level-maths-20-pure-1 + cie-as-maths-20-pure-1).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 9709
2020-2025 syllabus Pure Mathematics 1 section (8 topics, 33 spec points),
anchored to the served spine's point ids. The AS and A-level P1 served spines
carry identical point sets (same paper), so one lattice serves both courses
fresh; every anchor is verified against each spine before any byte is written
(0-unmapped pass law, enforced in kg_f8ma_generate.py).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1.1 Quadratics
    "MAP1-CON-COMPLETE-SQUARE": ["1.1.1"],
    "MAP1-CON-DISCRIMINANT": ["1.1.2"],
    "MAP1-CON-QUADRATIC-SOLVE": ["1.1.3"],
    "MAP1-CON-SIMULTANEOUS-QUAD": ["1.1.4"],
    "MAP1-CON-QUADRATIC-IN-FN": ["1.1.5"],
    # 1.2 Functions
    "MAP1-CON-FUNCTIONS": ["1.2.1", "1.2.2", "1.2.3", "1.2.4"],
    "MAP1-CON-TRANSFORMATIONS": ["1.2.5"],
    # 1.3 Coordinate geometry
    "MAP1-CON-LINE-EQUATION": ["1.3.1", "1.3.1a", "1.3.2"],
    "MAP1-CON-CIRCLE-EQUATION": ["1.3.2a"],
    # 1.4 Circular measure
    "MAP1-CON-RADIANS": ["1.4.1", "1.4.1a"],
    # 1.5 Trigonometry
    "MAP1-CON-TRIG-GRAPHS": ["1.5.1", "1.5.3"],
    "MAP1-CON-EXACT-VALUES": ["1.5.2"],
    "MAP1-CON-TRIG-IDENTITIES": ["1.5.4"],
    "MAP1-CON-TRIG-EQUATIONS": ["1.5.5"],
    # 1.6 Series
    "MAP1-CON-BINOMIAL": ["1.6.1"],
    "MAP1-CON-PROGRESSIONS": ["1.6.2", "1.6.3", "1.6.4"],
    # 1.7 Differentiation
    "MAP1-CON-DIFFERENTIATION": ["1.7.1", "1.7.2"],
    "MAP1-CON-DIFF-APPLICATIONS": ["1.7.3", "1.7.4"],
    # 1.8 Integration
    "MAP1-CON-INTEGRATION": ["1.8.1", "1.8.2", "1.8.3", "1.8.4"],
}

EDGES = [
    # Quadratics chain
    ("MAP1-CON-COMPLETE-SQUARE", "MAP1-CON-QUADRATIC-SOLVE", UWR),
    ("MAP1-CON-DISCRIMINANT", "MAP1-CON-QUADRATIC-SOLVE", UWR),
    ("MAP1-CON-QUADRATIC-SOLVE", "MAP1-CON-SIMULTANEOUS-QUAD", DD),
    ("MAP1-CON-QUADRATIC-SOLVE", "MAP1-CON-QUADRATIC-IN-FN", DD),
    # Coordinate geometry
    ("MAP1-CON-SIMULTANEOUS-QUAD", "MAP1-CON-CIRCLE-EQUATION", UWR),
    ("MAP1-CON-LINE-EQUATION", "MAP1-CON-CIRCLE-EQUATION", UWR),
    # Functions
    ("MAP1-CON-FUNCTIONS", "MAP1-CON-TRANSFORMATIONS", UWR),
    # Calculus
    ("MAP1-CON-LINE-EQUATION", "MAP1-CON-DIFF-APPLICATIONS", UWR),
    ("MAP1-CON-DIFFERENTIATION", "MAP1-CON-DIFF-APPLICATIONS", DD),
    ("MAP1-CON-DIFFERENTIATION", "MAP1-CON-INTEGRATION", DD),
    ("MAP1-CON-DIFF-APPLICATIONS", "MAP1-CON-INTEGRATION", UWR),
    # Trigonometry
    ("MAP1-CON-RADIANS", "MAP1-CON-TRIG-GRAPHS", UWR),
    ("MAP1-CON-TRIG-GRAPHS", "MAP1-CON-TRIG-EQUATIONS", DD),
    ("MAP1-CON-TRIG-IDENTITIES", "MAP1-CON-TRIG-EQUATIONS", UWR),
    ("MAP1-CON-EXACT-VALUES", "MAP1-CON-TRIG-EQUATIONS", UWR),
]
