"""0417 IGCSE ICT concept lattice — T-KG-PRE-16
(F8 rollout batch fourteen, the ICT family tranche 11;
serves cie-igcse-ict-21, 95 served points).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
0417 IGCSE ICT syllabus (2021 examination series; theory units 1-10 —
hardware/software, input/output/direct-data-entry devices, networks and
security, microprocessor-device effects, the application registers 6.1-6.11,
the systems-lifecycle 7.1-7.6, safety/data-protection/eSafety 8.1-8.3,
audience/copyright 9.1-9.2, email/internet 10.1-10.2 — and the practical
units 11-21: file management, documents, validation/verification, databases,
spreadsheets, web authoring), anchored to the served spine's point ids.
Every anchor is machine-verified against the spine before any byte is
written (0-unmapped pass law, enforced in kg_f8ma_generate.py).

Structure of record: near-1:1 — all 95 points are anchored, none excluded —
and the chains run definition -> process -> impacts -> evaluation within
each unit, with honest cross-unit bridges only where the syllabus itself
names the dependency (hardware/software -> operating systems; OS file
management -> the practical file units; input devices -> computer-controlled
systems; direct data entry -> the reduce-errors register; validation ->
database forms; spreadsheet modelling register -> the spreadsheet practical;
network types -> the internet register; cloud -> data-transfer security;
anti-malware -> data protection; microprocessor effects -> health issues;
health -> safety; data protection -> eSafety; the lifecycle chain runs
analysis -> record/analyse -> specification -> design -> testing ->
implementation -> documentation -> evaluation). Four authored pairs sit in
knowingly served-order-reversed territory (the internet -> email: the
syllabus serves the email register 10.1.1 before the internet register
10.2.1; the internet -> internet shopping: shopping is served in 6.9.2
before the internet register; databases -> school management systems: the
management-system register 6.4.1 is served before the database unit 18;
computer-controlled systems -> microprocessor-device effects: the effects
register 5.1.1 is served before the control register 6.3.1); the calibrated
in-order law drops exactly those, counted and disclosed — the law working
as designed.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # unit 1 — hardware, software, systems
    "IT4-CON-HARDWARE": ["1.1.1"],
    "IT4-CON-SOFTWARE": ["1.1.2"],
    "IT4-CON-ANALOG-DIGITAL": ["1.1.3"],
    "IT4-CON-CPU": ["1.2.1"],
    "IT4-CON-INTERNAL-MEMORY": ["1.2.2"],
    "IT4-CON-IO-DEVICES": ["1.2.3"],
    "IT4-CON-BACKING-STORAGE": ["1.2.4"],
    "IT4-CON-OPERATING-SYSTEM": ["1.3.1"],
    "IT4-CON-DEVICE-CLASSES": ["1.4.1", "1.4.2"],
    "IT4-CON-EMERGING-TECH": ["1.5.1"],
    # units 2-3 — peripheral registers
    "IT4-CON-INPUT-DEVICES": ["2.1.1"],
    "IT4-CON-DIRECT-DATA-ENTRY": ["2.2.1"],
    "IT4-CON-OUTPUT-DEVICES": ["2.3.1"],
    # unit 4 — networks and security
    "IT4-CON-ROUTER": ["4.1.1"],
    "IT4-CON-NET-ENVIRONMENTS": ["4.1.1a"],
    "IT4-CON-NET-DEVICES-WIFI-BT": ["4.1.2"],
    "IT4-CON-NET-TYPES": ["4.1.2a"],
    "IT4-CON-CLOUD": ["4.1.3"],
    "IT4-CON-TRANSFER-SECURITY": ["4.2.1"],
    "IT4-CON-PASSWORDS": ["4.2.2"],
    "IT4-CON-AUTH-METHODS": ["4.2.3"],
    "IT4-CON-ANTI-MALWARE": ["4.2.4"],
    "IT4-CON-E-CONFERENCING": ["4.2.5"],
    # unit 5 — microprocessor devices
    "IT4-CON-MICRO-DEVICE-EFFECTS": ["5.1.1"],
    "IT4-CON-HEALTH-ISSUES": ["5.2.1"],
    # unit 6 — applications
    "IT4-CON-COMM-MEDIA": ["6.1.1"],
    "IT4-CON-MOBILE-COMM": ["6.1.2"],
    "IT4-CON-MODELLING": ["6.2.1"],
    "IT4-CON-CONTROL-SYSTEMS": ["6.3.1"],
    "IT4-CON-SCHOOL-MGMT": ["6.4.1"],
    "IT4-CON-BOOKING": ["6.5.1"],
    "IT4-CON-BANKING": ["6.6.1"],
    "IT4-CON-MEDICINE-3DP": ["6.7.1"],
    "IT4-CON-EXPERT-SYSTEMS": ["6.8.1"],
    "IT4-CON-RETAIL": ["6.9.1"],
    "IT4-CON-INTERNET-SHOPPING": ["6.9.2"],
    "IT4-CON-RECOGNITION": ["6.10.1"],
    "IT4-CON-SATELLITE": ["6.11.1"],
    # unit 7 — systems lifecycle
    "IT4-CON-ANALYSIS": ["7.1.1"],
    "IT4-CON-RECORD-ANALYSE": ["7.1.2"],
    "IT4-CON-SPECIFICATION": ["7.1.3"],
    "IT4-CON-DESIGN": ["7.2.1"],
    "IT4-CON-TESTING": ["7.3.1"],
    "IT4-CON-IMPLEMENTATION": ["7.4.1"],
    "IT4-CON-DOCUMENTATION": ["7.5.1"],
    "IT4-CON-EVALUATION": ["7.6.1"],
    # unit 8 — safety and data
    "IT4-CON-SAFETY": ["8.1.1"],
    "IT4-CON-DATA-PROTECTION": ["8.2.1"],
    "IT4-CON-ESAFETY": ["8.2.1a", "8.2.2"],
    "IT4-CON-THREATS": ["8.3.1"],
    "IT4-CON-PROTECT-DATA": ["8.3.2"],
    # unit 9 — audience and copyright
    "IT4-CON-AUDIENCE": ["9.1.1"],
    "IT4-CON-COPYRIGHT": ["9.2.1"],
    # unit 10 — email and internet
    "IT4-CON-EMAIL": ["10.1.1"],
    "IT4-CON-INTERNET": ["10.2.1"],
    # unit 11 — file management
    "IT4-CON-MANAGE-FILES": ["11.1.1"],
    "IT4-CON-FILE-FORMATS": ["11.1.2"],
    "IT4-CON-COMPRESS-FILES": ["11.2.1"],
    "IT4-CON-FILE-COMPRESSION": ["11.2.2"],
    # unit 13 — documents
    "IT4-CON-DOC-CREATE": ["13.1.1"],
    "IT4-CON-DOC-TABLES": ["13.2.1"],
    "IT4-CON-HEADERS-FOOTERS": ["13.3.1"],
    "IT4-CON-HF-PURPOSE": ["13.3.2"],
    # unit 15 — reduce errors
    "IT4-CON-REDUCE-ERRORS": ["15.1.1"],
    "IT4-CON-SPELLCHECK": ["15.1.2"],
    "IT4-CON-VALIDATION": ["15.1.3"],
    "IT4-CON-VISUAL-VERIFICATION": ["15.2.1"],
    "IT4-CON-PROOFREAD": ["15.2.2"],
    "IT4-CON-VERIFICATION": ["15.2.3"],
    # unit 18 — databases
    "IT4-CON-DB-STRUCTURE": ["18.1.1"],
    "IT4-CON-DB-FORMS": ["18.1.2"],
    "IT4-CON-DB-TYPES": ["18.1.3"],
    "IT4-CON-DB-KEYS": ["18.1.4"],
    "IT4-CON-DB-FORM-DESIGN": ["18.1.5"],
    "IT4-CON-DB-CALCULATIONS": ["18.2.1"],
    "IT4-CON-DB-OUTPUT": ["18.2.1a"],
    "IT4-CON-DB-SORT": ["18.2.2"],
    "IT4-CON-DB-SEARCH": ["18.2.3"],
    "IT4-CON-DB-DISPLAY": ["18.3.1"],
    # unit 20 — spreadsheets
    "IT4-CON-SS-MODEL": ["20.1.1"],
    "IT4-CON-SS-FORMULAE": ["20.1.2"],
    "IT4-CON-SS-ORDER-OPS": ["20.1.3"],
    "IT4-CON-SS-CELL-REF": ["20.1.4"],
    "IT4-CON-SS-SORT": ["20.2.1"],
    "IT4-CON-SS-SEARCH": ["20.2.2"],
    "IT4-CON-SS-DISPLAY": ["20.3.1"],
    "IT4-CON-SS-FORMAT": ["20.3.2"],
    "IT4-CON-SS-PAGE-LAYOUT": ["20.3.3"],
    # unit 21 — web authoring
    "IT4-CON-WEB-LAYERS": ["21.1.1"],
    "IT4-CON-HTML": ["21.2.1", "21.2.1a"],
    "IT4-CON-CSS": ["21.3.1", "21.3.1a"],
}

EDGES = [
    # unit 1 — the hardware/software foundation chain
    ("IT4-CON-HARDWARE", "IT4-CON-SOFTWARE", DD),
    ("IT4-CON-ANALOG-DIGITAL", "IT4-CON-CPU", UWR),
    ("IT4-CON-CPU", "IT4-CON-IO-DEVICES", UWR),
    ("IT4-CON-INTERNAL-MEMORY", "IT4-CON-BACKING-STORAGE", UWR),
    ("IT4-CON-SOFTWARE", "IT4-CON-OPERATING-SYSTEM", DD),
    ("IT4-CON-HARDWARE", "IT4-CON-OPERATING-SYSTEM", UWR),
    ("IT4-CON-HARDWARE", "IT4-CON-DEVICE-CLASSES", UWR),
    ("IT4-CON-DEVICE-CLASSES", "IT4-CON-EMERGING-TECH", UWR),
    # units 2-3 — peripheral registers build on the I/O register
    ("IT4-CON-IO-DEVICES", "IT4-CON-INPUT-DEVICES", DD),
    ("IT4-CON-IO-DEVICES", "IT4-CON-OUTPUT-DEVICES", DD),
    ("IT4-CON-INPUT-DEVICES", "IT4-CON-DIRECT-DATA-ENTRY", DD),
    # unit 4 — networks and the security chain
    ("IT4-CON-ROUTER", "IT4-CON-NET-ENVIRONMENTS", UWR),
    ("IT4-CON-NET-ENVIRONMENTS", "IT4-CON-NET-DEVICES-WIFI-BT", UWR),
    ("IT4-CON-NET-DEVICES-WIFI-BT", "IT4-CON-NET-TYPES", DD),
    ("IT4-CON-NET-TYPES", "IT4-CON-CLOUD", UWR),
    ("IT4-CON-CLOUD", "IT4-CON-TRANSFER-SECURITY", UWR),
    ("IT4-CON-TRANSFER-SECURITY", "IT4-CON-PASSWORDS", DD),
    ("IT4-CON-PASSWORDS", "IT4-CON-AUTH-METHODS", DD),
    ("IT4-CON-AUTH-METHODS", "IT4-CON-ANTI-MALWARE", UWR),
    ("IT4-CON-NET-ENVIRONMENTS", "IT4-CON-E-CONFERENCING", UWR),
    # unit 5 — microprocessor-device effects
    ("IT4-CON-HARDWARE", "IT4-CON-MICRO-DEVICE-EFFECTS", UWR),
    ("IT4-CON-MICRO-DEVICE-EFFECTS", "IT4-CON-HEALTH-ISSUES", DD),
    # unit 6 — the application registers
    ("IT4-CON-NET-ENVIRONMENTS", "IT4-CON-COMM-MEDIA", UWR),
    ("IT4-CON-COMM-MEDIA", "IT4-CON-MOBILE-COMM", DD),
    ("IT4-CON-MODELLING", "IT4-CON-CONTROL-SYSTEMS", UWR),
    ("IT4-CON-INPUT-DEVICES", "IT4-CON-CONTROL-SYSTEMS", UWR),
    ("IT4-CON-SCHOOL-MGMT", "IT4-CON-BOOKING", UWR),
    ("IT4-CON-BOOKING", "IT4-CON-BANKING", UWR),
    ("IT4-CON-MODELLING", "IT4-CON-MEDICINE-3DP", UWR),
    ("IT4-CON-MEDICINE-3DP", "IT4-CON-EXPERT-SYSTEMS", UWR),
    ("IT4-CON-BANKING", "IT4-CON-RETAIL", UWR),
    ("IT4-CON-RETAIL", "IT4-CON-INTERNET-SHOPPING", DD),
    ("IT4-CON-RETAIL", "IT4-CON-RECOGNITION", UWR),
    ("IT4-CON-MOBILE-COMM", "IT4-CON-SATELLITE", UWR),
    # unit 7 — the lifecycle chain
    ("IT4-CON-ANALYSIS", "IT4-CON-RECORD-ANALYSE", DD),
    ("IT4-CON-RECORD-ANALYSE", "IT4-CON-SPECIFICATION", DD),
    ("IT4-CON-SPECIFICATION", "IT4-CON-DESIGN", DD),
    ("IT4-CON-DESIGN", "IT4-CON-TESTING", DD),
    ("IT4-CON-TESTING", "IT4-CON-IMPLEMENTATION", DD),
    ("IT4-CON-IMPLEMENTATION", "IT4-CON-DOCUMENTATION", DD),
    ("IT4-CON-DOCUMENTATION", "IT4-CON-EVALUATION", DD),
    # unit 8 — safety, data protection, eSafety
    ("IT4-CON-HEALTH-ISSUES", "IT4-CON-SAFETY", UWR),
    ("IT4-CON-DATA-PROTECTION", "IT4-CON-ESAFETY", DD),
    ("IT4-CON-TRANSFER-SECURITY", "IT4-CON-THREATS", UWR),
    ("IT4-CON-THREATS", "IT4-CON-PROTECT-DATA", DD),
    ("IT4-CON-ANTI-MALWARE", "IT4-CON-PROTECT-DATA", UWR),
    # unit 9 — copyright builds on the software register
    ("IT4-CON-SOFTWARE", "IT4-CON-COPYRIGHT", UWR),
    # unit 10-11 — internet, email, file management
    ("IT4-CON-NET-TYPES", "IT4-CON-INTERNET", UWR),
    ("IT4-CON-COMM-MEDIA", "IT4-CON-EMAIL", UWR),
    ("IT4-CON-OPERATING-SYSTEM", "IT4-CON-MANAGE-FILES", UWR),
    ("IT4-CON-MANAGE-FILES", "IT4-CON-FILE-FORMATS", DD),
    ("IT4-CON-FILE-FORMATS", "IT4-CON-COMPRESS-FILES", UWR),
    ("IT4-CON-COMPRESS-FILES", "IT4-CON-FILE-COMPRESSION", DD),
    # unit 13 — documents
    ("IT4-CON-MANAGE-FILES", "IT4-CON-DOC-CREATE", UWR),
    ("IT4-CON-DOC-CREATE", "IT4-CON-DOC-TABLES", DD),
    ("IT4-CON-DOC-CREATE", "IT4-CON-HEADERS-FOOTERS", UWR),
    ("IT4-CON-HEADERS-FOOTERS", "IT4-CON-HF-PURPOSE", DD),
    # unit 15 — the reduce-errors register
    ("IT4-CON-DIRECT-DATA-ENTRY", "IT4-CON-REDUCE-ERRORS", UWR),
    ("IT4-CON-DOC-CREATE", "IT4-CON-REDUCE-ERRORS", UWR),
    ("IT4-CON-REDUCE-ERRORS", "IT4-CON-SPELLCHECK", DD),
    ("IT4-CON-REDUCE-ERRORS", "IT4-CON-VALIDATION", DD),
    ("IT4-CON-REDUCE-ERRORS", "IT4-CON-VISUAL-VERIFICATION", DD),
    ("IT4-CON-VISUAL-VERIFICATION", "IT4-CON-PROOFREAD", DD),
    ("IT4-CON-PROOFREAD", "IT4-CON-VERIFICATION", UWR),
    # unit 18 — databases
    ("IT4-CON-VALIDATION", "IT4-CON-DB-FORMS", UWR),
    ("IT4-CON-DB-STRUCTURE", "IT4-CON-DB-FORMS", DD),
    ("IT4-CON-DB-STRUCTURE", "IT4-CON-DB-TYPES", DD),
    ("IT4-CON-DB-STRUCTURE", "IT4-CON-DB-KEYS", DD),
    ("IT4-CON-DB-TYPES", "IT4-CON-DB-KEYS", UWR),
    ("IT4-CON-DB-STRUCTURE", "IT4-CON-DB-CALCULATIONS", UWR),
    ("IT4-CON-DB-CALCULATIONS", "IT4-CON-DB-OUTPUT", DD),
    ("IT4-CON-DB-STRUCTURE", "IT4-CON-DB-SORT", UWR),
    ("IT4-CON-DB-KEYS", "IT4-CON-DB-SEARCH", UWR),
    ("IT4-CON-DB-SEARCH", "IT4-CON-DB-DISPLAY", UWR),
    # unit 20 — spreadsheets (the modelling register realized)
    ("IT4-CON-MODELLING", "IT4-CON-SS-MODEL", UWR),
    ("IT4-CON-SS-MODEL", "IT4-CON-SS-FORMULAE", DD),
    ("IT4-CON-SS-FORMULAE", "IT4-CON-SS-ORDER-OPS", DD),
    ("IT4-CON-SS-FORMULAE", "IT4-CON-SS-CELL-REF", DD),
    ("IT4-CON-SS-MODEL", "IT4-CON-SS-SORT", UWR),
    ("IT4-CON-SS-SORT", "IT4-CON-SS-SEARCH", UWR),
    ("IT4-CON-SS-MODEL", "IT4-CON-SS-DISPLAY", UWR),
    ("IT4-CON-SS-DISPLAY", "IT4-CON-SS-FORMAT", DD),
    ("IT4-CON-SS-FORMAT", "IT4-CON-SS-PAGE-LAYOUT", DD),
    # unit 21 — web authoring
    ("IT4-CON-INTERNET", "IT4-CON-WEB-LAYERS", UWR),
    ("IT4-CON-WEB-LAYERS", "IT4-CON-HTML", DD),
    ("IT4-CON-WEB-LAYERS", "IT4-CON-CSS", DD),
    ("IT4-CON-HTML", "IT4-CON-CSS", UWR),
    # knowingly served-order-reversed territory — dropped by the law,
    # counted and disclosed:
    ("IT4-CON-INTERNET", "IT4-CON-EMAIL", UWR),
    ("IT4-CON-INTERNET", "IT4-CON-INTERNET-SHOPPING", UWR),
    ("IT4-CON-DB-STRUCTURE", "IT4-CON-SCHOOL-MGMT", UWR),
    ("IT4-CON-CONTROL-SYSTEMS", "IT4-CON-MICRO-DEVICE-EFFECTS", UWR),
]
