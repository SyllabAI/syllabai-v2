"""IAL Statistics 2 (WST02) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, ial-maths-20-statistics-2).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel IAL Statistics 2 unit content (4 topics, 16 spec points), anchored
to the served spine's point ids. Every anchor is machine-verified against
the spine before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

S2 assumes S1 (its debts are S1's lattice, landed in this batch): the web
below records dependencies INTERNAL to the S2 point set — the binomial/
Poisson pair, continuous random variables, the continuous uniform, and the
hypothesis-testing block that closes the paper.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Binomial and Poisson
    "IAS2-CON-BINOMIAL-POISSON": ["1.1", "1.2"],
    "IAS2-CON-POISSON-APPROX": ["1.3"],
    # 2 Continuous random variables
    "IAS2-CON-CRV": ["2.1"],
    "IAS2-CON-PDF-CDF": ["2.2", "2.3"],
    "IAS2-CON-CRV-MOMENTS": ["2.4"],
    "IAS2-CON-CRV-QUANTILES": ["2.5"],
    # 3 Continuous distributions
    "IAS2-CON-UNIFORM": ["3.1"],
    "IAS2-CON-NORMAL-APPROX": ["3.2"],
    # 4 Sampling and hypothesis testing
    "IAS2-CON-SAMPLING": ["4.1", "4.2"],
    "IAS2-CON-HYP-TEST": ["4.3", "4.5"],
    "IAS2-CON-CRITICAL-REGION": ["4.4"],
    "IAS2-CON-BIN-POIS-TESTS": ["4.6"],
}

EDGES = [
    # Binomial and Poisson cluster
    ("IAS2-CON-BINOMIAL-POISSON", "IAS2-CON-POISSON-APPROX", DD),
    # Continuous random variables
    ("IAS2-CON-CRV", "IAS2-CON-PDF-CDF", DD),
    ("IAS2-CON-PDF-CDF", "IAS2-CON-CRV-MOMENTS", DD),
    ("IAS2-CON-PDF-CDF", "IAS2-CON-CRV-QUANTILES", DD),
    # Continuous distributions
    ("IAS2-CON-PDF-CDF", "IAS2-CON-UNIFORM", DD),
    ("IAS2-CON-CRV-MOMENTS", "IAS2-CON-UNIFORM", UWR),
    ("IAS2-CON-BINOMIAL-POISSON", "IAS2-CON-NORMAL-APPROX", DD),
    ("IAS2-CON-CRV", "IAS2-CON-NORMAL-APPROX", UWR),
    # Hypothesis testing block
    ("IAS2-CON-SAMPLING", "IAS2-CON-HYP-TEST", DD),
    ("IAS2-CON-HYP-TEST", "IAS2-CON-CRITICAL-REGION", DD),
    ("IAS2-CON-HYP-TEST", "IAS2-CON-BIN-POIS-TESTS", DD),
    ("IAS2-CON-CRITICAL-REGION", "IAS2-CON-BIN-POIS-TESTS", UWR),
    ("IAS2-CON-BINOMIAL-POISSON", "IAS2-CON-BIN-POIS-TESTS", UWR),
]
