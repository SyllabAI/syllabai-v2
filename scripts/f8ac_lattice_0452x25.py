"""0452 IGCSE Accounting (syllabus 2025 examination) concept lattice — T-KG-PRE-9
(F8 rollout batch seven, the accounting family tranche 4, cie-igcse-accounting-25).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
0452 IGCSE 2025 syllabus section (7 topics, 177 spec points), anchored to the
served spine's point ids. Every anchor is machine-verified against the spine
before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

Independent of f8ac_lattice_0452x21.py: the two spines share the id scheme
but not the texts, and the 2025 syllabus adds digital-records, ethics and
data-storage content (sections 2.x/3.x digital impact points, 7.2 ethics,
7.3 storage) — the 2025 concepts DIGITAL-LEDGERS, ETHICS and DATA-SECURITY
have no 2021 counterpart. Section order also differs (manufacturing is 5.4
here, 5.5 in 2021; clubs the reverse).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 The fundamentals of accounting
    "ACX25-CON-BOOKKEEPING-ACCOUNTING": ["1.1.1", "1.1.2", "1.1.3"],
    "ACX25-CON-ACCOUNTING-EQUATION": ["1.2.1", "1.2.2", "1.2.3"],
    # 2 Double entry book-keeping
    "ACX25-CON-DOUBLE-ENTRY": [
        "2.1.1", "2.1.2", "2.1.3", "2.1.4", "2.1.5", "2.1.6",
    ],
    "ACX25-CON-LEDGER-DIVISION": ["2.1.7"],
    "ACX25-CON-DIGITAL-LEDGERS": [
        "2.1.8", "2.2.3", "2.3.9", "2.3.10", "3.3.4", "3.4.4",
    ],
    "ACX25-CON-BUSINESS-DOCUMENTS": ["2.2.1", "2.2.2"],
    "ACX25-CON-BOOKS-PRIME-ENTRY": [
        "2.3.1", "2.3.2", "2.3.4", "2.3.5", "2.3.6", "2.3.7", "2.3.8",
    ],
    "ACX25-CON-DISCOUNTS": ["2.3.3"],
    # 3 Verification of accounting records
    "ACX25-CON-TRIAL-BALANCE": ["3.1.1", "3.1.2"],
    "ACX25-CON-ERROR-CORRECTION": [
        "3.1.3", "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.5",
    ],
    "ACX25-CON-BANK-RECON": ["3.3.1", "3.3.2", "3.3.3"],
    "ACX25-CON-CONTROL-ACCOUNTS": ["3.4.1", "3.4.2", "3.4.3"],
    # 4 Accounting procedures
    "ACX25-CON-CAPITAL-REVENUE": [
        "4.1.1", "4.1.2", "4.1.3", "4.1.4", "4.1.5", "4.1.6",
    ],
    "ACX25-CON-DEPRECIATION": [
        "4.2.1", "4.2.2", "4.2.3", "4.2.4", "4.2.5",
    ],
    "ACX25-CON-DISPOSALS": ["4.2.6", "4.2.7", "4.2.8"],
    "ACX25-CON-ACCRUALS": ["4.3.1", "4.3.2", "4.3.3", "4.3.4"],
    "ACX25-CON-IRRECOVERABLE-DEBTS": [
        "4.4.1", "4.4.2", "4.4.3", "4.4.4", "4.4.5",
    ],
    "ACX25-CON-INVENTORY-VALUATION": ["4.5.1", "4.5.2", "4.5.3"],
    # 5 Preparation of financial statements
    "ACX25-CON-SOLE-TRADER-FS": [
        "5.1.1", "5.1.2", "5.1.3", "5.1.4", "5.1.5", "5.1.6", "5.1.7",
        "5.1.8",
    ],
    "ACX25-CON-FS-ADJUSTMENTS": ["5.1.9", "5.1.10", "5.1.11", "5.1.12"],
    "ACX25-CON-PARTNERSHIP-FS": [
        "5.2.1", "5.2.2", "5.2.3", "5.2.4", "5.2.5", "5.2.6", "5.2.7",
        "5.2.8", "5.2.9",
    ],
    "ACX25-CON-LIMITED-CO-FS": [
        "5.3.1", "5.3.2", "5.3.3", "5.3.4", "5.3.5", "5.3.6", "5.3.7",
        "5.3.8",
    ],
    "ACX25-CON-MANUFACTURING-ACCOUNTS": [
        "5.4.1", "5.4.2", "5.4.3", "5.4.4", "5.4.5", "5.4.6",
    ],
    "ACX25-CON-CLUBS-FS": [
        "5.5.1", "5.5.2", "5.5.3", "5.5.4", "5.5.5", "5.5.6",
    ],
    "ACX25-CON-INCOMPLETE-RECORDS": [
        "5.6.1", "5.6.2", "5.6.3", "5.6.4", "5.6.5", "5.6.6", "5.6.7",
    ],
    # 6 Analysis and interpretation
    "ACX25-CON-RATIOS": [
        "6.1.1", "6.1.2", "6.1.3", "6.1.4", "6.1.5", "6.1.6", "6.1.7",
        "6.1.8", "6.1.9", "6.1.10",
    ],
    "ACX25-CON-RATIO-INTERPRETATION": [
        "6.2.1", "6.2.2", "6.2.3", "6.2.4", "6.2.5", "6.2.6", "6.2.7",
    ],
    "ACX25-CON-INTER-FIRM": ["6.3.1", "6.3.2"],
    "ACX25-CON-USERS": [
        "6.4.1", "6.4.2", "6.4.3", "6.4.4", "6.4.5", "6.4.6", "6.4.7",
        "6.4.8", "6.4.9", "6.4.10",
    ],
    "ACX25-CON-LIMITATIONS": ["6.5.1", "6.5.2", "6.5.3"],
    # 7 Accounting principles, ethics and data storage
    "ACX25-CON-ACCOUNTING-PRINCIPLES": [
        "7.1.1", "7.1.2", "7.1.3", "7.1.4", "7.1.5", "7.1.6", "7.1.7",
        "7.1.8", "7.1.9", "7.1.10",
    ],
    "ACX25-CON-ETHICS": ["7.2.1", "7.2.2", "7.2.3"],
    "ACX25-CON-DATA-SECURITY": [
        "7.3.1", "7.3.2", "7.3.3", "7.3.4", "7.3.5",
    ],
}

EDGES = [
    # Fundamentals
    ("ACX25-CON-BOOKKEEPING-ACCOUNTING", "ACX25-CON-ACCOUNTING-EQUATION", DD),
    ("ACX25-CON-ACCOUNTING-EQUATION", "ACX25-CON-DOUBLE-ENTRY", DD),
    # The recording pipeline: documents -> books of prime entry -> ledgers
    ("ACX25-CON-DOUBLE-ENTRY", "ACX25-CON-BUSINESS-DOCUMENTS", UWR),
    ("ACX25-CON-BUSINESS-DOCUMENTS", "ACX25-CON-BOOKS-PRIME-ENTRY", DD),
    ("ACX25-CON-BUSINESS-DOCUMENTS", "ACX25-CON-DISCOUNTS", UWR),
    ("ACX25-CON-DOUBLE-ENTRY", "ACX25-CON-LEDGER-DIVISION", DD),
    ("ACX25-CON-LEDGER-DIVISION", "ACX25-CON-BOOKS-PRIME-ENTRY", UWR),
    # The 2025 digital thread: digital ledger keeping alongside the manual
    ("ACX25-CON-DOUBLE-ENTRY", "ACX25-CON-DIGITAL-LEDGERS", UWR),
    # Verification chain
    ("ACX25-CON-DOUBLE-ENTRY", "ACX25-CON-TRIAL-BALANCE", UWR),
    ("ACX25-CON-TRIAL-BALANCE", "ACX25-CON-ERROR-CORRECTION", DD),
    ("ACX25-CON-BOOKS-PRIME-ENTRY", "ACX25-CON-BANK-RECON", UWR),
    ("ACX25-CON-DOUBLE-ENTRY", "ACX25-CON-BANK-RECON", UWR),
    ("ACX25-CON-LEDGER-DIVISION", "ACX25-CON-CONTROL-ACCOUNTS", DD),
    ("ACX25-CON-BOOKS-PRIME-ENTRY", "ACX25-CON-CONTROL-ACCOUNTS", UWR),
    ("ACX25-CON-TRIAL-BALANCE", "ACX25-CON-CONTROL-ACCOUNTS", UWR),
    # Accounting procedures
    ("ACX25-CON-ACCOUNTING-EQUATION", "ACX25-CON-CAPITAL-REVENUE", UWR),
    ("ACX25-CON-CAPITAL-REVENUE", "ACX25-CON-DEPRECIATION", UWR),
    ("ACX25-CON-DOUBLE-ENTRY", "ACX25-CON-DEPRECIATION", UWR),
    ("ACX25-CON-DEPRECIATION", "ACX25-CON-DISPOSALS", DD),
    ("ACX25-CON-DOUBLE-ENTRY", "ACX25-CON-ACCRUALS", UWR),
    ("ACX25-CON-ACCRUALS", "ACX25-CON-IRRECOVERABLE-DEBTS", DD),
    ("ACX25-CON-DOUBLE-ENTRY", "ACX25-CON-IRRECOVERABLE-DEBTS", UWR),
    ("ACX25-CON-ACCOUNTING-EQUATION", "ACX25-CON-INVENTORY-VALUATION", UWR),
    # Financial statements build on the recording + adjustment machinery
    ("ACX25-CON-DOUBLE-ENTRY", "ACX25-CON-SOLE-TRADER-FS", DD),
    ("ACX25-CON-INVENTORY-VALUATION", "ACX25-CON-SOLE-TRADER-FS", UWR),
    ("ACX25-CON-SOLE-TRADER-FS", "ACX25-CON-FS-ADJUSTMENTS", DD),
    ("ACX25-CON-FS-ADJUSTMENTS", "ACX25-CON-PARTNERSHIP-FS", UWR),
    ("ACX25-CON-SOLE-TRADER-FS", "ACX25-CON-PARTNERSHIP-FS", DD),
    ("ACX25-CON-FS-ADJUSTMENTS", "ACX25-CON-LIMITED-CO-FS", UWR),
    ("ACX25-CON-SOLE-TRADER-FS", "ACX25-CON-LIMITED-CO-FS", DD),
    ("ACX25-CON-CAPITAL-REVENUE", "ACX25-CON-MANUFACTURING-ACCOUNTS", UWR),
    ("ACX25-CON-SOLE-TRADER-FS", "ACX25-CON-MANUFACTURING-ACCOUNTS", DD),
    ("ACX25-CON-SOLE-TRADER-FS", "ACX25-CON-CLUBS-FS", DD),
    ("ACX25-CON-FS-ADJUSTMENTS", "ACX25-CON-CLUBS-FS", UWR),
    ("ACX25-CON-ACCOUNTING-EQUATION", "ACX25-CON-INCOMPLETE-RECORDS", UWR),
    ("ACX25-CON-SOLE-TRADER-FS", "ACX25-CON-INCOMPLETE-RECORDS", DD),
    # Analysis and interpretation
    ("ACX25-CON-SOLE-TRADER-FS", "ACX25-CON-RATIOS", UWR),
    ("ACX25-CON-INVENTORY-VALUATION", "ACX25-CON-RATIOS", UWR),
    ("ACX25-CON-RATIOS", "ACX25-CON-RATIO-INTERPRETATION", DD),
    ("ACX25-CON-RATIOS", "ACX25-CON-INTER-FIRM", UWR),
    ("ACX25-CON-RATIOS", "ACX25-CON-LIMITATIONS", UWR),
    ("ACX25-CON-SOLE-TRADER-FS", "ACX25-CON-USERS", UWR),
    # Principles, ethics and data storage
    ("ACX25-CON-SOLE-TRADER-FS", "ACX25-CON-ACCOUNTING-PRINCIPLES", UWR),
    ("ACX25-CON-ACCOUNTING-PRINCIPLES", "ACX25-CON-ETHICS", UWR),
    ("ACX25-CON-DIGITAL-LEDGERS", "ACX25-CON-DATA-SECURITY", DD),
]
