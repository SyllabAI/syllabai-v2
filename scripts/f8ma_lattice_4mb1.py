"""IGCSE Mathematics B (4MB1) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, igcse-maths-b-16).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel International GCSE Mathematics B specification (2016) content
(10 topics, 98 spec points), anchored to the served spine's point ids.
Every anchor is machine-verified against the spine before any byte is
written (0-unmapped pass law, enforced in kg_f8ma_generate.py).

Maths B runs wider than Maths A at the same tier: the factor theorem,
algebraic division, matrices and their plane transformations and vector-
matrix multiplication all appear at IGCSE — each gets its own concept.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Numbers
    "4MB-CON-NUM-OPERATIONS": ["1A"],
    "4MB-CON-PRIME-FACTORS": ["1B"],
    "4MB-CON-INDICES": ["1C"],
    "4MB-CON-SURDS": ["1D", "1E"],
    "4MB-CON-NUMBER-SETS": ["1F"],
    "4MB-CON-MEASURES-MONEY": ["1G"],
    "4MB-CON-FRACTIONS-RATIO": ["1H"],
    "4MB-CON-ACCURACY": ["1I", "1J"],
    "4MB-CON-STANDARD-FORM": ["1K"],
    # 2 Sets
    "4MB-CON-SETS": ["2A", "2B", "2C", "2D", "2E", "2F", "2G", "2H", "2I"],
    # 3 Algebra
    "4MB-CON-ALG-BASICS": ["3A"],
    "4MB-CON-FORMULAE": ["3B"],
    "4MB-CON-FACTORISE": ["3C"],
    "4MB-CON-FACTOR-THEOREM": ["3D", "3E"],
    "4MB-CON-ALG-FRACS": ["3F"],
    "4MB-CON-EQUATIONS-POLY": ["3G"],
    "4MB-CON-SIMULTANEOUS": ["3H"],
    "4MB-CON-QUAD-SIMULT": ["3I"],
    "4MB-CON-INEQUALITIES": ["3J", "3K"],
    "4MB-CON-SEQUENCES": ["3L"],
    # 4 Functions and calculus
    "4MB-CON-FUNCTIONS": ["4A", "4B", "4C", "4D", "4E", "4F"],
    "4MB-CON-VARIATION": ["4G"],
    "4MB-CON-COORDINATES": ["4H"],
    "4MB-CON-STRAIGHT-LINE": ["4I"],
    "4MB-CON-CUBIC-GRAPHS": ["4J"],
    "4MB-CON-GRADIENTS": ["4K"],
    "4MB-CON-CALCULUS": ["4L", "4M", "4N"],
    # 5 Matrices
    "4MB-CON-MATRICES": ["5A", "5B", "5C", "5D", "5E", "5F", "5G"],
    # 6 Geometry
    "4MB-CON-GEOM-PROPS": ["6A", "6B", "6C", "6D", "6E"],
    "4MB-CON-PYTHAGORAS": ["6F"],
    "4MB-CON-SIMILARITY": ["6G", "6H"],
    "4MB-CON-CONGRUENCE": ["6I", "6J"],
    "4MB-CON-CIRCLE-PROPS": ["6K", "6L"],
    "4MB-CON-LOCI": ["6M", "6N"],
    # 7 Mensuration
    "4MB-CON-MENSURATION": ["7A", "7B", "7C"],
    "4MB-CON-ARCS-SECTORS": ["7D"],
    # 8 Vectors and transformations
    "4MB-CON-VECTORS-BASICS": ["8A", "8B", "8C", "8D", "8E", "8F", "8G", "8H"],
    "4MB-CON-VECTORS-APPLY": ["8I"],
    "4MB-CON-TRANSFORMS": ["8J", "8K"],
    "4MB-CON-VECTOR-MATRIX": ["8L"],
    # 9 Trigonometry
    "4MB-CON-TRIG-RATIOS": ["9A"],
    "4MB-CON-TRIG-PROBLEMS": ["9B", "9C", "9D"],
    # 10 Statistics and probability
    "4MB-CON-DATA-DIAGRAMS": ["10A"],
    "4MB-CON-AVERAGES": ["10B", "10C", "10D"],
    "4MB-CON-PROB-BASICS": ["10E"],
    "4MB-CON-PROB-ADD": ["10F"],
    "4MB-CON-PROB-INDEPENDENT": ["10G", "10H"],
    "4MB-CON-PROB-CONDITIONAL": ["10I", "10J"],
    "4MB-CON-EXPECTED-FREQ": ["10K"],
}

EDGES = [
    # Number ladder
    ("4MB-CON-NUM-OPERATIONS", "4MB-CON-PRIME-FACTORS", UWR),
    ("4MB-CON-NUM-OPERATIONS", "4MB-CON-INDICES", UWR),
    ("4MB-CON-NUM-OPERATIONS", "4MB-CON-SURDS", UWR),
    ("4MB-CON-NUM-OPERATIONS", "4MB-CON-MEASURES-MONEY", UWR),
    ("4MB-CON-NUM-OPERATIONS", "4MB-CON-FRACTIONS-RATIO", UWR),
    ("4MB-CON-NUM-OPERATIONS", "4MB-CON-ACCURACY", UWR),
    ("4MB-CON-INDICES", "4MB-CON-SURDS", UWR),
    ("4MB-CON-SURDS", "4MB-CON-NUMBER-SETS", UWR),
    ("4MB-CON-INDICES", "4MB-CON-STANDARD-FORM", UWR),
    # Algebra ladder
    ("4MB-CON-NUM-OPERATIONS", "4MB-CON-ALG-BASICS", DD),
    ("4MB-CON-ALG-BASICS", "4MB-CON-FORMULAE", DD),
    ("4MB-CON-ALG-BASICS", "4MB-CON-FACTORISE", DD),
    ("4MB-CON-FACTORISE", "4MB-CON-FACTOR-THEOREM", DD),
    ("4MB-CON-FACTORISE", "4MB-CON-ALG-FRACS", DD),
    ("4MB-CON-FACTOR-THEOREM", "4MB-CON-EQUATIONS-POLY", UWR),
    ("4MB-CON-ALG-BASICS", "4MB-CON-SIMULTANEOUS", DD),
    ("4MB-CON-EQUATIONS-POLY", "4MB-CON-QUAD-SIMULT", UWR),
    ("4MB-CON-SIMULTANEOUS", "4MB-CON-QUAD-SIMULT", UWR),
    ("4MB-CON-ALG-BASICS", "4MB-CON-INEQUALITIES", DD),
    ("4MB-CON-EQUATIONS-POLY", "4MB-CON-INEQUALITIES", UWR),
    ("4MB-CON-ALG-BASICS", "4MB-CON-SEQUENCES", UWR),
    # Functions and calculus
    ("4MB-CON-SETS", "4MB-CON-FUNCTIONS", UWR),
    ("4MB-CON-FRACTIONS-RATIO", "4MB-CON-VARIATION", DD),
    ("4MB-CON-COORDINATES", "4MB-CON-STRAIGHT-LINE", DD),
    ("4MB-CON-EQUATIONS-POLY", "4MB-CON-CUBIC-GRAPHS", UWR),
    ("4MB-CON-COORDINATES", "4MB-CON-CUBIC-GRAPHS", UWR),
    ("4MB-CON-CUBIC-GRAPHS", "4MB-CON-GRADIENTS", UWR),
    ("4MB-CON-GRADIENTS", "4MB-CON-CALCULUS", UWR),
    ("4MB-CON-INDICES", "4MB-CON-CALCULUS", DD),
    # Geometry
    ("4MB-CON-GEOM-PROPS", "4MB-CON-PYTHAGORAS", UWR),
    ("4MB-CON-GEOM-PROPS", "4MB-CON-SIMILARITY", UWR),
    ("4MB-CON-GEOM-PROPS", "4MB-CON-CONGRUENCE", UWR),
    ("4MB-CON-GEOM-PROPS", "4MB-CON-CIRCLE-PROPS", UWR),
    ("4MB-CON-GEOM-PROPS", "4MB-CON-LOCI", UWR),
    ("4MB-CON-GEOM-PROPS", "4MB-CON-MENSURATION", UWR),
    ("4MB-CON-MENSURATION", "4MB-CON-ARCS-SECTORS", UWR),
    ("4MB-CON-CIRCLE-PROPS", "4MB-CON-ARCS-SECTORS", UWR),
    ("4MB-CON-GEOM-PROPS", "4MB-CON-TRIG-RATIOS", UWR),
    ("4MB-CON-TRIG-RATIOS", "4MB-CON-TRIG-PROBLEMS", DD),
    ("4MB-CON-PYTHAGORAS", "4MB-CON-TRIG-PROBLEMS", UWR),
    # Vectors and transformations
    ("4MB-CON-VECTORS-BASICS", "4MB-CON-VECTORS-APPLY", DD),
    ("4MB-CON-VECTORS-BASICS", "4MB-CON-TRANSFORMS", UWR),
    ("4MB-CON-MATRICES", "4MB-CON-VECTOR-MATRIX", DD),
    ("4MB-CON-VECTORS-BASICS", "4MB-CON-VECTOR-MATRIX", DD),
    # Statistics and probability
    ("4MB-CON-DATA-DIAGRAMS", "4MB-CON-AVERAGES", UWR),
    ("4MB-CON-PROB-BASICS", "4MB-CON-PROB-ADD", DD),
    ("4MB-CON-PROB-BASICS", "4MB-CON-PROB-INDEPENDENT", DD),
    ("4MB-CON-PROB-INDEPENDENT", "4MB-CON-PROB-CONDITIONAL", UWR),
    ("4MB-CON-PROB-INDEPENDENT", "4MB-CON-EXPECTED-FREQ", UWR),
    ("4MB-CON-PROB-CONDITIONAL", "4MB-CON-EXPECTED-FREQ", UWR),
]
