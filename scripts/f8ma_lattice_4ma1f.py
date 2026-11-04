"""IGCSE Mathematics A (4MA1) Foundation tier concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, igcse-maths-a-18-foundation).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel International GCSE Mathematics A specification (2018) Foundation
tier content (6 strands, 162 spec points), anchored to the served spine's
point ids. Every anchor is machine-verified against the spine before any
byte is written (0-unmapped pass law, enforced in kg_f8ma_generate.py).

The Foundation spine is a number-first ladder: number and operations feed
fractions/decimals/percentages, algebra generalises arithmetic, geometry
and statistics close the tier. The web records those internal chains at
spec-point granularity (concepts bind to the A-J skill-lettered points).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Numbers and the number system
    "4MF-CON-NUM-PLACE": ["1.1A", "1.1B", "1.1D"],
    "4MF-CON-NUM-DIRECTED": ["1.1C"],
    "4MF-CON-NUM-FOUR-RULES": ["1.1E", "1.1F"],
    "4MF-CON-NUM-PRIME-FACTORS": ["1.1G", "1.1H", "1.4D", "1.4E"],
    "4MF-CON-FRACTIONS": ["1.2A", "1.2B", "1.2C", "1.2F", "1.2I"],
    "4MF-CON-FRACTION-OF-QUANTITY": ["1.2D", "1.2E", "1.2H"],
    "4MF-CON-DECIMALS": ["1.3A", "1.3B", "1.3C"],
    "4MF-CON-NUM-CONVERT": ["1.2G", "1.3D", "1.3E"],
    "4MF-CON-SQUARES-POWERS": ["1.4A", "1.4B", "1.4C"],
    "4MF-CON-SETS": ["1.5A", "1.5B", "1.5C", "1.5D", "1.5E"],
    "4MF-CON-PERCENTAGES": ["1.6A", "1.6B", "1.6C", "1.6D", "1.6E"],
    "4MF-CON-REVERSE-PERCENT": ["1.6F"],
    "4MF-CON-COMPOUND-INTEREST": ["1.6G"],
    "4MF-CON-RATIO": ["1.7A", "1.7B", "1.7C", "1.7D", "1.7E"],
    "4MF-CON-ROUNDING": ["1.8A", "1.8B", "1.8C", "1.8D"],
    "4MF-CON-STANDARD-FORM": ["1.9A"],
    "4MF-CON-EVERYDAY-NUMBER": ["1.10A", "1.10B", "1.10C", "1.11A"],
    # 2 Equations, formulae and identities
    "4MF-CON-ALG-SYMBOLS": ["2.1A", "2.1B", "2.1C", "2.1D"],
    "4MF-CON-ALG-SUBSTITUTE": ["2.2A", "2.3C"],
    "4MF-CON-ALG-MANIPULATE": ["2.2B", "2.2C", "2.2D", "2.2E"],
    "4MF-CON-ALG-QUADRATIC-FACTOR": ["2.2F", "2.7A"],
    "4MF-CON-FORMULAE": ["2.3A", "2.3B", "2.3D", "2.3E", "2.3F"],
    "4MF-CON-LINEAR-EQUATIONS": ["2.4A", "2.4B"],
    "4MF-CON-SIMULTANEOUS": ["2.6A"],
    "4MF-CON-INEQUALITIES": ["2.8A", "2.8B", "2.8C", "2.8D", "2.8E"],
    # 3 Sequences, functions and graphs
    "4MF-CON-SEQUENCES": ["3.1A", "3.1B", "3.1C"],
    "4MF-CON-COORDINATES": ["3.3B", "3.3C", "3.3D", "3.3E"],
    "4MF-CON-GRAPHS-INTERPRET": ["3.3A", "3.3F", "3.3I"],
    "4MF-CON-STRAIGHT-LINE": ["3.3G", "3.3H"],
    # 4 Geometry
    "4MF-CON-ANGLES": ["4.1A", "4.1B", "4.1C", "4.1D"],
    "4MF-CON-POLYGONS": ["4.2A", "4.2B", "4.2C", "4.2D", "4.2E"],
    "4MF-CON-CONGRUENCE": ["4.2F", "4.2G"],
    "4MF-CON-SYMMETRY": ["4.3A"],
    "4MF-CON-MEASURES": ["4.4A", "4.4B", "4.4C", "4.4E", "4.9A"],
    "4MF-CON-BEARINGS": ["4.4D"],
    "4MF-CON-SPEED": ["4.4F", "4.4G"],
    "4MF-CON-CONSTRUCTIONS": ["4.5A", "4.5B", "4.5C", "4.5D"],
    "4MF-CON-CIRCLE-PROPS": ["4.6A", "4.6B"],
    "4MF-CON-GEOM-REASONING": ["4.7A"],
    "4MF-CON-PYTHAGORAS": ["4.8A"],
    "4MF-CON-TRIG-RATIOS": ["4.8B", "4.8C"],
    "4MF-CON-PERIMETER-AREA": ["4.9B", "4.9C", "4.9D", "4.9E"],
    "4MF-CON-SOLIDS": ["4.10A", "4.10B", "4.10C", "4.10D", "4.10E", "4.10F"],
    "4MF-CON-SIMILAR-FIGURES": ["4.11A", "4.11B"],
    # 5 Transformations
    "4MF-CON-RIGID-TRANSFORMS": ["5.2A", "5.2B", "5.2C", "5.2D", "5.2E", "5.2F", "5.2G", "5.2H", "5.2I"],
    "4MF-CON-ENLARGEMENT": ["5.2J", "5.2K", "5.2L"],
    "4MF-CON-TRANSFORM-DESCRIBE": ["5.2M"],
    # 6 Statistics and probability
    "4MF-CON-DATA-DIAGRAMS": ["6.1A", "6.1B", "6.1C"],
    "4MF-CON-AVERAGES": ["6.2A", "6.2B", "6.2C", "6.2D"],
    "4MF-CON-PROBABILITY-BASICS": ["6.3A", "6.3B", "6.3C", "6.3E"],
    "4MF-CON-PROB-TREE-OUTCOMES": ["6.3D", "6.3F", "6.3G"],
    "4MF-CON-PROB-COMPLEMENT-ADD": ["6.3H", "6.3I"],
    "4MF-CON-EXPECTED-FREQUENCY": ["6.3J"],
}

EDGES = [
    # Number ladder
    ("4MF-CON-NUM-PLACE", "4MF-CON-NUM-FOUR-RULES", DD),
    ("4MF-CON-NUM-DIRECTED", "4MF-CON-NUM-FOUR-RULES", UWR),
    ("4MF-CON-NUM-FOUR-RULES", "4MF-CON-NUM-PRIME-FACTORS", UWR),
    ("4MF-CON-NUM-FOUR-RULES", "4MF-CON-FRACTIONS", UWR),
    ("4MF-CON-NUM-FOUR-RULES", "4MF-CON-EVERYDAY-NUMBER", UWR),
    ("4MF-CON-FRACTIONS", "4MF-CON-FRACTION-OF-QUANTITY", DD),
    ("4MF-CON-NUM-PLACE", "4MF-CON-DECIMALS", DD),
    ("4MF-CON-FRACTIONS", "4MF-CON-NUM-CONVERT", DD),
    ("4MF-CON-SQUARES-POWERS", "4MF-CON-NUM-FOUR-RULES", UWR),
    ("4MF-CON-FRACTIONS", "4MF-CON-PERCENTAGES", DD),
    ("4MF-CON-DECIMALS", "4MF-CON-PERCENTAGES", UWR),
    ("4MF-CON-PERCENTAGES", "4MF-CON-REVERSE-PERCENT", DD),
    ("4MF-CON-PERCENTAGES", "4MF-CON-COMPOUND-INTEREST", DD),
    ("4MF-CON-FRACTIONS", "4MF-CON-RATIO", UWR),
    ("4MF-CON-NUM-PLACE", "4MF-CON-ROUNDING", UWR),
    ("4MF-CON-SQUARES-POWERS", "4MF-CON-STANDARD-FORM", UWR),
    # Algebra ladder
    ("4MF-CON-NUM-FOUR-RULES", "4MF-CON-ALG-SYMBOLS", DD),
    ("4MF-CON-ALG-SYMBOLS", "4MF-CON-ALG-SUBSTITUTE", DD),
    ("4MF-CON-ALG-SYMBOLS", "4MF-CON-ALG-MANIPULATE", DD),
    ("4MF-CON-ALG-MANIPULATE", "4MF-CON-ALG-QUADRATIC-FACTOR", DD),
    ("4MF-CON-ALG-SUBSTITUTE", "4MF-CON-FORMULAE", DD),
    ("4MF-CON-ALG-MANIPULATE", "4MF-CON-LINEAR-EQUATIONS", DD),
    ("4MF-CON-LINEAR-EQUATIONS", "4MF-CON-SIMULTANEOUS", DD),
    ("4MF-CON-LINEAR-EQUATIONS", "4MF-CON-INEQUALITIES", DD),
    # Graphs
    ("4MF-CON-ALG-SUBSTITUTE", "4MF-CON-GRAPHS-INTERPRET", UWR),
    ("4MF-CON-GRAPHS-INTERPRET", "4MF-CON-STRAIGHT-LINE", DD),
    ("4MF-CON-ALG-SYMBOLS", "4MF-CON-SEQUENCES", UWR),
    # Geometry ladder
    ("4MF-CON-ANGLES", "4MF-CON-POLYGONS", DD),
    ("4MF-CON-POLYGONS", "4MF-CON-CONGRUENCE", UWR),
    ("4MF-CON-POLYGONS", "4MF-CON-SYMMETRY", UWR),
    ("4MF-CON-MEASURES", "4MF-CON-BEARINGS", UWR),
    ("4MF-CON-MEASURES", "4MF-CON-SPEED", UWR),
    ("4MF-CON-MEASURES", "4MF-CON-CONSTRUCTIONS", UWR),
    ("4MF-CON-ANGLES", "4MF-CON-CIRCLE-PROPS", UWR),
    ("4MF-CON-ANGLES", "4MF-CON-GEOM-REASONING", DD),
    ("4MF-CON-POLYGONS", "4MF-CON-GEOM-REASONING", UWR),
    ("4MF-CON-SQUARES-POWERS", "4MF-CON-PYTHAGORAS", UWR),
    ("4MF-CON-PYTHAGORAS", "4MF-CON-TRIG-RATIOS", DD),
    ("4MF-CON-MEASURES", "4MF-CON-PERIMETER-AREA", UWR),
    ("4MF-CON-CIRCLE-PROPS", "4MF-CON-PERIMETER-AREA", UWR),
    ("4MF-CON-PERIMETER-AREA", "4MF-CON-SOLIDS", DD),
    ("4MF-CON-POLYGONS", "4MF-CON-SIMILAR-FIGURES", UWR),
    # Transformations
    ("4MF-CON-COORDINATES", "4MF-CON-RIGID-TRANSFORMS", UWR),
    ("4MF-CON-RIGID-TRANSFORMS", "4MF-CON-ENLARGEMENT", UWR),
    ("4MF-CON-RIGID-TRANSFORMS", "4MF-CON-TRANSFORM-DESCRIBE", DD),
    ("4MF-CON-ENLARGEMENT", "4MF-CON-TRANSFORM-DESCRIBE", UWR),
    # Statistics and probability
    ("4MF-CON-DATA-DIAGRAMS", "4MF-CON-AVERAGES", UWR),
    ("4MF-CON-PROBABILITY-BASICS", "4MF-CON-PROB-TREE-OUTCOMES", DD),
    ("4MF-CON-PROBABILITY-BASICS", "4MF-CON-PROB-COMPLEMENT-ADD", DD),
    ("4MF-CON-PROB-TREE-OUTCOMES", "4MF-CON-EXPECTED-FREQUENCY", UWR),
]
