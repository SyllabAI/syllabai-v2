"""8021 AS General Paper concept lattice — T-KG-PRE-12
(F8 rollout batch ten, the English cluster tranche 7, cie-as-english-general-paper-21).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
8021 AS General Paper served spine (73 points: 45 parallel topic areas +
a genuine skills progression in S1.046-S1.073 — essay/argument skills,
response mechanics, reading/comprehension skills, language analysis, and
directed-writing skills).

The topic areas (S1.001-S1.045) are PARALLEL content — no inter-topic edges
authored. The web is the skills progression: within-chain definitional
chains exactly as the syllabus sequences them, plus the cross-chain bridges
the syllabus itself states (biased reading feeds language analysis; factual
persuasion feeds text-based argument; persuasive arguments feed persuasive
writing features; register control feeds purpose-driven structure).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # Essay and argument skills (Paper 1)
    "ENGP-CON-KEY-TERMS": ["S1.046"],
    "ENGP-CON-DIFFERING-POVS": ["S1.047"],
    "ENGP-CON-APPLY-INFO": ["S1.048"],
    "ENGP-CON-EXAMPLES-SUPPORT": ["S1.049"],
    "ENGP-CON-SUPPORTED-JUDGEMENTS": ["S1.050"],
    "ENGP-CON-ANALYSE-PARTS": ["S1.051"],
    "ENGP-CON-DISCUSS-VIEWPOINTS": ["S1.052"],
    "ENGP-CON-EVALUATE-IMPORTANCE": ["S1.053"],
    "ENGP-CON-ESSAY-STRUCTURE": ["S1.054"],
    "ENGP-CON-CONCLUSION": ["S1.055"],
    # Response mechanics
    "ENGP-CON-RESPONSE-STRUCTURE": ["S1.056"],
    "ENGP-CON-CLARITY-COHERENCE": ["S1.057"],
    "ENGP-CON-VOCAB-REGISTER": ["S1.058"],
    # Reading and comprehension skills (Paper 2)
    "ENGP-CON-SELECT-RELEVANT": ["S1.059"],
    "ENGP-CON-INTERPRET-SOURCES": ["S1.060"],
    "ENGP-CON-IMPLICIT-BIAS": ["S1.061"],
    "ENGP-CON-APPLY-READ-INFO": ["S1.062"],
    "ENGP-CON-SPECIFIC-DETAILS": ["S1.063"],
    "ENGP-CON-PERSUADE-FACTS": ["S1.064"],
    # Language analysis skills
    "ENGP-CON-LANGUAGE-FEATURES": ["S1.065"],
    "ENGP-CON-RELEVANCE-JUDGEMENT": ["S1.066"],
    "ENGP-CON-EXPLANATIONS-JUSTIFY": ["S1.067"],
    "ENGP-CON-SUMMARISE": ["S1.068"],
    "ENGP-CON-PERSUASIVE-ARGUMENTS": ["S1.069"],
    # Directed writing skills
    "ENGP-CON-AUDIENCE-WRITING": ["S1.070"],
    "ENGP-CON-PURPOSE-STRUCTURE": ["S1.071"],
    "ENGP-CON-CLEAR-CONCISE": ["S1.072"],
    "ENGP-CON-PERSUASIVE-FEATURES": ["S1.073"],
}

EDGES = [
    # Essay/argument chain
    ("ENGP-CON-KEY-TERMS", "ENGP-CON-DIFFERING-POVS", DD),
    ("ENGP-CON-DIFFERING-POVS", "ENGP-CON-APPLY-INFO", DD),
    ("ENGP-CON-APPLY-INFO", "ENGP-CON-EXAMPLES-SUPPORT", DD),
    ("ENGP-CON-EXAMPLES-SUPPORT", "ENGP-CON-SUPPORTED-JUDGEMENTS", DD),
    ("ENGP-CON-SUPPORTED-JUDGEMENTS", "ENGP-CON-ANALYSE-PARTS", UWR),
    ("ENGP-CON-ANALYSE-PARTS", "ENGP-CON-DISCUSS-VIEWPOINTS", DD),
    ("ENGP-CON-DISCUSS-VIEWPOINTS", "ENGP-CON-EVALUATE-IMPORTANCE", DD),
    ("ENGP-CON-EVALUATE-IMPORTANCE", "ENGP-CON-ESSAY-STRUCTURE", DD),
    ("ENGP-CON-ESSAY-STRUCTURE", "ENGP-CON-CONCLUSION", DD),
    # Response mechanics chain
    ("ENGP-CON-RESPONSE-STRUCTURE", "ENGP-CON-CLARITY-COHERENCE", DD),
    ("ENGP-CON-CLARITY-COHERENCE", "ENGP-CON-VOCAB-REGISTER", DD),
    ("ENGP-CON-ESSAY-STRUCTURE", "ENGP-CON-RESPONSE-STRUCTURE", UWR),
    # Reading chain
    ("ENGP-CON-SELECT-RELEVANT", "ENGP-CON-INTERPRET-SOURCES", DD),
    ("ENGP-CON-INTERPRET-SOURCES", "ENGP-CON-IMPLICIT-BIAS", DD),
    ("ENGP-CON-IMPLICIT-BIAS", "ENGP-CON-APPLY-READ-INFO", DD),
    ("ENGP-CON-APPLY-READ-INFO", "ENGP-CON-SPECIFIC-DETAILS", DD),
    ("ENGP-CON-SPECIFIC-DETAILS", "ENGP-CON-PERSUADE-FACTS", DD),
    # Language-analysis chain
    ("ENGP-CON-LANGUAGE-FEATURES", "ENGP-CON-RELEVANCE-JUDGEMENT", DD),
    ("ENGP-CON-RELEVANCE-JUDGEMENT", "ENGP-CON-EXPLANATIONS-JUSTIFY", DD),
    ("ENGP-CON-EXPLANATIONS-JUSTIFY", "ENGP-CON-SUMMARISE", UWR),
    ("ENGP-CON-SUMMARISE", "ENGP-CON-PERSUASIVE-ARGUMENTS", DD),
    # Directed-writing chain
    ("ENGP-CON-AUDIENCE-WRITING", "ENGP-CON-PURPOSE-STRUCTURE", DD),
    ("ENGP-CON-PURPOSE-STRUCTURE", "ENGP-CON-CLEAR-CONCISE", DD),
    ("ENGP-CON-CLEAR-CONCISE", "ENGP-CON-PERSUASIVE-FEATURES", DD),
    # Cross-chain bridges the syllabus states
    ("ENGP-CON-IMPLICIT-BIAS", "ENGP-CON-LANGUAGE-FEATURES", UWR),
    ("ENGP-CON-SELECT-RELEVANT", "ENGP-CON-RELEVANCE-JUDGEMENT", UWR),
    ("ENGP-CON-PERSUADE-FACTS", "ENGP-CON-PERSUASIVE-ARGUMENTS", UWR),
    ("ENGP-CON-PERSUASIVE-ARGUMENTS", "ENGP-CON-PERSUASIVE-FEATURES", UWR),
    ("ENGP-CON-VOCAB-REGISTER", "ENGP-CON-PURPOSE-STRUCTURE", UWR),
]
