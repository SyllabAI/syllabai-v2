"""0475 IGCSE Literature in English concept lattice — T-KG-PRE-12
(F8 rollout batch ten, the English cluster tranche 7, cie-igcse-english-literature-21).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
0475 served spine (203 points). The spine is overwhelmingly a SET-TEXT
REGISTER: "Candidates answer on ..." requirement headers followed by
parallel set-text lists (Songs of Ourselves volumes, Stories of Ourselves,
named novels and plays, per exam and coursework component). Set texts are
PAIRWISE PARALLEL — no text is a prerequisite of another, and no
inter-text edges are authored. The honest web is the register's own
dependency shape: each answer-requirement header DEFINITIONALLY anchors
the list points it governs. Grade/admin residue is left unanchored.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # Answer-requirement headers
    "ENLX-CON-HDR-P1-POETRY": ["S3.001"],
    "ENLX-CON-HDR-P1-PROSE": ["S7.001"],
    "ENLX-CON-HDR-P1-DRAMA-TWO": ["S8.001"],
    "ENLX-CON-HDR-P1-DRAMA-ONE": ["S9.001"],
    "ENLX-CON-HDR-CW-POETRY": ["S11.001"],
    "ENLX-CON-HDR-CW-PROSE": ["S15.001"],
    "ENLX-CON-HDR-CW-DRAMA-TWO": ["S16.001"],
    "ENLX-CON-HDR-CW-DRAMA-ONE": ["S17.001"],
    "ENLX-CON-HDR-EX-POETRY": ["S19.001"],
    "ENLX-CON-HDR-EX-PROSE": ["S23.001"],
    "ENLX-CON-HDR-EX-DRAMA-TWO": ["S24.001"],
    "ENLX-CON-HDR-EX-DRAMA-ONE": ["S25.001"],
    # List anchors ("From Songs/Stories of Ourselves ..., the following ...")
    "ENLX-CON-LIST-P1-POETRY-V1": ["S3.002"],
    "ENLX-CON-LIST-P1-POETRY-V2": ["S5.001"],
    "ENLX-CON-LIST-P1-HUGHES": ["S5.018"],
    "ENLX-CON-LIST-P1-STORIES": ["S7.009"],
    "ENLX-CON-LIST-CW-POETRY-V1": ["S11.002"],
    "ENLX-CON-LIST-CW-POETRY-V2": ["S13.001"],
    "ENLX-CON-LIST-CW-HUGHES": ["S13.018"],
    "ENLX-CON-LIST-CW-STORIES": ["S15.009"],
    "ENLX-CON-LIST-EX-POETRY-V1": ["S19.002"],
    "ENLX-CON-LIST-EX-POETRY-V2": ["S21.001"],
    "ENLX-CON-LIST-EX-HUGHES": ["S21.018"],
    "ENLX-CON-LIST-EX-STORIES": ["S23.009"],
}

EDGES = [
    ("ENLX-CON-HDR-P1-POETRY", "ENLX-CON-LIST-P1-POETRY-V1", DD),
    ("ENLX-CON-HDR-P1-PROSE", "ENLX-CON-LIST-P1-STORIES", DD),
    ("ENLX-CON-HDR-CW-POETRY", "ENLX-CON-LIST-CW-POETRY-V1", DD),
    ("ENLX-CON-HDR-CW-PROSE", "ENLX-CON-LIST-CW-STORIES", DD),
    ("ENLX-CON-HDR-EX-POETRY", "ENLX-CON-LIST-EX-POETRY-V1", DD),
    ("ENLX-CON-HDR-EX-PROSE", "ENLX-CON-LIST-EX-STORIES", DD),
]
