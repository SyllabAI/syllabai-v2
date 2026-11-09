"""4MA1F modular unit (igcse-maths-a-modular-24-foundation-unit-1) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, igcse-maths-a-modular-24-foundation-unit-1).

AI_SUGGESTED / UNVALIDATED concept web DERIVED for the F8 lane from the
Foundation tier lattice of this batch (f8ma_lattice_4ma1f.py)
by the house projection semantics: every concept's anchor bindings
re-verified against this unit's served point ids (unresolvable bindings
dropped, concepts left with zero bindings dropped) and only web edges
whose both endpoints survive kept — the same anchor re-verification and
both-endpoint survival laws as scripts/kg_f8al_project.py, applied at the
web level because the 2024 modular units assess disjoint halves of the
4MA1F spec. The per-slug 0-unmapped pass law is re-asserted at
startup by kg_f8ma_generate.py.

The 2024 modular units split the 4MA1F Foundation spec into two
units; the base tier lattice anchors to the full spec, so this unit web is
its surviving restriction. Provenance of record is in the derivation stats
committed with the batch.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    '4MF-CON-NUM-PLACE': ['1.1A', '1.1B', '1.1D'],
    '4MF-CON-NUM-DIRECTED': ['1.1C'],
    '4MF-CON-NUM-FOUR-RULES': ['1.1E', '1.1F'],
    '4MF-CON-NUM-PRIME-FACTORS': ['1.1G', '1.1H'],
    '4MF-CON-FRACTIONS': ['1.2A', '1.2B', '1.2C', '1.2F', '1.2I'],
    '4MF-CON-FRACTION-OF-QUANTITY': ['1.2D', '1.2E', '1.2H'],
    '4MF-CON-DECIMALS': ['1.3A', '1.3B', '1.3C'],
    '4MF-CON-NUM-CONVERT': ['1.2G', '1.3D', '1.3E'],
    '4MF-CON-SQUARES-POWERS': ['1.4A', '1.4B', '1.4C'],
    '4MF-CON-SETS': ['1.5A', '1.5B', '1.5C', '1.5D', '1.5E'],
    '4MF-CON-PERCENTAGES': ['1.6A', '1.6B', '1.6C'],
    '4MF-CON-ROUNDING': ['1.8A', '1.8B', '1.8C', '1.8D'],
    '4MF-CON-EVERYDAY-NUMBER': ['1.10A', '1.10B', '1.10C', '1.11A'],
    '4MF-CON-ALG-SYMBOLS': ['2.1A', '2.1B', '2.1C', '2.1D'],
    '4MF-CON-ALG-SUBSTITUTE': ['2.2A'],
    '4MF-CON-ALG-MANIPULATE': ['2.2B', '2.2C', '2.2D', '2.2E'],
    '4MF-CON-ALG-QUADRATIC-FACTOR': ['2.2F', '2.7A'],
    '4MF-CON-LINEAR-EQUATIONS': ['2.4A', '2.4B'],
    '4MF-CON-COORDINATES': ['3.3B', '3.3C', '3.3D', '3.3E'],
    '4MF-CON-GRAPHS-INTERPRET': ['3.3A', '3.3F', '3.3I'],
    '4MF-CON-STRAIGHT-LINE': ['3.3G', '3.3H'],
    '4MF-CON-ANGLES': ['4.1A', '4.1B', '4.1C', '4.1D'],
    '4MF-CON-POLYGONS': ['4.2A', '4.2B', '4.2C'],
    '4MF-CON-MEASURES': ['4.9A'],
    '4MF-CON-SPEED': ['4.4F', '4.4G'],
    '4MF-CON-GEOM-REASONING': ['4.7A'],
    '4MF-CON-PYTHAGORAS': ['4.8A'],
    '4MF-CON-TRIG-RATIOS': ['4.8B', '4.8C'],
    '4MF-CON-PERIMETER-AREA': ['4.9B', '4.9C', '4.9D', '4.9E'],
    '4MF-CON-SOLIDS': ['4.10A', '4.10B'],
    '4MF-CON-PROBABILITY-BASICS': ['6.3A', '6.3B', '6.3C', '6.3E'],
    '4MF-CON-PROB-TREE-OUTCOMES': ['6.3D', '6.3F', '6.3G'],
    '4MF-CON-PROB-COMPLEMENT-ADD': ['6.3H', '6.3I'],
    '4MF-CON-EXPECTED-FREQUENCY': ['6.3J'],
}


EDGES = [
    ('4MF-CON-NUM-PLACE', '4MF-CON-NUM-FOUR-RULES', DD),
    ('4MF-CON-NUM-DIRECTED', '4MF-CON-NUM-FOUR-RULES', UWR),
    ('4MF-CON-NUM-FOUR-RULES', '4MF-CON-NUM-PRIME-FACTORS', UWR),
    ('4MF-CON-NUM-FOUR-RULES', '4MF-CON-FRACTIONS', UWR),
    ('4MF-CON-NUM-FOUR-RULES', '4MF-CON-EVERYDAY-NUMBER', UWR),
    ('4MF-CON-FRACTIONS', '4MF-CON-FRACTION-OF-QUANTITY', DD),
    ('4MF-CON-NUM-PLACE', '4MF-CON-DECIMALS', DD),
    ('4MF-CON-FRACTIONS', '4MF-CON-NUM-CONVERT', DD),
    ('4MF-CON-SQUARES-POWERS', '4MF-CON-NUM-FOUR-RULES', UWR),
    ('4MF-CON-FRACTIONS', '4MF-CON-PERCENTAGES', DD),
    ('4MF-CON-DECIMALS', '4MF-CON-PERCENTAGES', UWR),
    ('4MF-CON-NUM-PLACE', '4MF-CON-ROUNDING', UWR),
    ('4MF-CON-NUM-FOUR-RULES', '4MF-CON-ALG-SYMBOLS', DD),
    ('4MF-CON-ALG-SYMBOLS', '4MF-CON-ALG-SUBSTITUTE', DD),
    ('4MF-CON-ALG-SYMBOLS', '4MF-CON-ALG-MANIPULATE', DD),
    ('4MF-CON-ALG-MANIPULATE', '4MF-CON-ALG-QUADRATIC-FACTOR', DD),
    ('4MF-CON-ALG-MANIPULATE', '4MF-CON-LINEAR-EQUATIONS', DD),
    ('4MF-CON-ALG-SUBSTITUTE', '4MF-CON-GRAPHS-INTERPRET', UWR),
    ('4MF-CON-GRAPHS-INTERPRET', '4MF-CON-STRAIGHT-LINE', DD),
    ('4MF-CON-ANGLES', '4MF-CON-POLYGONS', DD),
    ('4MF-CON-MEASURES', '4MF-CON-SPEED', UWR),
    ('4MF-CON-ANGLES', '4MF-CON-GEOM-REASONING', DD),
    ('4MF-CON-POLYGONS', '4MF-CON-GEOM-REASONING', UWR),
    ('4MF-CON-SQUARES-POWERS', '4MF-CON-PYTHAGORAS', UWR),
    ('4MF-CON-PYTHAGORAS', '4MF-CON-TRIG-RATIOS', DD),
    ('4MF-CON-MEASURES', '4MF-CON-PERIMETER-AREA', UWR),
    ('4MF-CON-PERIMETER-AREA', '4MF-CON-SOLIDS', DD),
    ('4MF-CON-PROBABILITY-BASICS', '4MF-CON-PROB-TREE-OUTCOMES', DD),
    ('4MF-CON-PROBABILITY-BASICS', '4MF-CON-PROB-COMPLEMENT-ADD', DD),
    ('4MF-CON-PROB-TREE-OUTCOMES', '4MF-CON-EXPECTED-FREQUENCY', UWR),
]
