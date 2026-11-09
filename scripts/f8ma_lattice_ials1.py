"""IAL Statistics 1 (WST01) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, ial-maths-20-statistics-1).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel IAL Statistics 1 unit content (5 topics, 16 spec points), anchored
to the served spine's point ids. Every anchor is machine-verified against
the spine before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

S1's spine runs data presentation -> summary measures -> probability ->
correlation/regression -> the normal and discrete distributions; the web
records those internal dependencies.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Mathematical models
    "IAS1-CON-MODELLING": ["1.1"],
    # 2 Data presentation and measures
    "IAS1-CON-DIAGRAMS": ["2.1"],
    "IAS1-CON-LOCATION": ["2.2"],
    "IAS1-CON-DISPERSION": ["2.3"],
    "IAS1-CON-SKEWNESS": ["2.4"],
    # 3 Probability
    "IAS1-CON-PROBABILITY": ["3.1"],
    "IAS1-CON-SAMPLE-SPACE": ["3.2"],
    "IAS1-CON-INDEPENDENCE": ["3.3"],
    "IAS1-CON-TREE-VENN": ["3.4"],
    # 4 Correlation and regression
    "IAS1-CON-REGRESSION": ["4.1"],
    "IAS1-CON-VARIABLES": ["4.2"],
    "IAS1-CON-PMCC": ["4.3"],
    # 5 Distributions
    "IAS1-CON-NORMAL": ["5.1"],
    "IAS1-CON-DISCRETE-RV": ["5.2"],
    "IAS1-CON-EXPECTATION": ["5.3"],
    "IAS1-CON-DISCRETE-UNIFORM": ["5.4"],
}

EDGES = [
    # Data measures cluster
    ("IAS1-CON-DIAGRAMS", "IAS1-CON-LOCATION", UWR),
    ("IAS1-CON-LOCATION", "IAS1-CON-DISPERSION", UWR),
    ("IAS1-CON-LOCATION", "IAS1-CON-SKEWNESS", UWR),
    ("IAS1-CON-DISPERSION", "IAS1-CON-SKEWNESS", UWR),
    # Probability cluster
    ("IAS1-CON-PROBABILITY", "IAS1-CON-SAMPLE-SPACE", DD),
    ("IAS1-CON-SAMPLE-SPACE", "IAS1-CON-INDEPENDENCE", DD),
    ("IAS1-CON-SAMPLE-SPACE", "IAS1-CON-TREE-VENN", DD),
    ("IAS1-CON-INDEPENDENCE", "IAS1-CON-TREE-VENN", UWR),
    # Correlation and regression
    ("IAS1-CON-REGRESSION", "IAS1-CON-VARIABLES", DD),
    ("IAS1-CON-REGRESSION", "IAS1-CON-PMCC", UWR),
    ("IAS1-CON-VARIABLES", "IAS1-CON-PMCC", UWR),
    # Discrete random variables
    ("IAS1-CON-DISCRETE-RV", "IAS1-CON-EXPECTATION", DD),
    ("IAS1-CON-EXPECTATION", "IAS1-CON-DISCRETE-UNIFORM", UWR),
]
