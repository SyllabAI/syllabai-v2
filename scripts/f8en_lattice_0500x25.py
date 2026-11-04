"""0500/2025 IGCSE First Language English concept lattice — T-KG-PRE-12
(F8 rollout batch ten, the English cluster tranche 7, cie-igcse-english-language-25).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
0500 syllabus (2025 examination spine; 209 served points). The genuine
skills core: reading AOs (S2.007-012), writing AOs (S2.013-018), the
coursework assignment programme (S4.003-029). Grade-descriptor bands
(S1.014-037, S5-S17) and change-log/admin points (S18-S25) are parallel or
administrative — honestly left unanchored.

Independent of the 0500/2020 lattice: distinct served id set (the 2025
renumber folds the writing AOs into S2.013-018; one coursework section
S4.* replaces 2020's split) and different point texts — the independent
version lattice law (0452/0264, 0455/2020-vs-2025 precedents).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # Overall aims
    "ENF5-CON-READ-WIDE": ["S2.001"],
    "ENF5-CON-READ-CRITICAL": ["S2.002"],
    # Reading assessment objectives
    "ENF5-CON-R-UNDERSTAND": ["S2.007"],
    "ENF5-CON-R-SUMMARISE": ["S2.008"],
    "ENF5-CON-R-ANALYSE-EVALUATE": ["S2.009"],
    "ENF5-CON-R-WRITER-EFFECTS": ["S2.010"],
    "ENF5-CON-R-SELECT-INFO": ["S2.011"],
    "ENF5-CON-R-LINGUISTIC-DEVICES": ["S2.012"],
    # Writing assessment objectives (2025 numbering)
    "ENF5-CON-W-EXPRESS": ["S2.013"],
    "ENF5-CON-W-ORGANISE": ["S2.014"],
    "ENF5-CON-W-VOCABULARY": ["S2.015"],
    "ENF5-CON-W-SENTENCE-STRUCT": ["S2.016"],
    "ENF5-CON-W-AUDIENCE-PURPOSE": ["S2.017"],
    "ENF5-CON-W-ACCURACY": ["S2.018"],
    # Coursework programme (assignments 1-3, 2025 section)
    "ENF5-CON-CW-PROGRAMME": ["S4.003"],
    "ENF5-CON-CW-DIFFERENT-STYLES": ["S4.009"],
    "ENF5-CON-CW-A1-ASSESSED-BOTH": ["S4.011"],
    "ENF5-CON-CW-A1-OVERVIEW": ["S4.016"],
    "ENF5-CON-CW-A2-IDEAS-IMAGES": ["S4.020"],
    "ENF5-CON-CW-A3-ANY-FORM": ["S4.023"],
    "ENF5-CON-CW-A3-PLOT": ["S4.024"],
}

EDGES = [
    # Aims
    ("ENF5-CON-READ-WIDE", "ENF5-CON-READ-CRITICAL", DD),
    ("ENF5-CON-READ-CRITICAL", "ENF5-CON-W-ORGANISE", UWR),
    # Reading AO chain
    ("ENF5-CON-R-UNDERSTAND", "ENF5-CON-R-SUMMARISE", DD),
    ("ENF5-CON-R-SUMMARISE", "ENF5-CON-R-ANALYSE-EVALUATE", DD),
    ("ENF5-CON-R-ANALYSE-EVALUATE", "ENF5-CON-R-WRITER-EFFECTS", UWR),
    ("ENF5-CON-R-ANALYSE-EVALUATE", "ENF5-CON-R-SELECT-INFO", UWR),
    ("ENF5-CON-R-WRITER-EFFECTS", "ENF5-CON-R-LINGUISTIC-DEVICES", DD),
    # Writing AO chain
    ("ENF5-CON-W-EXPRESS", "ENF5-CON-W-ORGANISE", DD),
    ("ENF5-CON-W-ORGANISE", "ENF5-CON-W-VOCABULARY", DD),
    ("ENF5-CON-W-VOCABULARY", "ENF5-CON-W-SENTENCE-STRUCT", DD),
    ("ENF5-CON-W-SENTENCE-STRUCT", "ENF5-CON-W-AUDIENCE-PURPOSE", DD),
    ("ENF5-CON-W-AUDIENCE-PURPOSE", "ENF5-CON-W-ACCURACY", DD),
    # Reading informs writing
    ("ENF5-CON-R-LINGUISTIC-DEVICES", "ENF5-CON-W-VOCABULARY", UWR),
    ("ENF5-CON-R-ANALYSE-EVALUATE", "ENF5-CON-W-ORGANISE", UWR),
    # Coursework programme
    ("ENF5-CON-CW-PROGRAMME", "ENF5-CON-CW-DIFFERENT-STYLES", DD),
    ("ENF5-CON-CW-A1-ASSESSED-BOTH", "ENF5-CON-CW-A1-OVERVIEW", UWR),
    ("ENF5-CON-CW-A1-ASSESSED-BOTH", "ENF5-CON-CW-A2-IDEAS-IMAGES", UWR),
    ("ENF5-CON-CW-A2-IDEAS-IMAGES", "ENF5-CON-CW-A3-ANY-FORM", UWR),
    ("ENF5-CON-CW-A3-ANY-FORM", "ENF5-CON-CW-A3-PLOT", DD),
]
