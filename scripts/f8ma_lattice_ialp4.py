"""IAL Pure Mathematics 4 (WMA14) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, ial-maths-20-pure-4).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel IAL Pure Mathematics 4 unit content (7 topics, 18 spec points),
anchored to the served spine's point ids. Every anchor is machine-verified
against the spine before any byte is written (0-unmapped pass law,
enforced in kg_f8ma_generate.py).

P4 closes the A2 pure core: partial fractions feed the partial-fraction
integrals, parametric curves feed the implicit/parametric calculus and the
parametric area, the DE cluster hangs together, and the vector block is
kept as a definitional chain from vectors to the scalar product.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Proof
    "IAP4-CON-CONTRADICTION": ["1.1"],
    # 2 Algebra
    "IAP4-CON-PARTIAL-FRACTIONS": ["2.1"],
    # 3 Coordinate geometry
    "IAP4-CON-PARAMETRIC": ["3.1"],
    # 4 Series
    "IAP4-CON-BINOMIAL-SERIES": ["4.1"],
    # 5 Differentiation
    "IAP4-CON-DIFF-IMPLICIT-PARAM": ["5.1"],
    "IAP4-CON-FORM-DE": ["5.2"],
    # 6 Integration
    "IAP4-CON-VOLUME-REV": ["6.1"],
    "IAP4-CON-INT-SUB-PARTS": ["6.2"],
    "IAP4-CON-INT-PARTIAL-FRACS": ["6.3"],
    "IAP4-CON-SEPARABLE-ODE": ["6.4"],
    "IAP4-CON-PARAM-AREA": ["6.5"],
    # 7 Vectors
    "IAP4-CON-VECTORS": ["7.1", "7.3"],
    "IAP4-CON-VECTOR-MAGNITUDE": ["7.2"],
    "IAP4-CON-POSITION-VECTORS": ["7.4"],
    "IAP4-CON-VECTOR-DISTANCE": ["7.5"],
    "IAP4-CON-LINE-VECTORS": ["7.6"],
    "IAP4-CON-SCALAR-PRODUCT": ["7.7"],
}

EDGES = [
    # Parametric cluster into calculus
    ("IAP4-CON-PARAMETRIC", "IAP4-CON-DIFF-IMPLICIT-PARAM", DD),
    ("IAP4-CON-DIFF-IMPLICIT-PARAM", "IAP4-CON-FORM-DE", UWR),
    ("IAP4-CON-PARAMETRIC", "IAP4-CON-VOLUME-REV", UWR),
    ("IAP4-CON-PARAMETRIC", "IAP4-CON-PARAM-AREA", UWR),
    # Integration cluster
    ("IAP4-CON-PARTIAL-FRACTIONS", "IAP4-CON-INT-PARTIAL-FRACS", DD),
    # Differential equations
    ("IAP4-CON-FORM-DE", "IAP4-CON-SEPARABLE-ODE", DD),
    # Vectors cluster
    ("IAP4-CON-VECTORS", "IAP4-CON-VECTOR-MAGNITUDE", DD),
    ("IAP4-CON-VECTORS", "IAP4-CON-POSITION-VECTORS", DD),
    ("IAP4-CON-POSITION-VECTORS", "IAP4-CON-VECTOR-DISTANCE", DD),
    ("IAP4-CON-VECTOR-MAGNITUDE", "IAP4-CON-VECTOR-DISTANCE", UWR),
    ("IAP4-CON-VECTORS", "IAP4-CON-LINE-VECTORS", UWR),
    ("IAP4-CON-POSITION-VECTORS", "IAP4-CON-LINE-VECTORS", DD),
    ("IAP4-CON-VECTORS", "IAP4-CON-SCALAR-PRODUCT", DD),
]
