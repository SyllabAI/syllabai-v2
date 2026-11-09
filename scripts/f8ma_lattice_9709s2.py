"""9709 Paper 6 (Probability & Statistics 2) concept lattice — T-KG-PRE-7
(F8 rollout batch five, cie-a-level-maths-20-probability-and-statistics-2).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 9709
2020-2025 syllabus Probability & Statistics 2 paper (5 topics, 18 spec
points), anchored to the served spine's point ids. PS2 is A-level-only (no AS
PS2 spine exists in the corpus). PS2 assumes PS1 (landed in this batch) and
adds the Poisson distribution, linear combinations of random variables,
continuous random variables, sampling and estimation, and hypothesis tests;
edges record only dependencies INTERNAL to the PS2 point set.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 6.1 The Poisson distribution
    "MAS2-CON-POISSON-PROB": ["6.1.1"],
    "MAS2-CON-POISSON-MEANVAR": ["6.1.2"],
    "MAS2-CON-POISSON-MODEL": ["6.1.3"],
    "MAS2-CON-POISSON-BINOM-APPROX": ["6.1.4"],
    "MAS2-CON-NORMAL-POISSON-APPROX": ["6.1.5"],
    # 6.2 Linear combinations of random variables
    "MAS2-CON-LINCOMB-EXPECT": ["6.2.1"],
    "MAS2-CON-LINCOMB-DISTRIBUTIONS": ["6.2.2"],
    # 6.3 Continuous random variables
    "MAS2-CON-CRV-PDF": ["6.3.1"],
    "MAS2-CON-CRV-CALC": ["6.3.2"],
    # 6.4 Sampling and estimation
    "MAS2-CON-SAMPLING-BASICS": ["6.4.1", "6.4.2"],
    "MAS2-CON-SAMPLE-MEAN": ["6.4.3", "6.4.4"],
    # 6.5 Hypothesis tests
    "MAS2-CON-HYPOTHESIS-BASICS": ["6.5.1"],
    "MAS2-CON-HYPOTHESIS-DISCRETE": ["6.5.2"],
    "MAS2-CON-HYPOTHESIS-MEAN": ["6.5.3"],
    "MAS2-CON-ERROR-TYPES": ["6.5.4"],
    "MAS2-CON-ERROR-CALC": ["6.5.5"],
}

EDGES = [
    # The Poisson distribution
    ("MAS2-CON-POISSON-PROB", "MAS2-CON-POISSON-MEANVAR", DD),
    ("MAS2-CON-POISSON-PROB", "MAS2-CON-POISSON-MODEL", UWR),
    ("MAS2-CON-POISSON-PROB", "MAS2-CON-POISSON-BINOM-APPROX", DD),
    ("MAS2-CON-POISSON-MODEL", "MAS2-CON-POISSON-BINOM-APPROX", UWR),
    ("MAS2-CON-POISSON-PROB", "MAS2-CON-NORMAL-POISSON-APPROX", DD),
    # Linear combinations of random variables
    ("MAS2-CON-POISSON-MEANVAR", "MAS2-CON-LINCOMB-EXPECT", UWR),
    ("MAS2-CON-LINCOMB-EXPECT", "MAS2-CON-LINCOMB-DISTRIBUTIONS", DD),
    # Continuous random variables
    ("MAS2-CON-CRV-PDF", "MAS2-CON-CRV-CALC", DD),
    # Sampling and estimation
    ("MAS2-CON-SAMPLING-BASICS", "MAS2-CON-SAMPLE-MEAN", DD),
    # Hypothesis tests
    ("MAS2-CON-HYPOTHESIS-BASICS", "MAS2-CON-HYPOTHESIS-DISCRETE", DD),
    ("MAS2-CON-HYPOTHESIS-BASICS", "MAS2-CON-HYPOTHESIS-MEAN", DD),
    ("MAS2-CON-POISSON-PROB", "MAS2-CON-HYPOTHESIS-DISCRETE", DD),
    ("MAS2-CON-POISSON-MODEL", "MAS2-CON-HYPOTHESIS-DISCRETE", UWR),
    ("MAS2-CON-SAMPLE-MEAN", "MAS2-CON-HYPOTHESIS-MEAN", DD),
    ("MAS2-CON-HYPOTHESIS-BASICS", "MAS2-CON-ERROR-TYPES", DD),
    ("MAS2-CON-ERROR-TYPES", "MAS2-CON-ERROR-CALC", DD),
    ("MAS2-CON-HYPOTHESIS-DISCRETE", "MAS2-CON-ERROR-CALC", UWR),
    ("MAS2-CON-HYPOTHESIS-MEAN", "MAS2-CON-ERROR-CALC", UWR),
]
