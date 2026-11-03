"""0607 International Maths Core concept lattice — T-KG-PRE-7
(F8 rollout batch five, cie-igcse-maths-international-maths-23-core).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 0607
Cambridge IGCSE International Mathematics Core tier (10 topics, 109 spec
points), anchored to the served spine's point ids (C-prefixed space).

Structural note of record: Core and Extended are INDEPENDENT lattices over
disjoint C*/E* point id spaces (mirroring the 0580 two-tier law from batch
four) — the Core web is not a projection of the Extended web.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Number
    "CMC-CON-NUMBER-TYPES": ["C1.1.1"],
    "CMC-CON-SETS": ["C1.2.1"],
    "CMC-CON-POWERS-ROOTS": ["C1.3.1"],
    "CMC-CON-FDP": ["C1.4.1", "C1.4.2"],
    "CMC-CON-ORDERING": ["C1.5.1"],
    "CMC-CON-FOUR-OPS": ["C1.6.1"],
    "CMC-CON-INDICES": ["C1.7.1", "C1.7.2"],
    "CMC-CON-STANDARD-FORM": ["C1.8.1", "C1.8.2", "C1.8.3"],
    "CMC-CON-ESTIMATION": ["C1.9.1", "C1.9.2", "C1.9.3"],
    "CMC-CON-RATIO": ["C1.10.1"],
    "CMC-CON-RATE": ["C1.11.1", "C1.11.2", "C1.11.3"],
    "CMC-CON-PERCENTAGES": ["C1.12.1", "C1.12.2", "C1.12.3", "C1.12.4"],
    # 2 Algebra
    "CMC-CON-ALGEBRA-INTRO": ["C2.1.1", "C2.1.2"],
    "CMC-CON-ALGEBRA-MANIP": ["C2.2.1", "C2.2.2", "C2.2.3"],
    "CMC-CON-ALG-FRACTIONS": ["C2.3.1"],
    "CMC-CON-INDICES-II": ["C2.4.1", "C2.4.2", "C2.4.3"],
    "CMC-CON-EQUATION-CONSTRUCT": ["C2.5.1", "C2.5.2"],
    "CMC-CON-SIMULTANEOUS": ["C2.5.3"],
    "CMC-CON-CHANGE-SUBJECT": ["C2.5.5"],
    "CMC-CON-INEQUALITIES": ["C2.6.1"],
    "CMC-CON-SEQUENCES": ["C2.7.1", "C2.7.2", "C2.7.3"],
    # 3 Functions
    "CMC-CON-GRAPH-TYPES": ["C3.1.1"],
    "CMC-CON-FUNCTION-NOTATION": ["C3.3.1", "C3.3.2"],
    # 4 Coordinate geometry
    "CMC-CON-COORDINATES": ["C4.1.1"],
    "CMC-CON-GRADIENT": ["C4.2.1"],
    "CMC-CON-LENGTH-MIDPOINT": ["C4.3.1", "C4.3.2"],
    "CMC-CON-LINE-EQUATION": ["C4.4.1", "C4.4.2"],
    "CMC-CON-PARALLEL-LINES": ["C4.5.1"],
    # 5 Geometry
    "CMC-CON-GEOM-VOCAB": ["C5.1.1", "C5.1.2", "C5.1.3", "C5.1.3a", "C5.1.4"],
    "CMC-CON-ANGLE-MEASURE": ["C5.2.1", "C5.2.2"],
    "CMC-CON-SIMILARITY": ["C5.3.1"],
    "CMC-CON-ANGLE-FACTS": ["C5.5.1", "C5.5.2", "C5.5.3"],
    "CMC-CON-CIRCLE-THMS-I": ["C5.6.1"],
    "CMC-CON-CIRCLE-THMS-II": ["C5.7.1"],
    # 6 Mensuration
    "CMC-CON-UNITS": ["C6.1.1"],
    "CMC-CON-AREA-PERIMETER": ["C6.2.1"],
    "CMC-CON-CIRCLES-ARCS": ["C6.3.1", "C6.3.2"],
    "CMC-CON-SURFACE-VOLUME": ["C6.4.1"],
    "CMC-CON-COMPOUND-SHAPES": ["C6.5.1", "C6.5.2"],
    # 7 Trigonometry
    "CMC-CON-PYTHAGORAS": ["C7.1.1"],
    "CMC-CON-TRIG-RATIOS": ["C7.2.1", "C7.2.2"],
    # 8 Transformations and vectors
    "CMC-CON-TRANSFORMATIONS": ["C8.1.1", "C8.1.1a", "C8.1.2", "C8.1.3", "C8.1.4"],
    # 9 Probability
    "CMC-CON-PROB-INTRO": ["C9.1.1", "C9.1.2", "C9.1.3"],
    "CMC-CON-RELATIVE-FREQ": ["C9.2.1", "C9.2.2", "C9.2.3"],
    "CMC-CON-COMBINED-EVENTS": ["C9.3.1"],
    # 10 Statistics
    "CMC-CON-DATA-INTERPRET": ["C10.2.1", "C10.2.2", "C10.2.3"],
    "CMC-CON-AVERAGES": ["C10.4.1"],
    "CMC-CON-CHARTS": ["C10.6.1"],
    "CMC-CON-SCATTER": ["C10.7.1", "C10.7.2", "C10.7.3"],
}

EDGES = [
    # Number
    ("CMC-CON-FDP", "CMC-CON-FOUR-OPS", DD),
    ("CMC-CON-ORDERING", "CMC-CON-FOUR-OPS", UWR),
    ("CMC-CON-POWERS-ROOTS", "CMC-CON-INDICES", DD),
    ("CMC-CON-INDICES", "CMC-CON-STANDARD-FORM", DD),
    ("CMC-CON-FOUR-OPS", "CMC-CON-ESTIMATION", UWR),
    ("CMC-CON-FDP", "CMC-CON-PERCENTAGES", DD),
    ("CMC-CON-FOUR-OPS", "CMC-CON-PERCENTAGES", UWR),
    ("CMC-CON-RATIO", "CMC-CON-PERCENTAGES", UWR),
    ("CMC-CON-RATE", "CMC-CON-PERCENTAGES", UWR),
    # Algebra
    ("CMC-CON-ALGEBRA-INTRO", "CMC-CON-ALGEBRA-MANIP", DD),
    ("CMC-CON-ALGEBRA-MANIP", "CMC-CON-ALG-FRACTIONS", DD),
    ("CMC-CON-ALGEBRA-MANIP", "CMC-CON-INDICES-II", UWR),
    ("CMC-CON-INDICES", "CMC-CON-INDICES-II", DD),
    ("CMC-CON-ALGEBRA-INTRO", "CMC-CON-EQUATION-CONSTRUCT", DD),
    ("CMC-CON-ALGEBRA-MANIP", "CMC-CON-EQUATION-CONSTRUCT", UWR),
    ("CMC-CON-EQUATION-CONSTRUCT", "CMC-CON-SIMULTANEOUS", DD),
    ("CMC-CON-EQUATION-CONSTRUCT", "CMC-CON-CHANGE-SUBJECT", DD),
    ("CMC-CON-EQUATION-CONSTRUCT", "CMC-CON-INEQUALITIES", UWR),
    ("CMC-CON-ORDERING", "CMC-CON-INEQUALITIES", UWR),
    ("CMC-CON-ALGEBRA-INTRO", "CMC-CON-SEQUENCES", UWR),
    ("CMC-CON-ALGEBRA-INTRO", "CMC-CON-FUNCTION-NOTATION", UWR),
    # Functions
    ("CMC-CON-GRAPH-TYPES", "CMC-CON-FUNCTION-NOTATION", UWR),
    # Coordinate geometry
    ("CMC-CON-COORDINATES", "CMC-CON-GRADIENT", DD),
    ("CMC-CON-COORDINATES", "CMC-CON-LENGTH-MIDPOINT", DD),
    ("CMC-CON-GRADIENT", "CMC-CON-LINE-EQUATION", DD),
    ("CMC-CON-COORDINATES", "CMC-CON-LINE-EQUATION", UWR),
    ("CMC-CON-LINE-EQUATION", "CMC-CON-PARALLEL-LINES", DD),
    ("CMC-CON-GRADIENT", "CMC-CON-PARALLEL-LINES", DD),
    # Geometry
    ("CMC-CON-GEOM-VOCAB", "CMC-CON-ANGLE-FACTS", UWR),
    ("CMC-CON-ANGLE-MEASURE", "CMC-CON-ANGLE-FACTS", UWR),
    ("CMC-CON-ANGLE-FACTS", "CMC-CON-CIRCLE-THMS-I", UWR),
    ("CMC-CON-CIRCLE-THMS-I", "CMC-CON-CIRCLE-THMS-II", UWR),
    ("CMC-CON-GEOM-VOCAB", "CMC-CON-SIMILARITY", UWR),
    # Mensuration
    ("CMC-CON-UNITS", "CMC-CON-AREA-PERIMETER", UWR),
    ("CMC-CON-AREA-PERIMETER", "CMC-CON-CIRCLES-ARCS", UWR),
    ("CMC-CON-CIRCLES-ARCS", "CMC-CON-SURFACE-VOLUME", UWR),
    ("CMC-CON-AREA-PERIMETER", "CMC-CON-SURFACE-VOLUME", UWR),
    ("CMC-CON-AREA-PERIMETER", "CMC-CON-COMPOUND-SHAPES", DD),
    ("CMC-CON-SURFACE-VOLUME", "CMC-CON-COMPOUND-SHAPES", DD),
    # Trigonometry
    ("CMC-CON-PYTHAGORAS", "CMC-CON-TRIG-RATIOS", UWR),
    # Probability
    ("CMC-CON-PROB-INTRO", "CMC-CON-RELATIVE-FREQ", DD),
    ("CMC-CON-PROB-INTRO", "CMC-CON-COMBINED-EVENTS", DD),
    ("CMC-CON-RELATIVE-FREQ", "CMC-CON-COMBINED-EVENTS", UWR),
    # Statistics
    ("CMC-CON-DATA-INTERPRET", "CMC-CON-AVERAGES", UWR),
    ("CMC-CON-CHARTS", "CMC-CON-SCATTER", UWR),
]
