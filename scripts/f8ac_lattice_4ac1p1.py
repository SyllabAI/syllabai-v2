"""Edexcel International GCSE Accounting 4AC1 Paper 1 (Financial Statements)
concept lattice — T-KG-PRE-9
(F8 rollout batch seven, the accounting family tranche 4,
igcse-accounting-17-financial-statements).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
4AC1 Paper 1 specification content (topics 4-5 as served, 36 spec points),
anchored to the served spine's point ids (IGCSE_ACCOUNTING:S*.*). Every
anchor is machine-verified against the spine before any byte is written
(0-unmapped pass law, enforced in kg_f8ma_generate.py).

Served-order disclosure: the spine lists the Paper 1 statement-preparation
points FIRST (S4.158-S4.174) and the adjustment techniques (concepts,
depreciation, irrecoverable debts, other receivables/payables) LAST
(S5.175-S5.185) — the reverse of teaching order. The true adjustment ->
statement dependencies are authored honestly and the calibrated export law
drops those reversed pairs outright (counted in exportCounts.reversedDropped,
the 4MA1 governance class); the assessment-mechanics points (S5.027-S5.034)
are bound by no concept.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # Paper 1 core: the two primary statements
    "ACP1-CON-INCOME-STATEMENT": ["IGCSE_ACCOUNTING:S4.158"],
    "ACP1-CON-SOFP": ["IGCSE_ACCOUNTING:S4.159"],
    # Partnerships
    "ACP1-CON-PARTNERSHIP": [
        "IGCSE_ACCOUNTING:S4.160", "IGCSE_ACCOUNTING:S4.162",
    ],
    "ACP1-CON-LLP": ["IGCSE_ACCOUNTING:S4.161"],
    "ACP1-CON-APPROPRIATION": [
        "IGCSE_ACCOUNTING:S4.163", "IGCSE_ACCOUNTING:S4.164",
    ],
    "ACP1-CON-PARTNER-ACCOUNTS": [
        "IGCSE_ACCOUNTING:S4.165", "IGCSE_ACCOUNTING:S4.166",
    ],
    # Incomplete records
    "ACP1-CON-EQUITY-PROFIT": ["IGCSE_ACCOUNTING:S4.167"],
    "ACP1-CON-INCOMPLETE-RECORDS": [
        "IGCSE_ACCOUNTING:S4.168", "IGCSE_ACCOUNTING:S4.169",
    ],
    # Ratios
    "ACP1-CON-PROFITABILITY-LIQUIDITY": ["IGCSE_ACCOUNTING:S4.170"],
    "ACP1-CON-PROFITABILITY-RATIOS": ["IGCSE_ACCOUNTING:S4.171"],
    "ACP1-CON-LIQUIDITY-RATIOS": ["IGCSE_ACCOUNTING:S4.172"],
    # Manufacturing
    "ACP1-CON-INVENTORY-TYPES": ["IGCSE_ACCOUNTING:S4.173"],
    "ACP1-CON-MANUFACTURING-ACCOUNTS": ["IGCSE_ACCOUNTING:S4.174"],
    # Adjustment techniques (topic 5, served last)
    "ACP1-CON-CONCEPTS": ["IGCSE_ACCOUNTING:S5.175"],
    "ACP1-CON-DEPRECIATION": [
        "IGCSE_ACCOUNTING:S5.176", "IGCSE_ACCOUNTING:S5.177",
        "IGCSE_ACCOUNTING:S5.178",
    ],
    "ACP1-CON-DISPOSALS": ["IGCSE_ACCOUNTING:S5.179"],
    "ACP1-CON-IRRECOVERABLE-DEBTS": [
        "IGCSE_ACCOUNTING:S5.180", "IGCSE_ACCOUNTING:S5.181",
        "IGCSE_ACCOUNTING:S5.182",
    ],
    "ACP1-CON-RECEIVABLES-PAYABLES": [
        "IGCSE_ACCOUNTING:S5.183", "IGCSE_ACCOUNTING:S5.184",
        "IGCSE_ACCOUNTING:S5.185",
    ],
}

EDGES = [
    # The two primary statements
    ("ACP1-CON-INCOME-STATEMENT", "ACP1-CON-SOFP", DD),
    # Partnership chain
    ("ACP1-CON-PARTNERSHIP", "ACP1-CON-LLP", UWR),
    ("ACP1-CON-PARTNERSHIP", "ACP1-CON-APPROPRIATION", DD),
    ("ACP1-CON-APPROPRIATION", "ACP1-CON-PARTNER-ACCOUNTS", DD),
    ("ACP1-CON-SOFP", "ACP1-CON-PARTNER-ACCOUNTS", UWR),
    # Incomplete records build on the equity comparison
    ("ACP1-CON-SOFP", "ACP1-CON-EQUITY-PROFIT", UWR),
    ("ACP1-CON-EQUITY-PROFIT", "ACP1-CON-INCOMPLETE-RECORDS", DD),
    # Ratios interpret the statements
    ("ACP1-CON-INCOME-STATEMENT", "ACP1-CON-PROFITABILITY-LIQUIDITY", UWR),
    ("ACP1-CON-PROFITABILITY-LIQUIDITY", "ACP1-CON-PROFITABILITY-RATIOS", DD),
    ("ACP1-CON-PROFITABILITY-LIQUIDITY", "ACP1-CON-LIQUIDITY-RATIOS", DD),
    # Manufacturing accounts
    ("ACP1-CON-INVENTORY-TYPES", "ACP1-CON-MANUFACTURING-ACCOUNTS", DD),
    # True dependencies whose served order is reversed (adjustments listed
    # last, statements first) — authored honestly, exported pairs dropped
    # and counted by the in-order law
    ("ACP1-CON-CONCEPTS", "ACP1-CON-INCOME-STATEMENT", UWR),
    ("ACP1-CON-DEPRECIATION", "ACP1-CON-SOFP", UWR),
    ("ACP1-CON-IRRECOVERABLE-DEBTS", "ACP1-CON-INCOME-STATEMENT", UWR),
]
