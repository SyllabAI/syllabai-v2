"""CIE combined science chemistry concept lattice — T-KG-PRE-23
(F8 rollout batch twenty-one, the CIE science family, the rollout tail; serves
cie-igcse-science-combined-science-23-chemistry, 82 served points).

AI_SUGGESTED / UNVALIDATED concept web FRESH AUTHORED over the combined
science 2023 chemistry register's own statements. FRESH-AUTHORING DISCLOSED:
the combined-science register is NOT a text mirror of the co-ordinated
register (mapcheck of record in scripts/f8ci_derive.py: only ~20 of 82
combined statements text-match a co-ordinated statement; the rest are
re-authored multi-topic statements), so derivation from the separate-science
master cannot serve this course honestly — the fresh-authoring pattern of the
rollout (history 0470, RS 0490, EM 0680, ICT 0417/4IT1) applies. Concepts
were reasoned statement-by-statement over the served spine; multi-anchoring
mirrors the spec serving the same teaching at two register positions.

The exact reversed list for this course, computed against the combined
spine's own point order via the law of record (scripts/kg_f8al_project.py
export_pairs):
  - CHEM-COMBUSTION [C12.3.3] -> CHEM-CO2-FORMATION [C11.3.1]  (the
    CO2-formation statement names complete combustion as a source before the
    combustion teaching itself is served)
  - CHEM-COMBUSTION [C12.3.3] -> CHEM-FOSSIL-FUELS [C12.1.1]
  - CHEM-COMBUSTION [C12.3.3] -> CHEM-FOSSIL-FUELS [C12.1.2]  (the fossil-fuel
    statements say these fuels produce carbon dioxide on combustion before the
    complete-combustion statement is served)
  - CHEM-SOLUTION-TERMS [C3.2.2] -> CHEM-SEPARATION [C2.3.1]  (crystallisation
    and distillation in the separation-methods statement use the solvent /
    solute / solution vocabulary before the register defines it)
  (each a genuine dependency the spec serves backwards, dropped by the
  calibrated in-order law and counted)

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "CHEM-STATES": ["C1.1.1"],
    "CHEM-STATE-STRUCTURE": ["C1.1.2"],
    "CHEM-STATE-CHANGES": ["C1.1.3"],
    "CHEM-STATE-ENERGY": ["C1.1.4"],
    "CHEM-APPARATUS": ["C2.1.1"],
    "CHEM-CHROMATOGRAPHY": ["C2.2.1", "C2.2.2"],
    "CHEM-SEPARATION": ["C2.3.1"],
    "CHEM-SEPARATION-CHOICE": ["C2.3.2"],
    "CHEM-PHYS-CHEM-CHANGE": ["C3.1.1"],
    "CHEM-ELEM-MIX-COMP": ["C3.2.1"],
    "CHEM-SOLUTION-TERMS": ["C3.2.2"],
    "CHEM-ATOM-STRUCTURE": ["C3.3.1"],
    "CHEM-ELECTRON-SHELLS": ["C3.3.2"],
    "CHEM-SUBATOMIC": ["C3.3.3"],
    "CHEM-PROTON-NUMBER": ["C3.3.4"],
    "CHEM-NUCLEON-NUMBER": ["C3.3.5"],
    "CHEM-PERIODIC-BASIS": ["C3.3.6"],
    "CHEM-IONS-FORM": ["C3.4.1"],
    "CHEM-IONIC-BOND": ["C3.4.2", "C3.4.3"],
    "CHEM-IONIC-LATTICE": ["C3.4.4"],
    "CHEM-COVALENT-SIMPLE": ["C3.5.1", "C3.5.2"],
    "CHEM-COVALENT-COMPLEX": ["C3.5.3"],
    "CHEM-FORMULAE": ["C4.1.1"],
    "CHEM-IONIC-FORMULA": ["C4.1.2"],
    "CHEM-ELECTROLYSIS-DEF": ["C5.1.1"],
    "CHEM-ELECTROLYSIS-TERMS": ["C5.1.2"],
    "CHEM-ELECTROLYSIS-MECH": ["C5.1.3"],
    "CHEM-EXO-ENDO": ["C6.1.1"],
    "CHEM-BOND-ENERGY": ["C6.1.2"],
    "CHEM-ENERGY-DIAGRAMS": ["C6.1.3", "C6.1.4"],
    "CHEM-RATE-EXPERIMENTS": ["C7.1.1"],
    "CHEM-RATE-DATA": ["C7.1.2"],
    "CHEM-RATE-APPARATUS": ["C7.1.3"],
    "CHEM-REDOX-O2": ["C7.2.1"],
    "CHEM-REDOX-AGENTS": ["C7.2.2"],
    "CHEM-PH": ["C8.1.1"],
    "CHEM-ACID-PROPS": ["C8.1.2"],
    "CHEM-SOIL-ACIDITY": ["C8.1.3"],
    "CHEM-SALT-PREP": ["C8.2.1", "C8.2.2"],
    "CHEM-CATION-TESTS": ["C8.3.1"],
    "CHEM-PT-CLASSIFY": ["C9.1.1"],
    "CHEM-PERIOD-TRENDS": ["C9.2.1"],
    "CHEM-GROUP-TRENDS": ["C9.2.2"],
    "CHEM-GROUP-1": ["C9.3.1"],
    "CHEM-GROUP-1-PREDICT": ["C9.3.2"],
    "CHEM-TRANSITION": ["C9.4.1"],
    "CHEM-NOBLE-GASES": ["C9.5.1", "C9.5.2"],
    "CHEM-METALS-PROPS": ["C10.1.1"],
    "CHEM-ALLOYS": ["C10.1.2", "C10.1.3", "C10.1.4"],
    "CHEM-REACTIVITY-SERIES": ["C10.2.1", "C10.2.2"],
    "CHEM-COPPER-EXTRACTION": ["C10.3.1"],
    "CHEM-IRON-EXTRACTION": ["C10.3.2"],
    "CHEM-WATER-TEST": ["C11.1.1"],
    "CHEM-WATER-TREATMENT": ["C11.1.2"],
    "CHEM-CLEAN-AIR": ["C11.2.1"],
    "CHEM-AIR-POLLUTANTS": ["C11.2.2", "C11.2.3"],
    "CHEM-RUSTING": ["C11.2.4", "C11.2.5"],
    "CHEM-CO2-FORMATION": ["C11.3.1"],
    "CHEM-GREENHOUSE": ["C11.3.2", "C11.3.3"],
    "CHEM-FOSSIL-FUELS": ["C12.1.1", "C12.1.2"],
    "CHEM-PETROLEUM": ["C12.1.3", "C12.1.4"],
    "CHEM-HOMOLOGOUS": ["C12.2.1"],
    "CHEM-ALKANES": ["C12.3.1", "C12.3.2"],
    "CHEM-COMBUSTION": ["C12.3.3"],
    "CHEM-ALKENES": ["C12.4.1"],
    "CHEM-CRACKING": ["C12.4.2", "C12.4.3"],
}

EDGES = [
    ("CHEM-STATES", "CHEM-STATE-STRUCTURE", DD),
    ("CHEM-STATE-STRUCTURE", "CHEM-STATE-CHANGES", DD),
    ("CHEM-STATE-CHANGES", "CHEM-STATE-ENERGY", DD),
    ("CHEM-ATOM-STRUCTURE", "CHEM-SUBATOMIC", DD),
    ("CHEM-ATOM-STRUCTURE", "CHEM-ELECTRON-SHELLS", DD),
    ("CHEM-SUBATOMIC", "CHEM-PROTON-NUMBER", DD),
    ("CHEM-SUBATOMIC", "CHEM-NUCLEON-NUMBER", DD),
    ("CHEM-PROTON-NUMBER", "CHEM-PERIODIC-BASIS", DD),
    ("CHEM-ELECTRON-SHELLS", "CHEM-PERIODIC-BASIS", DD),
    ("CHEM-ELECTRON-SHELLS", "CHEM-IONS-FORM", DD),
    ("CHEM-IONS-FORM", "CHEM-IONIC-BOND", DD),
    ("CHEM-IONIC-BOND", "CHEM-IONIC-LATTICE", DD),
    ("CHEM-ELECTRON-SHELLS", "CHEM-COVALENT-SIMPLE", DD),
    ("CHEM-COVALENT-SIMPLE", "CHEM-COVALENT-COMPLEX", DD),
    ("CHEM-FORMULAE", "CHEM-IONIC-FORMULA", DD),
    ("CHEM-IONIC-BOND", "CHEM-IONIC-FORMULA", DD),
    ("CHEM-IONS-FORM", "CHEM-ELECTROLYSIS-DEF", DD),
    ("CHEM-ELECTROLYSIS-DEF", "CHEM-ELECTROLYSIS-TERMS", DD),
    ("CHEM-ELECTROLYSIS-TERMS", "CHEM-ELECTROLYSIS-MECH", DD),
    ("CHEM-EXO-ENDO", "CHEM-BOND-ENERGY", DD),
    ("CHEM-EXO-ENDO", "CHEM-ENERGY-DIAGRAMS", DD),
    ("CHEM-BOND-ENERGY", "CHEM-ENERGY-DIAGRAMS", UWR),
    ("CHEM-RATE-EXPERIMENTS", "CHEM-RATE-DATA", DD),
    ("CHEM-RATE-EXPERIMENTS", "CHEM-RATE-APPARATUS", UWR),
    ("CHEM-APPARATUS", "CHEM-RATE-APPARATUS", UWR),
    ("CHEM-REDOX-O2", "CHEM-REDOX-AGENTS", DD),
    ("CHEM-REDOX-O2", "CHEM-IRON-EXTRACTION", UWR),
    ("CHEM-REDOX-O2", "CHEM-COPPER-EXTRACTION", UWR),
    ("CHEM-PH", "CHEM-ACID-PROPS", DD),
    ("CHEM-ACID-PROPS", "CHEM-SOIL-ACIDITY", UWR),
    ("CHEM-ACID-PROPS", "CHEM-SALT-PREP", DD),
    ("CHEM-SEPARATION", "CHEM-SALT-PREP", DD),
    ("CHEM-SOLUTION-TERMS", "CHEM-SEPARATION", DD),
    ("CHEM-STATE-CHANGES", "CHEM-SEPARATION", UWR),
    ("CHEM-CHROMATOGRAPHY", "CHEM-SEPARATION", UWR),
    ("CHEM-SEPARATION", "CHEM-SEPARATION-CHOICE", DD),
    ("CHEM-SEPARATION", "CHEM-WATER-TREATMENT", DD),
    ("CHEM-ELEM-MIX-COMP", "CHEM-ALLOYS", UWR),
    ("CHEM-ELECTRON-SHELLS", "CHEM-GROUP-TRENDS", DD),
    ("CHEM-PERIODIC-BASIS", "CHEM-PERIOD-TRENDS", DD),
    ("CHEM-PT-CLASSIFY", "CHEM-PERIOD-TRENDS", UWR),
    ("CHEM-PT-CLASSIFY", "CHEM-GROUP-1", UWR),
    ("CHEM-GROUP-TRENDS", "CHEM-GROUP-1", UWR),
    ("CHEM-GROUP-1", "CHEM-GROUP-1-PREDICT", DD),
    ("CHEM-PT-CLASSIFY", "CHEM-TRANSITION", UWR),
    ("CHEM-ELECTRON-SHELLS", "CHEM-NOBLE-GASES", DD),
    ("CHEM-METALS-PROPS", "CHEM-ALLOYS", DD),
    ("CHEM-REACTIVITY-SERIES", "CHEM-COPPER-EXTRACTION", DD),
    ("CHEM-REACTIVITY-SERIES", "CHEM-IRON-EXTRACTION", UWR),
    ("CHEM-CLEAN-AIR", "CHEM-AIR-POLLUTANTS", DD),
    ("CHEM-COMBUSTION", "CHEM-CO2-FORMATION", UWR),
    ("CHEM-COMBUSTION", "CHEM-FOSSIL-FUELS", UWR),
    ("CHEM-CO2-FORMATION", "CHEM-GREENHOUSE", DD),
    ("CHEM-FOSSIL-FUELS", "CHEM-PETROLEUM", DD),
    ("CHEM-COVALENT-SIMPLE", "CHEM-ALKANES", UWR),
    ("CHEM-COVALENT-SIMPLE", "CHEM-ALKENES", UWR),
    ("CHEM-HOMOLOGOUS", "CHEM-ALKANES", DD),
    ("CHEM-HOMOLOGOUS", "CHEM-ALKENES", DD),
    ("CHEM-ALKANES", "CHEM-COMBUSTION", DD),
    ("CHEM-ALKENES", "CHEM-CRACKING", DD),
]
