"""Edexcel 4EA1 Paper 2 concept lattice — T-KG-PRE-12
(F8 rollout batch ten, the English cluster tranche 7,
igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel 4EA1 Paper 2 served spine: an ANTHOLOGY corpus (Section A: 10
poetry/prose anthology texts; Section B: imaginative writing skills; 12
served points). Parallel content — the honest web is thin: the section's
analytical approach frames each text (USED_WITHOUT_RETEACHING), and the
poetry/prose study section feeds the imaginative writing section. Texts are
pairwise PARALLEL — no inter-text edges authored.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "ENP2-CON-SEC-A-STUDY": ["IGCSE_ENGLISH_LANGUAGE_A:C2AA"],
    "ENP2-CON-SEC-B-IMAGINATIVE": ["IGCSE_ENGLISH_LANGUAGE_A:C2AB"],
    "ENP2-CON-T01-OWEN": ["IGCSE_ENGLISH_LANGUAGE_A:C2T01"],
    "ENP2-CON-T02-FROST": ["IGCSE_ENGLISH_LANGUAGE_A:C2T02"],
    "ENP2-CON-T03-ALVI": ["IGCSE_ENGLISH_LANGUAGE_A:C2T03"],
    "ENP2-CON-T04-HARRISON": ["IGCSE_ENGLISH_LANGUAGE_A:C2T04"],
    "ENP2-CON-T05-ANGELOU": ["IGCSE_ENGLISH_LANGUAGE_A:C2T05"],
    "ENP2-CON-T06-CHOPIN": ["IGCSE_ENGLISH_LANGUAGE_A:C2T06"],
    "ENP2-CON-T07-MAUPASSANT": ["IGCSE_ENGLISH_LANGUAGE_A:C2T07"],
    "ENP2-CON-T08-TREMAIN": ["IGCSE_ENGLISH_LANGUAGE_A:C2T08"],
    "ENP2-CON-T09-HILL": ["IGCSE_ENGLISH_LANGUAGE_A:C2T09"],
    "ENP2-CON-T10-MUNRO": ["IGCSE_ENGLISH_LANGUAGE_A:C2T10"],
}

EDGES = [
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-SEC-B-IMAGINATIVE", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T01-OWEN", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T02-FROST", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T03-ALVI", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T04-HARRISON", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T05-ANGELOU", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T06-CHOPIN", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T07-MAUPASSANT", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T08-TREMAIN", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T09-HILL", UWR),
    ("ENP2-CON-SEC-A-STUDY", "ENP2-CON-T10-MUNRO", UWR),
]
