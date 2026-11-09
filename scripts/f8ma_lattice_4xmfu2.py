"""4MA1F modular unit (igcse-maths-a-modular-24-foundation-unit-2) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, igcse-maths-a-modular-24-foundation-unit-2).

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
    '4MF-CON-NUM-PRIME-FACTORS': ['1.4D', '1.4E'],
    '4MF-CON-PERCENTAGES': ['1.6D', '1.6E'],
    '4MF-CON-REVERSE-PERCENT': ['1.6F'],
    '4MF-CON-COMPOUND-INTEREST': ['1.6G'],
    '4MF-CON-RATIO': ['1.7A', '1.7B', '1.7C', '1.7D', '1.7E'],
    '4MF-CON-STANDARD-FORM': ['1.9A'],
    '4MF-CON-ALG-SUBSTITUTE': ['2.3C'],
    '4MF-CON-FORMULAE': ['2.3A', '2.3B', '2.3D', '2.3E', '2.3F'],
    '4MF-CON-SIMULTANEOUS': ['2.6A'],
    '4MF-CON-INEQUALITIES': ['2.8A', '2.8B', '2.8C', '2.8D', '2.8E'],
    '4MF-CON-SEQUENCES': ['3.1A', '3.1B', '3.1C'],
    '4MF-CON-POLYGONS': ['4.2D', '4.2E'],
    '4MF-CON-CONGRUENCE': ['4.2F', '4.2G'],
    '4MF-CON-SYMMETRY': ['4.3A'],
    '4MF-CON-MEASURES': ['4.4A', '4.4B', '4.4C', '4.4E'],
    '4MF-CON-BEARINGS': ['4.4D'],
    '4MF-CON-CONSTRUCTIONS': ['4.5A', '4.5B', '4.5C', '4.5D'],
    '4MF-CON-CIRCLE-PROPS': ['4.6A', '4.6B'],
    '4MF-CON-SOLIDS': ['4.10C', '4.10D', '4.10E', '4.10F'],
    '4MF-CON-SIMILAR-FIGURES': ['4.11A', '4.11B'],
    '4MF-CON-RIGID-TRANSFORMS': ['5.2A', '5.2B', '5.2C', '5.2D', '5.2E', '5.2F', '5.2G', '5.2H', '5.2I'],
    '4MF-CON-ENLARGEMENT': ['5.2J', '5.2K', '5.2L'],
    '4MF-CON-TRANSFORM-DESCRIBE': ['5.2M'],
    '4MF-CON-DATA-DIAGRAMS': ['6.1B', '6.1C'],
    '4MF-CON-AVERAGES': ['6.2A', '6.2B', '6.2C', '6.2D'],
}


EDGES = [
    ('4MF-CON-PERCENTAGES', '4MF-CON-REVERSE-PERCENT', DD),
    ('4MF-CON-PERCENTAGES', '4MF-CON-COMPOUND-INTEREST', DD),
    ('4MF-CON-ALG-SUBSTITUTE', '4MF-CON-FORMULAE', DD),
    ('4MF-CON-POLYGONS', '4MF-CON-CONGRUENCE', UWR),
    ('4MF-CON-POLYGONS', '4MF-CON-SYMMETRY', UWR),
    ('4MF-CON-MEASURES', '4MF-CON-BEARINGS', UWR),
    ('4MF-CON-MEASURES', '4MF-CON-CONSTRUCTIONS', UWR),
    ('4MF-CON-POLYGONS', '4MF-CON-SIMILAR-FIGURES', UWR),
    ('4MF-CON-RIGID-TRANSFORMS', '4MF-CON-ENLARGEMENT', UWR),
    ('4MF-CON-RIGID-TRANSFORMS', '4MF-CON-TRANSFORM-DESCRIBE', DD),
    ('4MF-CON-ENLARGEMENT', '4MF-CON-TRANSFORM-DESCRIBE', UWR),
    ('4MF-CON-DATA-DIAGRAMS', '4MF-CON-AVERAGES', UWR),
]
