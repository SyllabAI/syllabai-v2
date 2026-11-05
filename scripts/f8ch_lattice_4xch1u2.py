"""4XCH1U2 modular unit concept lattice — T-KG-PRE-20
(F8 rollout batch eighteen, the Edexcel science tranche 15, the chemistry
family; serves igcse-chemistry-modular-24-unit-2, 81 served points).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane for the
Edexcel 4XCH1 IGCSE Chemistry modular specification, unit 2 sections 1-4 part 2 (5.x ionic/covalent/metallic/electrolysis; 6.x groups 1/7, gases, tests; 7.x rates/equilibrium; 8.x alcohols/carboxylic/esters/polymers).
DERIVATION DISCLOSED: the modular 2024 spec re-sections the linear 4CH1
2017 content into eight renumbered sections across the two units — every
modular statement maps 1:1 onto the linear register by text (4XCH1U2
map: unit 1 100 statements = 96 exact + 4 typographic-only, unit 2 81 = 81
exact; injective; the typographic diffs are curly quotes at U1 1.14, a
bullet/wording reflow at U1 2.6, the 'c ΔT' spacing at U1 3.3 and an
IUPAC line-wrap at U1 4.4). The linear statement 3.4 (molar enthalpy
change from Q) is the ONE statement the modular spec does not carry; its
master concept C3-MOLAR-DH is dropped here and named. The lattice is
therefore the master 4CH1 web (f8ch_lattice_4ch1.py) with anchors
renumbered onto the unit register; the same authored edges are kept,
minus the master edges that leave the unit territory (123
dropped), so the unit's web carries only intra-unit dependencies — the
same honest web the linear course ships, scoped to what this exam
serves. Concept ids mirror the master lattice for traceability. The
master's reversed-territory edges that fall inside this unit are carried
here too and dropped by the same calibrated in-order law — the exact
reversed list for this unit, computed against the unit's own spine
order:
  C2-COMBUSTION -> C2-O2-PERCENT;

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
    "C1-METAL-LATTICE": ["5.16C"],
    "C1-METAL-BOND": ["5.17C"],
    "C1-METAL-PROPS": ["5.18C"],
    "C1-COV-COND-WHY": ["5.19C"],
    "C1-IONIC-COND-WHY": ["5.20C"],
    "C1-AN-CAT": ["5.21C"],
    "C1-ELECTROLYSIS": ["5.22C"],
    "C1-HALF-EQNS": ["5.23C"],
    "C1-PRAC-ELECTRO": ["5.24C"],
    "C2-G1-FAMILY": ["6.1"],
    "C2-G1-TREND": ["6.2"],
    "C2-G1-PREDICT": ["6.3"],
    "C2-G1-EC": ["6.4C"],
    "C2-G7-PROPS": ["6.5"],
    "C2-G7-PREDICT": ["6.6"],
    "C2-G7-DISPLACE": ["6.7"],
    "C2-G7-EC": ["6.8C"],
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
    "C3-PROFILE": ["7.6C"],
    "C3-PRAC-MARBLE": ["7.7"],
    "C3-PRAC-PEROXIDE": ["7.8"],
    "C3-REVERSIBLE": ["7.9"],
    "C3-REV-EXAMPLES": ["7.10"],
    "C3-DYN-EQ": ["7.11C"],
    "C3-EQ-CHAR": ["7.12C"],
    "C3-EQ-CATALYST": ["7.13C"],
    "C3-EQ-SHIFT": ["7.14C"],
    "C4-OH-FG": ["8.1C"],
    "C4-ALCOHOL-DRAW": ["8.2C"],
    "C4-ETHANOL-OX": ["8.3C"],
    "C4-ETHANOL-MFG": ["8.4C"],
    "C4-FERMENT": ["8.5C"],
    "C4-COA-FG": ["8.6C"],
    "C4-COA-DRAW": ["8.7C"],
    "C4-COA-REACTIONS": ["8.8C"],
    "C4-VINEGAR": ["8.9C"],
    "C4-ESTER-FG": ["8.10C"],
    "C4-ETHYL-ETH": ["8.11C"],
    "C4-ESTER-DRAW": ["8.12C"],
    "C4-ESTER-GENERAL": ["8.13C"],
    "C4-ESTER-USES": ["8.14C"],
    "C4-PRAC-ESTER": ["8.15C"],
    "C4-ADD-POLY": ["8.16"],
    "C4-REPEAT-UNIT": ["8.17"],
    "C4-MONOMER": ["8.18"],
    "C4-POLY-DISPOSAL": ["8.19"],
    "C4-COND-POLY": ["8.20C"],
    "C4-POLYESTER": ["8.21C"],
    "C4-BIOPOLY": ["8.22C"],
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
    ("C1-METAL-LATTICE", "C1-METAL-BOND", DD),
    ("C1-METAL-BOND", "C1-METAL-PROPS", UWR),
    ("C1-COV-COND", "C1-COV-COND-WHY", DD),
    ("C1-IONIC-COND", "C1-IONIC-COND-WHY", DD),
    ("C1-ION-FORM", "C1-AN-CAT", UWR),
    ("C1-IONIC-COND-WHY", "C1-ELECTROLYSIS", UWR),
    ("C1-AN-CAT", "C1-ELECTROLYSIS", UWR),
    ("C1-ELECTROLYSIS", "C1-HALF-EQNS", UWR),
    ("C1-ELECTROLYSIS", "C1-PRAC-ELECTRO", UWR),
    ("C2-G1-FAMILY", "C2-G1-TREND", DD),
    ("C2-G1-TREND", "C2-G1-PREDICT", UWR),
    ("C2-G1-TREND", "C2-G1-EC", UWR),
    ("C2-G7-PROPS", "C2-G7-PREDICT", UWR),
    ("C2-G7-PROPS", "C2-G7-DISPLACE", UWR),
    ("C2-G7-DISPLACE", "C2-G7-EC", UWR),
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
    ("C3-REVERSIBLE", "C3-DYN-EQ", UWR),
    ("C3-DYN-EQ", "C3-EQ-CHAR", DD),
    ("C3-CATALYST", "C3-EQ-CATALYST", UWR),
    ("C3-EQ-CHAR", "C3-EQ-CATALYST", UWR),
    ("C3-EQ-CHAR", "C3-EQ-SHIFT", UWR),
    ("C4-OH-FG", "C4-ALCOHOL-DRAW", UWR),
    ("C4-ALCOHOL-DRAW", "C4-ETHANOL-OX", UWR),
    ("C4-ETHANOL-MFG", "C4-FERMENT", UWR),
    ("C4-COA-FG", "C4-COA-DRAW", UWR),
    ("C4-COA-DRAW", "C4-COA-REACTIONS", UWR),
    ("C4-COA-FG", "C4-VINEGAR", UWR),
    ("C4-ESTER-FG", "C4-ETHYL-ETH", UWR),
    ("C4-COA-FG", "C4-ETHYL-ETH", UWR),
    ("C4-OH-FG", "C4-ETHYL-ETH", UWR),
    ("C4-ETHYL-ETH", "C4-ESTER-DRAW", UWR),
    ("C4-ESTER-DRAW", "C4-ESTER-GENERAL", UWR),
    ("C4-ESTER-GENERAL", "C4-ESTER-USES", UWR),
    ("C4-ETHYL-ETH", "C4-PRAC-ESTER", UWR),
    ("C4-ADD-POLY", "C4-REPEAT-UNIT", UWR),
    ("C4-REPEAT-UNIT", "C4-MONOMER", DD),
    ("C4-ADD-POLY", "C4-POLY-DISPOSAL", UWR),
    ("C4-COA-FG", "C4-COND-POLY", UWR),
    ("C4-OH-FG", "C4-COND-POLY", UWR),
    ("C4-COND-POLY", "C4-POLYESTER", UWR),
    ("C4-POLYESTER", "C4-BIOPOLY", UWR),
]
