"""4XBI1U1 modular unit concept lattice — T-KG-PRE-21
(F8 rollout batch nineteen, the Edexcel science tranche 16, the biology
family; serves igcse-biology-modular-24-unit-1, 54 served points).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane for the
Edexcel 4XBI1 IGCSE Biology modular specification, unit 1 sections 1-2 (1 nature and variety of living organisms; 2 structure and functions in living organisms: part 1 — 2a-2g organisation/biomolecules/enzymes/movement/photosynthesis/diet-digestion/respiration/gas exchange).
DERIVATION DISCLOSED: the modular 2024 spec re-sections the linear 4BI1
2017 content — every modular statement maps 1:1 onto the linear register
by text (mapcheck of record: unit 1 54 statements = 52 exact + 2
typographic-only — the eukaryotes statement at U1 1.2 (ratio 1.000,
spacing) and the hydrogen-carbonate practical at U1 2.45B (0.995,
hyphen spacing); unit 2 122 statements = 121 exact + 1 — the industrial
fermenter statement U2 6.8 maps to linear 5.8 (0.961, spec rewording);
injective; ZERO linear statements uncovered). The renumbering:
U1 1.x <- linear 1.x (4), 2.x <- linear 2.1-2.50 (50); U2 1.x/2.x/3.x/4.x
carried on point ids 3.x <- linear 2.51-2.95B (45), 4.x <- linear 3.x
(39), 5.x <- linear 4.x (18), 6.x <- linear 5.x (20). The lattice is
therefore the master 4BI1 web (f8bi_lattice_4bi1.py) with anchors
renumbered onto the unit register; the same authored edges are kept,
minus the master edges that leave the unit territory (144
dropped), so the unit's web carries only intra-unit dependencies — the
same honest web the linear course ships, scoped to what this exam
serves. Concept ids mirror the master lattice for traceability. The
master's reversed-territory edges that fall inside this unit are carried
here too and dropped by the same calibrated in-order law — the exact
reversed list for this unit, computed against the unit's own spine
order:
  (none)

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"


CONCEPTS = {
    "B1-CHARACTERISTICS": ["1.1"],
    "B1-EUKARYOTES": ["1.2"],
    "B1-PROKARYOTES": ["1.3"],
    "B1-PATHOGENS": ["1.4"],
    "B2-LEVELS": ["2.1"],
    "B2-CELL-STRUCT": ["2.2"],
    "B2-CELL-FUNCT": ["2.3"],
    "B2-PLANT-ANIMAL": ["2.4"],
    "B2-DIFFERENTIATION": ["2.5B"],
    "B2-STEM-CELLS": ["2.6B"],
    "B2-BIOMOL-ELEMENTS": ["2.7"],
    "B2-BIOMOL-STRUCT": ["2.8"],
    "B2-CP-FOOD-TESTS": ["2.9"],
    "B2-ENZYMES": ["2.10"],
    "B2-ENZ-TEMP": ["2.11"],
    "B2-CP-ENZ-TEMP": ["2.12"],
    "B2-ENZ-PH": ["2.13"],
    "B2-CP-ENZ-PH": ["2.14B"],
    "B2-MOVE": ["2.15"],
    "B2-MOVE-FACTORS": ["2.16"],
    "B2-CP-DIFF-OSM": ["2.17"],
    "B2-PHOTOSYN": ["2.18"],
    "B2-PHOT-EQ": ["2.19"],
    "B2-LIMITING": ["2.20"],
    "B2-LEAF-STRUCT": ["2.21"],
    "B2-MINERALS": ["2.22"],
    "B2-CP-PHOTOSYN": ["2.23"],
    "B2-DIET-BALANCED": ["2.24"],
    "B2-DIET-SOURCES": ["2.25"],
    "B2-ENERGY-REQ": ["2.26"],
    "B2-ALIMENTARY": ["2.27"],
    "B2-PERISTALSIS": ["2.28"],
    "B2-DIGEST-ENZ": ["2.29"],
    "B2-BILE-PROD": ["2.30"],
    "B2-BILE-ROLE": ["2.31"],
    "B2-VILLUS": ["2.32"],
    "B2-CP-FOOD-ENERGY": ["2.33B"],
    "B2-ATP-RESP": ["2.34"],
    "B2-ATP-USES": ["2.35"],
    "B2-AER-ANAER": ["2.36"],
    "B2-RESP-EQ-AER": ["2.37"],
    "B2-RESP-EQ-ANA": ["2.38"],
    "B2-CP-RESP-SEEDS": ["2.39"],
    "B2-GAS-DIFF": ["2.40B"],
    "B2-GAS-EX-REL": ["2.41B"],
    "B2-LEAF-GAS-EX": ["2.42B"],
    "B2-STOMATA": ["2.43B"],
    "B2-NET-EXCHANGE": ["2.44B"],
    "B2-CP-HCO3": ["2.45B"],
    "B2-THORAX": ["2.46"],
    "B2-VENTILATION": ["2.47"],
    "B2-ALVEOLI": ["2.48"],
    "B2-SMOKING": ["2.49"],
    "B2-CP-BREATHING": ["2.50"],
}


EDGES = [
    ("B1-CHARACTERISTICS", "B1-EUKARYOTES", DD),
    ("B1-EUKARYOTES", "B1-PROKARYOTES", UWR),
    ("B1-EUKARYOTES", "B1-PATHOGENS", UWR),
    ("B2-LEVELS", "B2-CELL-STRUCT", DD),
    ("B2-CELL-STRUCT", "B2-CELL-FUNCT", UWR),
    ("B2-CELL-STRUCT", "B2-PLANT-ANIMAL", UWR),
    ("B2-CELL-FUNCT", "B2-DIFFERENTIATION", UWR),
    ("B2-DIFFERENTIATION", "B2-STEM-CELLS", DD),
    ("B2-BIOMOL-ELEMENTS", "B2-BIOMOL-STRUCT", DD),
    ("B2-BIOMOL-STRUCT", "B2-CP-FOOD-TESTS", UWR),
    ("B2-BIOMOL-STRUCT", "B2-ENZYMES", UWR),
    ("B2-ENZYMES", "B2-ENZ-TEMP", DD),
    ("B2-ENZ-TEMP", "B2-CP-ENZ-TEMP", UWR),
    ("B2-ENZ-TEMP", "B2-ENZ-PH", UWR),
    ("B2-ENZ-PH", "B2-CP-ENZ-PH", UWR),
    ("B2-CELL-FUNCT", "B2-MOVE", UWR),
    ("B2-MOVE", "B2-MOVE-FACTORS", DD),
    ("B2-MOVE", "B2-CP-DIFF-OSM", UWR),
    ("B2-PHOTOSYN", "B2-PHOT-EQ", DD),
    ("B2-PHOT-EQ", "B2-LIMITING", UWR),
    ("B2-PHOTOSYN", "B2-LEAF-STRUCT", UWR),
    ("B2-PHOTOSYN", "B2-MINERALS", UWR),
    ("B2-LIMITING", "B2-CP-PHOTOSYN", UWR),
    ("B2-BIOMOL-ELEMENTS", "B2-DIET-BALANCED", UWR),
    ("B2-DIET-BALANCED", "B2-DIET-SOURCES", DD),
    ("B2-DIET-SOURCES", "B2-ENERGY-REQ", UWR),
    ("B2-ENERGY-REQ", "B2-CP-FOOD-ENERGY", UWR),
    ("B2-ALIMENTARY", "B2-PERISTALSIS", DD),
    ("B2-ENZYMES", "B2-DIGEST-ENZ", DD),
    ("B2-BIOMOL-STRUCT", "B2-DIGEST-ENZ", UWR),
    ("B2-ALIMENTARY", "B2-BILE-PROD", UWR),
    ("B2-BILE-PROD", "B2-BILE-ROLE", DD),
    ("B2-MOVE", "B2-VILLUS", UWR),
    ("B2-DIGEST-ENZ", "B2-VILLUS", UWR),
    ("B2-ATP-RESP", "B2-ATP-USES", DD),
    ("B2-ATP-RESP", "B2-AER-ANAER", DD),
    ("B2-AER-ANAER", "B2-RESP-EQ-AER", DD),
    ("B2-AER-ANAER", "B2-RESP-EQ-ANA", DD),
    ("B2-RESP-EQ-AER", "B2-CP-RESP-SEEDS", UWR),
    ("B2-MOVE", "B2-GAS-DIFF", DD),
    ("B2-PHOT-EQ", "B2-GAS-EX-REL", UWR),
    ("B2-RESP-EQ-AER", "B2-GAS-EX-REL", DD),
    ("B2-GAS-DIFF", "B2-GAS-EX-REL", UWR),
    ("B2-LEAF-STRUCT", "B2-LEAF-GAS-EX", DD),
    ("B2-LEAF-GAS-EX", "B2-STOMATA", DD),
    ("B2-STOMATA", "B2-NET-EXCHANGE", DD),
    ("B2-LIMITING", "B2-NET-EXCHANGE", UWR),
    ("B2-NET-EXCHANGE", "B2-CP-HCO3", UWR),
    ("B2-THORAX", "B2-VENTILATION", DD),
    ("B2-VENTILATION", "B2-CP-BREATHING", UWR),
    ("B2-GAS-DIFF", "B2-ALVEOLI", DD),
    ("B2-ALVEOLI", "B2-SMOKING", UWR),
]
