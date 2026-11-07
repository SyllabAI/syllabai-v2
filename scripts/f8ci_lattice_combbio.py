"""CIE combined science biology concept lattice — T-KG-PRE-23
(F8 rollout batch twenty-one, the CIE science family, the rollout tail; serves
cie-igcse-science-combined-science-23-biology, 70 served points).

AI_SUGGESTED / UNVALIDATED concept web FRESH AUTHORED over the combined
science 2023 biology register's own statements. FRESH-AUTHORING DISCLOSED:
the combined-science register is NOT a text mirror of the co-ordinated
register (mapcheck of record in scripts/f8ci_derive.py: only ~25 of 70
combined statements text-match a co-ordinated statement; the rest are
re-authored multi-topic statements), so derivation from the separate-science
master cannot serve this course honestly — the fresh-authoring pattern of the
rollout (history 0470, RS 0490, EM 0680, ICT 0417/4IT1) applies. Concepts
were reasoned statement-by-statement over the served spine; multi-anchoring
(11 concepts binding two statements) mirrors the spec serving the same
teaching at two register positions.

The exact reversed list for this course, computed against the combined
spine's own point order via the law of record (scripts/kg_f8al_project.py
export_pairs):
  - BIO-AEROBIC-RESP [B8.2.2] -> BIO-ENERGY-USES [B8.2.1]  (the uses-of-energy
    statement is served before the aerobic-respiration definition whose energy
    release it names; a genuine dependency the spec serves backwards, dropped
    by the calibrated in-order law and counted)

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "BIO-CHARACTERISTICS": ["B1.1.1"],
    "BIO-CELLS-EXIST": ["B2.1.1"],
    "BIO-CELL-STRUCTURE": ["B2.1.2"],
    "BIO-CELL-FUNCTIONS": ["B2.1.3"],
    "BIO-SPECIALISED-CELLS": ["B2.1.4"],
    "BIO-DIFFUSION": ["B2.2.1", "B2.2.2"],
    "BIO-OSMOSIS": ["B2.2.3", "B2.2.4"],
    "BIO-BIOMOLECULES": ["B3.1.1"],
    "BIO-BIOMOLECULE-BUILD": ["B3.1.2"],
    "BIO-FOOD-TESTS": ["B3.1.3"],
    "BIO-WATER-SOLVENT": ["B3.1.4"],
    "BIO-ENZYMES-DEF": ["B4.1.1"],
    "BIO-ENZYMES-ACTION": ["B4.1.2"],
    "BIO-PHOTOSYNTHESIS-DEF": ["B5.1.1"],
    "BIO-PHOTOSYNTHESIS-EQUATION": ["B5.1.2", "B5.1.3"],
    "BIO-CHLOROPHYLL-ENERGY": ["B5.1.4"],
    "BIO-CARB-USE-STORAGE": ["B5.1.5"],
    "BIO-BALANCED-DIET": ["B6.1.1"],
    "BIO-DIET-SOURCES": ["B6.1.2"],
    "BIO-DIET-NEEDS": ["B6.1.3"],
    "BIO-MALNUTRITION": ["B6.1.4"],
    "BIO-VIT-D-IRON": ["B6.1.5"],
    "BIO-INGESTION": ["B6.2.1"],
    "BIO-DIGESTION-DEF": ["B6.2.2"],
    "BIO-MECH-DIGESTION": ["B6.2.3"],
    "BIO-CHEM-DIGESTION": ["B6.2.4"],
    "BIO-DIGESTION-SIGNIF": ["B6.3.1"],
    "BIO-DIGESTIVE-ENZYMES": ["B6.3.2"],
    "BIO-ENZYME-SECRETION": ["B6.3.3"],
    "BIO-HCL-FUNCTION": ["B6.3.4"],
    "BIO-XYLEM-PHLOEM": ["B7.1.1"],
    "BIO-XYLEM-POSITION": ["B7.1.2"],
    "BIO-ROOT-HAIR-CELLS": ["B7.1.3"],
    "BIO-ROOT-HAIR-AREA": ["B7.1.4"],
    "BIO-CIRCULATION-SYSTEM": ["B7.2.1"],
    "BIO-DOUBLE-CIRC": ["B7.2.2"],
    "BIO-DOUBLE-CIRC-ADV": ["B7.2.3"],
    "BIO-GAS-EXCHANGE-ORGANS": ["B8.1.1"],
    "BIO-GAS-EXCHANGE-SURFACES": ["B8.1.2"],
    "BIO-ENERGY-USES": ["B8.2.1"],
    "BIO-AEROBIC-RESP": ["B8.2.2"],
    "BIO-HORMONES": ["B9.1.1"],
    "BIO-ADRENALINE": ["B9.1.2", "B9.1.3"],
    "BIO-TROPISMS": ["B9.2.1", "B9.2.2"],
    "BIO-AUXIN": ["B9.2.3"],
    "BIO-ASEXUAL-REP": ["B10.1.1", "B10.1.2"],
    "BIO-SEXUAL-REP": ["B10.1.3"],
    "BIO-FLOWER-STRUCTURE": ["B10.2.1", "B10.2.2"],
    "BIO-MALE-REP": ["B10.3.1", "B10.3.2"],
    "BIO-FEMALE-REP": ["B10.3.3", "B10.3.4"],
    "BIO-FERTILISATION": ["B10.3.5"],
    "BIO-GAMETES": ["B10.3.6", "B10.3.7", "B10.3.8"],
    "BIO-SUN-ENERGY": ["B11.1.1"],
    "BIO-FOOD-CHAINS": ["B11.1.2"],
    "BIO-ECOSYSTEMS": ["B11.1.3"],
    "BIO-ENERGY-TRANSFER": ["B11.1.4"],
    "BIO-TROPHIC-LEVELS": ["B11.1.5"],
    "BIO-CARBON-CYCLE": ["B12.1.1"],
    "BIO-FOSSIL-EFFECTS": ["B12.1.2"],
}

EDGES = [
    ("BIO-CELLS-EXIST", "BIO-CELL-STRUCTURE", DD),
    ("BIO-CELL-STRUCTURE", "BIO-CELL-FUNCTIONS", DD),
    ("BIO-CELL-STRUCTURE", "BIO-SPECIALISED-CELLS", DD),
    ("BIO-CELLS-EXIST", "BIO-DIFFUSION", UWR),
    ("BIO-DIFFUSION", "BIO-OSMOSIS", DD),
    ("BIO-BIOMOLECULES", "BIO-FOOD-TESTS", UWR),
    ("BIO-BIOMOLECULES", "BIO-DIET-SOURCES", UWR),
    ("BIO-BIOMOLECULES", "BIO-DIGESTIVE-ENZYMES", UWR),
    ("BIO-BIOMOLECULE-BUILD", "BIO-DIGESTIVE-ENZYMES", DD),
    ("BIO-ENZYMES-DEF", "BIO-ENZYMES-ACTION", DD),
    ("BIO-ENZYMES-DEF", "BIO-DIGESTIVE-ENZYMES", DD),
    ("BIO-DIGESTIVE-ENZYMES", "BIO-ENZYME-SECRETION", DD),
    ("BIO-INGESTION", "BIO-DIGESTION-DEF", DD),
    ("BIO-DIGESTION-DEF", "BIO-MECH-DIGESTION", DD),
    ("BIO-DIGESTION-DEF", "BIO-CHEM-DIGESTION", DD),
    ("BIO-CHEM-DIGESTION", "BIO-DIGESTIVE-ENZYMES", DD),
    ("BIO-CHEM-DIGESTION", "BIO-DIGESTION-SIGNIF", DD),
    ("BIO-PHOTOSYNTHESIS-DEF", "BIO-PHOTOSYNTHESIS-EQUATION", DD),
    ("BIO-PHOTOSYNTHESIS-DEF", "BIO-CHLOROPHYLL-ENERGY", DD),
    ("BIO-PHOTOSYNTHESIS-EQUATION", "BIO-CARB-USE-STORAGE", DD),
    ("BIO-BALANCED-DIET", "BIO-DIET-SOURCES", DD),
    ("BIO-DIET-SOURCES", "BIO-DIET-NEEDS", UWR),
    ("BIO-DIET-SOURCES", "BIO-VIT-D-IRON", DD),
    ("BIO-OSMOSIS", "BIO-ROOT-HAIR-CELLS", UWR),
    ("BIO-SPECIALISED-CELLS", "BIO-ROOT-HAIR-CELLS", UWR),
    ("BIO-XYLEM-PHLOEM", "BIO-XYLEM-POSITION", DD),
    ("BIO-XYLEM-PHLOEM", "BIO-ROOT-HAIR-CELLS", UWR),
    ("BIO-ROOT-HAIR-CELLS", "BIO-ROOT-HAIR-AREA", DD),
    ("BIO-CIRCULATION-SYSTEM", "BIO-DOUBLE-CIRC", DD),
    ("BIO-DOUBLE-CIRC", "BIO-DOUBLE-CIRC-ADV", DD),
    ("BIO-GAS-EXCHANGE-ORGANS", "BIO-GAS-EXCHANGE-SURFACES", DD),
    ("BIO-AEROBIC-RESP", "BIO-ENERGY-USES", UWR),
    ("BIO-HORMONES", "BIO-ADRENALINE", DD),
    ("BIO-HORMONES", "BIO-AUXIN", DD),
    ("BIO-TROPISMS", "BIO-AUXIN", DD),
    ("BIO-ASEXUAL-REP", "BIO-SEXUAL-REP", DD),
    ("BIO-SEXUAL-REP", "BIO-FERTILISATION", DD),
    ("BIO-MALE-REP", "BIO-FERTILISATION", UWR),
    ("BIO-FEMALE-REP", "BIO-FERTILISATION", UWR),
    ("BIO-SUN-ENERGY", "BIO-FOOD-CHAINS", DD),
    ("BIO-FOOD-CHAINS", "BIO-ECOSYSTEMS", DD),
    ("BIO-ECOSYSTEMS", "BIO-ENERGY-TRANSFER", DD),
    ("BIO-ENERGY-TRANSFER", "BIO-TROPHIC-LEVELS", DD),
    ("BIO-PHOTOSYNTHESIS-DEF", "BIO-CARBON-CYCLE", UWR),
    ("BIO-AEROBIC-RESP", "BIO-CARBON-CYCLE", UWR),
    ("BIO-CARBON-CYCLE", "BIO-FOSSIL-EFFECTS", DD),
]
