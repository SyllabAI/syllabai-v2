"""9709 Paper 5 (Probability & Statistics 1) concept lattice — T-KG-PRE-7
(F8 rollout batch five, cie-as-maths-20-probability-and-statistics-1 +
cie-a-level-maths-20-probability-and-statistics-1).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 9709
2020-2025 syllabus Probability & Statistics 1 paper (5 topics, 17 spec
points), anchored to the served spine's point ids. The AS and A-level PS1
served spines carry identical point sets (same paper), so one lattice serves
both courses fresh.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 5.1 Representation of data
    "MAS1-CON-DATA-REPRESENT": ["5.1.1", "5.1.2"],
    "MAS1-CON-CENTRAL-TENDENCY": ["5.1.3"],
    "MAS1-CON-CUMULATIVE-FREQ": ["5.1.4"],
    "MAS1-CON-MEAN-SD": ["5.1.5"],
    # 5.2 Permutations and combinations
    "MAS1-CON-PERM-COMB": ["5.2.1"],
    "MAS1-CON-ARRANGEMENTS": ["5.2.2"],
    # 5.3 Probability
    "MAS1-CON-PROB-BASIC": ["5.3.1"],
    "MAS1-CON-PROB-ADDMULT": ["5.3.2"],
    "MAS1-CON-EXCL-INDEP": ["5.3.3"],
    "MAS1-CON-CONDITIONAL": ["5.3.4"],
    # 5.4 Discrete random variables
    "MAS1-CON-DRV-TABLE": ["5.4.1"],
    "MAS1-CON-BINOM-GEOM": ["5.4.2"],
    "MAS1-CON-BINOM-EXPECT": ["5.4.3"],
    # 5.5 The normal distribution
    "MAS1-CON-NORMAL-MODEL": ["5.5.1"],
    "MAS1-CON-NORMAL-CALC": ["5.5.2"],
    "MAS1-CON-NORMAL-BINOM-APPROX": ["5.5.3"],
}

EDGES = [
    # Data handling
    ("MAS1-CON-DATA-REPRESENT", "MAS1-CON-CENTRAL-TENDENCY", UWR),
    ("MAS1-CON-DATA-REPRESENT", "MAS1-CON-CUMULATIVE-FREQ", DD),
    ("MAS1-CON-CENTRAL-TENDENCY", "MAS1-CON-CUMULATIVE-FREQ", UWR),
    ("MAS1-CON-CENTRAL-TENDENCY", "MAS1-CON-MEAN-SD", DD),
    # Counting into probability
    ("MAS1-CON-PERM-COMB", "MAS1-CON-ARRANGEMENTS", DD),
    ("MAS1-CON-PERM-COMB", "MAS1-CON-PROB-BASIC", UWR),
    # Probability chain
    ("MAS1-CON-PROB-BASIC", "MAS1-CON-PROB-ADDMULT", DD),
    ("MAS1-CON-PROB-ADDMULT", "MAS1-CON-EXCL-INDEP", DD),
    ("MAS1-CON-PROB-ADDMULT", "MAS1-CON-CONDITIONAL", DD),
    ("MAS1-CON-EXCL-INDEP", "MAS1-CON-CONDITIONAL", UWR),
    # Discrete random variables
    ("MAS1-CON-PROB-BASIC", "MAS1-CON-DRV-TABLE", DD),
    ("MAS1-CON-PROB-ADDMULT", "MAS1-CON-DRV-TABLE", UWR),
    ("MAS1-CON-DRV-TABLE", "MAS1-CON-BINOM-GEOM", DD),
    ("MAS1-CON-BINOM-GEOM", "MAS1-CON-BINOM-EXPECT", DD),
    ("MAS1-CON-DRV-TABLE", "MAS1-CON-BINOM-EXPECT", UWR),
    # The normal distribution
    ("MAS1-CON-NORMAL-MODEL", "MAS1-CON-NORMAL-CALC", DD),
    ("MAS1-CON-MEAN-SD", "MAS1-CON-NORMAL-CALC", UWR),
    ("MAS1-CON-BINOM-GEOM", "MAS1-CON-NORMAL-BINOM-APPROX", DD),
    ("MAS1-CON-NORMAL-CALC", "MAS1-CON-NORMAL-BINOM-APPROX", DD),
]
