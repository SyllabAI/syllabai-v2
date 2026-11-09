"""IAL Pure Mathematics 2 (WMA12) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, ial-maths-20-pure-2).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel IAL Pure Mathematics 2 unit content (8 topics, 19 spec points),
anchored to the served spine's point ids. Every anchor is machine-verified
against the spine before any byte is written (0-unmapped pass law,
enforced in kg_f8ma_generate.py).

P2 extends P1 (landed in the same batch, its own lattice): the web below
records only dependencies INTERNAL to the P2 point set — the known P2
deltas over P1 (algebraic division, logarithms, the tan identity) carry
their in-paper dependencies only.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Proof
    "IAP2-CON-PROOF": ["1.1", "1.2", "1.3"],
    # 2 Algebra
    "IAP2-CON-POLY-DIVISION": ["2.1"],
    # 3 Coordinate geometry
    "IAP2-CON-CIRCLE-COORD": ["3.1"],
    # 4 Sequences and series
    "IAP2-CON-SEQUENCES": ["4.1"],
    "IAP2-CON-AP": ["4.2"],
    "IAP2-CON-SEQ-BEHAVIOUR": ["4.3"],
    "IAP2-CON-GP": ["4.4"],
    "IAP2-CON-BINOMIAL": ["4.5"],
    # 5 Exponentials and logarithms
    "IAP2-CON-EXP-FN": ["5.1"],
    "IAP2-CON-LOG-LAWS": ["5.2"],
    "IAP2-CON-EXP-EQUATIONS": ["5.3"],
    # 6 Trigonometry
    "IAP2-CON-TRIG-IDENTITIES": ["6.1"],
    "IAP2-CON-TRIG-EQUATIONS": ["6.2"],
    # 7 Differentiation
    "IAP2-CON-STATIONARY": ["7.1"],
    # 8 Integration
    "IAP2-CON-DEF-INTEGRALS": ["8.1"],
    "IAP2-CON-AREA-UNDER": ["8.2"],
    "IAP2-CON-TRAPEZIUM": ["8.3"],
}

EDGES = [
    # Sequences and series cluster
    ("IAP2-CON-SEQUENCES", "IAP2-CON-AP", DD),
    ("IAP2-CON-SEQUENCES", "IAP2-CON-SEQ-BEHAVIOUR", DD),
    ("IAP2-CON-SEQUENCES", "IAP2-CON-GP", DD),
    ("IAP2-CON-AP", "IAP2-CON-SEQ-BEHAVIOUR", UWR),
    # Exponentials and logarithms
    ("IAP2-CON-EXP-FN", "IAP2-CON-LOG-LAWS", UWR),
    ("IAP2-CON-EXP-FN", "IAP2-CON-EXP-EQUATIONS", DD),
    ("IAP2-CON-LOG-LAWS", "IAP2-CON-EXP-EQUATIONS", DD),
    # Trigonometry
    ("IAP2-CON-TRIG-IDENTITIES", "IAP2-CON-TRIG-EQUATIONS", DD),
    # Integration
    ("IAP2-CON-DEF-INTEGRALS", "IAP2-CON-AREA-UNDER", DD),
    ("IAP2-CON-DEF-INTEGRALS", "IAP2-CON-TRAPEZIUM", UWR),
]
