"""4XSD1 physics modular unit 2 concept lattice — T-KG-PRE-22
(F8 rollout batch twenty, the Edexcel science tranche 17, the double-award
family; serves igcse-science-double-award-modular-24-physics-unit-2, 57 served
points).

AI_SUGGESTED / UNVALIDATED concept web DERIVED for the Edexcel 4XSD1
Double Award physics modular specification, unit 2 sections 6-9 (solids-liquids-gases part 2; magnetism and electromagnetism; radioactivity and particles; astrophysics), anchored 1:1
to the unit's served point ids.
DERIVATION DISCLOSED (two hops, both text-verified): the 2024 modular spec
RE-SECTIONS the 4SD0 linear content into a continuing register — mapcheck of
record for THIS unit: 57 statements matched 1:1 onto the 4SD0 linear register
by exact or >=0.85 similarity text (41 exact + 16 sub-exact, each eyeballed:
6.1->P5.15 (0.992); 6.2->P5.16 (0.979); 6.7->P5.21 (0.984); 6.8->P5.22 (0.974); 8.12->P7.12 (0.982); 8.13->P7.13 (0.991); 8.18->P7.18 (0.997); 8.2->P7.2 (0.989); 8.3->P7.3 (0.993); 8.4->P7.4 (0.996); 8.9->P7.9 (0.988); 9.1->P8.1 (0.996); 9.3->P8.3 (0.989); 9.4->P8.4 (0.997); 9.6->P8.6 (0.960); 9.8->P8.8 (0.932)),
the map is INJECTIVE and covers the unit exactly. The unit lattice is the
4SD0 linear web (f8da_lattice_4sd0phys.py, itself derived from the
separate-science master f8ph_lattice_4ph1.py) with anchors renumbered onto
the unit register; edges kept VERBATIM minus the edges leaving the unit
territory (145 dropped). NO edge re-authored. Concept ids mirror the master
lattice for traceability. The exact reversed list for THIS unit, computed
against the unit's own spine order:
  - S7-FUSION [8.24] -> S7-FUSION-VS-FISSION [8.23]

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "S5-GAS-PRESSURE": ["6.1"],
    "S5-ABSOLUTE-ZERO": ["6.2"],
    "S5-KELVIN": ["6.3"],
    "S5-TEMP-SPEED": ["6.4"],
    "S5-KE-TEMP": ["6.5"],
    "S5-GAS-QUALITATIVE": ["6.6"],
    "S5-PT-EQ": ["6.7"],
    "S5-PV-EQ": ["6.8"],
    "S6-UNITS": ["7.1"],
    "S6-MAGNET-BASIC": ["7.2"],
    "S6-HARD-SOFT": ["7.3"],
    "S6-FIELD-LINE": ["7.4"],
    "S6-INDUCED-MAG": ["7.5"],
    "S6-PRAC-FIELD": ["7.6"],
    "S6-UNIFORM-FIELD": ["7.7"],
    "S6-CURRENT-FIELD": ["7.8"],
    "S6-MOTOR-FORCE": ["7.12"],
    "S6-LEFT-HAND": ["7.13"],
    "S6-FORCE-FACTORS": ["7.14"],
    "S6-INDUCED-VOLTAGE": ["7.15"],
    "S6-GENERATION": ["7.16"],
    "S7-UNITS": ["8.1"],
    "S7-ATOM-STRUCTURE": ["8.2"],
    "S7-NUCLIDE-TERMS": ["8.3"],
    "S7-IONISING-RADIATIONS": ["8.4"],
    "S7-RADIATION-NATURE": ["8.5"],
    "S7-PRAC-PENETRATION": ["8.6"],
    "S7-DECAY-NUMBERS": ["8.7"],
    "S7-NUCLEAR-EQUATIONS": ["8.8"],
    "S7-DETECTORS": ["8.9"],
    "S7-BACKGROUND": ["8.10"],
    "S7-ACTIVITY": ["8.11"],
    "S7-HALF-LIFE-DEF": ["8.12"],
    "S7-HALF-LIFE-CALC": ["8.13"],
    "S7-USES": ["8.14"],
    "S7-CONTAM-IRRAD": ["8.15"],
    "S7-DANGERS": ["8.16"],
    "S7-NUCLEAR-ENERGY": ["8.17"],
    "S7-FISSION": ["8.18"],
    "S7-FISSION-PRODUCTS": ["8.19"],
    "S7-CHAIN-REACTION": ["8.20"],
    "S7-CONTROL-MODERATOR": ["8.21"],
    "S7-SHIELDING": ["8.22"],
    "S7-FUSION-VS-FISSION": ["8.23"],
    "S7-FUSION": ["8.24"],
    "S7-FUSION-STARS": ["8.25"],
    "S7-FUSION-CONDITIONS": ["8.26"],
    "S8-UNITS": ["9.1"],
    "S8-UNIVERSE-SCALE": ["9.2"],
    "S8-G-VARIES": ["9.3"],
    "S8-ORBITS": ["9.4"],
    "S8-ORBIT-TYPES": ["9.5"],
    "S8-ORBITAL-SPEED": ["9.6"],
    "S8-STAR-COLOUR": ["9.7"],
    "S8-STAR-TEMP": ["9.8"],
    "S8-STARS-LIFE": ["9.9"],
    "S8-STARS-LIFE-BIG": ["9.10"],
}

EDGES = [
    ("S5-GAS-PRESSURE", "S5-ABSOLUTE-ZERO", DD),
    ("S5-ABSOLUTE-ZERO", "S5-KELVIN", DD),
    ("S5-GAS-PRESSURE", "S5-TEMP-SPEED", UWR),
    ("S5-TEMP-SPEED", "S5-KE-TEMP", DD),
    ("S5-KELVIN", "S5-KE-TEMP", UWR),
    ("S5-KE-TEMP", "S5-GAS-QUALITATIVE", DD),
    ("S5-GAS-QUALITATIVE", "S5-PT-EQ", DD),
    ("S5-KELVIN", "S5-PT-EQ", UWR),
    ("S5-GAS-QUALITATIVE", "S5-PV-EQ", DD),
    ("S6-UNITS", "S6-MAGNET-BASIC", UWR),
    ("S6-MAGNET-BASIC", "S6-HARD-SOFT", DD),
    ("S6-MAGNET-BASIC", "S6-INDUCED-MAG", DD),
    ("S6-MAGNET-BASIC", "S6-FIELD-LINE", DD),
    ("S6-FIELD-LINE", "S6-PRAC-FIELD", DD),
    ("S6-FIELD-LINE", "S6-UNIFORM-FIELD", DD),
    ("S6-FIELD-LINE", "S6-CURRENT-FIELD", DD),
    ("S6-CURRENT-FIELD", "S6-MOTOR-FORCE", DD),
    ("S6-MOTOR-FORCE", "S6-LEFT-HAND", DD),
    ("S6-MOTOR-FORCE", "S6-FORCE-FACTORS", DD),
    ("S6-FIELD-LINE", "S6-INDUCED-VOLTAGE", DD),
    ("S6-INDUCED-VOLTAGE", "S6-GENERATION", DD),
    ("S7-UNITS", "S7-ACTIVITY", UWR),
    ("S7-ATOM-STRUCTURE", "S7-NUCLIDE-TERMS", DD),
    ("S7-NUCLIDE-TERMS", "S7-IONISING-RADIATIONS", DD),
    ("S7-IONISING-RADIATIONS", "S7-RADIATION-NATURE", DD),
    ("S7-RADIATION-NATURE", "S7-PRAC-PENETRATION", DD),
    ("S7-NUCLIDE-TERMS", "S7-DECAY-NUMBERS", DD),
    ("S7-DECAY-NUMBERS", "S7-NUCLEAR-EQUATIONS", DD),
    ("S7-RADIATION-NATURE", "S7-DETECTORS", UWR),
    ("S7-DETECTORS", "S7-BACKGROUND", UWR),
    ("S7-IONISING-RADIATIONS", "S7-ACTIVITY", DD),
    ("S7-ACTIVITY", "S7-HALF-LIFE-DEF", DD),
    ("S7-HALF-LIFE-DEF", "S7-HALF-LIFE-CALC", DD),
    ("S7-HALF-LIFE-DEF", "S7-USES", UWR),
    ("S7-IONISING-RADIATIONS", "S7-CONTAM-IRRAD", DD),
    ("S7-CONTAM-IRRAD", "S7-DANGERS", DD),
    ("S7-ATOM-STRUCTURE", "S7-NUCLEAR-ENERGY", DD),
    ("S7-NUCLEAR-ENERGY", "S7-FISSION", DD),
    ("S7-FISSION", "S7-FISSION-PRODUCTS", DD),
    ("S7-FISSION-PRODUCTS", "S7-CHAIN-REACTION", DD),
    ("S7-CHAIN-REACTION", "S7-CONTROL-MODERATOR", DD),
    ("S7-DANGERS", "S7-SHIELDING", UWR),
    ("S7-NUCLEAR-ENERGY", "S7-FUSION", DD),
    ("S7-FISSION", "S7-FUSION-VS-FISSION", DD),
    ("S7-FUSION", "S7-FUSION-VS-FISSION", UWR),
    ("S7-FUSION", "S7-FUSION-STARS", DD),
    ("S7-FUSION", "S7-FUSION-CONDITIONS", DD),
    ("S8-UNITS", "S8-ORBITAL-SPEED", UWR),
    ("S8-UNITS", "S8-UNIVERSE-SCALE", UWR),
    ("S8-G-VARIES", "S8-ORBITS", DD),
    ("S8-UNIVERSE-SCALE", "S8-ORBITS", DD),
    ("S8-ORBITS", "S8-ORBIT-TYPES", DD),
    ("S8-ORBIT-TYPES", "S8-ORBITAL-SPEED", DD),
    ("S7-FUSION-STARS", "S8-STAR-COLOUR", UWR),
    ("S8-UNIVERSE-SCALE", "S8-STAR-COLOUR", UWR),
    ("S8-STAR-COLOUR", "S8-STAR-TEMP", DD),
    ("S8-STAR-COLOUR", "S8-STARS-LIFE", UWR),
    ("S7-FUSION-STARS", "S8-STARS-LIFE", UWR),
    ("S8-STARS-LIFE", "S8-STARS-LIFE-BIG", DD),
]
