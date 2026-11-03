"""0580 (Extended) concept lattice — T-KG-PRE-6 (F8 rollout batch four, cie-igcse-maths-25-extended).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 0580
2025 syllabus structure (9 sections, 178 spec points), anchored to the served
spine's point ids. Anchors chosen only against the syllabus outcome statements
of the served spine; every anchor is verified against the spine before any byte
is written (0-unmapped pass law, enforced in kg_f8ma_generate.py).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # -- 1 Number ------------------------------------------------------------
    "MAE-CON-NUMBER-TYPES": ["E1.1.1"],
    "MAE-CON-SETS-VENN": ["E1.2.1", "E1.2.2"],
    "MAE-CON-SQUARES-ROOTS": ["E1.3.1"],
    "MAE-CON-FDP-EQUIVALENCE": ["E1.4.1", "E1.4.2"],
    "MAE-CON-ORDERING": ["E1.5.1"],
    "MAE-CON-FOUR-OPERATIONS": ["E1.6.1"],
    "MAE-CON-INDICES": ["E1.7.1", "E1.7.2"],
    "MAE-CON-STANDARD-FORM": ["E1.8.1", "E1.8.2", "E1.8.3"],
    "MAE-CON-ROUNDING-ESTIMATION": ["E1.9.1", "E1.9.2", "E1.9.3"],
    "MAE-CON-BOUNDS": ["E1.10.1", "E1.10.2"],
    "MAE-CON-RATIO-PROPORTION-NUM": ["E1.11.1"],
    "MAE-CON-RATE-SPEED": ["E1.12.1", "E1.12.2", "E1.12.3", "E1.12.4"],
    "MAE-CON-PERCENTAGES": ["E1.13.1", "E1.13.2", "E1.13.3", "E1.13.5", "E1.13.6"],
    "MAE-CON-INTEREST": ["E1.13.4"],
    "MAE-CON-CALCULATOR-USE": ["E1.14.1", "E1.14.2", "E1.14.3"],
    "MAE-CON-TIME": ["E1.15.1", "E1.15.2", "E1.15.3"],
    "MAE-CON-MONEY": ["E1.16.1", "E1.16.2"],
    "MAE-CON-EXP-GROWTH-DECAY": ["E1.17.1", "E1.17.2"],
    "MAE-CON-SURDS": ["E1.18.1", "E1.18.2"],
    # -- 2 Algebra and graphs -------------------------------------------------
    "MAE-CON-ALGEBRAIC-NOTATION": ["E2.1.1", "E2.1.2"],
    "MAE-CON-SIMPLIFY-EXPAND": ["E2.2.1", "E2.2.2"],
    "MAE-CON-FACTORISING": ["E2.2.3", "E2.2.4"],
    "MAE-CON-COMPLETE-SQUARE": ["E2.2.5"],
    "MAE-CON-ALGEBRAIC-FRACTIONS": ["E2.3.1", "E2.3.2"],
    "MAE-CON-ALGEBRAIC-INDICES": ["E2.4.1", "E2.4.2", "E2.4.3"],
    "MAE-CON-CONSTRUCT-EXPRESSIONS": ["E2.5.1"],
    "MAE-CON-LINEAR-EQUATIONS": ["E2.5.2", "E2.5.3"],
    "MAE-CON-SIMULTANEOUS": ["E2.5.4", "E2.5.5"],
    "MAE-CON-QUADRATIC-SOLVE": ["E2.5.6"],
    "MAE-CON-CHANGE-SUBJECT": ["E2.5.7"],
    "MAE-CON-INEQUALITIES": ["E2.6.1", "E2.6.2", "E2.6.3", "E2.6.4"],
    "MAE-CON-SEQUENCES": ["E2.7.1", "E2.7.2", "E2.7.3"],
    "MAE-CON-PROPORTION-ALG": ["E2.8.1"],
    "MAE-CON-PRACTICAL-GRAPHS": ["E2.9.1", "E2.9.2", "E2.9.3", "E2.9.4"],
    "MAE-CON-VALUE-TABLE-GRAPHS": ["E2.10.1", "E2.10.1a", "E2.10.2", "E2.10.3"],
    "MAE-CON-SKETCH-FUNCTIONS": ["E2.11.1", "E2.11.2", "E2.11.3", "E2.11.4"],
    "MAE-CON-DIFFERENTIATION": ["E2.12.1", "E2.12.2", "E2.12.3", "E2.12.4", "E2.12.5"],
    "MAE-CON-FUNCTIONS": ["E2.13.1", "E2.13.2", "E2.13.3"],
    # -- 3 Coordinate geometry ------------------------------------------------
    "MAE-CON-CARTESIAN": ["E3.1.1"],
    "MAE-CON-LINE-GRAPHS": ["E3.2.1"],
    "MAE-CON-GRADIENT": ["E3.3.1", "E3.3.2"],
    "MAE-CON-SEGMENT": ["E3.4.1", "E3.4.2"],
    "MAE-CON-LINE-EQUATION": ["E3.5.1", "E3.5.2"],
    "MAE-CON-PARALLEL-PERPENDICULAR": ["E3.6.1", "E3.7.1"],
    # -- 4 Geometry -----------------------------------------------------------
    "MAE-CON-GEOM-VOCAB": ["E4.1.1", "E4.1.2", "E4.1.3"],
    "MAE-CON-CONSTRUCTIONS": ["E4.2.1", "E4.2.2", "E4.2.3"],
    "MAE-CON-SCALE-BEARINGS": ["E4.3.1", "E4.3.2", "E4.3.3"],
    "MAE-CON-SIMILARITY": ["E4.4.1", "E4.4.2", "E4.4.3"],
    "MAE-CON-SYMMETRY": ["E4.5.1", "E4.5.2"],
    "MAE-CON-ANGLE-RULES": ["E4.6.1", "E4.6.2", "E4.6.3"],
    "MAE-CON-CIRCLE-ANGLES": ["E4.7.1", "E4.8.1"],
    # -- 5 Mensuration ----------------------------------------------------------
    "MAE-CON-UNITS": ["E5.1.1", "E5.1.2"],
    "MAE-CON-PERIMETER-AREA": ["E5.2.1"],
    "MAE-CON-CIRCLE-MEASURES": ["E5.3.1", "E5.3.2"],
    "MAE-CON-SURFACE-AREA": ["E5.4.1", "E5.4.2"],
    "MAE-CON-COMPOUND-SOLIDS": ["E5.5.1", "E5.5.2"],
    # -- 6 Trigonometry ---------------------------------------------------------
    "MAE-CON-PYTHAGORAS": ["E6.1.1"],
    "MAE-CON-TRIG-RATIOS": ["E6.2.1", "E6.2.3"],
    "MAE-CON-TRIG-2D": ["E6.2.2", "E6.2.4"],
    "MAE-CON-EXACT-VALUES": ["E6.3.1", "E6.3.1a", "E6.3.2"],
    "MAE-CON-TRIG-GRAPHS": ["E6.4.1", "E6.4.2"],
    "MAE-CON-SINE-COSINE-RULE": ["E6.5.1", "E6.5.1a", "E6.5.2"],
    "MAE-CON-TRIG-3D": ["E6.6.1"],
    # -- 7 Transformations and vectors -------------------------------------------
    "MAE-CON-TRANSFORMATIONS": ["E7.1.1", "E7.1.1a", "E7.1.2", "E7.1.3", "E7.1.4"],
    "MAE-CON-VECTOR-ARITHMETIC": ["E7.2.1", "E7.2.2", "E7.2.3"],
    "MAE-CON-VECTOR-MAGNITUDE": ["E7.3.1", "E7.3.2"],
    "MAE-CON-VECTOR-GEOMETRY": ["E7.4.1", "E7.4.2", "E7.4.3", "E7.4.4"],
    # -- 8 Probability -----------------------------------------------------------
    "MAE-CON-PROBABILITY-BASICS": ["E8.1.1", "E8.1.2", "E8.1.3", "E8.1.4"],
    "MAE-CON-RELATIVE-FREQUENCY": ["E8.2.1", "E8.2.2", "E8.2.3"],
    "MAE-CON-COMBINED-EVENTS": ["E8.3.1"],
    "MAE-CON-CONDITIONAL-PROB": ["E8.4.1"],
    # -- 9 Statistics ------------------------------------------------------------
    "MAE-CON-DATA-CLASSIFY": ["E9.1.1"],
    "MAE-CON-INTERPRET-TABLES": ["E9.2.1", "E9.2.2", "E9.2.3"],
    "MAE-CON-AVERAGES": ["E9.3.1", "E9.3.2", "E9.3.3"],
    "MAE-CON-BAR-PIE": ["E9.4.1"],
    "MAE-CON-SCATTER-CORRELATION": ["E9.5.1", "E9.5.2", "E9.5.3"],
    "MAE-CON-CUMULATIVE-FREQ": ["E9.6.1", "E9.6.2"],
    "MAE-CON-HISTOGRAMS": ["E9.7.1", "E9.7.2"],
}

# (prerequisite, dependent, basis) — web edges between anchored concepts.
# Authored in the syllabus's own reading order so the calibrated export law
# (in-order pairs only, reversed dropped outright) keeps the intended
# direction; claims that the spine order reverses are omitted, not shipped.
EDGES = [
    # Number
    ("MAE-CON-NUMBER-TYPES", "MAE-CON-ORDERING", DD),
    ("MAE-CON-NUMBER-TYPES", "MAE-CON-FOUR-OPERATIONS", UWR),
    ("MAE-CON-SQUARES-ROOTS", "MAE-CON-INDICES", DD),
    ("MAE-CON-INDICES", "MAE-CON-STANDARD-FORM", UWR),
    ("MAE-CON-SQUARES-ROOTS", "MAE-CON-SURDS", DD),
    ("MAE-CON-FDP-EQUIVALENCE", "MAE-CON-PERCENTAGES", UWR),
    ("MAE-CON-FOUR-OPERATIONS", "MAE-CON-ALGEBRAIC-FRACTIONS", UWR),
    ("MAE-CON-ROUNDING-ESTIMATION", "MAE-CON-BOUNDS", DD),
    ("MAE-CON-RATIO-PROPORTION-NUM", "MAE-CON-RATE-SPEED", UWR),
    ("MAE-CON-PERCENTAGES", "MAE-CON-INTEREST", DD),
    ("MAE-CON-INTEREST", "MAE-CON-EXP-GROWTH-DECAY", UWR),
    ("MAE-CON-SETS-VENN", "MAE-CON-CONDITIONAL-PROB", UWR),
    # Algebra
    ("MAE-CON-ALGEBRAIC-NOTATION", "MAE-CON-SIMPLIFY-EXPAND", DD),
    ("MAE-CON-ALGEBRAIC-NOTATION", "MAE-CON-CONSTRUCT-EXPRESSIONS", DD),
    ("MAE-CON-SIMPLIFY-EXPAND", "MAE-CON-FACTORISING", DD),
    ("MAE-CON-FACTORISING", "MAE-CON-COMPLETE-SQUARE", DD),
    ("MAE-CON-FACTORISING", "MAE-CON-QUADRATIC-SOLVE", DD),
    ("MAE-CON-COMPLETE-SQUARE", "MAE-CON-QUADRATIC-SOLVE", UWR),
    ("MAE-CON-COMPLETE-SQUARE", "MAE-CON-SKETCH-FUNCTIONS", UWR),
    ("MAE-CON-INDICES", "MAE-CON-ALGEBRAIC-INDICES", DD),
    ("MAE-CON-ALGEBRAIC-NOTATION", "MAE-CON-CHANGE-SUBJECT", UWR),
    ("MAE-CON-CHANGE-SUBJECT", "MAE-CON-PROPORTION-ALG", UWR),
    ("MAE-CON-CONSTRUCT-EXPRESSIONS", "MAE-CON-LINEAR-EQUATIONS", DD),
    ("MAE-CON-LINEAR-EQUATIONS", "MAE-CON-SIMULTANEOUS", DD),
    ("MAE-CON-LINEAR-EQUATIONS", "MAE-CON-INEQUALITIES", DD),
    ("MAE-CON-CONSTRUCT-EXPRESSIONS", "MAE-CON-SEQUENCES", UWR),
    ("MAE-CON-RATE-SPEED", "MAE-CON-PRACTICAL-GRAPHS", UWR),
    ("MAE-CON-EXP-GROWTH-DECAY", "MAE-CON-VALUE-TABLE-GRAPHS", UWR),
    ("MAE-CON-VALUE-TABLE-GRAPHS", "MAE-CON-SKETCH-FUNCTIONS", UWR),
    ("MAE-CON-ALGEBRAIC-NOTATION", "MAE-CON-FUNCTIONS", UWR),
    # Coordinate geometry
    ("MAE-CON-CARTESIAN", "MAE-CON-LINE-GRAPHS", DD),
    ("MAE-CON-LINE-GRAPHS", "MAE-CON-GRADIENT", DD),
    ("MAE-CON-CARTESIAN", "MAE-CON-GRADIENT", UWR),
    ("MAE-CON-CARTESIAN", "MAE-CON-SEGMENT", DD),
    ("MAE-CON-LINE-GRAPHS", "MAE-CON-LINE-EQUATION", DD),
    ("MAE-CON-GRADIENT", "MAE-CON-LINE-EQUATION", UWR),
    ("MAE-CON-LINE-EQUATION", "MAE-CON-PARALLEL-PERPENDICULAR", DD),
    ("MAE-CON-GRADIENT", "MAE-CON-PARALLEL-PERPENDICULAR", UWR),
    # Geometry
    ("MAE-CON-GEOM-VOCAB", "MAE-CON-CONSTRUCTIONS", UWR),
    ("MAE-CON-CONSTRUCTIONS", "MAE-CON-SCALE-BEARINGS", UWR),
    ("MAE-CON-GEOM-VOCAB", "MAE-CON-ANGLE-RULES", UWR),
    ("MAE-CON-ANGLE-RULES", "MAE-CON-CIRCLE-ANGLES", UWR),
    ("MAE-CON-GEOM-VOCAB", "MAE-CON-CIRCLE-ANGLES", UWR),
    ("MAE-CON-SIMILARITY", "MAE-CON-TRANSFORMATIONS", UWR),
    ("MAE-CON-SYMMETRY", "MAE-CON-TRANSFORMATIONS", UWR),
    # Mensuration
    ("MAE-CON-UNITS", "MAE-CON-PERIMETER-AREA", DD),
    ("MAE-CON-GEOM-VOCAB", "MAE-CON-PERIMETER-AREA", UWR),
    ("MAE-CON-PERIMETER-AREA", "MAE-CON-CIRCLE-MEASURES", DD),
    ("MAE-CON-PERIMETER-AREA", "MAE-CON-SURFACE-AREA", DD),
    ("MAE-CON-SURFACE-AREA", "MAE-CON-COMPOUND-SOLIDS", DD),
    ("MAE-CON-CIRCLE-MEASURES", "MAE-CON-COMPOUND-SOLIDS", UWR),
    # Trigonometry
    ("MAE-CON-PYTHAGORAS", "MAE-CON-TRIG-2D", UWR),
    ("MAE-CON-TRIG-RATIOS", "MAE-CON-TRIG-2D", DD),
    ("MAE-CON-SCALE-BEARINGS", "MAE-CON-TRIG-2D", UWR),
    ("MAE-CON-TRIG-RATIOS", "MAE-CON-EXACT-VALUES", UWR),
    ("MAE-CON-TRIG-RATIOS", "MAE-CON-TRIG-GRAPHS", UWR),
    ("MAE-CON-TRIG-RATIOS", "MAE-CON-SINE-COSINE-RULE", UWR),
    ("MAE-CON-PYTHAGORAS", "MAE-CON-TRIG-3D", UWR),
    ("MAE-CON-SINE-COSINE-RULE", "MAE-CON-TRIG-3D", UWR),
    # Vectors
    ("MAE-CON-TRANSFORMATIONS", "MAE-CON-VECTOR-ARITHMETIC", UWR),
    ("MAE-CON-VECTOR-ARITHMETIC", "MAE-CON-VECTOR-MAGNITUDE", DD),
    ("MAE-CON-PYTHAGORAS", "MAE-CON-VECTOR-MAGNITUDE", UWR),
    ("MAE-CON-VECTOR-ARITHMETIC", "MAE-CON-VECTOR-GEOMETRY", DD),
    # Probability
    ("MAE-CON-PROBABILITY-BASICS", "MAE-CON-RELATIVE-FREQUENCY", DD),
    ("MAE-CON-PROBABILITY-BASICS", "MAE-CON-COMBINED-EVENTS", DD),
    ("MAE-CON-COMBINED-EVENTS", "MAE-CON-CONDITIONAL-PROB", DD),
    # Statistics
    ("MAE-CON-DATA-CLASSIFY", "MAE-CON-INTERPRET-TABLES", DD),
    ("MAE-CON-INTERPRET-TABLES", "MAE-CON-AVERAGES", DD),
    ("MAE-CON-DATA-CLASSIFY", "MAE-CON-BAR-PIE", UWR),
    ("MAE-CON-BAR-PIE", "MAE-CON-HISTOGRAMS", UWR),
    ("MAE-CON-CARTESIAN", "MAE-CON-SCATTER-CORRELATION", UWR),
    ("MAE-CON-DATA-CLASSIFY", "MAE-CON-CUMULATIVE-FREQ", UWR),
    ("MAE-CON-AVERAGES", "MAE-CON-CUMULATIVE-FREQ", UWR),
]
