"""9706 A Level Accounting concept lattice — T-KG-PRE-9
(F8 rollout batch seven, the accounting family tranche 4, cie-a-level-accounting-21).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
9706 A Level syllabus (the served spine carries the 19 AS ids — identical
texts to the AS spine — plus 15 A2-only ids, 34 points total), anchored to
the served spine's point ids. Every anchor is machine-verified against the
spine before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

The AS core edges are re-anchored here on the shared ids; the A2 concepts
(3.x financial reporting, 4.x costing extensions) bind the A2-only ids, so
this lattice is NOT a projection of the AS one — it covers the full served
point set of the A-level course.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # ── AS core (shared ids) ──
    "ACAL-CON-BUSINESS-ENTITIES": ["1.1.1"],
    "ACAL-CON-DOUBLE-ENTRY": ["1.2.1"],
    "ACAL-CON-CAPITAL-REVENUE": ["1.3.1"],
    "ACAL-CON-ASSET-VALUES": ["1.3.2"],
    "ACAL-CON-RECONCILIATION": ["1.4.1"],
    "ACAL-CON-TRIAL-BALANCE": ["1.4.2"],
    "ACAL-CON-BANK-RECON": ["1.4.3"],
    "ACAL-CON-CONTROL-ACCOUNTS": ["1.4.4"],
    "ACAL-CON-FS-ADJUSTMENTS": ["1.5.1"],
    "ACAL-CON-SOLE-TRADER-FS": ["1.5.2"],
    "ACAL-CON-PARTNERSHIP-FS": ["1.5.3"],
    "ACAL-CON-LIMITED-CO-FS": ["1.5.4"],
    "ACAL-CON-USERS": ["1.6.1"],
    "ACAL-CON-RATIOS": ["1.6.2"],
    "ACAL-CON-MATERIALS-LABOUR": ["2.1.1"],
    "ACAL-CON-COSTING-APPLICATIONS": ["2.2.1"],
    "ACAL-CON-ABSORPTION": ["2.2.2"],
    "ACAL-CON-MARGINAL": ["2.2.3"],
    "ACAL-CON-CVP": ["2.2.4"],
    # ── A2 extensions (A2-only ids) ──
    "ACAL-CON-FS-SPECIFIC": ["3.1.1"],
    "ACAL-CON-GOODWILL": ["3.1.2"],
    "ACAL-CON-CLUBS": ["3.1.3"],
    "ACAL-CON-MANUFACTURING": ["3.1.4"],
    "ACAL-CON-CO-IAS": ["3.1.5"],
    "ACAL-CON-IAS": ["3.2.1"],
    "ACAL-CON-ETHICS": ["3.2.2"],
    "ACAL-CON-AUDITING": ["3.2.3"],
    "ACAL-CON-MERGER": ["3.3.1"],
    "ACAL-CON-COMPUTERISED": ["3.4.1"],
    "ACAL-CON-RATIOS-EXT": ["3.5.1"],
    "ACAL-CON-ABC": ["4.1.1"],
    "ACAL-CON-STANDARD-COSTING": ["4.2.1"],
    "ACAL-CON-BUDGETING": ["4.3.1"],
    "ACAL-CON-INVESTMENT-APPRAISAL": ["4.4.1"],
}

EDGES = [
    # ── AS core (re-anchored, all forward on the shared id sequence) ──
    ("ACAL-CON-BUSINESS-ENTITIES", "ACAL-CON-DOUBLE-ENTRY", UWR),
    ("ACAL-CON-DOUBLE-ENTRY", "ACAL-CON-CAPITAL-REVENUE", UWR),
    ("ACAL-CON-DOUBLE-ENTRY", "ACAL-CON-RECONCILIATION", UWR),
    ("ACAL-CON-DOUBLE-ENTRY", "ACAL-CON-TRIAL-BALANCE", UWR),
    ("ACAL-CON-DOUBLE-ENTRY", "ACAL-CON-CONTROL-ACCOUNTS", UWR),
    ("ACAL-CON-DOUBLE-ENTRY", "ACAL-CON-SOLE-TRADER-FS", UWR),
    ("ACAL-CON-CAPITAL-REVENUE", "ACAL-CON-ASSET-VALUES", UWR),
    ("ACAL-CON-TRIAL-BALANCE", "ACAL-CON-BANK-RECON", UWR),
    ("ACAL-CON-TRIAL-BALANCE", "ACAL-CON-CONTROL-ACCOUNTS", UWR),
    ("ACAL-CON-CAPITAL-REVENUE", "ACAL-CON-FS-ADJUSTMENTS", UWR),
    ("ACAL-CON-ASSET-VALUES", "ACAL-CON-FS-ADJUSTMENTS", UWR),
    ("ACAL-CON-FS-ADJUSTMENTS", "ACAL-CON-SOLE-TRADER-FS", DD),
    ("ACAL-CON-SOLE-TRADER-FS", "ACAL-CON-PARTNERSHIP-FS", DD),
    ("ACAL-CON-SOLE-TRADER-FS", "ACAL-CON-LIMITED-CO-FS", DD),
    ("ACAL-CON-SOLE-TRADER-FS", "ACAL-CON-USERS", UWR),
    ("ACAL-CON-USERS", "ACAL-CON-RATIOS", UWR),
    ("ACAL-CON-SOLE-TRADER-FS", "ACAL-CON-RATIOS", UWR),
    ("ACAL-CON-MATERIALS-LABOUR", "ACAL-CON-COSTING-APPLICATIONS", DD),
    ("ACAL-CON-COSTING-APPLICATIONS", "ACAL-CON-ABSORPTION", DD),
    ("ACAL-CON-ABSORPTION", "ACAL-CON-MARGINAL", UWR),
    ("ACAL-CON-MARGINAL", "ACAL-CON-CVP", DD),
    # ── A2 financial reporting extensions ──
    ("ACAL-CON-SOLE-TRADER-FS", "ACAL-CON-FS-SPECIFIC", DD),
    ("ACAL-CON-PARTNERSHIP-FS", "ACAL-CON-GOODWILL", DD),
    ("ACAL-CON-SOLE-TRADER-FS", "ACAL-CON-CLUBS", UWR),
    ("ACAL-CON-CAPITAL-REVENUE", "ACAL-CON-MANUFACTURING", UWR),
    ("ACAL-CON-SOLE-TRADER-FS", "ACAL-CON-MANUFACTURING", DD),
    ("ACAL-CON-LIMITED-CO-FS", "ACAL-CON-CO-IAS", DD),
    ("ACAL-CON-LIMITED-CO-FS", "ACAL-CON-IAS", UWR),
    ("ACAL-CON-CO-IAS", "ACAL-CON-IAS", UWR),
    ("ACAL-CON-USERS", "ACAL-CON-ETHICS", UWR),
    ("ACAL-CON-LIMITED-CO-FS", "ACAL-CON-AUDITING", UWR),
    ("ACAL-CON-ETHICS", "ACAL-CON-AUDITING", UWR),
    ("ACAL-CON-BUSINESS-ENTITIES", "ACAL-CON-MERGER", UWR),
    ("ACAL-CON-LIMITED-CO-FS", "ACAL-CON-MERGER", UWR),
    ("ACAL-CON-DOUBLE-ENTRY", "ACAL-CON-COMPUTERISED", UWR),
    ("ACAL-CON-RATIOS", "ACAL-CON-RATIOS-EXT", DD),
    # ── A2 costing extensions ──
    ("ACAL-CON-ABSORPTION", "ACAL-CON-ABC", DD),
    ("ACAL-CON-COSTING-APPLICATIONS", "ACAL-CON-STANDARD-COSTING", UWR),
    ("ACAL-CON-COSTING-APPLICATIONS", "ACAL-CON-BUDGETING", UWR),
    ("ACAL-CON-CVP", "ACAL-CON-INVESTMENT-APPRAISAL", UWR),
]
