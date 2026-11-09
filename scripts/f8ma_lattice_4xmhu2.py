"""4MA1H modular unit (igcse-maths-a-modular-24-higher-unit-2) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, igcse-maths-a-modular-24-higher-unit-2).

AI_SUGGESTED / UNVALIDATED concept web DERIVED for the F8 lane from the
Higher tier lattice of this batch (f8ma_lattice_4ma1h.py)
by the house projection semantics: every concept's anchor bindings
re-verified against this unit's served point ids (unresolvable bindings
dropped, concepts left with zero bindings dropped) and only web edges
whose both endpoints survive kept — the same anchor re-verification and
both-endpoint survival laws as scripts/kg_f8al_project.py, applied at the
web level because the 2024 modular units assess disjoint halves of the
4MA1H spec. The per-slug 0-unmapped pass law is re-asserted at
startup by kg_f8ma_generate.py.

The 2024 modular units split the 4MA1H Higher spec into two
units; the base tier lattice anchors to the full spec, so this unit web is
its surviving restriction. Provenance of record is in the derivation stats
committed with the batch.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    '4MH-CON-NUM-PRIME-FACTORS': ['1.4D', '1.4E'],
    '4MH-CON-PERCENTAGES': ['1.6D', '1.6E', '1.6F', '1.6G'],
    '4MH-CON-REPEATED-PERCENT': ['1.6A', '1.6B'],
    '4MH-CON-RATIO': ['1.7A', '1.7B', '1.7C', '1.7D', '1.7E'],
    '4MH-CON-STANDARD-FORM': ['1.9A'],
    '4MH-CON-ALG-PROOF': ['2.2E'],
    '4MH-CON-FORMULAE': ['2.3A', '2.3B', '2.3C', '2.3D', '2.3E', '2.3F'],
    '4MH-CON-PROPORTION': ['2.5A'],
    '4MH-CON-SIMULTANEOUS': ['2.6A', '2.6B'],
    '4MH-CON-QUAD-SIMULT': ['2.7D'],
    '4MH-CON-INEQUALITIES': ['2.8C', '2.8D', '2.8E'],
    '4MH-CON-QUAD-INEQUALITIES': ['2.8A', '2.8B'],
    '4MH-CON-AP': ['3.1A', '3.1B', '3.1C'],
    '4MH-CON-FUNCTIONS': ['3.2A', '3.2B', '3.2C', '3.2D'],
    '4MH-CON-TRANSFORMS-FN': ['3.3B', '3.3C'],
    '4MH-CON-GRADIENTS-NONLIN': ['3.3D'],
    '4MH-CON-GRAPH-INTERSECT': ['3.3E'],
    '4MH-CON-CALCULUS': ['3.4A', '3.4B', '3.4C', '3.4D', '3.4E'],
    '4MH-CON-POLYGONS': ['4.2D', '4.2E'],
    '4MH-CON-CONGRUENCE': ['4.2F', '4.2G'],
    '4MH-CON-SYMMETRY': ['4.3A'],
    '4MH-CON-MEASURES': ['4.4A', '4.4B', '4.4C', '4.4E'],
    '4MH-CON-BEARINGS': ['4.4D'],
    '4MH-CON-CONSTRUCTIONS': ['4.5A', '4.5B', '4.5C', '4.5D'],
    '4MH-CON-CIRCLE-THEOREMS': ['4.6A', '4.6B', '4.6C'],
    '4MH-CON-SPHERE-CONE': ['4.10A'],
    '4MH-CON-SOLIDS': ['4.10C', '4.10D', '4.10E', '4.10F'],
    '4MH-CON-SIMILAR-AREA-VOL': ['4.11A', '4.11B', '4.11C'],
    '4MH-CON-VECTORS': ['5.1A', '5.1B', '5.1C', '5.1D', '5.1E', '5.1F', '5.1G'],
    '4MH-CON-RIGID-TRANSFORMS': ['5.2A', '5.2B', '5.2C', '5.2D', '5.2E', '5.2F', '5.2G', '5.2H', '5.2I'],
    '4MH-CON-ENLARGEMENT': ['5.2J', '5.2K', '5.2L'],
    '4MH-CON-TRANSFORM-DESCRIBE': ['5.2M'],
    '4MH-CON-CUM-FREQ': ['6.1B', '6.1C'],
    '4MH-CON-MEDIAN-CF': ['6.2A'],
    '4MH-CON-SPREAD': ['6.2B', '6.2C', '6.2D'],
}


EDGES = [
    ('4MH-CON-RATIO', '4MH-CON-PROPORTION', DD),
    ('4MH-CON-SIMULTANEOUS', '4MH-CON-QUAD-SIMULT', UWR),
    ('4MH-CON-FUNCTIONS', '4MH-CON-TRANSFORMS-FN', UWR),
    ('4MH-CON-GRADIENTS-NONLIN', '4MH-CON-CALCULUS', UWR),
    ('4MH-CON-QUAD-SIMULT', '4MH-CON-GRAPH-INTERSECT', UWR),
    ('4MH-CON-POLYGONS', '4MH-CON-CONGRUENCE', UWR),
    ('4MH-CON-POLYGONS', '4MH-CON-SYMMETRY', UWR),
    ('4MH-CON-MEASURES', '4MH-CON-BEARINGS', UWR),
    ('4MH-CON-MEASURES', '4MH-CON-CONSTRUCTIONS', UWR),
    ('4MH-CON-CONGRUENCE', '4MH-CON-CIRCLE-THEOREMS', UWR),
    ('4MH-CON-MEASURES', '4MH-CON-SPHERE-CONE', UWR),
    ('4MH-CON-POLYGONS', '4MH-CON-SIMILAR-AREA-VOL', UWR),
    ('4MH-CON-VECTORS', '4MH-CON-RIGID-TRANSFORMS', UWR),
    ('4MH-CON-RIGID-TRANSFORMS', '4MH-CON-ENLARGEMENT', UWR),
    ('4MH-CON-RIGID-TRANSFORMS', '4MH-CON-TRANSFORM-DESCRIBE', DD),
    ('4MH-CON-ENLARGEMENT', '4MH-CON-TRANSFORM-DESCRIBE', UWR),
    ('4MH-CON-CUM-FREQ', '4MH-CON-MEDIAN-CF', DD),
    ('4MH-CON-CUM-FREQ', '4MH-CON-SPREAD', UWR),
    ('4MH-CON-MEDIAN-CF', '4MH-CON-SPREAD', UWR),
]
