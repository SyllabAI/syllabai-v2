"""4MA1H modular unit (igcse-maths-a-modular-24-higher-unit-1) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, igcse-maths-a-modular-24-higher-unit-1).

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
    '4MH-CON-NUM-PLACE': ['1.1A', '1.1B', '1.1D'],
    '4MH-CON-NUM-DIRECTED': ['1.1C'],
    '4MH-CON-NUM-FOUR-RULES': ['1.1E', '1.1F'],
    '4MH-CON-NUM-PRIME-FACTORS': ['1.1G', '1.1H'],
    '4MH-CON-FRACTIONS': ['1.2A', '1.2B', '1.2C', '1.2F', '1.2I'],
    '4MH-CON-FRACTION-OF-QUANTITY': ['1.2D', '1.2E', '1.2H'],
    '4MH-CON-DECIMALS': ['1.3B', '1.3C', '1.3E'],
    '4MH-CON-RECURRING-DECIMALS': ['1.3A'],
    '4MH-CON-NUM-CONVERT': ['1.2G', '1.3D'],
    '4MH-CON-SURDS': ['1.4A', '1.4B'],
    '4MH-CON-INDICES-NUM': ['1.4C'],
    '4MH-CON-SETS': ['1.5A', '1.5B', '1.5C', '1.5D', '1.5E'],
    '4MH-CON-PERCENTAGES': ['1.6C'],
    '4MH-CON-REPEATED-PERCENT': ['1.6A', '1.6B'],
    '4MH-CON-ROUNDING': ['1.8B', '1.8D'],
    '4MH-CON-BOUNDS': ['1.8A', '1.8C'],
    '4MH-CON-EVERYDAY-NUMBER': ['1.10A', '1.10B', '1.10C', '1.11A'],
    '4MH-CON-ALG-INDICES': ['2.1A', '2.1B', '2.1C', '2.1D'],
    '4MH-CON-ALG-EXPAND': ['2.2A'],
    '4MH-CON-ALG-FACTORISE': ['2.2B', '2.2F'],
    '4MH-CON-ALG-FRACS': ['2.2C'],
    '4MH-CON-COMPLETE-SQUARE': ['2.2D'],
    '4MH-CON-ALG-PROOF': ['2.2E'],
    '4MH-CON-LINEAR-EQUATIONS': ['2.4A', '2.4B'],
    '4MH-CON-QUAD-SOLVE': ['2.7A', '2.7B', '2.7C'],
    '4MH-CON-GRAPHS-INTERPRET': ['3.3A', '3.3I'],
    '4MH-CON-TRANSFORMS-FN': ['3.3B', '3.3C'],
    '4MH-CON-GRADIENTS-NONLIN': ['3.3D'],
    '4MH-CON-GRAPH-INTERSECT': ['3.3E'],
    '4MH-CON-STRAIGHT-LINE': ['3.3F', '3.3G', '3.3H'],
    '4MH-CON-ANGLES': ['4.1A', '4.1B', '4.1C', '4.1D'],
    '4MH-CON-POLYGONS': ['4.2A', '4.2B', '4.2C'],
    '4MH-CON-SPEED': ['4.4F', '4.4G'],
    '4MH-CON-GEOM-REASONING': ['4.7A'],
    '4MH-CON-TRIG-EXTENDED': ['4.8A', '4.8B', '4.8C'],
    '4MH-CON-PYTHAGORAS-3D': ['4.8D'],
    '4MH-CON-TRIG-AREA': ['4.8E'],
    '4MH-CON-TRIG-3D': ['4.8F'],
    '4MH-CON-SECTORS': ['4.9A'],
    '4MH-CON-PERIMETER-AREA': ['4.9B', '4.9C', '4.9D', '4.9E'],
    '4MH-CON-SPHERE-CONE': ['4.10A'],
    '4MH-CON-SOLIDS': ['4.10B'],
    '4MH-CON-HISTOGRAMS': ['6.1A'],
    '4MH-CON-PROB-TREES': ['6.3A', '6.3B'],
    '4MH-CON-CONDITIONAL-PROB': ['6.3C', '6.3D'],
    '4MH-CON-PROB-BASICS': ['6.3E', '6.3F', '6.3G', '6.3H', '6.3I', '6.3J'],
}


EDGES = [
    ('4MH-CON-NUM-PLACE', '4MH-CON-NUM-FOUR-RULES', DD),
    ('4MH-CON-NUM-DIRECTED', '4MH-CON-NUM-FOUR-RULES', UWR),
    ('4MH-CON-NUM-FOUR-RULES', '4MH-CON-NUM-PRIME-FACTORS', UWR),
    ('4MH-CON-NUM-FOUR-RULES', '4MH-CON-FRACTIONS', UWR),
    ('4MH-CON-NUM-FOUR-RULES', '4MH-CON-EVERYDAY-NUMBER', UWR),
    ('4MH-CON-FRACTIONS', '4MH-CON-FRACTION-OF-QUANTITY', DD),
    ('4MH-CON-NUM-PLACE', '4MH-CON-DECIMALS', DD),
    ('4MH-CON-FRACTIONS', '4MH-CON-RECURRING-DECIMALS', DD),
    ('4MH-CON-FRACTIONS', '4MH-CON-NUM-CONVERT', DD),
    ('4MH-CON-NUM-FOUR-RULES', '4MH-CON-SURDS', UWR),
    ('4MH-CON-NUM-FOUR-RULES', '4MH-CON-INDICES-NUM', UWR),
    ('4MH-CON-FRACTIONS', '4MH-CON-PERCENTAGES', DD),
    ('4MH-CON-DECIMALS', '4MH-CON-PERCENTAGES', UWR),
    ('4MH-CON-FRACTIONS', '4MH-CON-REPEATED-PERCENT', UWR),
    ('4MH-CON-BOUNDS', '4MH-CON-ROUNDING', DD),
    ('4MH-CON-NUM-PLACE', '4MH-CON-BOUNDS', UWR),
    ('4MH-CON-INDICES-NUM', '4MH-CON-ALG-INDICES', UWR),
    ('4MH-CON-ALG-INDICES', '4MH-CON-ALG-EXPAND', UWR),
    ('4MH-CON-ALG-EXPAND', '4MH-CON-ALG-FACTORISE', DD),
    ('4MH-CON-ALG-FACTORISE', '4MH-CON-ALG-FRACS', DD),
    ('4MH-CON-FRACTIONS', '4MH-CON-ALG-FRACS', UWR),
    ('4MH-CON-ALG-EXPAND', '4MH-CON-COMPLETE-SQUARE', DD),
    ('4MH-CON-ALG-EXPAND', '4MH-CON-ALG-PROOF', UWR),
    ('4MH-CON-ALG-EXPAND', '4MH-CON-LINEAR-EQUATIONS', DD),
    ('4MH-CON-ALG-FACTORISE', '4MH-CON-QUAD-SOLVE', DD),
    ('4MH-CON-COMPLETE-SQUARE', '4MH-CON-QUAD-SOLVE', UWR),
    ('4MH-CON-GRAPHS-INTERPRET', '4MH-CON-TRANSFORMS-FN', DD),
    ('4MH-CON-QUAD-SOLVE', '4MH-CON-GRAPHS-INTERPRET', UWR),
    ('4MH-CON-GRAPHS-INTERPRET', '4MH-CON-GRADIENTS-NONLIN', UWR),
    ('4MH-CON-GRAPHS-INTERPRET', '4MH-CON-GRAPH-INTERSECT', UWR),
    ('4MH-CON-GRAPHS-INTERPRET', '4MH-CON-STRAIGHT-LINE', UWR),
    ('4MH-CON-ANGLES', '4MH-CON-POLYGONS', DD),
    ('4MH-CON-ANGLES', '4MH-CON-GEOM-REASONING', DD),
    ('4MH-CON-PYTHAGORAS-3D', '4MH-CON-TRIG-3D', DD),
    ('4MH-CON-TRIG-EXTENDED', '4MH-CON-PYTHAGORAS-3D', UWR),
    ('4MH-CON-TRIG-EXTENDED', '4MH-CON-TRIG-AREA', DD),
    ('4MH-CON-TRIG-EXTENDED', '4MH-CON-TRIG-3D', UWR),
    ('4MH-CON-SECTORS', '4MH-CON-PERIMETER-AREA', UWR),
    ('4MH-CON-PERIMETER-AREA', '4MH-CON-SOLIDS', DD),
    ('4MH-CON-PROB-TREES', '4MH-CON-CONDITIONAL-PROB', UWR),
    ('4MH-CON-PROB-TREES', '4MH-CON-PROB-BASICS', UWR),
]
