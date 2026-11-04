"""9706 AS Level Accounting concept lattice — T-KG-PRE-9
(F8 rollout batch seven, the accounting family tranche 4, cie-as-accounting-21).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
9706 AS Level syllabus section (6 topics, 19 spec points), anchored to the
served spine's point ids. Every anchor is machine-verified against the spine
before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

This lattice is the AS course's own startup: the A-level spine is a strict
superset (19 shared ids carry identical texts + 15 A2-only ids), so the AL
course gets its own lattice (f8ac_lattice_9706al.py) covering the A2
extensions — distinct served point sets get independent lattices (the 0580
two-tier law applied to distinct id SETS).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1.1 The fundamentals of accounting
    "ACAS-CON-BUSINESS-ENTITIES": ["1.1.1"],
    # 1.2 The accounting system
    "ACAS-CON-DOUBLE-ENTRY": ["1.2.1"],
    # 1.3 Capital and revenue
    "ACAS-CON-CAPITAL-REVENUE": ["1.3.1"],
    "ACAS-CON-ASSET-VALUES": ["1.3.2"],
    # 1.4 Reconciliation and verification
    "ACAS-CON-RECONCILIATION": ["1.4.1"],
    "ACAS-CON-TRIAL-BALANCE": ["1.4.2"],
    "ACAS-CON-BANK-RECON": ["1.4.3"],
    "ACAS-CON-CONTROL-ACCOUNTS": ["1.4.4"],
    # 1.5 Preparation of financial statements
    "ACAS-CON-FS-ADJUSTMENTS": ["1.5.1"],
    "ACAS-CON-SOLE-TRADER-FS": ["1.5.2"],
    "ACAS-CON-PARTNERSHIP-FS": ["1.5.3"],
    "ACAS-CON-LIMITED-CO-FS": ["1.5.4"],
    # 1.6 Analysis and communication
    "ACAS-CON-USERS": ["1.6.1"],
    "ACAS-CON-RATIOS": ["1.6.2"],
    # 2.1 Costing: materials and labour
    "ACAS-CON-MATERIALS-LABOUR": ["2.1.1"],
    # 2.2 Costing applications
    "ACAS-CON-COSTING-APPLICATIONS": ["2.2.1"],
    "ACAS-CON-ABSORPTION": ["2.2.2"],
    "ACAS-CON-MARGINAL": ["2.2.3"],
    "ACAS-CON-CVP": ["2.2.4"],
}

EDGES = [
    # Fundamentals frame the recording system
    ("ACAS-CON-BUSINESS-ENTITIES", "ACAS-CON-DOUBLE-ENTRY", UWR),
    # The double entry system is the spine everything else stands on
    ("ACAS-CON-DOUBLE-ENTRY", "ACAS-CON-CAPITAL-REVENUE", UWR),
    ("ACAS-CON-DOUBLE-ENTRY", "ACAS-CON-RECONCILIATION", UWR),
    ("ACAS-CON-DOUBLE-ENTRY", "ACAS-CON-TRIAL-BALANCE", UWR),
    ("ACAS-CON-DOUBLE-ENTRY", "ACAS-CON-CONTROL-ACCOUNTS", UWR),
    ("ACAS-CON-DOUBLE-ENTRY", "ACAS-CON-SOLE-TRADER-FS", UWR),
    # Capital vs revenue distinction underpins asset value treatment
    ("ACAS-CON-CAPITAL-REVENUE", "ACAS-CON-ASSET-VALUES", UWR),
    # Verification chain
    ("ACAS-CON-TRIAL-BALANCE", "ACAS-CON-BANK-RECON", UWR),
    ("ACAS-CON-TRIAL-BALANCE", "ACAS-CON-CONTROL-ACCOUNTS", UWR),
    # Adjustments feed statement preparation
    ("ACAS-CON-CAPITAL-REVENUE", "ACAS-CON-FS-ADJUSTMENTS", UWR),
    ("ACAS-CON-ASSET-VALUES", "ACAS-CON-FS-ADJUSTMENTS", UWR),
    ("ACAS-CON-FS-ADJUSTMENTS", "ACAS-CON-SOLE-TRADER-FS", DD),
    # Entity forms build on the sole trader statements
    ("ACAS-CON-SOLE-TRADER-FS", "ACAS-CON-PARTNERSHIP-FS", DD),
    ("ACAS-CON-SOLE-TRADER-FS", "ACAS-CON-LIMITED-CO-FS", DD),
    # Analysis serves the users of the statements
    ("ACAS-CON-SOLE-TRADER-FS", "ACAS-CON-USERS", UWR),
    ("ACAS-CON-USERS", "ACAS-CON-RATIOS", UWR),
    ("ACAS-CON-SOLE-TRADER-FS", "ACAS-CON-RATIOS", UWR),
    # Costing chain
    ("ACAS-CON-MATERIALS-LABOUR", "ACAS-CON-COSTING-APPLICATIONS", DD),
    ("ACAS-CON-COSTING-APPLICATIONS", "ACAS-CON-ABSORPTION", DD),
    ("ACAS-CON-ABSORPTION", "ACAS-CON-MARGINAL", UWR),
    ("ACAS-CON-MARGINAL", "ACAS-CON-CVP", DD),
]
