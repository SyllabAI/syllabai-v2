"""4XSD1 biology modular unit 2 concept lattice — T-KG-PRE-22
(F8 rollout batch twenty, the Edexcel science tranche 17, the double-award
family; serves igcse-science-double-award-modular-24-biology-unit-2, 60 served
points).

AI_SUGGESTED / UNVALIDATED concept web DERIVED for the Edexcel 4XSD1
Double Award biology modular specification, unit 2 sections 4-6 (reproduction and inheritance; ecology and the environment; use of biological resources), anchored 1:1
to the unit's served point ids.
DERIVATION DISCLOSED (two hops, both text-verified): the 2024 modular spec
RE-SECTIONS the 4SD0 linear content into a continuing register — mapcheck of
record for THIS unit: 60 statements matched 1:1 onto the 4SD0 linear register
by exact or >=0.85 similarity text (60 exact + 0 sub-exact, each eyeballed:
none),
the map is INJECTIVE and covers the unit exactly. The unit lattice is the
4SD0 linear web (f8da_lattice_4sd0bio.py, itself derived from the
separate-science master f8bi_lattice_4bi1.py) with anchors renumbered onto
the unit register; edges kept VERBATIM minus the edges leaving the unit
territory (82 dropped). NO edge re-authored. Concept ids mirror the master
lattice for traceability. The exact reversed list for THIS unit, computed
against the unit's own spine order:
  - B5-FERTILISER [6.3] -> B4-EUTROPH [5.17]

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "B3-SEX-ASEX": ["4.1"],
    "B3-FERTILISATION": ["4.2"],
    "B3-FLOWERS": ["4.3"],
    "B3-POLLEN-SEED": ["4.4"],
    "B3-CP-GERMINATION": ["4.5"],
    "B3-GERM-RESERVES": ["4.6"],
    "B3-ASEX-PLANTS": ["4.7"],
    "B3-REPRO-SYSTEMS": ["4.8"],
    "B3-MENSTRUAL-EP": ["4.9"],
    "B3-PLACENTA": ["4.11"],
    "B3-AMNIOTIC": ["4.12"],
    "B3-SECONDARY": ["4.13"],
    "B3-GENOME": ["4.14"],
    "B3-CHROMOSOMES": ["4.15"],
    "B3-ALLELES": ["4.19"],
    "B3-TERMS": ["4.20"],
    "B3-POLYGENIC": ["4.22"],
    "B3-MONO-DIAGRAM": ["4.23"],
    "B3-PEDIGREES": ["4.24"],
    "B3-PROBABILITIES": ["4.25"],
    "B3-SEX-CHROM": ["4.26"],
    "B3-SEX-DETERM": ["4.27"],
    "B3-MITOSIS": ["4.28"],
    "B3-MITOSIS-USES": ["4.29"],
    "B3-MEIOSIS": ["4.30"],
    "B3-RAND-FERT": ["4.31"],
    "B3-DIPLOID": ["4.32"],
    "B3-VARIATION": ["4.33"],
    "B3-MUTATION": ["4.34"],
    "B3-NAT-SEL": ["4.38"],
    "B3-AB-RESIST": ["4.39"],
    "B4-TERMS": ["5.1"],
    "B4-CP-QUADRATS": ["5.2"],
    "B4-FACTORS": ["5.5"],
    "B4-TROPHIC": ["5.6"],
    "B4-FOOD-CHAINS": ["5.7"],
    "B4-TRANSFER": ["5.8"],
    "B4-ENERGY-10": ["5.9"],
    "B4-CARBON-CYCLE": ["5.10"],
    "B4-AIR-POLLUTION": ["5.12"],
    "B4-GREENHOUSE": ["5.13"],
    "B4-GREENHOUSE-HUMAN": ["5.14"],
    "B4-GLOBAL-WARMING": ["5.15"],
    "B4-SEWAGE": ["5.16"],
    "B4-EUTROPH": ["5.17"],
    "B5-GLASSHOUSES": ["6.1"],
    "B5-GLASS-YIELD": ["6.2"],
    "B5-FERTILISER": ["6.3"],
    "B5-PEST-CONTROL": ["6.4"],
    "B5-YEAST-BREAD": ["6.5"],
    "B5-CP-YEAST": ["6.6"],
    "B5-YOGHURT": ["6.7"],
    "B5-FERMENTER": ["6.8"],
    "B5-SELECT-PLANTS": ["6.10"],
    "B5-SELECT-ANIMALS": ["6.11"],
    "B5-RESTRICT-LIGASE": ["6.12"],
    "B5-VECTORS": ["6.13"],
    "B5-GM-INSULIN": ["6.14"],
    "B5-GM-PLANTS": ["6.15"],
    "B5-TRANSGENIC": ["6.16"],
}

EDGES = [
    ("B3-SEX-ASEX", "B3-FERTILISATION", DD),
    ("B3-SEX-ASEX", "B3-ASEX-PLANTS", UWR),
    ("B3-FERTILISATION", "B3-POLLEN-SEED", UWR),
    ("B3-FLOWERS", "B3-POLLEN-SEED", DD),
    ("B3-POLLEN-SEED", "B3-CP-GERMINATION", UWR),
    ("B3-POLLEN-SEED", "B3-GERM-RESERVES", DD),
    ("B3-SEX-ASEX", "B3-REPRO-SYSTEMS", UWR),
    ("B3-REPRO-SYSTEMS", "B3-PLACENTA", UWR),
    ("B3-PLACENTA", "B3-AMNIOTIC", UWR),
    ("B3-GENOME", "B3-CHROMOSOMES", DD),
    ("B3-GENOME", "B3-ALLELES", DD),
    ("B3-ALLELES", "B3-TERMS", DD),
    ("B3-ALLELES", "B3-POLYGENIC", UWR),
    ("B3-TERMS", "B3-MONO-DIAGRAM", DD),
    ("B3-MONO-DIAGRAM", "B3-PEDIGREES", UWR),
    ("B3-MONO-DIAGRAM", "B3-PROBABILITIES", DD),
    ("B3-CHROMOSOMES", "B3-SEX-CHROM", DD),
    ("B3-SEX-CHROM", "B3-SEX-DETERM", DD),
    ("B3-MONO-DIAGRAM", "B3-SEX-DETERM", UWR),
    ("B3-CHROMOSOMES", "B3-MITOSIS", DD),
    ("B3-MITOSIS", "B3-MITOSIS-USES", DD),
    ("B3-MITOSIS", "B3-MEIOSIS", UWR),
    ("B3-MEIOSIS", "B3-RAND-FERT", DD),
    ("B3-FERTILISATION", "B3-RAND-FERT", UWR),
    ("B3-MEIOSIS", "B3-DIPLOID", UWR),
    ("B3-RAND-FERT", "B3-VARIATION", DD),
    ("B3-VARIATION", "B3-MUTATION", DD),
    ("B3-VARIATION", "B3-NAT-SEL", DD),
    ("B3-MUTATION", "B3-NAT-SEL", UWR),
    ("B3-NAT-SEL", "B3-AB-RESIST", DD),
    ("B4-TERMS", "B4-CP-QUADRATS", UWR),
    ("B4-TERMS", "B4-FACTORS", DD),
    ("B4-TROPHIC", "B4-FOOD-CHAINS", DD),
    ("B4-FOOD-CHAINS", "B4-TRANSFER", DD),
    ("B4-TRANSFER", "B4-ENERGY-10", DD),
    ("B4-TROPHIC", "B4-CARBON-CYCLE", UWR),
    ("B4-CARBON-CYCLE", "B4-GREENHOUSE", DD),
    ("B4-GREENHOUSE", "B4-GREENHOUSE-HUMAN", DD),
    ("B4-GREENHOUSE-HUMAN", "B4-GLOBAL-WARMING", DD),
    ("B4-FACTORS", "B4-SEWAGE", UWR),
    ("B4-SEWAGE", "B4-EUTROPH", UWR),
    ("B5-FERTILISER", "B4-EUTROPH", UWR),
    ("B5-GLASSHOUSES", "B5-GLASS-YIELD", DD),
    ("B5-GLASS-YIELD", "B5-FERTILISER", UWR),
    ("B5-FERTILISER", "B5-PEST-CONTROL", UWR),
    ("B5-YEAST-BREAD", "B5-CP-YEAST", UWR),
    ("B5-YOGHURT", "B5-FERMENTER", UWR),
    ("B5-YEAST-BREAD", "B5-FERMENTER", UWR),
    ("B3-TERMS", "B5-SELECT-PLANTS", DD),
    ("B5-SELECT-PLANTS", "B5-SELECT-ANIMALS", UWR),
    ("B5-RESTRICT-LIGASE", "B5-VECTORS", DD),
    ("B5-VECTORS", "B5-GM-INSULIN", DD),
    ("B5-VECTORS", "B5-GM-PLANTS", UWR),
    ("B5-GM-INSULIN", "B5-TRANSGENIC", UWR),
]
