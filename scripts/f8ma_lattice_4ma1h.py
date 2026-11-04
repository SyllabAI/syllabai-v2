"""IGCSE Mathematics A (4MA1) Higher tier concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, igcse-maths-a-18-higher).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel International GCSE Mathematics A specification (2018) Higher tier
content (6 strands, 188 spec points), anchored to the served spine's
point ids. Every anchor is machine-verified against the spine before any
byte is written (0-unmapped pass law, enforced in kg_f8ma_generate.py).

The Higher spine extends the Foundation ladder with surds, algebraic
fractions, completing the square, function notation, calculus, circle
theorems, 3D trigonometry, vectors and conditional probability — each
gets its own concept and the internal definitional chains below.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Numbers and the number system
    "4MH-CON-NUM-PLACE": ["1.1A", "1.1B", "1.1D"],
    "4MH-CON-NUM-DIRECTED": ["1.1C"],
    "4MH-CON-NUM-FOUR-RULES": ["1.1E", "1.1F"],
    "4MH-CON-NUM-PRIME-FACTORS": ["1.1G", "1.1H", "1.4D", "1.4E"],
    "4MH-CON-FRACTIONS": ["1.2A", "1.2B", "1.2C", "1.2F", "1.2I"],
    "4MH-CON-FRACTION-OF-QUANTITY": ["1.2D", "1.2E", "1.2H"],
    "4MH-CON-DECIMALS": ["1.3B", "1.3C", "1.3E"],
    "4MH-CON-RECURRING-DECIMALS": ["1.3A"],
    "4MH-CON-NUM-CONVERT": ["1.2G", "1.3D"],
    "4MH-CON-SURDS": ["1.4A", "1.4B"],
    "4MH-CON-INDICES-NUM": ["1.4C"],
    "4MH-CON-SETS": ["1.5A", "1.5B", "1.5C", "1.5D", "1.5E"],
    "4MH-CON-PERCENTAGES": ["1.6C", "1.6D", "1.6E", "1.6F", "1.6G"],
    "4MH-CON-REPEATED-PERCENT": ["1.6A", "1.6B"],
    "4MH-CON-RATIO": ["1.7A", "1.7B", "1.7C", "1.7D", "1.7E"],
    "4MH-CON-ROUNDING": ["1.8B", "1.8D"],
    "4MH-CON-BOUNDS": ["1.8A", "1.8C"],
    "4MH-CON-STANDARD-FORM": ["1.9A"],
    "4MH-CON-EVERYDAY-NUMBER": ["1.10A", "1.10B", "1.10C", "1.11A"],
    # 2 Equations, formulae and identities
    "4MH-CON-ALG-INDICES": ["2.1A", "2.1B", "2.1C", "2.1D"],
    "4MH-CON-ALG-EXPAND": ["2.2A"],
    "4MH-CON-ALG-FACTORISE": ["2.2B", "2.2F"],
    "4MH-CON-ALG-FRACS": ["2.2C"],
    "4MH-CON-COMPLETE-SQUARE": ["2.2D"],
    "4MH-CON-ALG-PROOF": ["2.2E"],
    "4MH-CON-FORMULAE": ["2.3A", "2.3B", "2.3C", "2.3D", "2.3E", "2.3F"],
    "4MH-CON-LINEAR-EQUATIONS": ["2.4A", "2.4B"],
    "4MH-CON-PROPORTION": ["2.5A"],
    "4MH-CON-SIMULTANEOUS": ["2.6A", "2.6B"],
    "4MH-CON-QUAD-SOLVE": ["2.7A", "2.7B", "2.7C"],
    "4MH-CON-QUAD-SIMULT": ["2.7D"],
    "4MH-CON-INEQUALITIES": ["2.8C", "2.8D", "2.8E"],
    "4MH-CON-QUAD-INEQUALITIES": ["2.8A", "2.8B"],
    # 3 Sequences, functions and graphs
    "4MH-CON-AP": ["3.1A", "3.1B", "3.1C"],
    "4MH-CON-FUNCTIONS": ["3.2A", "3.2B", "3.2C", "3.2D"],
    "4MH-CON-GRAPHS-INTERPRET": ["3.3A", "3.3I"],
    "4MH-CON-TRANSFORMS-FN": ["3.3B", "3.3C"],
    "4MH-CON-GRADIENTS-NONLIN": ["3.3D"],
    "4MH-CON-GRAPH-INTERSECT": ["3.3E"],
    "4MH-CON-STRAIGHT-LINE": ["3.3F", "3.3G", "3.3H"],
    "4MH-CON-CALCULUS": ["3.4A", "3.4B", "3.4C", "3.4D", "3.4E"],
    # 4 Geometry
    "4MH-CON-ANGLES": ["4.1A", "4.1B", "4.1C", "4.1D"],
    "4MH-CON-POLYGONS": ["4.2A", "4.2B", "4.2C", "4.2D", "4.2E"],
    "4MH-CON-CONGRUENCE": ["4.2F", "4.2G"],
    "4MH-CON-SYMMETRY": ["4.3A"],
    "4MH-CON-MEASURES": ["4.4A", "4.4B", "4.4C", "4.4E"],
    "4MH-CON-BEARINGS": ["4.4D"],
    "4MH-CON-SPEED": ["4.4F", "4.4G"],
    "4MH-CON-CONSTRUCTIONS": ["4.5A", "4.5B", "4.5C", "4.5D"],
    "4MH-CON-CIRCLE-THEOREMS": ["4.6A", "4.6B", "4.6C"],
    "4MH-CON-GEOM-REASONING": ["4.7A"],
    "4MH-CON-TRIG-EXTENDED": ["4.8A", "4.8B", "4.8C"],
    "4MH-CON-PYTHAGORAS-3D": ["4.8D"],
    "4MH-CON-TRIG-AREA": ["4.8E"],
    "4MH-CON-TRIG-3D": ["4.8F"],
    "4MH-CON-SECTORS": ["4.9A"],
    "4MH-CON-PERIMETER-AREA": ["4.9B", "4.9C", "4.9D", "4.9E"],
    "4MH-CON-SPHERE-CONE": ["4.10A"],
    "4MH-CON-SOLIDS": ["4.10B", "4.10C", "4.10D", "4.10E", "4.10F"],
    "4MH-CON-SIMILAR-AREA-VOL": ["4.11A", "4.11B", "4.11C"],
    # 5 Vectors and transformations
    "4MH-CON-VECTORS": ["5.1A", "5.1B", "5.1C", "5.1D", "5.1E", "5.1F", "5.1G"],
    "4MH-CON-RIGID-TRANSFORMS": ["5.2A", "5.2B", "5.2C", "5.2D", "5.2E", "5.2F", "5.2G", "5.2H", "5.2I"],
    "4MH-CON-ENLARGEMENT": ["5.2J", "5.2K", "5.2L"],
    "4MH-CON-TRANSFORM-DESCRIBE": ["5.2M"],
    # 6 Statistics and probability
    "4MH-CON-HISTOGRAMS": ["6.1A"],
    "4MH-CON-CUM-FREQ": ["6.1B", "6.1C"],
    "4MH-CON-MEDIAN-CF": ["6.2A"],
    "4MH-CON-SPREAD": ["6.2B", "6.2C", "6.2D"],
    "4MH-CON-PROB-TREES": ["6.3A", "6.3B"],
    "4MH-CON-CONDITIONAL-PROB": ["6.3C", "6.3D"],
    "4MH-CON-PROB-BASICS": ["6.3E", "6.3F", "6.3G", "6.3H", "6.3I", "6.3J"],
}

EDGES = [
    # Number ladder
    ("4MH-CON-NUM-PLACE", "4MH-CON-NUM-FOUR-RULES", DD),
    ("4MH-CON-NUM-DIRECTED", "4MH-CON-NUM-FOUR-RULES", UWR),
    ("4MH-CON-NUM-FOUR-RULES", "4MH-CON-NUM-PRIME-FACTORS", UWR),
    ("4MH-CON-NUM-FOUR-RULES", "4MH-CON-FRACTIONS", UWR),
    ("4MH-CON-NUM-FOUR-RULES", "4MH-CON-EVERYDAY-NUMBER", UWR),
    ("4MH-CON-FRACTIONS", "4MH-CON-FRACTION-OF-QUANTITY", DD),
    ("4MH-CON-NUM-PLACE", "4MH-CON-DECIMALS", DD),
    ("4MH-CON-FRACTIONS", "4MH-CON-RECURRING-DECIMALS", DD),
    ("4MH-CON-FRACTIONS", "4MH-CON-NUM-CONVERT", DD),
    ("4MH-CON-NUM-FOUR-RULES", "4MH-CON-SURDS", UWR),
    ("4MH-CON-NUM-FOUR-RULES", "4MH-CON-INDICES-NUM", UWR),
    ("4MH-CON-FRACTIONS", "4MH-CON-PERCENTAGES", DD),
    ("4MH-CON-DECIMALS", "4MH-CON-PERCENTAGES", UWR),
    ("4MH-CON-FRACTIONS", "4MH-CON-REPEATED-PERCENT", UWR),
    ("4MH-CON-FRACTIONS", "4MH-CON-RATIO", UWR),
    ("4MH-CON-BOUNDS", "4MH-CON-ROUNDING", DD),
    ("4MH-CON-NUM-PLACE", "4MH-CON-BOUNDS", UWR),
    ("4MH-CON-INDICES-NUM", "4MH-CON-STANDARD-FORM", UWR),
    # Algebra ladder
    ("4MH-CON-INDICES-NUM", "4MH-CON-ALG-INDICES", UWR),
    ("4MH-CON-ALG-INDICES", "4MH-CON-ALG-EXPAND", UWR),
    ("4MH-CON-ALG-EXPAND", "4MH-CON-ALG-FACTORISE", DD),
    ("4MH-CON-ALG-FACTORISE", "4MH-CON-ALG-FRACS", DD),
    ("4MH-CON-FRACTIONS", "4MH-CON-ALG-FRACS", UWR),
    ("4MH-CON-ALG-EXPAND", "4MH-CON-COMPLETE-SQUARE", DD),
    ("4MH-CON-ALG-EXPAND", "4MH-CON-ALG-PROOF", UWR),
    ("4MH-CON-ALG-EXPAND", "4MH-CON-FORMULAE", UWR),
    ("4MH-CON-ALG-EXPAND", "4MH-CON-LINEAR-EQUATIONS", DD),
    ("4MH-CON-RATIO", "4MH-CON-PROPORTION", DD),
    ("4MH-CON-LINEAR-EQUATIONS", "4MH-CON-SIMULTANEOUS", DD),
    ("4MH-CON-ALG-FACTORISE", "4MH-CON-QUAD-SOLVE", DD),
    ("4MH-CON-COMPLETE-SQUARE", "4MH-CON-QUAD-SOLVE", UWR),
    ("4MH-CON-FORMULAE", "4MH-CON-QUAD-SOLVE", UWR),
    ("4MH-CON-QUAD-SOLVE", "4MH-CON-QUAD-SIMULT", DD),
    ("4MH-CON-SIMULTANEOUS", "4MH-CON-QUAD-SIMULT", UWR),
    ("4MH-CON-LINEAR-EQUATIONS", "4MH-CON-INEQUALITIES", DD),
    ("4MH-CON-QUAD-SOLVE", "4MH-CON-QUAD-INEQUALITIES", DD),
    # Functions, graphs and calculus
    ("4MH-CON-SETS", "4MH-CON-FUNCTIONS", UWR),
    ("4MH-CON-FUNCTIONS", "4MH-CON-TRANSFORMS-FN", UWR),
    ("4MH-CON-GRAPHS-INTERPRET", "4MH-CON-TRANSFORMS-FN", DD),
    ("4MH-CON-QUAD-SOLVE", "4MH-CON-GRAPHS-INTERPRET", UWR),
    ("4MH-CON-GRAPHS-INTERPRET", "4MH-CON-GRADIENTS-NONLIN", UWR),
    ("4MH-CON-GRADIENTS-NONLIN", "4MH-CON-CALCULUS", UWR),
    ("4MH-CON-ALG-INDICES", "4MH-CON-CALCULUS", DD),
    ("4MH-CON-GRAPHS-INTERPRET", "4MH-CON-GRAPH-INTERSECT", UWR),
    ("4MH-CON-QUAD-SIMULT", "4MH-CON-GRAPH-INTERSECT", UWR),
    ("4MH-CON-GRAPHS-INTERPRET", "4MH-CON-STRAIGHT-LINE", UWR),
    ("4MH-CON-AP", "4MH-CON-ALG-INDICES", UWR),
    # Geometry ladder
    ("4MH-CON-ANGLES", "4MH-CON-POLYGONS", DD),
    ("4MH-CON-POLYGONS", "4MH-CON-CONGRUENCE", UWR),
    ("4MH-CON-POLYGONS", "4MH-CON-SYMMETRY", UWR),
    ("4MH-CON-MEASURES", "4MH-CON-BEARINGS", UWR),
    ("4MH-CON-MEASURES", "4MH-CON-SPEED", UWR),
    ("4MH-CON-MEASURES", "4MH-CON-CONSTRUCTIONS", UWR),
    ("4MH-CON-ANGLES", "4MH-CON-CIRCLE-THEOREMS", DD),
    ("4MH-CON-CONGRUENCE", "4MH-CON-CIRCLE-THEOREMS", UWR),
    ("4MH-CON-ANGLES", "4MH-CON-GEOM-REASONING", DD),
    ("4MH-CON-CIRCLE-THEOREMS", "4MH-CON-GEOM-REASONING", UWR),
    ("4MH-CON-PYTHAGORAS-3D", "4MH-CON-TRIG-3D", DD),
    ("4MH-CON-TRIG-EXTENDED", "4MH-CON-PYTHAGORAS-3D", UWR),
    ("4MH-CON-TRIG-EXTENDED", "4MH-CON-TRIG-AREA", DD),
    ("4MH-CON-TRIG-EXTENDED", "4MH-CON-TRIG-3D", UWR),
    ("4MH-CON-MEASURES", "4MH-CON-SECTORS", UWR),
    ("4MH-CON-MEASURES", "4MH-CON-PERIMETER-AREA", UWR),
    ("4MH-CON-SECTORS", "4MH-CON-PERIMETER-AREA", UWR),
    ("4MH-CON-MEASURES", "4MH-CON-SPHERE-CONE", UWR),
    ("4MH-CON-PERIMETER-AREA", "4MH-CON-SOLIDS", DD),
    ("4MH-CON-POLYGONS", "4MH-CON-SIMILAR-AREA-VOL", UWR),
    # Vectors and transformations
    ("4MH-CON-VECTORS", "4MH-CON-RIGID-TRANSFORMS", UWR),
    ("4MH-CON-RIGID-TRANSFORMS", "4MH-CON-ENLARGEMENT", UWR),
    ("4MH-CON-RIGID-TRANSFORMS", "4MH-CON-TRANSFORM-DESCRIBE", DD),
    ("4MH-CON-ENLARGEMENT", "4MH-CON-TRANSFORM-DESCRIBE", UWR),
    # Statistics and probability
    ("4MH-CON-CUM-FREQ", "4MH-CON-MEDIAN-CF", DD),
    ("4MH-CON-CUM-FREQ", "4MH-CON-SPREAD", UWR),
    ("4MH-CON-MEDIAN-CF", "4MH-CON-SPREAD", UWR),
    ("4MH-CON-PROB-TREES", "4MH-CON-CONDITIONAL-PROB", UWR),
    ("4MH-CON-PROB-TREES", "4MH-CON-PROB-BASICS", UWR),
]
