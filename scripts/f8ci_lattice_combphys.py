"""CIE combined science physics concept lattice — T-KG-PRE-23
(F8 rollout batch twenty-one, the CIE science family, the rollout tail; serves
cie-igcse-science-combined-science-23-physics, 86 served points).

AI_SUGGESTED / UNVALIDATED concept web FRESH AUTHORED over the combined
science 2023 physics register's own statements. FRESH-AUTHORING DISCLOSED:
the combined-science register is NOT a text mirror of the co-ordinated
register (mapcheck of record in scripts/f8ci_derive.py: only ~21 of 86
combined statements text-match a co-ordinated statement; the rest are
re-authored multi-topic statements), so derivation from the separate-science
master cannot serve this course honestly — the fresh-authoring pattern of the
rollout (history 0470, RS 0490, EM 0680, ICT 0417/4IT1) applies. Concepts
were reasoned statement-by-statement over the served spine; multi-anchoring
mirrors the spec serving the same teaching at two register positions.

The exact reversed list for this course, computed against the combined
spine's own point order via the law of record (scripts/kg_f8al_project.py
export_pairs):
  - PHYS-EM-SPECTRUM [P4.3.1] -> PHYS-RADIATION [P3.3.1b]
  - PHYS-EM-SPECTRUM [P4.3.1] -> PHYS-RADIATION [P3.3.2a]  (the thermal-
    radiation teaching identifies infrared as the electromagnetic-spectrum
    band long before the spectrum itself is served)
  - PHYS-CONDUCTORS [P3.3.2] -> PHYS-TRANSFER-APPLICATIONS [P3.3.1c]
  - PHYS-RADIATION [P3.3.2a] -> PHYS-TRANSFER-APPLICATIONS [P3.3.1c]  (the
    everyday-applications statement is served before the conduction-
    experiments and radiation statements it presumes)
  (each a genuine dependency the spec serves backwards, dropped by the
  calibrated in-order law and counted)

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "PHYS-MEASUREMENT-BASICS": ["P1.1.1", "P1.1.2"],
    "PHYS-AVERAGING": ["P1.1.3"],
    "PHYS-SPEED": ["P1.2.1"],
    "PHYS-GRAPHS": ["P1.2.2"],
    "PHYS-GRAPH-SHAPES": ["P1.2.3"],
    "PHYS-AREA-DISTANCE": ["P1.2.4"],
    "PHYS-ACCELERATION-GRADIENT": ["P1.2.5"],
    "PHYS-CONSTANT-ACCEL": ["P1.2.6", "P1.2.7"],
    "PHYS-MASS-WEIGHT": ["P1.3.1"],
    "PHYS-GRAV-FIELD": ["P1.3.2"],
    "PHYS-WEIGHT-CONCEPT": ["P1.3.3"],
    "PHYS-DENSITY-EQ": ["P1.4.1"],
    "PHYS-DENSITY-EXP": ["P1.4.2", "P1.4.3"],
    "PHYS-FORCES-EFFECTS": ["P1.5.1"],
    "PHYS-EXTENSION-GRAPHS": ["P1.5.2"],
    "PHYS-HOOKE": ["P1.5.3"],
    "PHYS-LIMIT-PROP": ["P1.5.4"],
    "PHYS-PRESSURE-CONCEPT": ["P1.6.1"],
    "PHYS-PRESSURE-EQ": ["P1.6.2"],
    "PHYS-WORK-CONCEPT": ["P2.1.1"],
    "PHYS-WORK-EQ": ["P2.1.2"],
    "PHYS-WORK-ENERGY": ["P2.2.1"],
    "PHYS-ENERGY-STORES": ["P2.2.2"],
    "PHYS-ENERGY-CHANGES": ["P2.2.3"],
    "PHYS-KE-GPE-EQ": ["P2.2.4"],
    "PHYS-POWER-CONCEPT": ["P2.3.1"],
    "PHYS-POWER-EQ": ["P2.3.2"],
    "PHYS-RENEWABLE": ["P2.4.1"],
    "PHYS-ENERGY-SOURCES": ["P2.4.2"],
    "PHYS-SOURCES-TRADEOFFS": ["P2.4.3"],
    "PHYS-SUN-SOURCE": ["P2.4.4"],
    "PHYS-TIDAL-MOON": ["P2.4.5"],
    "PHYS-FUSION-SUN": ["P2.4.6"],
    "PHYS-KPG": ["P3.1.1"],
    "PHYS-KPG-FORCES": ["P3.1.2"],
    "PHYS-THERMAL-EXPANSION": ["P3.2.1", "P3.2.2"],
    "PHYS-CONDUCTORS": ["P3.3.1", "P3.3.2"],
    "PHYS-CONVECTION": ["P3.3.1a"],
    "PHYS-RADIATION": ["P3.3.1b", "P3.3.2a"],
    "PHYS-TRANSFER-APPLICATIONS": ["P3.3.1c"],
    "PHYS-CONDUCTION-MECH": ["P3.3.3"],
    "PHYS-EMITTERS-ABSORBERS": ["P3.3.4"],
    "PHYS-WAVE-ENERGY": ["P4.1.1"],
    "PHYS-WAVE-MOTION": ["P4.1.2"],
    "PHYS-WAVE-TERMS": ["P4.1.3"],
    "PHYS-TRANS-LONG": ["P4.1.4"],
    "PHYS-MIRROR-IMAGE": ["P4.2.1"],
    "PHYS-REFRACTION-DEMO": ["P4.2.1a"],
    "PHYS-LENS-ACTION": ["P4.2.1b"],
    "PHYS-REFLECTION-LAW": ["P4.2.2"],
    "PHYS-FOCAL-TERMS": ["P4.2.2a"],
    "PHYS-MIRROR-CONSTRUCTIONS": ["P4.2.3"],
    "PHYS-LENS-RAY-DIAGRAMS": ["P4.2.3a"],
    "PHYS-MAGNIFYING-GLASS": ["P4.2.4"],
    "PHYS-EM-SPECTRUM": ["P4.3.1"],
    "PHYS-EM-SPEED": ["P4.3.2", "P4.3.3"],
    "PHYS-SOUND-PRODUCTION": ["P4.4.1"],
    "PHYS-SOUND-LONGITUDINAL": ["P4.4.2"],
    "PHYS-SOUND-COMPRESSIONS": ["P4.4.3"],
    "PHYS-CHARGES": ["P5.1.1", "P5.1.2"],
    "PHYS-CHARGING-FRICTION": ["P5.1.3", "P5.1.4"],
    "PHYS-CONDUCTORS-INSULATORS": ["P5.1.5"],
    "PHYS-CIRCUIT-QUANTITIES": ["P5.2.1"],
    "PHYS-CURRENT-CHARGE": ["P5.2.2"],
    "PHYS-Q-IT": ["P5.2.3"],
    "PHYS-CURRENT-RATE": ["P5.2.4"],
    "PHYS-RESISTANCE-CONCEPT": ["P5.3.1"],
    "PHYS-R-V-I": ["P5.3.2"],
    "PHYS-RESISTANCE-PROPORTIONS": ["P5.3.3"],
    "PHYS-CIRCUIT-DIAGRAMS": ["P6.1.1"],
    "PHYS-SERIES-CURRENT": ["P6.2.1"],
    "PHYS-SERIES-RESISTANCE": ["P6.2.2"],
    "PHYS-SERIES-PD": ["P6.2.3"],
    "PHYS-ELECTRICAL-POWER": ["P6.3.1"],
    "PHYS-ELECTRICAL-HAZARDS": ["P6.4.1"],
    "PHYS-FUSES": ["P6.4.2", "P6.4.3"],
}

EDGES = [
    ("PHYS-MEASUREMENT-BASICS", "PHYS-AVERAGING", DD),
    ("PHYS-SPEED", "PHYS-GRAPHS", DD),
    ("PHYS-GRAPHS", "PHYS-GRAPH-SHAPES", DD),
    ("PHYS-GRAPHS", "PHYS-AREA-DISTANCE", DD),
    ("PHYS-GRAPHS", "PHYS-ACCELERATION-GRADIENT", DD),
    ("PHYS-ACCELERATION-GRADIENT", "PHYS-CONSTANT-ACCEL", DD),
    ("PHYS-MASS-WEIGHT", "PHYS-WEIGHT-CONCEPT", DD),
    ("PHYS-GRAV-FIELD", "PHYS-WEIGHT-CONCEPT", DD),
    ("PHYS-DENSITY-EQ", "PHYS-DENSITY-EXP", DD),
    ("PHYS-FORCES-EFFECTS", "PHYS-EXTENSION-GRAPHS", DD),
    ("PHYS-EXTENSION-GRAPHS", "PHYS-HOOKE", DD),
    ("PHYS-HOOKE", "PHYS-LIMIT-PROP", DD),
    ("PHYS-FORCES-EFFECTS", "PHYS-WORK-CONCEPT", UWR),
    ("PHYS-PRESSURE-CONCEPT", "PHYS-PRESSURE-EQ", DD),
    ("PHYS-WORK-CONCEPT", "PHYS-WORK-EQ", DD),
    ("PHYS-WORK-CONCEPT", "PHYS-POWER-CONCEPT", DD),
    ("PHYS-WORK-EQ", "PHYS-WORK-ENERGY", DD),
    ("PHYS-WORK-ENERGY", "PHYS-ENERGY-STORES", DD),
    ("PHYS-ENERGY-STORES", "PHYS-ENERGY-CHANGES", DD),
    ("PHYS-ENERGY-STORES", "PHYS-KE-GPE-EQ", DD),
    ("PHYS-ENERGY-STORES", "PHYS-ENERGY-SOURCES", DD),
    ("PHYS-RENEWABLE", "PHYS-ENERGY-SOURCES", UWR),
    ("PHYS-ENERGY-SOURCES", "PHYS-SOURCES-TRADEOFFS", DD),
    ("PHYS-RENEWABLE", "PHYS-SOURCES-TRADEOFFS", UWR),
    ("PHYS-POWER-CONCEPT", "PHYS-POWER-EQ", DD),
    ("PHYS-SUN-SOURCE", "PHYS-FUSION-SUN", DD),
    ("PHYS-KPG", "PHYS-KPG-FORCES", DD),
    ("PHYS-KPG-FORCES", "PHYS-THERMAL-EXPANSION", UWR),
    ("PHYS-KPG", "PHYS-SOUND-COMPRESSIONS", UWR),
    ("PHYS-CONDUCTORS", "PHYS-CONDUCTION-MECH", DD),
    ("PHYS-RADIATION", "PHYS-EMITTERS-ABSORBERS", DD),
    ("PHYS-CONDUCTORS", "PHYS-TRANSFER-APPLICATIONS", UWR),
    ("PHYS-CONVECTION", "PHYS-TRANSFER-APPLICATIONS", UWR),
    ("PHYS-RADIATION", "PHYS-TRANSFER-APPLICATIONS", UWR),
    ("PHYS-WAVE-ENERGY", "PHYS-WAVE-MOTION", DD),
    ("PHYS-WAVE-MOTION", "PHYS-WAVE-TERMS", DD),
    ("PHYS-WAVE-TERMS", "PHYS-TRANS-LONG", DD),
    ("PHYS-WAVE-TERMS", "PHYS-EM-SPECTRUM", UWR),
    ("PHYS-EM-SPECTRUM", "PHYS-EM-SPEED", DD),
    ("PHYS-EM-SPECTRUM", "PHYS-RADIATION", UWR),
    ("PHYS-TRANS-LONG", "PHYS-SOUND-LONGITUDINAL", DD),
    ("PHYS-SOUND-PRODUCTION", "PHYS-SOUND-LONGITUDINAL", DD),
    ("PHYS-SOUND-LONGITUDINAL", "PHYS-SOUND-COMPRESSIONS", DD),
    ("PHYS-MIRROR-IMAGE", "PHYS-MIRROR-CONSTRUCTIONS", DD),
    ("PHYS-REFLECTION-LAW", "PHYS-MIRROR-CONSTRUCTIONS", DD),
    ("PHYS-REFRACTION-DEMO", "PHYS-LENS-ACTION", UWR),
    ("PHYS-FOCAL-TERMS", "PHYS-LENS-RAY-DIAGRAMS", DD),
    ("PHYS-LENS-ACTION", "PHYS-LENS-RAY-DIAGRAMS", DD),
    ("PHYS-LENS-RAY-DIAGRAMS", "PHYS-MAGNIFYING-GLASS", DD),
    ("PHYS-CHARGES", "PHYS-CHARGING-FRICTION", DD),
    ("PHYS-CHARGES", "PHYS-CURRENT-CHARGE", UWR),
    ("PHYS-CIRCUIT-QUANTITIES", "PHYS-CURRENT-CHARGE", DD),
    ("PHYS-CURRENT-CHARGE", "PHYS-Q-IT", DD),
    ("PHYS-Q-IT", "PHYS-CURRENT-RATE", UWR),
    ("PHYS-CIRCUIT-QUANTITIES", "PHYS-RESISTANCE-CONCEPT", DD),
    ("PHYS-RESISTANCE-CONCEPT", "PHYS-R-V-I", DD),
    ("PHYS-R-V-I", "PHYS-RESISTANCE-PROPORTIONS", DD),
    ("PHYS-CIRCUIT-QUANTITIES", "PHYS-CIRCUIT-DIAGRAMS", UWR),
    ("PHYS-CIRCUIT-DIAGRAMS", "PHYS-SERIES-CURRENT", DD),
    ("PHYS-SERIES-CURRENT", "PHYS-SERIES-RESISTANCE", DD),
    ("PHYS-CIRCUIT-QUANTITIES", "PHYS-SERIES-PD", UWR),
    ("PHYS-POWER-EQ", "PHYS-ELECTRICAL-POWER", DD),
    ("PHYS-ELECTRICAL-POWER", "PHYS-ELECTRICAL-HAZARDS", UWR),
    ("PHYS-ELECTRICAL-HAZARDS", "PHYS-FUSES", DD),
]
