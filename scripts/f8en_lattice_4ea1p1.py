"""Edexcel 4EA1 Paper 1 concept lattice — T-KG-PRE-12
(F8 rollout batch ten, the English cluster tranche 7,
igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel International GCSE English Language A (4EA1) Paper 1 served spine:
an ANTHOLOGY corpus (Section A: 10 non-fiction anthology texts; Section B:
transactional writing skills; 12 served points). The spine is parallel
content, not a skills progression — the honest web is correspondingly thin:
the section's analytical approach frames the study of each anthology text
(USED_WITHOUT_RETEACHING), and the non-fiction study section feeds the
transactional writing section. Anthology texts are pairwise PARALLEL — no
text is a prerequisite of another, and none is authored.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "ENP1-CON-SEC-A-STUDY": ["IGCSE_ENGLISH_LANGUAGE_A:C1AA"],
    "ENP1-CON-SEC-B-TRANSACTIONAL": ["IGCSE_ENGLISH_LANGUAGE_A:C1AB"],
    "ENP1-CON-T01-ADICHIE": ["IGCSE_ENGLISH_LANGUAGE_A:C1T01"],
    "ENP1-CON-T02-ALAGIAH": ["IGCSE_ENGLISH_LANGUAGE_A:C1T02"],
    "ENP1-CON-T03-HERBERT": ["IGCSE_ENGLISH_LANGUAGE_A:C1T03"],
    "ENP1-CON-T04-MORRIS": ["IGCSE_ENGLISH_LANGUAGE_A:C1T04"],
    "ENP1-CON-T05-RALSTON": ["IGCSE_ENGLISH_LANGUAGE_A:C1T05"],
    "ENP1-CON-T06-ZEPHANIAH": ["IGCSE_ENGLISH_LANGUAGE_A:C1T06"],
    "ENP1-CON-T07-LEVINE": ["IGCSE_ENGLISH_LANGUAGE_A:C1T07"],
    "ENP1-CON-T08-ZEPPA": ["IGCSE_ENGLISH_LANGUAGE_A:C1T08"],
    "ENP1-CON-T09-MACDONALD": ["IGCSE_ENGLISH_LANGUAGE_A:C1T09"],
    "ENP1-CON-T10-MAH": ["IGCSE_ENGLISH_LANGUAGE_A:C1T10"],
}

EDGES = [
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-SEC-B-TRANSACTIONAL", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T01-ADICHIE", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T02-ALAGIAH", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T03-HERBERT", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T04-MORRIS", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T05-RALSTON", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T06-ZEPHANIAH", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T07-LEVINE", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T08-ZEPPA", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T09-MACDONALD", UWR),
    ("ENP1-CON-SEC-A-STUDY", "ENP1-CON-T10-MAH", UWR),
]
