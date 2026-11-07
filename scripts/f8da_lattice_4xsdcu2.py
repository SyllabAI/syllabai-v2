"""4XSD1 chemistry modular unit 2 concept lattice — T-KG-PRE-22
(F8 rollout batch twenty, the Edexcel science tranche 17, the double-award
family; serves igcse-science-double-award-modular-24-chemistry-unit-2, 47 served
points).

AI_SUGGESTED / UNVALIDATED concept web DERIVED for the Edexcel 4XSD1
Double Award chemistry modular specification, unit 2 sections 5-8 (the continuing parts of the same four sections), anchored 1:1
to the unit's served point ids.
DERIVATION DISCLOSED (two hops, both text-verified): the 2024 modular spec
RE-SECTIONS the 4SD0 linear content into a continuing register — mapcheck of
record for THIS unit: 47 statements matched 1:1 onto the 4SD0 linear register
by exact or >=0.85 similarity text (44 exact + 3 sub-exact, each eyeballed:
5.14->C1.50 (0.993); 6.19->C2.48 (0.932); 7.9->C3.17 (0.989); plus the manual override chem U2 5.2 -> C1.38 (ion formatting)),
the map is INJECTIVE and covers the unit exactly. The unit lattice is the
4SD0 linear web (f8da_lattice_4sd0chem.py, itself derived from the
separate-science master f8ch_lattice_4ch1.py) with anchors renumbered onto
the unit register; edges kept VERBATIM minus the edges leaving the unit
territory (91 dropped). NO edge re-authored. Concept ids mirror the master
lattice for traceability. The exact reversed list for THIS unit, computed
against the unit's own spine order:
  - C2-COMBUSTION [6.11] -> C2-O2-PERCENT [6.10]

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "C1-ION-FORM": ["5.1"],
    "C1-ION-CHARGES": ["5.2"],
    "C1-FORMULAE-IONS": ["5.3"],
    "C1-DOT-IONIC": ["5.4"],
    "C1-IONIC-BOND": ["5.5"],
    "C1-IONIC-MP": ["5.6"],
    "C1-IONIC-COND": ["5.7"],
    "C1-COV-BOND": ["5.8"],
    "C1-COV-ELECTRO": ["5.9"],
    "C1-DOT-COV": ["5.10"],
    "C1-SIMPLE-MOL": ["5.11"],
    "C1-MR-BP": ["5.12"],
    "C1-GIANT-COV": ["5.13"],
    "C1-CARBON-FORMS": ["5.14"],
    "C1-COV-COND": ["5.15"],
    "C2-G1-FAMILY": ["6.1"],
    "C2-G1-TREND": ["6.2"],
    "C2-G1-PREDICT": ["6.3"],
    "C2-G7-PROPS": ["6.5"],
    "C2-G7-PREDICT": ["6.6"],
    "C2-G7-DISPLACE": ["6.7"],
    "C2-AIR": ["6.9"],
    "C2-O2-PERCENT": ["6.10"],
    "C2-COMBUSTION": ["6.11"],
    "C2-CO2-CARB": ["6.12"],
    "C2-GREENHOUSE": ["6.13"],
    "C2-PRAC-O2": ["6.14"],
    "C2-GAS-TESTS": ["6.15"],
    "C2-FLAME": ["6.16"],
    "C2-FLAME-COLOURS": ["6.17"],
    "C2-CATION-TESTS": ["6.18"],
    "C2-ANION-TESTS": ["6.19"],
    "C2-WATER-TEST": ["6.20"],
    "C2-WATER-PURE": ["6.21"],
    "C3-RATE-EXP": ["7.1"],
    "C3-RATE-FACTORS": ["7.2"],
    "C3-COLLISION": ["7.3"],
    "C3-CATALYST": ["7.4"],
    "C3-CATALYST-EA": ["7.5"],
    "C3-PRAC-MARBLE": ["7.7"],
    "C3-PRAC-PEROXIDE": ["7.8"],
    "C3-REVERSIBLE": ["7.9"],
    "C3-REV-EXAMPLES": ["7.10"],
    "C4-ADD-POLY": ["8.16"],
    "C4-REPEAT-UNIT": ["8.17"],
    "C4-MONOMER": ["8.18"],
    "C4-POLY-DISPOSAL": ["8.19"],
}

EDGES = [
    ("C1-ION-FORM", "C1-ION-CHARGES", DD),
    ("C1-ION-CHARGES", "C1-FORMULAE-IONS", UWR),
    ("C1-ION-FORM", "C1-DOT-IONIC", UWR),
    ("C1-ION-FORM", "C1-IONIC-BOND", DD),
    ("C1-DOT-IONIC", "C1-IONIC-BOND", UWR),
    ("C1-IONIC-BOND", "C1-IONIC-MP", UWR),
    ("C1-IONIC-BOND", "C1-IONIC-COND", UWR),
    ("C1-COV-BOND", "C1-COV-ELECTRO", DD),
    ("C1-COV-BOND", "C1-DOT-COV", UWR),
    ("C1-DOT-COV", "C1-SIMPLE-MOL", UWR),
    ("C1-SIMPLE-MOL", "C1-MR-BP", DD),
    ("C1-SIMPLE-MOL", "C1-GIANT-COV", UWR),
    ("C1-GIANT-COV", "C1-CARBON-FORMS", UWR),
    ("C1-SIMPLE-MOL", "C1-COV-COND", UWR),
    ("C2-G1-FAMILY", "C2-G1-TREND", DD),
    ("C2-G1-TREND", "C2-G1-PREDICT", UWR),
    ("C2-G7-PROPS", "C2-G7-PREDICT", UWR),
    ("C2-G7-PROPS", "C2-G7-DISPLACE", UWR),
    ("C2-AIR", "C2-O2-PERCENT", UWR),
    ("C2-COMBUSTION", "C2-O2-PERCENT", UWR),
    ("C2-CO2-CARB", "C2-GREENHOUSE", UWR),
    ("C2-O2-PERCENT", "C2-PRAC-O2", UWR),
    ("C2-CO2-CARB", "C2-GAS-TESTS", UWR),
    ("C2-FLAME", "C2-FLAME-COLOURS", DD),
    ("C2-FLAME", "C2-CATION-TESTS", UWR),
    ("C2-CATION-TESTS", "C2-ANION-TESTS", UWR),
    ("C2-ANION-TESTS", "C2-WATER-TEST", UWR),
    ("C2-WATER-TEST", "C2-WATER-PURE", DD),
    ("C3-RATE-EXP", "C3-RATE-FACTORS", UWR),
    ("C3-RATE-FACTORS", "C3-COLLISION", UWR),
    ("C3-RATE-FACTORS", "C3-CATALYST", UWR),
    ("C3-CATALYST", "C3-CATALYST-EA", UWR),
    ("C3-RATE-EXP", "C3-PRAC-MARBLE", UWR),
    ("C3-CATALYST", "C3-PRAC-PEROXIDE", UWR),
    ("C3-REVERSIBLE", "C3-REV-EXAMPLES", UWR),
    ("C4-ADD-POLY", "C4-REPEAT-UNIT", UWR),
    ("C4-REPEAT-UNIT", "C4-MONOMER", DD),
    ("C4-ADD-POLY", "C4-POLY-DISPOSAL", UWR),
]
