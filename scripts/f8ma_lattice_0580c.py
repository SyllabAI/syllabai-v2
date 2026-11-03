"""0580 (Core) concept lattice — T-KG-PRE-6 (F8 rollout batch four, cie-igcse-maths-25-core).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 0580
2025 Core syllabus structure (9 sections, 112 spec points), anchored to the
served spine's point ids. The Core spine uses C-prefixed point ids disjoint
from the Extended E-prefixed set, so this is a separate lattice, not a
projection. Every anchor is verified against the spine before any byte is
written (0-unmapped pass law, enforced in kg_f8ma_generate.py).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # -- 1 Number ------------------------------------------------------------
    "MAC-CON-NUMBER-TYPES": ["C1.1.1"],
    "MAC-CON-SETS-VENN": ["C1.2.1", "C1.2.2"],
    "MAC-CON-SQUARES-ROOTS": ["C1.3.1"],
    "MAC-CON-FDP-EQUIVALENCE": ["C1.4.1", "C1.4.2"],
    "MAC-CON-ORDERING": ["C1.5.1"],
    "MAC-CON-FOUR-OPERATIONS": ["C1.6.1"],
    "MAC-CON-INDICES": ["C1.7.1", "C1.7.2"],
    "MAC-CON-STANDARD-FORM": ["C1.8.1", "C1.8.2", "C1.8.3"],
    "MAC-CON-ROUNDING-ESTIMATION": ["C1.9.1", "C1.9.2", "C1.9.3"],
    "MAC-CON-BOUNDS": ["C1.10.1", "C1.10.2"],
    "MAC-CON-RATIO-PROPORTION-NUM": ["C1.11.1"],
    "MAC-CON-RATE-SPEED": ["C1.12.1", "C1.12.2", "C1.12.3", "C1.12.4"],
    "MAC-CON-PERCENTAGES": ["C1.13.1", "C1.13.2", "C1.13.3", "C1.13.5"],
    "MAC-CON-INTEREST": ["C1.13.4"],
    "MAC-CON-CALCULATOR-USE": ["C1.14.1", "C1.14.2", "C1.14.3"],
    "MAC-CON-TIME": ["C1.15.1", "C1.15.2", "C1.15.3"],
    "MAC-CON-MONEY": ["C1.16.1", "C1.16.2"],
    # -- 2 Algebra -----------------------------------------------------------
    "MAC-CON-ALGEBRAIC-NOTATION": ["C2.1.1", "C2.1.2"],
    "MAC-CON-SIMPLIFY-EXPAND": ["C2.2.1", "C2.2.2"],
    "MAC-CON-FACTORISING": ["C2.2.3"],
    "MAC-CON-ALGEBRAIC-INDICES": ["C2.4.1", "C2.4.2", "C2.4.3"],
    "MAC-CON-CONSTRUCT-EXPRESSIONS": ["C2.5.1"],
    "MAC-CON-LINEAR-EQUATIONS": ["C2.5.2"],
    "MAC-CON-SIMULTANEOUS": ["C2.5.3"],
    "MAC-CON-CHANGE-SUBJECT": ["C2.5.4"],
    "MAC-CON-INEQUALITIES": ["C2.6.1"],
    "MAC-CON-SEQUENCES": ["C2.7.1", "C2.7.2", "C2.7.3"],
    "MAC-CON-PRACTICAL-GRAPHS": ["C2.9.1", "C2.9.2"],
    "MAC-CON-VALUE-TABLE-GRAPHS": ["C2.10.1", "C2.10.2"],
    "MAC-CON-SKETCH-FUNCTIONS": ["C2.11.1", "C2.11.2"],
    # -- 3 Coordinate geometry ------------------------------------------------
    "MAC-CON-CARTESIAN": ["C3.1.1"],
    "MAC-CON-LINE-GRAPHS": ["C3.2.1"],
    "MAC-CON-GRADIENT": ["C3.3.1"],
    "MAC-CON-LINE-EQUATION": ["C3.5.1"],
    "MAC-CON-PARALLEL": ["C3.6.1"],
    # -- 4 Geometry -----------------------------------------------------------
    "MAC-CON-GEOM-VOCAB": ["C4.1.1", "C4.1.1a", "C4.1.2", "C4.1.3", "C4.1.4"],
    "MAC-CON-CONSTRUCTIONS": ["C4.2.1", "C4.2.2", "C4.2.3"],
    "MAC-CON-SCALE-BEARINGS": ["C4.3.1", "C4.3.2"],
    "MAC-CON-SIMILARITY": ["C4.4.1"],
    "MAC-CON-SYMMETRY": ["C4.5.1"],
    "MAC-CON-ANGLE-RULES": ["C4.6.1", "C4.6.2", "C4.6.3"],
    "MAC-CON-CIRCLE-ANGLES": ["C4.7.1"],
    # -- 5 Mensuration ----------------------------------------------------------
    "MAC-CON-UNITS": ["C5.1.1", "C5.1.2"],
    "MAC-CON-PERIMETER-AREA": ["C5.2.1"],
    "MAC-CON-CIRCLE-MEASURES": ["C5.3.1", "C5.3.2"],
    "MAC-CON-SURFACE-AREA": ["C5.4.1", "C5.4.2"],
    "MAC-CON-COMPOUND-SOLIDS": ["C5.5.1", "C5.5.2"],
    # -- 6 Trigonometry ---------------------------------------------------------
    "MAC-CON-PYTHAGORAS": ["C6.1.1"],
    "MAC-CON-TRIG-RATIOS": ["C6.2.1"],
    "MAC-CON-TRIG-2D": ["C6.2.2"],
    # -- 7 Transformations --------------------------------------------------------
    "MAC-CON-TRANSFORMATIONS": ["C7.1.1", "C7.1.1a", "C7.1.2", "C7.1.3", "C7.1.4"],
    # -- 8 Probability -----------------------------------------------------------
    "MAC-CON-PROBABILITY-BASICS": ["C8.1.1", "C8.1.2", "C8.1.3"],
    "MAC-CON-RELATIVE-FREQUENCY": ["C8.2.1", "C8.2.2", "C8.2.3"],
    "MAC-CON-COMBINED-EVENTS": ["C8.3.1"],
    # -- 9 Statistics ------------------------------------------------------------
    "MAC-CON-DATA-CLASSIFY": ["C9.1.1"],
    "MAC-CON-INTERPRET-TABLES": ["C9.2.1", "C9.2.2", "C9.2.3"],
    "MAC-CON-AVERAGES": ["C9.3.1"],
    "MAC-CON-BAR-PIE": ["C9.4.1"],
    "MAC-CON-SCATTER-CORRELATION": ["C9.5.1", "C9.5.2", "C9.5.3"],
}

EDGES = [
    # Number
    ("MAC-CON-NUMBER-TYPES", "MAC-CON-ORDERING", DD),
    ("MAC-CON-NUMBER-TYPES", "MAC-CON-FOUR-OPERATIONS", UWR),
    ("MAC-CON-SQUARES-ROOTS", "MAC-CON-INDICES", DD),
    ("MAC-CON-INDICES", "MAC-CON-STANDARD-FORM", UWR),
    ("MAC-CON-FDP-EQUIVALENCE", "MAC-CON-PERCENTAGES", UWR),
    ("MAC-CON-ROUNDING-ESTIMATION", "MAC-CON-BOUNDS", DD),
    ("MAC-CON-RATIO-PROPORTION-NUM", "MAC-CON-RATE-SPEED", UWR),
    ("MAC-CON-PERCENTAGES", "MAC-CON-INTEREST", DD),
    # Algebra
    ("MAC-CON-ALGEBRAIC-NOTATION", "MAC-CON-SIMPLIFY-EXPAND", DD),
    ("MAC-CON-ALGEBRAIC-NOTATION", "MAC-CON-CONSTRUCT-EXPRESSIONS", DD),
    ("MAC-CON-SIMPLIFY-EXPAND", "MAC-CON-FACTORISING", DD),
    ("MAC-CON-INDICES", "MAC-CON-ALGEBRAIC-INDICES", DD),
    ("MAC-CON-ALGEBRAIC-NOTATION", "MAC-CON-CHANGE-SUBJECT", UWR),
    ("MAC-CON-CONSTRUCT-EXPRESSIONS", "MAC-CON-LINEAR-EQUATIONS", DD),
    ("MAC-CON-LINEAR-EQUATIONS", "MAC-CON-SIMULTANEOUS", DD),
    ("MAC-CON-LINEAR-EQUATIONS", "MAC-CON-INEQUALITIES", DD),
    ("MAC-CON-CONSTRUCT-EXPRESSIONS", "MAC-CON-SEQUENCES", UWR),
    ("MAC-CON-RATE-SPEED", "MAC-CON-PRACTICAL-GRAPHS", UWR),
    ("MAC-CON-VALUE-TABLE-GRAPHS", "MAC-CON-SKETCH-FUNCTIONS", UWR),
    # Coordinate geometry
    ("MAC-CON-CARTESIAN", "MAC-CON-LINE-GRAPHS", DD),
    ("MAC-CON-LINE-GRAPHS", "MAC-CON-GRADIENT", DD),
    ("MAC-CON-LINE-GRAPHS", "MAC-CON-LINE-EQUATION", DD),
    ("MAC-CON-GRADIENT", "MAC-CON-LINE-EQUATION", UWR),
    ("MAC-CON-LINE-EQUATION", "MAC-CON-PARALLEL", DD),
    # Geometry
    ("MAC-CON-GEOM-VOCAB", "MAC-CON-CONSTRUCTIONS", UWR),
    ("MAC-CON-CONSTRUCTIONS", "MAC-CON-SCALE-BEARINGS", UWR),
    ("MAC-CON-GEOM-VOCAB", "MAC-CON-ANGLE-RULES", UWR),
    ("MAC-CON-ANGLE-RULES", "MAC-CON-CIRCLE-ANGLES", UWR),
    ("MAC-CON-SIMILARITY", "MAC-CON-TRANSFORMATIONS", UWR),
    ("MAC-CON-SYMMETRY", "MAC-CON-TRANSFORMATIONS", UWR),
    # Mensuration
    ("MAC-CON-UNITS", "MAC-CON-PERIMETER-AREA", DD),
    ("MAC-CON-GEOM-VOCAB", "MAC-CON-PERIMETER-AREA", UWR),
    ("MAC-CON-PERIMETER-AREA", "MAC-CON-CIRCLE-MEASURES", DD),
    ("MAC-CON-PERIMETER-AREA", "MAC-CON-SURFACE-AREA", DD),
    ("MAC-CON-SURFACE-AREA", "MAC-CON-COMPOUND-SOLIDS", DD),
    # Trigonometry
    ("MAC-CON-PYTHAGORAS", "MAC-CON-TRIG-2D", UWR),
    ("MAC-CON-TRIG-RATIOS", "MAC-CON-TRIG-2D", DD),
    ("MAC-CON-SCALE-BEARINGS", "MAC-CON-TRIG-2D", UWR),
    # Probability
    ("MAC-CON-PROBABILITY-BASICS", "MAC-CON-RELATIVE-FREQUENCY", DD),
    ("MAC-CON-PROBABILITY-BASICS", "MAC-CON-COMBINED-EVENTS", DD),
    # Statistics
    ("MAC-CON-DATA-CLASSIFY", "MAC-CON-INTERPRET-TABLES", DD),
    ("MAC-CON-INTERPRET-TABLES", "MAC-CON-AVERAGES", DD),
    ("MAC-CON-DATA-CLASSIFY", "MAC-CON-BAR-PIE", UWR),
    ("MAC-CON-CARTESIAN", "MAC-CON-SCATTER-CORRELATION", UWR),
]
