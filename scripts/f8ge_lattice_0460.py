"""0460 IGCSE Geography concept lattice — T-KG-PRE-13
(F8 rollout batch eleven, the geography family tranche 8;
serves BOTH cie-igcse-geography-20 and cie-igcse-geography-25).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
0460 IGCSE Geography syllabus (113 spec points, three sections: Population
and settlement, The natural environment, Economic development), anchored to
the served spine's point ids. Every anchor is machine-verified against the
spine before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

One lattice, two served spines: the 2020 and 2025 examination spines carry
IDENTICAL point ids, texts and node labels (id-set and text equality
verified before authoring) — the 9709P1/9709M two-course module pattern of
batch five, not the independent-version pattern (there is no content
divergence to model).

Structure of record: each subtopic is a definitional chain (foundation
concept -> process -> impact -> management -> its named case-study
application), with honest cross-subtopic bridges only where the syllabus
itself names the dependency (migration -> urbanisation, river processes ->
coastal processes and water supply, weather instruments -> climate graphs ->
the mathematical-skills register, sector classification -> agricultural and
industrial systems, energy and deforestation -> environmental threats). The
3.7.6-3.7.17 mathematical-skills block is treated as its own skills register
hanging off the umbrella point 3.7.6, in the 8021GP skills-chain style of
batch ten. Three authored pairs are knowingly served-order-reversed (site
factors -> settlement patterns, urban growth -> urban land use, axis
selection -> graph drawing); the calibrated in-order law drops exactly
those, counted and disclosed — the law working as designed.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1a Population dynamics
    "G46-CON-POP-GROWTH-REASONS": ["1.1.1"],
    "G46-CON-OVER-UNDER-POP": ["1.1.2"],
    "G46-CON-POP-CHANGE-CAUSES": ["1.1.3"],
    "G46-CON-NATURAL-CHANGE-RATES": ["1.1.4"],
    "G46-CON-POP-POLICIES": ["1.1.5"],
    "G46-CON-CS-OVERPOP": ["1.1.7"],
    "G46-CON-CS-UNDERPOP": ["1.1.8"],
    "G46-CON-CS-HIGH-GROWTH": ["1.1.9"],
    "G46-CON-CS-LOW-GROWTH": ["1.1.10"],
    # 1b Migration
    "G46-CON-MIGRATION-REASONS": ["1.2.1"],
    "G46-CON-MIGRATION-IMPACTS": ["1.2.2"],
    "G46-CON-CS-INT-MIGRATION": ["1.2.4"],
    # 1c Population structure
    "G46-CON-POP-STRUCTURE": ["1.3.1"],
    "G46-CON-CS-HIGH-DEP": ["1.3.3"],
    # 1d Population density and distribution
    "G46-CON-DENSITY-DISTRIBUTION": ["1.4.1"],
    "G46-CON-CS-DENSE": ["1.4.3"],
    "G46-CON-CS-SPARSE": ["1.4.4"],
    # 1e Settlement (rural and urban) and service provision
    "G46-CON-SETTLEMENT-PATTERNS": ["1.5.1"],
    "G46-CON-SETTLEMENT-SITES": ["1.5.2"],
    "G46-CON-SETTLEMENT-HIERARCHY": ["1.5.3"],
    "G46-CON-CS-SETTLEMENT-AREA": ["1.5.5"],
    # 1f Urban settlements
    "G46-CON-URBAN-LANDUSE": ["1.6.1"],
    "G46-CON-URBAN-PROBLEMS": ["1.6.2"],
    "G46-CON-CS-URBAN-AREA": ["1.6.4"],
    # 1g Urbanisation
    "G46-CON-URBAN-GROWTH-REASONS": ["1.7.1"],
    "G46-CON-URBANISATION-IMPACTS": ["1.7.2"],
    "G46-CON-CS-RAPID-URBAN": ["1.7.4"],
    # 2a Earthquakes and volcanoes
    "G46-CON-QUAKE-VOLCANO-FEATURES": ["2.1.1"],
    "G46-CON-QUAKE-VOLCANO-DISTRIBUTION": ["2.1.2"],
    "G46-CON-QUAKE-CAUSES-EFFECTS": ["2.1.3"],
    "G46-CON-VOLCANO-HAZ-OPP": ["2.1.4"],
    "G46-CON-QUAKE-VOLCANO-REDUCTION": ["2.1.5"],
    "G46-CON-CS-QUAKE": ["2.1.7"],
    "G46-CON-CS-VOLCANO": ["2.1.8"],
    # 2b Rivers
    "G46-CON-RIVER-HYDROLOGY": ["2.2.1"],
    "G46-CON-RIVER-WORK": ["2.2.2"],
    "G46-CON-RIVER-LANDFORMS": ["2.2.3"],
    "G46-CON-RIVER-HAZ-OPP": ["2.2.4"],
    "G46-CON-RIVER-FLOOD-MGMT": ["2.2.5"],
    "G46-CON-CS-RIVER": ["2.2.7"],
    # 2c Coasts
    "G46-CON-COAST-WORK": ["2.3.1"],
    "G46-CON-COAST-LANDFORMS": ["2.3.2"],
    "G46-CON-CORAL-MANGROVE": ["2.3.3"],
    "G46-CON-COAST-HAZ-OPP": ["2.3.4"],
    "G46-CON-COAST-EROSION-MGMT": ["2.3.5"],
    "G46-CON-CS-COAST": ["2.3.7"],
    # 2d Weather
    "G46-CON-WEATHER-DATA": ["2.4.1"],
    "G46-CON-WEATHER-CALC": ["2.4.2"],
    "G46-CON-WEATHER-GRAPHS": ["2.4.3"],
    # 2e Climate and natural vegetation
    "G46-CON-CLIMATE-CHARS": ["2.5.1"],
    "G46-CON-EQUATORIAL-CLIMATE": ["2.5.2"],
    "G46-CON-HOT-DESERT-CLIMATE": ["2.5.3"],
    "G46-CON-ECOSYSTEMS": ["2.5.4"],
    "G46-CON-DEFORESTATION": ["2.5.5"],
    "G46-CON-CS-RAINFOREST": ["2.5.7"],
    "G46-CON-CS-DESERT": ["2.5.8"],
    # 3a Development
    "G46-CON-DEV-INDICATORS": ["3.1.1"],
    "G46-CON-INEQUALITIES": ["3.1.2"],
    "G46-CON-SECTORS": ["3.1.3"],
    "G46-CON-SECTOR-DEV": ["3.1.4"],
    "G46-CON-GLOBALISATION": ["3.1.5"],
    "G46-CON-CS-TNC": ["3.1.7"],
    # 3b Food production
    "G46-CON-AG-SYSTEM": ["3.2.1"],
    "G46-CON-FOOD-SHORTAGE": ["3.2.2"],
    "G46-CON-CS-FARM": ["3.2.4"],
    "G46-CON-CS-FOOD-SHORT": ["3.2.5"],
    # 3c Industry
    "G46-CON-IND-SYSTEM": ["3.3.1"],
    "G46-CON-IND-LOCATION": ["3.3.2"],
    "G46-CON-CS-IND-ZONE": ["3.3.4"],
    # 3d Tourism
    "G46-CON-TOURISM-GROWTH": ["3.4.1"],
    "G46-CON-TOURISM-EVAL": ["3.4.2"],
    "G46-CON-TOURISM-SUSTAIN": ["3.4.3"],
    "G46-CON-CS-TOURISM": ["3.4.5"],
    # 3e Energy
    "G46-CON-ENERGY-SOURCES": ["3.5.1"],
    "G46-CON-ENERGY-EVAL": ["3.5.2"],
    "G46-CON-CS-ENERGY": ["3.5.4"],
    # 3f Water
    "G46-CON-WATER-SUPPLY": ["3.6.1"],
    "G46-CON-WATER-SHORTAGE": ["3.6.2"],
    "G46-CON-CS-WATER": ["3.6.4"],
    # 3g Environmental risks of economic development
    "G46-CON-ENV-THREATS": ["3.7.1"],
    "G46-CON-SUSTAINABLE-DEV": ["3.7.2"],
    "G46-CON-RESOURCE-CONSERVATION": ["3.7.3"],
    "G46-CON-CS-DEV-RISK": ["3.7.5"],
    # 3g mathematical skills register (3.7.6 umbrella)
    "G46-CON-MATHS-SKILLS": ["3.7.6"],
    "G46-CON-MATHS-ARITHMETIC": ["3.7.7"],
    "G46-CON-MATHS-SCALE": ["3.7.8"],
    "G46-CON-MATHS-AVERAGES": ["3.7.9"],
    "G46-CON-MATHS-NUMBERS": ["3.7.10"],
    "G46-CON-MATHS-NOTATION": ["3.7.11"],
    "G46-CON-MATHS-SIGFIG": ["3.7.12"],
    "G46-CON-MATHS-SCATTER": ["3.7.13"],
    "G46-CON-MATHS-GRAPHS": ["3.7.14"],
    "G46-CON-MATHS-AXES": ["3.7.15"],
    "G46-CON-MATHS-TOOLS": ["3.7.16"],
    "G46-CON-MATHS-CALC": ["3.7.17"],
}

EDGES = [
    # 1a Population dynamics
    ("G46-CON-POP-GROWTH-REASONS", "G46-CON-POP-CHANGE-CAUSES", DD),
    ("G46-CON-POP-CHANGE-CAUSES", "G46-CON-NATURAL-CHANGE-RATES", DD),
    ("G46-CON-NATURAL-CHANGE-RATES", "G46-CON-POP-POLICIES", UWR),
    ("G46-CON-OVER-UNDER-POP", "G46-CON-CS-OVERPOP", DD),
    ("G46-CON-OVER-UNDER-POP", "G46-CON-CS-UNDERPOP", DD),
    ("G46-CON-NATURAL-CHANGE-RATES", "G46-CON-CS-HIGH-GROWTH", UWR),
    ("G46-CON-NATURAL-CHANGE-RATES", "G46-CON-CS-LOW-GROWTH", UWR),
    ("G46-CON-POP-POLICIES", "G46-CON-CS-HIGH-GROWTH", UWR),
    # 1b Migration
    ("G46-CON-POP-CHANGE-CAUSES", "G46-CON-MIGRATION-REASONS", UWR),
    ("G46-CON-MIGRATION-REASONS", "G46-CON-MIGRATION-IMPACTS", DD),
    ("G46-CON-MIGRATION-IMPACTS", "G46-CON-CS-INT-MIGRATION", UWR),
    # 1c Population structure
    ("G46-CON-NATURAL-CHANGE-RATES", "G46-CON-POP-STRUCTURE", UWR),
    ("G46-CON-POP-STRUCTURE", "G46-CON-CS-HIGH-DEP", DD),
    # 1d Density and distribution
    ("G46-CON-MIGRATION-IMPACTS", "G46-CON-DENSITY-DISTRIBUTION", UWR),
    ("G46-CON-DENSITY-DISTRIBUTION", "G46-CON-CS-DENSE", UWR),
    ("G46-CON-DENSITY-DISTRIBUTION", "G46-CON-CS-SPARSE", UWR),
    # 1e Settlement and service provision
    ("G46-CON-SETTLEMENT-SITES", "G46-CON-SETTLEMENT-PATTERNS", UWR),
    ("G46-CON-SETTLEMENT-SITES", "G46-CON-SETTLEMENT-HIERARCHY", UWR),
    ("G46-CON-SETTLEMENT-HIERARCHY", "G46-CON-CS-SETTLEMENT-AREA", UWR),
    ("G46-CON-SETTLEMENT-SITES", "G46-CON-CS-SETTLEMENT-AREA", UWR),
    # 1f Urban settlements
    ("G46-CON-URBAN-LANDUSE", "G46-CON-CS-URBAN-AREA", UWR),
    ("G46-CON-URBAN-PROBLEMS", "G46-CON-CS-URBAN-AREA", UWR),
    ("G46-CON-URBAN-GROWTH-REASONS", "G46-CON-URBAN-LANDUSE", UWR),
    # 1g Urbanisation
    ("G46-CON-URBAN-GROWTH-REASONS", "G46-CON-URBANISATION-IMPACTS", DD),
    ("G46-CON-URBANISATION-IMPACTS", "G46-CON-CS-RAPID-URBAN", UWR),
    ("G46-CON-MIGRATION-REASONS", "G46-CON-URBAN-GROWTH-REASONS", UWR),
    # 2a Earthquakes and volcanoes
    ("G46-CON-QUAKE-VOLCANO-FEATURES", "G46-CON-QUAKE-VOLCANO-DISTRIBUTION", UWR),
    ("G46-CON-QUAKE-VOLCANO-DISTRIBUTION", "G46-CON-QUAKE-CAUSES-EFFECTS", UWR),
    ("G46-CON-QUAKE-CAUSES-EFFECTS", "G46-CON-VOLCANO-HAZ-OPP", DD),
    ("G46-CON-VOLCANO-HAZ-OPP", "G46-CON-QUAKE-VOLCANO-REDUCTION", UWR),
    ("G46-CON-QUAKE-CAUSES-EFFECTS", "G46-CON-CS-QUAKE", UWR),
    ("G46-CON-VOLCANO-HAZ-OPP", "G46-CON-CS-VOLCANO", UWR),
    # 2b Rivers
    ("G46-CON-RIVER-HYDROLOGY", "G46-CON-RIVER-WORK", DD),
    ("G46-CON-RIVER-WORK", "G46-CON-RIVER-LANDFORMS", DD),
    ("G46-CON-RIVER-LANDFORMS", "G46-CON-RIVER-HAZ-OPP", UWR),
    ("G46-CON-RIVER-HAZ-OPP", "G46-CON-RIVER-FLOOD-MGMT", UWR),
    ("G46-CON-RIVER-FLOOD-MGMT", "G46-CON-CS-RIVER", UWR),
    # 2c Coasts
    ("G46-CON-RIVER-WORK", "G46-CON-COAST-WORK", UWR),
    ("G46-CON-COAST-WORK", "G46-CON-COAST-LANDFORMS", DD),
    ("G46-CON-COAST-LANDFORMS", "G46-CON-COAST-HAZ-OPP", UWR),
    ("G46-CON-COAST-HAZ-OPP", "G46-CON-COAST-EROSION-MGMT", UWR),
    ("G46-CON-CORAL-MANGROVE", "G46-CON-CS-COAST", UWR),
    ("G46-CON-COAST-EROSION-MGMT", "G46-CON-CS-COAST", UWR),
    # 2d Weather
    ("G46-CON-WEATHER-DATA", "G46-CON-WEATHER-CALC", DD),
    ("G46-CON-WEATHER-CALC", "G46-CON-WEATHER-GRAPHS", DD),
    # 2e Climate and natural vegetation
    ("G46-CON-WEATHER-GRAPHS", "G46-CON-CLIMATE-CHARS", UWR),
    ("G46-CON-CLIMATE-CHARS", "G46-CON-EQUATORIAL-CLIMATE", DD),
    ("G46-CON-CLIMATE-CHARS", "G46-CON-HOT-DESERT-CLIMATE", DD),
    ("G46-CON-EQUATORIAL-CLIMATE", "G46-CON-ECOSYSTEMS", UWR),
    ("G46-CON-HOT-DESERT-CLIMATE", "G46-CON-ECOSYSTEMS", UWR),
    ("G46-CON-ECOSYSTEMS", "G46-CON-DEFORESTATION", DD),
    ("G46-CON-DEFORESTATION", "G46-CON-CS-RAINFOREST", UWR),
    ("G46-CON-CLIMATE-CHARS", "G46-CON-CS-DESERT", UWR),
    # 3a Development
    ("G46-CON-DEV-INDICATORS", "G46-CON-INEQUALITIES", UWR),
    ("G46-CON-SECTORS", "G46-CON-SECTOR-DEV", DD),
    ("G46-CON-DEV-INDICATORS", "G46-CON-SECTOR-DEV", UWR),
    ("G46-CON-GLOBALISATION", "G46-CON-CS-TNC", UWR),
    ("G46-CON-INEQUALITIES", "G46-CON-FOOD-SHORTAGE", UWR),
    # 3b Food production
    ("G46-CON-SECTORS", "G46-CON-AG-SYSTEM", UWR),
    ("G46-CON-AG-SYSTEM", "G46-CON-CS-FARM", UWR),
    ("G46-CON-FOOD-SHORTAGE", "G46-CON-CS-FOOD-SHORT", UWR),
    # 3c Industry
    ("G46-CON-AG-SYSTEM", "G46-CON-IND-SYSTEM", UWR),
    ("G46-CON-IND-LOCATION", "G46-CON-CS-IND-ZONE", UWR),
    # 3d Tourism
    ("G46-CON-TOURISM-GROWTH", "G46-CON-TOURISM-EVAL", DD),
    ("G46-CON-TOURISM-EVAL", "G46-CON-TOURISM-SUSTAIN", DD),
    ("G46-CON-TOURISM-SUSTAIN", "G46-CON-CS-TOURISM", UWR),
    # 3e Energy
    ("G46-CON-ENERGY-SOURCES", "G46-CON-ENERGY-EVAL", DD),
    ("G46-CON-ENERGY-EVAL", "G46-CON-CS-ENERGY", UWR),
    # 3f Water
    ("G46-CON-RIVER-HYDROLOGY", "G46-CON-WATER-SUPPLY", UWR),
    ("G46-CON-WATER-SUPPLY", "G46-CON-WATER-SHORTAGE", DD),
    ("G46-CON-WATER-SHORTAGE", "G46-CON-CS-WATER", UWR),
    # 3g Environmental risks
    ("G46-CON-ENERGY-SOURCES", "G46-CON-ENV-THREATS", UWR),
    ("G46-CON-DEFORESTATION", "G46-CON-ENV-THREATS", UWR),
    ("G46-CON-ENV-THREATS", "G46-CON-SUSTAINABLE-DEV", DD),
    ("G46-CON-SUSTAINABLE-DEV", "G46-CON-RESOURCE-CONSERVATION", DD),
    ("G46-CON-RESOURCE-CONSERVATION", "G46-CON-CS-DEV-RISK", UWR),
    # 3g mathematical skills register
    ("G46-CON-MATHS-SKILLS", "G46-CON-MATHS-ARITHMETIC", DD),
    ("G46-CON-MATHS-SKILLS", "G46-CON-MATHS-SCALE", DD),
    ("G46-CON-MATHS-SKILLS", "G46-CON-MATHS-SCATTER", DD),
    ("G46-CON-MATHS-SKILLS", "G46-CON-MATHS-TOOLS", DD),
    ("G46-CON-MATHS-ARITHMETIC", "G46-CON-MATHS-AVERAGES", DD),
    ("G46-CON-MATHS-AVERAGES", "G46-CON-MATHS-NUMBERS", UWR),
    ("G46-CON-MATHS-NOTATION", "G46-CON-MATHS-SIGFIG", DD),
    ("G46-CON-MATHS-SCATTER", "G46-CON-MATHS-GRAPHS", UWR),
    ("G46-CON-MATHS-AXES", "G46-CON-MATHS-GRAPHS", DD),
    ("G46-CON-MATHS-SCALE", "G46-CON-MATHS-AXES", UWR),
    ("G46-CON-WEATHER-CALC", "G46-CON-MATHS-AVERAGES", UWR),
    ("G46-CON-WEATHER-GRAPHS", "G46-CON-MATHS-GRAPHS", UWR),
]
