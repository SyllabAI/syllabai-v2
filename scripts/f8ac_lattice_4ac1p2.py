"""Edexcel International GCSE Accounting 4AC1 Paper 2 (Introduction to
Bookkeeping and Accounting) concept lattice — T-KG-PRE-9
(F8 rollout batch seven, the accounting family tranche 4,
igcse-accounting-17-introduction-to-bookkeeping-and-accounting).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
4AC1 Paper 2 specification content (topics 1-3 as served, 48 spec points),
anchored to the served spine's point ids (IGCSE_ACCOUNTING:S*.*). Every
anchor is machine-verified against the spine before any byte is written
(0-unmapped pass law, enforced in kg_f8ma_generate.py).

The two 4AC1 papers assess disjoint specification content (Paper 1: topics
4-5 statements; Paper 2: topics 1-3 bookkeeping), so they are independent
lattices per the two-paper law — no projection in either direction. The
assessment-mechanics points (S3.018-S3.026) are bound by no concept.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # Topic 1: the business and accounting context
    "ACP2-CON-SECTORS": ["IGCSE_ACCOUNTING:S1.119"],
    "ACP2-CON-STAKEHOLDERS": ["IGCSE_ACCOUNTING:S1.120"],
    "ACP2-CON-CONCEPTS": ["IGCSE_ACCOUNTING:S1.121"],
    "ACP2-CON-TECHNOLOGY": ["IGCSE_ACCOUNTING:S1.122"],
    "ACP2-CON-DATA-SECURITY": [
        "IGCSE_ACCOUNTING:S1.123", "IGCSE_ACCOUNTING:S1.124",
    ],
    "ACP2-CON-ETHICS": [
        "IGCSE_ACCOUNTING:S1.125", "IGCSE_ACCOUNTING:S1.126",
        "IGCSE_ACCOUNTING:S1.127",
    ],
    # Topic 2: the books of account
    "ACP2-CON-BUSINESS-DOCUMENTS": [
        "IGCSE_ACCOUNTING:S2.128", "IGCSE_ACCOUNTING:S2.129",
        "IGCSE_ACCOUNTING:S2.130",
    ],
    "ACP2-CON-BOOKS-PRIME-ENTRY": [
        "IGCSE_ACCOUNTING:S2.131", "IGCSE_ACCOUNTING:S2.132",
    ],
    "ACP2-CON-LEDGERS": [
        "IGCSE_ACCOUNTING:S2.133", "IGCSE_ACCOUNTING:S2.134",
    ],
    "ACP2-CON-CAPITAL-REVENUE": [
        "IGCSE_ACCOUNTING:S2.135", "IGCSE_ACCOUNTING:S2.136",
    ],
    "ACP2-CON-DEPRECIATION": [
        "IGCSE_ACCOUNTING:S2.137", "IGCSE_ACCOUNTING:S2.138",
        "IGCSE_ACCOUNTING:S2.139",
    ],
    "ACP2-CON-DISPOSALS": ["IGCSE_ACCOUNTING:S2.140"],
    "ACP2-CON-IRRECOVERABLE-DEBTS": [
        "IGCSE_ACCOUNTING:S2.141", "IGCSE_ACCOUNTING:S2.142",
        "IGCSE_ACCOUNTING:S2.143",
    ],
    "ACP2-CON-RECEIVABLES-PAYABLES": [
        "IGCSE_ACCOUNTING:S2.144", "IGCSE_ACCOUNTING:S2.145",
        "IGCSE_ACCOUNTING:S2.146",
    ],
    # Topic 3: verification of accounting records
    "ACP2-CON-TRIAL-BALANCE": [
        "IGCSE_ACCOUNTING:S3.147", "IGCSE_ACCOUNTING:S3.148",
        "IGCSE_ACCOUNTING:S3.149",
    ],
    "ACP2-CON-CONTROL-ACCOUNTS": [
        "IGCSE_ACCOUNTING:S3.150", "IGCSE_ACCOUNTING:S3.151",
    ],
    "ACP2-CON-ERROR-CORRECTION": [
        "IGCSE_ACCOUNTING:S3.152", "IGCSE_ACCOUNTING:S3.153",
        "IGCSE_ACCOUNTING:S3.154",
    ],
    "ACP2-CON-BANK-RECON": [
        "IGCSE_ACCOUNTING:S3.155", "IGCSE_ACCOUNTING:S3.156",
        "IGCSE_ACCOUNTING:S3.157",
    ],
}

EDGES = [
    # Business context
    ("ACP2-CON-SECTORS", "ACP2-CON-STAKEHOLDERS", DD),
    ("ACP2-CON-CONCEPTS", "ACP2-CON-LEDGERS", UWR),
    ("ACP2-CON-CONCEPTS", "ACP2-CON-ETHICS", UWR),
    ("ACP2-CON-TECHNOLOGY", "ACP2-CON-DATA-SECURITY", DD),
    # The recording pipeline: documents -> books of prime entry -> ledgers
    ("ACP2-CON-BUSINESS-DOCUMENTS", "ACP2-CON-BOOKS-PRIME-ENTRY", DD),
    ("ACP2-CON-BOOKS-PRIME-ENTRY", "ACP2-CON-LEDGERS", DD),
    # Adjustment techniques apply through the ledgers
    ("ACP2-CON-LEDGERS", "ACP2-CON-CAPITAL-REVENUE", UWR),
    ("ACP2-CON-CAPITAL-REVENUE", "ACP2-CON-DEPRECIATION", DD),
    ("ACP2-CON-DEPRECIATION", "ACP2-CON-DISPOSALS", DD),
    ("ACP2-CON-LEDGERS", "ACP2-CON-IRRECOVERABLE-DEBTS", UWR),
    ("ACP2-CON-LEDGERS", "ACP2-CON-RECEIVABLES-PAYABLES", UWR),
    # Verification chain
    ("ACP2-CON-LEDGERS", "ACP2-CON-TRIAL-BALANCE", UWR),
    ("ACP2-CON-TRIAL-BALANCE", "ACP2-CON-CONTROL-ACCOUNTS", UWR),
    ("ACP2-CON-TRIAL-BALANCE", "ACP2-CON-ERROR-CORRECTION", DD),
    ("ACP2-CON-CONTROL-ACCOUNTS", "ACP2-CON-ERROR-CORRECTION", UWR),
    ("ACP2-CON-LEDGERS", "ACP2-CON-BANK-RECON", UWR),
    ("ACP2-CON-TRIAL-BALANCE", "ACP2-CON-BANK-RECON", UWR),
]
