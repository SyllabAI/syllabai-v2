"""Edexcel 4EA1 Paper 3 (coursework) concept lattice — T-KG-PRE-12
(F8 rollout batch ten, the English cluster tranche 7,
igcse-english-language-a-16-paper-3-coursework).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel 4EA1 Paper 3 served spine: 2 points (Assignment A: poetry/prose
study; Assignment B: imaginative writing). The served spine is minimal; the
honest web is one edge — the Assignment A analytical study feeds the
Assignment B imaginative writing (USED_WITHOUT_RETEACHING), mirroring the
Paper 2 relation it parallels.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "ENP3-CON-ASSIGN-A-STUDY": ["IGCSE_ENGLISH_LANGUAGE_A:C3AA"],
    "ENP3-CON-ASSIGN-B-IMAGINATIVE": ["IGCSE_ENGLISH_LANGUAGE_A:C3AB"],
}

EDGES = [
    ("ENP3-CON-ASSIGN-A-STUDY", "ENP3-CON-ASSIGN-B-IMAGINATIVE", UWR),
]
