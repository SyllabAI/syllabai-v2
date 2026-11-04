"""0500/2020 IGCSE First Language English concept lattice — T-KG-PRE-12
(F8 rollout batch ten, the English cluster tranche 7, cie-igcse-english-language-20).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
0500 syllabus (2020 examination spine; 163 served points). The spine mixes
the genuine skills core (overall aims S2.001-006, reading AOs S2.007-012,
writing AOs S3.001-006, speaking/listening S4.001-006, the coursework
assignment programme S4.009-036) with parallel grade-descriptor bands
(S5.*) and syllabus-support/admin points (S1.*), which are honestly left
unanchored or untouched — parallel band statements carry no prerequisite
structure between them.

Independent of the 0455-style version law applied to 0500/2025: distinct
served id sets and texts (2025 renumbers the writing AOs into S2.013-018 and
restructures the coursework section) — independent lattice.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # Overall aims (the spec's own progression)
    "ENFL-CON-READ-WIDE": ["S2.001"],
    "ENFL-CON-READ-CRITICAL": ["S2.002"],
    # Reading assessment objectives
    "ENFL-CON-R-UNDERSTAND": ["S2.007"],
    "ENFL-CON-R-SUMMARISE": ["S2.008"],
    "ENFL-CON-R-ANALYSE-EVALUATE": ["S2.009"],
    "ENFL-CON-R-WRITER-EFFECTS": ["S2.010"],
    "ENFL-CON-R-SELECT-INFO": ["S2.011"],
    "ENFL-CON-R-LINGUISTIC-DEVICES": ["S2.012"],
    # Writing assessment objectives
    "ENFL-CON-W-EXPRESS": ["S3.001"],
    "ENFL-CON-W-ORGANISE": ["S3.002"],
    "ENFL-CON-W-VOCABULARY": ["S3.003"],
    "ENFL-CON-W-SENTENCE-STRUCT": ["S3.004"],
    "ENFL-CON-W-AUDIENCE-PURPOSE": ["S3.005"],
    "ENFL-CON-W-ACCURACY": ["S3.006"],
    # Speaking and listening
    "ENFL-CON-S-DESCRIBE-REFLECT": ["S4.001"],
    "ENFL-CON-S-ORGANISE": ["S4.002"],
    "ENFL-CON-S-COMPLEX-IDEAS": ["S4.003"],
    "ENFL-CON-S-CLARITY": ["S4.004"],
    "ENFL-CON-S-CONTEXT": ["S4.005"],
    "ENFL-CON-S-CONVERSATION": ["S4.006"],
    # Coursework programme (assignments 1-3)
    "ENFL-CON-CW-PROGRAMME": ["S4.009"],
    "ENFL-CON-CW-DIFFERENT-STYLES": ["S4.015"],
    "ENFL-CON-CW-A1-DIRECTED": ["S4.016"],
    "ENFL-CON-CW-A1-ASSESSED-BOTH": ["S4.017"],
    "ENFL-CON-CW-A1-OVERVIEW": ["S4.022"],
    "ENFL-CON-CW-A2-DESCRIPTIVE": ["S4.027"],
    "ENFL-CON-CW-A2-IDEAS-IMAGES": ["S4.029"],
    "ENFL-CON-CW-A3-NARRATIVE": ["S4.032"],
    "ENFL-CON-CW-A3-PLOT": ["S4.034"],
}

EDGES = [
    # Aims: reading critically informs writing (the spec's own statement)
    ("ENFL-CON-READ-WIDE", "ENFL-CON-READ-CRITICAL", DD),
    ("ENFL-CON-READ-CRITICAL", "ENFL-CON-W-ORGANISE", UWR),
    # Reading AO chain
    ("ENFL-CON-R-UNDERSTAND", "ENFL-CON-R-SUMMARISE", DD),
    ("ENFL-CON-R-SUMMARISE", "ENFL-CON-R-ANALYSE-EVALUATE", DD),
    ("ENFL-CON-R-ANALYSE-EVALUATE", "ENFL-CON-R-WRITER-EFFECTS", UWR),
    ("ENFL-CON-R-ANALYSE-EVALUATE", "ENFL-CON-R-SELECT-INFO", UWR),
    ("ENFL-CON-R-WRITER-EFFECTS", "ENFL-CON-R-LINGUISTIC-DEVICES", DD),
    # Writing AO chain
    ("ENFL-CON-W-EXPRESS", "ENFL-CON-W-ORGANISE", DD),
    ("ENFL-CON-W-ORGANISE", "ENFL-CON-W-VOCABULARY", DD),
    ("ENFL-CON-W-VOCABULARY", "ENFL-CON-W-SENTENCE-STRUCT", DD),
    ("ENFL-CON-W-SENTENCE-STRUCT", "ENFL-CON-W-AUDIENCE-PURPOSE", DD),
    ("ENFL-CON-W-AUDIENCE-PURPOSE", "ENFL-CON-W-ACCURACY", DD),
    # Reading informs writing (bridges the spec states)
    ("ENFL-CON-R-LINGUISTIC-DEVICES", "ENFL-CON-W-VOCABULARY", UWR),
    ("ENFL-CON-R-ANALYSE-EVALUATE", "ENFL-CON-W-ORGANISE", UWR),
    # Speaking chain
    ("ENFL-CON-S-DESCRIBE-REFLECT", "ENFL-CON-S-ORGANISE", DD),
    ("ENFL-CON-S-ORGANISE", "ENFL-CON-S-COMPLEX-IDEAS", DD),
    ("ENFL-CON-S-COMPLEX-IDEAS", "ENFL-CON-S-CLARITY", DD),
    ("ENFL-CON-S-CLARITY", "ENFL-CON-S-CONTEXT", DD),
    ("ENFL-CON-S-CONTEXT", "ENFL-CON-S-CONVERSATION", DD),
    # Coursework programme: brief -> styles -> assignment sequence
    ("ENFL-CON-CW-PROGRAMME", "ENFL-CON-CW-DIFFERENT-STYLES", DD),
    ("ENFL-CON-CW-A1-DIRECTED", "ENFL-CON-CW-A1-ASSESSED-BOTH", DD),
    ("ENFL-CON-CW-A1-ASSESSED-BOTH", "ENFL-CON-CW-A1-OVERVIEW", UWR),
    ("ENFL-CON-CW-A1-DIRECTED", "ENFL-CON-CW-A2-DESCRIPTIVE", UWR),
    ("ENFL-CON-CW-A2-DESCRIPTIVE", "ENFL-CON-CW-A2-IDEAS-IMAGES", DD),
    ("ENFL-CON-CW-A2-DESCRIPTIVE", "ENFL-CON-CW-A3-NARRATIVE", UWR),
    ("ENFL-CON-CW-A3-NARRATIVE", "ENFL-CON-CW-A3-PLOT", DD),
]
