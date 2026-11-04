"""0452 IGCSE Accounting (syllabus 2021 examination) concept lattice — T-KG-PRE-9
(F8 rollout batch seven, the accounting family tranche 4, cie-igcse-accounting-21).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
0452 IGCSE syllabus section (7 topics, 144 spec points), anchored to the
served spine's point ids. Every anchor is machine-verified against the spine
before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

The 2021 and 2025 examination spines share id SCHEME but not id TEXTS
(only 4 of 142 shared ids carry identical texts) and the 2025 syllabus adds
35 points (digital records, ethics, storage, mark-up, cash-vs-profit) —
so this lattice and f8ac_lattice_0452x25.py are INDEPENDENT startups, not a
projection pair (the two-tier law applied to same-scheme/different-text
spines).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 The fundamentals of accounting
    "ACX21-CON-BOOKKEEPING-ACCOUNTING": ["1.1.1", "1.1.2", "1.1.3"],
    "ACX21-CON-ACCOUNTING-EQUATION": ["1.2.1", "1.2.2"],
    # 2 Double entry book-keeping
    "ACX21-CON-DOUBLE-ENTRY": [
        "2.1.1", "2.1.2", "2.1.3", "2.1.4", "2.1.5", "2.1.6",
    ],
    "ACX21-CON-LEDGER-DIVISION": ["2.1.7"],
    "ACX21-CON-BUSINESS-DOCUMENTS": ["2.2.1", "2.2.2", "2.2.3"],
    "ACX21-CON-BOOKS-PRIME-ENTRY": [
        "2.3.1", "2.3.2", "2.3.3", "2.3.5", "2.3.6", "2.3.7",
    ],
    "ACX21-CON-DISCOUNTS": ["2.3.4"],
    # 3 Verification of accounting records
    "ACX21-CON-TRIAL-BALANCE": ["3.1.1", "3.1.2", "3.1.3"],
    "ACX21-CON-ERROR-CORRECTION": [
        "3.1.4", "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.5",
    ],
    "ACX21-CON-BANK-RECON": ["3.3.1", "3.3.2", "3.3.3"],
    "ACX21-CON-CONTROL-ACCOUNTS": ["3.4.1", "3.4.2", "3.4.3"],
    # 4 Accounting procedures
    "ACX21-CON-CAPITAL-REVENUE": ["4.1.1", "4.1.2", "4.1.3", "4.1.4"],
    "ACX21-CON-DEPRECIATION": ["4.2.1", "4.2.2", "4.2.3", "4.2.4"],
    "ACX21-CON-DISPOSALS": ["4.2.5"],
    "ACX21-CON-ACCRUALS": ["4.3.1", "4.3.2", "4.3.3"],
    "ACX21-CON-IRRECOVERABLE-DEBTS": [
        "4.4.1", "4.4.2", "4.4.3", "4.4.4", "4.4.5",
    ],
    "ACX21-CON-INVENTORY-VALUATION": ["4.5.1", "4.5.2", "4.5.3"],
    # 5 Preparation of financial statements
    "ACX21-CON-SOLE-TRADER-FS": [
        "5.1.1", "5.1.2", "5.1.3", "5.1.4", "5.1.5", "5.1.6", "5.1.7",
        "5.1.8",
    ],
    "ACX21-CON-FS-ADJUSTMENTS": ["5.1.9", "5.1.10", "5.1.11", "5.1.12"],
    "ACX21-CON-PARTNERSHIP-FS": [
        "5.2.1", "5.2.2", "5.2.3", "5.2.4", "5.2.5", "5.2.6", "5.2.7",
        "5.2.8", "5.2.9",
    ],
    "ACX21-CON-LIMITED-CO-FS": [
        "5.3.1", "5.3.2", "5.3.3", "5.3.4", "5.3.5", "5.3.6", "5.3.7",
        "5.3.8",
    ],
    "ACX21-CON-CLUBS-FS": [
        "5.4.1", "5.4.2", "5.4.3", "5.4.4", "5.4.5", "5.4.6",
    ],
    "ACX21-CON-MANUFACTURING-ACCOUNTS": [
        "5.5.1", "5.5.2", "5.5.3", "5.5.4", "5.5.5", "5.5.6",
    ],
    "ACX21-CON-INCOMPLETE-RECORDS": [
        "5.6.1", "5.6.2", "5.6.3", "5.6.4", "5.6.5", "5.6.6", "5.6.7",
    ],
    # 6 Analysis and interpretation
    "ACX21-CON-RATIOS": [
        "6.1.1", "6.1.2", "6.1.3", "6.1.4", "6.1.5", "6.1.6", "6.1.7",
        "6.1.8",
    ],
    "ACX21-CON-RATIO-INTERPRETATION": ["6.2.1", "6.2.2", "6.2.3", "6.2.4"],
    "ACX21-CON-INTER-FIRM": ["6.3.1", "6.3.2"],
    "ACX21-CON-USERS": [
        "6.4.1", "6.4.2", "6.4.3", "6.4.4", "6.4.5", "6.4.6", "6.4.7",
    ],
    "ACX21-CON-LIMITATIONS": ["6.5.1", "6.5.2", "6.5.3"],
    # 7 Accounting principles
    "ACX21-CON-ACCOUNTING-PRINCIPLES": [
        "7.1.1", "7.1.2", "7.1.3", "7.1.4", "7.1.5",
    ],
    "ACX21-CON-QUALITATIVE-CHARACTERISTICS": [
        "7.2.1", "7.2.2", "7.2.3", "7.2.4",
    ],
}

EDGES = [
    # Fundamentals
    ("ACX21-CON-BOOKKEEPING-ACCOUNTING", "ACX21-CON-ACCOUNTING-EQUATION", DD),
    ("ACX21-CON-ACCOUNTING-EQUATION", "ACX21-CON-DOUBLE-ENTRY", DD),
    # The recording pipeline: documents -> books of prime entry -> ledgers
    ("ACX21-CON-DOUBLE-ENTRY", "ACX21-CON-BUSINESS-DOCUMENTS", UWR),
    ("ACX21-CON-BUSINESS-DOCUMENTS", "ACX21-CON-BOOKS-PRIME-ENTRY", DD),
    ("ACX21-CON-BUSINESS-DOCUMENTS", "ACX21-CON-DISCOUNTS", UWR),
    ("ACX21-CON-DOUBLE-ENTRY", "ACX21-CON-LEDGER-DIVISION", DD),
    ("ACX21-CON-LEDGER-DIVISION", "ACX21-CON-BOOKS-PRIME-ENTRY", UWR),
    # Verification chain
    ("ACX21-CON-DOUBLE-ENTRY", "ACX21-CON-TRIAL-BALANCE", UWR),
    ("ACX21-CON-TRIAL-BALANCE", "ACX21-CON-ERROR-CORRECTION", DD),
    ("ACX21-CON-BOOKS-PRIME-ENTRY", "ACX21-CON-BANK-RECON", UWR),
    ("ACX21-CON-DOUBLE-ENTRY", "ACX21-CON-BANK-RECON", UWR),
    ("ACX21-CON-LEDGER-DIVISION", "ACX21-CON-CONTROL-ACCOUNTS", DD),
    ("ACX21-CON-BOOKS-PRIME-ENTRY", "ACX21-CON-CONTROL-ACCOUNTS", UWR),
    ("ACX21-CON-TRIAL-BALANCE", "ACX21-CON-CONTROL-ACCOUNTS", UWR),
    # Accounting procedures
    ("ACX21-CON-ACCOUNTING-EQUATION", "ACX21-CON-CAPITAL-REVENUE", UWR),
    ("ACX21-CON-CAPITAL-REVENUE", "ACX21-CON-DEPRECIATION", UWR),
    ("ACX21-CON-DOUBLE-ENTRY", "ACX21-CON-DEPRECIATION", UWR),
    ("ACX21-CON-DEPRECIATION", "ACX21-CON-DISPOSALS", DD),
    ("ACX21-CON-DOUBLE-ENTRY", "ACX21-CON-ACCRUALS", UWR),
    ("ACX21-CON-ACCRUALS", "ACX21-CON-IRRECOVERABLE-DEBTS", DD),
    ("ACX21-CON-DOUBLE-ENTRY", "ACX21-CON-IRRECOVERABLE-DEBTS", UWR),
    ("ACX21-CON-ACCOUNTING-EQUATION", "ACX21-CON-INVENTORY-VALUATION", UWR),
    # Financial statements build on the recording + adjustment machinery
    ("ACX21-CON-DOUBLE-ENTRY", "ACX21-CON-SOLE-TRADER-FS", DD),
    ("ACX21-CON-INVENTORY-VALUATION", "ACX21-CON-SOLE-TRADER-FS", UWR),
    ("ACX21-CON-SOLE-TRADER-FS", "ACX21-CON-FS-ADJUSTMENTS", DD),
    ("ACX21-CON-FS-ADJUSTMENTS", "ACX21-CON-PARTNERSHIP-FS", UWR),
    ("ACX21-CON-SOLE-TRADER-FS", "ACX21-CON-PARTNERSHIP-FS", DD),
    ("ACX21-CON-FS-ADJUSTMENTS", "ACX21-CON-LIMITED-CO-FS", UWR),
    ("ACX21-CON-SOLE-TRADER-FS", "ACX21-CON-LIMITED-CO-FS", DD),
    ("ACX21-CON-SOLE-TRADER-FS", "ACX21-CON-CLUBS-FS", DD),
    ("ACX21-CON-FS-ADJUSTMENTS", "ACX21-CON-CLUBS-FS", UWR),
    ("ACX21-CON-CAPITAL-REVENUE", "ACX21-CON-MANUFACTURING-ACCOUNTS", UWR),
    ("ACX21-CON-SOLE-TRADER-FS", "ACX21-CON-MANUFACTURING-ACCOUNTS", DD),
    ("ACX21-CON-ACCOUNTING-EQUATION", "ACX21-CON-INCOMPLETE-RECORDS", UWR),
    ("ACX21-CON-SOLE-TRADER-FS", "ACX21-CON-INCOMPLETE-RECORDS", DD),
    # Analysis and interpretation
    ("ACX21-CON-SOLE-TRADER-FS", "ACX21-CON-RATIOS", UWR),
    ("ACX21-CON-INVENTORY-VALUATION", "ACX21-CON-RATIOS", UWR),
    ("ACX21-CON-RATIOS", "ACX21-CON-RATIO-INTERPRETATION", DD),
    ("ACX21-CON-RATIOS", "ACX21-CON-INTER-FIRM", UWR),
    ("ACX21-CON-RATIOS", "ACX21-CON-LIMITATIONS", UWR),
    ("ACX21-CON-SOLE-TRADER-FS", "ACX21-CON-USERS", UWR),
    # Principles and qualitative characteristics
    ("ACX21-CON-SOLE-TRADER-FS", "ACX21-CON-ACCOUNTING-PRINCIPLES", UWR),
    (
        "ACX21-CON-ACCOUNTING-PRINCIPLES",
        "ACX21-CON-QUALITATIVE-CHARACTERISTICS",
        DD,
    ),
]
