"""CIE co-ordinated sciences (double award) physics concept lattice — T-KG-PRE-23
(F8 rollout batch twenty-one, the CIE science family, the rollout tail; serves
cie-igcse-science-co-ordinated-sciences-double-award-23-physics, 221 served points).

AI_SUGGESTED / UNVALIDATED concept web DERIVED from the separate-science
0625 2023 master web (scripts/f8ph_lattice_0625.py (F8 batch two, T-KG-PRE-4)), re-anchored onto the co-ordinated
spine's own point ids.

DERIVATION DISCLOSED (law of record: scripts/f8ci_derive.py): the
co-ordinated physics register is a verified TEXT restatement of the
separate-science 2023 register — mapcheck of record: 196 of 221 co-ordinated
points mapped by exact or composite text match (composite = max(seq,
token-containment) >= 0.85 with token-Jaccard >= 0.45; the 96
auto sub-exact pairs, each eyeballed: P1.1.6->1.1.6 (score 1.000, jacc 0.789); P1.2.10->1.2.10 (score 1.000, jacc 1.000); P1.2.11->1.2.11 (score 1.000, jacc 0.667); P1.2.12->1.2.12 (score 1.000, jacc 0.923); P1.2.13->1.2.8 (score 0.967, jacc 0.920); P1.2.5->1.2.5 (score 1.000, jacc 0.909); P1.2.6->1.2.6 (score 1.000, jacc 1.000); P1.2.7->1.2.7 (score 0.905, jacc 0.760); P1.3.1->1.3.1 (score 1.000, jacc 0.700); P1.3.2->1.3.2 (score 0.971, jacc 0.857); P1.3.5->1.3.3 (score 1.000, jacc 0.500); P1.4.3->1.4.3 (score 1.000, jacc 0.818); P1.5.1->1.5.1 (score 1.000, jacc 0.933); P1.5.10->1.5.10 (score 1.000, jacc 0.690); P1.5.3->1.5.6 (score 0.938, jacc 0.882); P1.5.6->1.5.4 (score 0.917, jacc 0.786); P1.5.7->1.5.11 (score 1.000, jacc 0.952); P1.6.1c->1.7.1b (score 0.913, jacc 0.649); P1.6.1d->1.7.1c (score 1.000, jacc 0.840); P1.6.2->1.7.2 (score 1.000, jacc 1.000); P1.6.2a->1.7.2a (score 1.000, jacc 1.000); P1.6.2b->1.7.2b (score 0.970, jacc 0.889); P1.6.3->1.7.3 (score 0.955, jacc 0.778); P1.6.4->1.7.4 (score 1.000, jacc 0.667); P1.6.5->1.7.5a (score 1.000, jacc 0.524); P1.6.7->1.7.7 (score 0.958, jacc 0.852); P2.1.1->2.1.1 (score 0.929, jacc 0.800); P2.1.1a->2.1.1a (score 1.000, jacc 0.964); P2.1.1b->2.1.1b (score 1.000, jacc 1.000); P2.1.2->2.1.2 (score 0.969, jacc 0.920); P2.1.3->2.1.4 (score 0.950, jacc 0.543); P2.1.4->2.1.6 (score 0.955, jacc 0.750); P2.1.5->2.1.5 (score 0.933, jacc 0.824); P2.1.6->2.1.7 (score 1.000, jacc 0.821); P2.2.1a->2.2.2a (score 1.000, jacc 0.750); P2.2.2->2.2.3 (score 1.000, jacc 0.889); P2.2.2a->2.2.2 (score 0.909, jacc 0.476); P2.2.3->2.2.4 (score 1.000, jacc 0.944); P2.3.1a->2.3.1a (score 1.000, jacc 0.933); P2.3.1b->2.3.2a (score 1.000, jacc 0.650); P2.3.1c->2.3.1c (score 0.875, jacc 0.467); P2.3.2->2.3.2b (score 0.963, jacc 0.897); P2.3.2b->2.3.3 (score 0.957, jacc 0.917); P2.3.4->2.3.7 (score 0.925, jacc 0.846); P2.3.5->2.3.8 (score 0.926, jacc 0.846); P3.1.2->3.1.2 (score 0.952, jacc 0.870); P3.1.3->3.1.3 (score 1.000, jacc 0.947); P3.1.4->3.1.7 (score 1.000, jacc 0.760); P3.1.6->3.1.5 (score 0.970, jacc 0.842); P3.1.7->3.1.6 (score 0.966, jacc 0.848); P3.2.1->3.2.1 (score 0.923, jacc 0.750); P3.2.2->3.2.2 (score 0.958, jacc 0.742); P3.2.2a->3.2.1a (score 1.000, jacc 0.812); P3.2.2b->3.2.2b (score 1.000, jacc 1.000); P3.2.2c->3.2.2c (score 0.944, jacc 0.680); P3.2.3b->3.2.3b (score 0.938, jacc 0.714); P3.2.4a->3.2.4b (score 1.000, jacc 0.889); P3.3.1->3.3.1 (score 1.000, jacc 0.680); P3.3.3->3.3.3 (score 0.922, jacc 0.621); P3.3.4->3.3.4 (score 1.000, jacc 0.778); P3.4.10->3.4.11 (score 1.000, jacc 0.950); P3.4.2->3.4.3 (score 0.969, jacc 0.824); P3.4.4->3.4.6 (score 0.882, jacc 0.750); P3.4.6->3.4.8 (score 0.970, jacc 0.727); P4.1.1->4.1.1 (score 1.000, jacc 0.970); P4.1.3->4.1.4 (score 1.000, jacc 1.000); P4.2.4->4.2.4 (score 0.954, jacc 0.875); P4.2.4c->4.2.7a (score 0.926, jacc 0.610); P4.3.1->4.3.1 (score 1.000, jacc 0.689); P4.3.4->4.3.7 (score 0.909, jacc 0.769); P4.3.5->4.3.5 (score 0.957, jacc 0.900); P4.3.6->4.3.6 (score 0.959, jacc 0.900); P4.3.7->4.3.2a (score 0.900, jacc 0.581); P4.4.2->4.4.1 (score 1.000, jacc 1.000); P4.4.3->4.4.3 (score 1.000, jacc 0.679); P4.5.1->4.5.1 (score 0.973, jacc 0.929); P4.5.1a->4.5.1b (score 1.000, jacc 0.870); P4.5.1c->4.5.1c (score 0.964, jacc 0.675); P4.5.1d->4.5.1d (score 0.958, jacc 0.548); P4.5.1e->4.5.1e (score 0.958, jacc 0.889); P4.5.2->4.5.3 (score 1.000, jacc 0.632); P4.5.5->4.5.4a (score 1.000, jacc 1.000); P5.1.4->5.1.4 (score 1.000, jacc 0.833); P5.2.1->5.2.1 (score 1.000, jacc 0.538); P5.2.1a->5.2.2a (score 1.000, jacc 0.912); P5.2.1b->5.2.1b (score 1.000, jacc 1.000); P5.2.1d->5.2.5a (score 0.941, jacc 0.565); P5.2.2->5.2.2 (score 1.000, jacc 1.000); P5.2.2a->5.2.2b (score 0.950, jacc 0.875); P5.2.2b->5.2.1d (score 0.995, jacc 0.882); P5.2.3b->5.2.2c (score 1.000, jacc 0.650); P6.1.1->6.1.1a (score 1.000, jacc 0.828); P6.2.1->6.2.1a (score 0.923, jacc 0.450); P6.2.4->6.1.6 (score 1.000, jacc 0.909); P6.2.6->6.1.4 (score 1.000, jacc 0.926); P6.2.8->6.2.2 (score 1.000, jacc 0.812)),
plus 19 manual overrides with stated evidence (P1.5.1b->1.5.1b (same centre-of-gravity statement; co-ord adds the regularly-shaped-objects position clause); P1.6.1b->1.7.5 (formula-fragment statement (extracted as 'mv 2 gravitational potential energy delta E = mg delta h') — the GPE formula sentence names donor 1.7.5's equation verbatim); P2.1.2a->2.1.2a (substring: sep 2.1.2a = the co-ord statement + the absolute-zero extension clause); P2.3.1->2.3.1 (reworded: co-ord 'Identify and give examples of typical good thermal conductors and bad thermal conductors' vs sep 'Describe experiments to demonstrate the properties of good/bad thermal conductors'); P2.3.2a->2.3.2 (substring: co-ord 'Describe convection in liquids and gases' inside sep 'Explain convection in liquids and gases in terms of density changes and describe experiments to illustrate convection'); P3.2.1b->3.2.1b (reduced: co-ord covers the converging lens only; sep 3.2.1b covers converging and diverging); P3.2.5->3.2.4 (reworded: co-ord 'Use simple diagrams, measurements and calculations for reflection by plane mirrors' (tail fragments of later statements glued) vs sep 'Use simple constructions, measurements and calculations for reflection by plane mirrors'); P3.2.6->3.2.5 (reduced: co-ord TIR using ray diagrams inside sep 'Describe internal reflection and total internal reflection using both experimental and everyday examples'); P3.2.7->3.2.4a (depth-fuller: co-ord defines the critical angle fully; sep 3.2.4a 'State the meaning of critical angle'); P3.2.8->3.2.9 (fragment-strip: co-ord optical-fibre statement (tail fragments of later statements glued) vs sep 3.2.9 'Describe the use of optical fibres, particularly in telecommunications'); P3.4.8->3.4.2 (substring: co-ord adds 'in air as a series of compressions and rarefactions' to sep 3.4.2 'Describe the longitudinal nature of sound waves'); P3.4.9->3.4.10 (same compression/rarefaction statement at different depth: co-ord qualitative pressure wording vs sep 3.4.10 'Describe compression and rarefaction'); P4.2.3->4.2.3 (reworded: co-ord 'Describe electrostatic charging by friction, and simple methods to determine if an object is charged' vs sep 'Describe simple experiments to show the production of electrostatic charges by friction and to show the detection of electrostatic charges'); P4.2.5->4.2.6 (reduced restatement: co-ord 'Distinguish between electrical conductors and insulators and give typical examples' (tail header glued) vs sep 'Recall and use a simple electron model to explain the difference between electrical conductors and insulators and give typical examples'); P4.2.8->4.2.9 (exact-substring: sep 4.2.9 = the co-ord field-direction statement; the co-ord text carries a glued fragment of the next statement's tail ('a point per unit t...') which only depresses Jaccard); P4.5.2a->4.5.2b (substring/split-part: sep 4.5.2b = the co-ord sketch-graphs statement + the relate-position clause + glued fragments); P5.1.5->5.1.5 (same isotope statement: co-ord 'State that an element may have more than one isotope and know that some isotopes are radioactive' vs sep 'Explain what is meant by an isotope and state that an element may have more than one isotope'); P5.2.3a->5.2.4a (partial-embedded: the beta-emission change (neutron -> proton + electron) is embedded in sep 5.2.4a's glued text); P6.2.3a->6.2.4 (same Big-Bang statement family: co-ord fuller 'Know that the Big Bang Theory is supported by many astronomical observations and states that: ...' vs sep 'Know that redshift in the light from distant galaxies is evidence that the Universe is expanding and supports the Big Bang Theory')),
plus 9 disclosed split/collapse claimants (P1.3.3->1.3.3 (sep 1.3.3 = definition+equation AND the equivalence-to-free-fall clause in one statement; the co-ord register splits it (P1.3.5 equivalence auto-claims via containment, this point is the definition half + the 9.8 N/kg clause)); P3.1.8->3.1.7 (sep 3.1.7 lists reflection/refraction/diffraction; the co-ord register splits the list (P3.1.4 auto-claims the composite, this point is the diffraction sentence)); P3.2.4->3.2.2 (the co-ord register carries TWO plane-mirror image statements (P3.2.2 'vertical plane mirror' auto-claims sep 3.2.2; this point is the 'plane mirror ... explain why it is virtual' restatement)); P4.2.3d->4.2.7a (sep 4.2.7a GLUES the I-V behaviour statement and the two resistance-proportionality statements; P4.2.4c auto-claims the composite (the proportionality half), this point is the I-V graph half); P4.3.2->4.3.2a (sep 4.3.2a GLUES the draw-and-interpret-diagrams statement (LED behaviour) and the current/p.d.-sum statement; the co-ord register splits them (P4.3.7 current/p.d.-sum auto-claims via containment in the glued tail, this point is the diagrams half)); P5.2.4a->5.2.5a (sep 5.2.5a GLUES the decay-equations statement and the applications-of-radioactivity statement; the co-ord register splits them (P5.2.1d applications auto-claims via containment in the glued tail, this point is the decay-equations half)); P6.2.1a->6.2.3 (sep 6.2.3 is the single glued life-cycle statement (formation from gas/dust clouds ... stages by mass); the co-ord register splits it: this point (protostar formation) and P6.2.2a (stages by mass)); P6.2.1b->6.2.1a (sep 6.2.1a is a garbled multi-part extraction ('State that: stars Milky Way ... light-years ...'); P6.2.1 auto-claims it, this point is its Milky-Way/galaxies half); P6.2.2a->6.2.3 (same life-cycle split as P6.2.1a — this point is the stages-by-mass half)),
plus 16 points with NO served separate-science counterpart,
left UNANCHORED (P1.2.4; P1.6.6; P2.3.3; P3.2.1a; P4.1.4; P4.2.1b; P4.2.2a; P4.2.2b; P4.3.8; P4.4.1; P4.5.2b; P4.5.2d; P4.5.4; P4.5.6; P5.1.6; P5.1.7).
The lattice is the master web with anchors renumbered through the verified
map; the master's authored edges are kept VERBATIM minus the edges whose
endpoints die in the re-anchoring (31 dropped).
NO edge is re-authored, re-weighted or re-oriented. Concept ids mirror the
master for traceability. Coverage disclosure: 183 of 221 co-ordinated points
carry at least one concept (the master web does not anchor every separate
point either — the inherited coverage pattern); points mapped but not
concept-covered: P1.3.2; P1.3.4; P1.3.5; P1.4.2; P1.4.3; P1.5.3b; P1.6.2b; P4.2.3a; P4.2.3b; P6.2.1; P6.2.2; P6.2.2b; P6.2.3; P6.2.3a; P6.2.4; P6.2.6; P6.2.7; P6.2.8. The exact reversed list for this course, computed
against the co-ordinated spine's own point order via the law of record
(scripts/kg_f8al_project.py export_pairs):
  - 0625-CON-AC-GENERATOR [P4.5.2a] -> 0625-CON-TRANSFORMERS [P4.5.1e]
  - 0625-CON-CIRCUIT-DIAGRAMS [P4.3.2] -> 0625-CON-SERIES-CIRCUITS [P4.3.1a]
  - 0625-CON-CIRCUIT-DIAGRAMS [P4.3.2a] -> 0625-CON-SERIES-CIRCUITS [P4.3.1a]
  - 0625-CON-CIRCUIT-DIAGRAMS [P4.3.7] -> 0625-CON-SERIES-CIRCUITS [P4.3.1a]
  - 0625-CON-CIRCUIT-DIAGRAMS [P4.3.7] -> 0625-CON-SERIES-CIRCUITS [P4.3.3]
  - 0625-CON-CIRCUIT-ENERGY-TRANSFER [P4.2.3c] -> 0625-CON-ELECTRICAL-POWER-IGCSE [P4.2.2d]
  - 0625-CON-CONDUCTION [P2.3.2] -> 0625-CON-CONDUCTION-APPLICATIONS [P2.3.1c]
  - 0625-CON-ELECTRIC-CHARGE [P4.2.2] -> 0625-CON-ELECTRIC-CURRENT-IGCSE [P4.2.1a]
  - 0625-CON-ELECTRIC-CHARGE [P4.2.3] -> 0625-CON-ELECTRIC-CURRENT-IGCSE [P4.2.1a]
  - 0625-CON-ELECTRIC-CHARGE [P4.2.4] -> 0625-CON-ELECTRIC-CURRENT-IGCSE [P4.2.1a]
  - 0625-CON-ELECTRIC-CHARGE [P4.2.6] -> 0625-CON-ELECTRIC-CURRENT-IGCSE [P4.2.1a]
  - 0625-CON-ELECTRIC-CHARGE [P4.2.6] -> 0625-CON-ELECTRIC-CURRENT-IGCSE [P4.2.5]
  - 0625-CON-ELECTRIC-CURRENT-IGCSE [P4.2.5] -> 0625-CON-RESISTANCE-IGCSE [P4.2.1c]
  - 0625-CON-ELECTRIC-CURRENT-IGCSE [P4.2.5] -> 0625-CON-RESISTANCE-IGCSE [P4.2.2c]
  - 0625-CON-ELECTROMAGNETIC-INDUCTION-IGCSE [P4.5.2] -> 0625-CON-AC-GENERATOR [P4.5.1a]
  - 0625-CON-ELECTROMAGNETIC-INDUCTION-IGCSE [P4.5.2] -> 0625-CON-TRANSFORMERS [P4.5.1e]
  - 0625-CON-EM-SPECTRUM [P3.3.5] -> 0625-CON-EM-HAZARDS [P3.3.4]
  - 0625-CON-EM-SPECTRUM [P3.3.5] -> 0625-CON-EM-USES [P3.3.3]
  - 0625-CON-EM-SPECTRUM [P3.3.1] -> 0625-CON-RADIATION [P2.3.1b]
  - 0625-CON-EM-SPECTRUM [P3.3.1] -> 0625-CON-RADIATION [P2.3.2b]
  - 0625-CON-EM-SPECTRUM [P3.3.1] -> 0625-CON-RADIATION [P2.3.4]
  - 0625-CON-EM-SPECTRUM [P3.3.1] -> 0625-CON-RADIATION [P2.3.5]
  - 0625-CON-EM-SPECTRUM [P3.3.2] -> 0625-CON-RADIATION [P2.3.1b]
  - 0625-CON-EM-SPECTRUM [P3.3.2] -> 0625-CON-RADIATION [P2.3.2b]
  - 0625-CON-EM-SPECTRUM [P3.3.2] -> 0625-CON-RADIATION [P2.3.4]
  - 0625-CON-EM-SPECTRUM [P3.3.2] -> 0625-CON-RADIATION [P2.3.5]
  - 0625-CON-EM-SPECTRUM [P3.3.5] -> 0625-CON-RADIATION [P2.3.1b]
  - 0625-CON-EM-SPECTRUM [P3.3.5] -> 0625-CON-RADIATION [P2.3.2b]
  - 0625-CON-EM-SPECTRUM [P3.3.5] -> 0625-CON-RADIATION [P2.3.4]
  - 0625-CON-EM-SPECTRUM [P3.3.5] -> 0625-CON-RADIATION [P2.3.5]
  - 0625-CON-FORCE-ON-CONDUCTOR-IGCSE [P4.5.2c] -> 0625-CON-DC-MOTOR [P4.5.1d]
  - 0625-CON-FRICTION [P1.5.3] -> 0625-CON-FREE-FALL [P1.2.13]
  - 0625-CON-FRICTION [P1.5.4] -> 0625-CON-FREE-FALL [P1.2.13]
  - 0625-CON-FRICTION [P1.5.5] -> 0625-CON-FREE-FALL [P1.2.13]
  - 0625-CON-IONISING-RADIATIONS-IGCSE [P5.2.2a] -> 0625-CON-DECAY-EQUATIONS-IGCSE [P5.2.1d]
  - 0625-CON-IONISING-RADIATIONS-IGCSE [P5.2.3a] -> 0625-CON-DECAY-EQUATIONS-IGCSE [P5.2.1d]
  - 0625-CON-IONISING-RADIATIONS-IGCSE [P5.2.3a] -> 0625-CON-RADIATION-SAFETY [P5.2.2b]
  - 0625-CON-MAGNETIC-MATERIALS [P4.1.7] -> 0625-CON-MAGNETIC-FIELD-LINES [P4.1.5]
  - 0625-CON-MAGNETIC-MATERIALS [P4.1.7] -> 0625-CON-MAGNETIC-FIELD-LINES [P4.1.6]
  - 0625-CON-MELTING-BOILING [P2.2.5] -> 0625-CON-EVAPORATION [P2.2.3]
  - 0625-CON-MELTING-BOILING [P2.2.5] -> 0625-CON-EVAPORATION [P2.2.4]
  - 0625-CON-POTENTIAL-DIFFERENCE-IGCSE [P4.2.3d] -> 0625-CON-RESISTANCE-IGCSE [P4.2.1c]
  - 0625-CON-POTENTIAL-DIFFERENCE-IGCSE [P4.2.3d] -> 0625-CON-RESISTANCE-IGCSE [P4.2.2c]
  - 0625-CON-POTENTIAL-DIFFERENCE-IGCSE [P4.2.4c] -> 0625-CON-RESISTANCE-IGCSE [P4.2.1c]
  - 0625-CON-POTENTIAL-DIFFERENCE-IGCSE [P4.2.4c] -> 0625-CON-RESISTANCE-IGCSE [P4.2.2c]
  - 0625-CON-RADIOACTIVE-DECAY-NATURE [P5.2.1b] -> 0625-CON-BACKGROUND-RADIATION [P5.2.1]
  - 0625-CON-RADIOACTIVE-DECAY-NATURE [P5.2.1b] -> 0625-CON-IONISING-RADIATIONS-IGCSE [P5.2.1a]
  - 0625-CON-REFRACTION [P3.2.2a] -> 0625-CON-DISPERSION [P3.2.1c]
  - 0625-CON-REFRACTION [P3.2.3a] -> 0625-CON-DISPERSION [P3.2.1c]
  - 0625-CON-REFRACTION [P3.2.3a] -> 0625-CON-DISPERSION [P3.2.2c]
  - 0625-CON-REFRACTION [P3.2.2a] -> 0625-CON-LENSES [P3.2.1b]
  - 0625-CON-REFRACTION [P3.2.3a] -> 0625-CON-LENSES [P3.2.1b]
  - 0625-CON-REFRACTION [P3.2.3a] -> 0625-CON-LENSES [P3.2.2b]
  - 0625-CON-SOUND-PRODUCTION [P3.4.8] -> 0625-CON-LOUDNESS-PITCH [P3.4.5]
  - 0625-CON-SOUND-PRODUCTION [P3.4.8] -> 0625-CON-SOUND-MEDIUM-SPEED [P3.4.3]
  - 0625-CON-SOUND-PRODUCTION [P3.4.8] -> 0625-CON-SOUND-MEDIUM-SPEED [P3.4.4]
  - 0625-CON-SOUND-PRODUCTION [P3.4.8] -> 0625-CON-SOUND-RANGE [P3.4.2]
  - 0625-CON-SOUND-PRODUCTION [P3.4.8] -> 0625-CON-SOUND-RANGE [P3.4.7]
  - 0625-CON-SUN-STAR [P6.2.5] -> 0625-CON-SOLAR-SYSTEM [P6.1.1]
  - 0625-CON-TRANSVERSE-LONGITUDINAL [P3.4.9] -> 0625-CON-SOUND-PRODUCTION [P3.4.1]
  - 0625-CON-TRANSVERSE-LONGITUDINAL [P3.4.9] -> 0625-CON-SOUND-PRODUCTION [P3.4.8]
  - 0625-CON-WORK-DONE [P1.6.2a] -> 0625-CON-GPE [P1.6.1b]
  - 0625-CON-WORK-DONE [P1.6.2a] -> 0625-CON-POWER [P1.6.1d]

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    "0625-CON-MEASUREMENT-LENGTH-TIME": ["P1.1.1", "P1.1.2", "P1.1.3"],
    "0625-CON-SCALARS-VECTORS": ["P1.1.4", "P1.1.5", "P1.1.6"],
    "0625-CON-SPEED": ["P1.2.1", "P1.2.2"],
    "0625-CON-VELOCITY": ["P1.2.8"],
    "0625-CON-MOTION-GRAPHS": ["P1.2.3", "P1.2.5", "P1.2.6", "P1.2.7"],
    "0625-CON-ACCELERATION": ["P1.2.10", "P1.2.11", "P1.2.12", "P1.2.9"],
    "0625-CON-FREE-FALL": ["P1.2.13"],
    "0625-CON-MASS-WEIGHT": ["P1.3.1"],
    "0625-CON-DENSITY": ["P1.4.1"],
    "0625-CON-FORCE-EFFECTS": ["P1.5.1"],
    "0625-CON-LOAD-EXTENSION": ["P1.5.8"],
    "0625-CON-RESULTANT-FORCE": ["P1.5.2"],
    "0625-CON-MOMENT-OF-FORCE": ["P1.5.1a", "P1.5.2a"],
    "0625-CON-CENTRE-OF-GRAVITY": ["P1.5.1b", "P1.5.2b"],
    "0625-CON-EQUILIBRIUM": ["P1.5.3a"],
    "0625-CON-NEWTONS-FIRST-LAW": ["P1.5.6"],
    "0625-CON-FRICTION": ["P1.5.3", "P1.5.4", "P1.5.5"],
    "0625-CON-SPRING-CONSTANT": ["P1.5.10", "P1.5.9"],
    "0625-CON-F-MA": ["P1.5.7"],
    "0625-CON-ENERGY-STORES": ["P1.6.1"],
    "0625-CON-WORK-DONE": ["P1.6.1a", "P1.6.2a"],
    "0625-CON-ENERGY-RESOURCES": ["P1.6.1c", "P1.6.4a", "P1.6.5"],
    "0625-CON-POWER": ["P1.6.1d"],
    "0625-CON-ENERGY-TRANSFERS": ["P1.6.2"],
    "0625-CON-ENERGY-CONSERVATION": ["P1.6.3"],
    "0625-CON-EFFICIENCY": ["P1.6.3a", "P1.6.7"],
    "0625-CON-KINETIC-ENERGY": ["P1.6.4"],
    "0625-CON-GPE": ["P1.6.1b"],
    "0625-CON-PRESSURE": ["P1.7.1", "P1.7.2"],
    "0625-CON-STATES-MATTER": ["P2.1.1", "P2.1.1a"],
    "0625-CON-PRESSURE-PARTICLE-MODEL": ["P2.1.1b", "P2.1.6"],
    "0625-CON-CHANGES-OF-STATE": ["P2.1.2", "P2.1.2a"],
    "0625-CON-BROWNIAN-MOTION": ["P2.1.3", "P2.1.5"],
    "0625-CON-PARTICLE-FORCES": ["P2.1.4"],
    "0625-CON-THERMAL-EXPANSION": ["P2.2.1", "P2.2.2a"],
    "0625-CON-MELTING-BOILING": ["P2.2.1a", "P2.2.2", "P2.2.5"],
    "0625-CON-EVAPORATION": ["P2.2.3", "P2.2.4"],
    "0625-CON-CONDUCTION": ["P2.3.1", "P2.3.2"],
    "0625-CON-CONVECTION": ["P2.3.1a", "P2.3.2a"],
    "0625-CON-RADIATION": ["P2.3.1b", "P2.3.2b", "P2.3.4", "P2.3.5"],
    "0625-CON-CONDUCTION-APPLICATIONS": ["P2.3.1c"],
    "0625-CON-WAVE-BASICS": ["P3.1.1", "P3.1.2"],
    "0625-CON-WAVE-FEATURES": ["P3.1.3"],
    "0625-CON-WAVE-SPEED-EQUATION": ["P3.1.5"],
    "0625-CON-TRANSVERSE-LONGITUDINAL": ["P3.1.6", "P3.1.7", "P3.4.9"],
    "0625-CON-WAVE-BEHAVIOUR": ["P3.1.4", "P3.1.8"],
    "0625-CON-DIFFRACTION-GAP": ["P3.1.9"],
    "0625-CON-REFLECTION": ["P3.2.1", "P3.2.2", "P3.2.3", "P3.2.4", "P3.2.5"],
    "0625-CON-REFRACTION": ["P3.2.2a", "P3.2.3a"],
    "0625-CON-LENSES": ["P3.2.1b", "P3.2.2b", "P3.2.3b", "P3.2.4a"],
    "0625-CON-DISPERSION": ["P3.2.1c", "P3.2.2c"],
    "0625-CON-CRITICAL-ANGLE-TIR": ["P3.2.6", "P3.2.7"],
    "0625-CON-OPTICAL-FIBRES": ["P3.2.8"],
    "0625-CON-EM-SPECTRUM": ["P3.3.1", "P3.3.2", "P3.3.5"],
    "0625-CON-EM-USES": ["P3.3.3"],
    "0625-CON-EM-HAZARDS": ["P3.3.4"],
    "0625-CON-SOUND-PRODUCTION": ["P3.4.1", "P3.4.8"],
    "0625-CON-SOUND-RANGE": ["P3.4.2", "P3.4.7"],
    "0625-CON-SOUND-MEDIUM-SPEED": ["P3.4.10", "P3.4.3", "P3.4.4"],
    "0625-CON-LOUDNESS-PITCH": ["P3.4.5"],
    "0625-CON-ECHO": ["P3.4.6"],
    "0625-CON-MAGNETIC-MATERIALS": ["P4.1.1", "P4.1.2", "P4.1.3", "P4.1.7"],
    "0625-CON-MAGNETIC-FIELD-LINES": ["P4.1.5", "P4.1.6"],
    "0625-CON-ELECTRIC-CHARGE": ["P4.2.1", "P4.2.2", "P4.2.3", "P4.2.4", "P4.2.6"],
    "0625-CON-ELECTRIC-CURRENT-IGCSE": ["P4.2.1a", "P4.2.5"],
    "0625-CON-POTENTIAL-DIFFERENCE-IGCSE": ["P4.2.3d", "P4.2.4c"],
    "0625-CON-RESISTANCE-IGCSE": ["P4.2.1c", "P4.2.2c"],
    "0625-CON-CIRCUIT-ENERGY-TRANSFER": ["P4.2.1d", "P4.2.3c"],
    "0625-CON-ELECTRICAL-POWER-IGCSE": ["P4.2.2d"],
    "0625-CON-KILOWATT-HOUR": ["P4.2.4b"],
    "0625-CON-AC-DC": ["P4.2.4a"],
    "0625-CON-ELECTRIC-FIELD-IGCSE": ["P4.2.7", "P4.2.8"],
    "0625-CON-CIRCUIT-DIAGRAMS": ["P4.3.1", "P4.3.2", "P4.3.2a", "P4.3.7"],
    "0625-CON-SERIES-CIRCUITS": ["P4.3.1a", "P4.3.3"],
    "0625-CON-PARALLEL-CIRCUITS": ["P4.3.4", "P4.3.5", "P4.3.6"],
    "0625-CON-MAINS-SAFETY": ["P4.4.2", "P4.4.3", "P4.4.4"],
    "0625-CON-MAGNETIC-FIELD-CURRENT": ["P4.5.1b"],
    "0625-CON-ELECTROMAGNETIC-INDUCTION-IGCSE": ["P4.5.1", "P4.5.2"],
    "0625-CON-AC-GENERATOR": ["P4.5.1a", "P4.5.2a"],
    "0625-CON-FORCE-ON-CONDUCTOR-IGCSE": ["P4.5.1c", "P4.5.2c"],
    "0625-CON-DC-MOTOR": ["P4.5.1d"],
    "0625-CON-TRANSFORMERS": ["P4.5.1e", "P4.5.2e", "P4.5.3", "P4.5.5"],
    "0625-CON-NUCLEAR-MODEL-IGCSE": ["P5.1.1", "P5.1.2"],
    "0625-CON-PROTON-NUCLEON-NUMBER-IGCSE": ["P5.1.3", "P5.1.4"],
    "0625-CON-ISOTOPES-IGCSE": ["P5.1.5"],
    "0625-CON-BACKGROUND-RADIATION": ["P5.2.1", "P5.2.2"],
    "0625-CON-RADIOACTIVE-DECAY-NATURE": ["P5.2.1b"],
    "0625-CON-DETECTION-COUNT-RATE": ["P5.2.3", "P5.2.4"],
    "0625-CON-IONISING-RADIATIONS-IGCSE": ["P5.2.1a", "P5.2.2a", "P5.2.3a"],
    "0625-CON-DECAY-EQUATIONS-IGCSE": ["P5.2.1d", "P5.2.4a"],
    "0625-CON-HALF-LIFE-IGCSE": ["P5.2.1c"],
    "0625-CON-RADIATION-SAFETY": ["P5.2.2b", "P5.2.3b"],
    "0625-CON-SOLAR-SYSTEM": ["P6.1.1"],
    "0625-CON-SUN-STAR": ["P6.2.5"],
}

EDGES = [
    ("0625-CON-SCALARS-VECTORS", "0625-CON-SPEED", DD),
    ("0625-CON-SPEED", "0625-CON-VELOCITY", DD),
    ("0625-CON-SPEED", "0625-CON-MOTION-GRAPHS", DD),
    ("0625-CON-VELOCITY", "0625-CON-ACCELERATION", DD),
    ("0625-CON-MOTION-GRAPHS", "0625-CON-ACCELERATION", UWR),
    ("0625-CON-ACCELERATION", "0625-CON-FREE-FALL", DD),
    ("0625-CON-MEASUREMENT-LENGTH-TIME", "0625-CON-SPEED", UWR),
    ("0625-CON-MEASUREMENT-LENGTH-TIME", "0625-CON-DENSITY", UWR),
    ("0625-CON-SCALARS-VECTORS", "0625-CON-RESULTANT-FORCE", DD),
    ("0625-CON-RESULTANT-FORCE", "0625-CON-NEWTONS-FIRST-LAW", DD),
    ("0625-CON-RESULTANT-FORCE", "0625-CON-F-MA", DD),
    ("0625-CON-ACCELERATION", "0625-CON-F-MA", DD),
    ("0625-CON-FORCE-EFFECTS", "0625-CON-LOAD-EXTENSION", DD),
    ("0625-CON-LOAD-EXTENSION", "0625-CON-SPRING-CONSTANT", DD),
    ("0625-CON-FORCE-EFFECTS", "0625-CON-MOMENT-OF-FORCE", DD),
    ("0625-CON-RESULTANT-FORCE", "0625-CON-EQUILIBRIUM", UWR),
    ("0625-CON-FRICTION", "0625-CON-FREE-FALL", UWR),
    ("0625-CON-FORCE-EFFECTS", "0625-CON-WORK-DONE", UWR),
    ("0625-CON-ENERGY-STORES", "0625-CON-ENERGY-TRANSFERS", DD),
    ("0625-CON-ENERGY-TRANSFERS", "0625-CON-ENERGY-CONSERVATION", DD),
    ("0625-CON-ENERGY-CONSERVATION", "0625-CON-EFFICIENCY", DD),
    ("0625-CON-WORK-DONE", "0625-CON-POWER", DD),
    ("0625-CON-ENERGY-STORES", "0625-CON-ENERGY-RESOURCES", DD),
    ("0625-CON-ENERGY-STORES", "0625-CON-KINETIC-ENERGY", UWR),
    ("0625-CON-MASS-WEIGHT", "0625-CON-GPE", UWR),
    ("0625-CON-WORK-DONE", "0625-CON-GPE", UWR),
    ("0625-CON-FORCE-EFFECTS", "0625-CON-PRESSURE", DD),
    ("0625-CON-STATES-MATTER", "0625-CON-CHANGES-OF-STATE", DD),
    ("0625-CON-STATES-MATTER", "0625-CON-PRESSURE-PARTICLE-MODEL", DD),
    ("0625-CON-STATES-MATTER", "0625-CON-BROWNIAN-MOTION", UWR),
    ("0625-CON-STATES-MATTER", "0625-CON-PARTICLE-FORCES", DD),
    ("0625-CON-STATES-MATTER", "0625-CON-THERMAL-EXPANSION", DD),
    ("0625-CON-CHANGES-OF-STATE", "0625-CON-MELTING-BOILING", DD),
    ("0625-CON-MELTING-BOILING", "0625-CON-EVAPORATION", UWR),
    ("0625-CON-CONDUCTION", "0625-CON-CONDUCTION-APPLICATIONS", UWR),
    ("0625-CON-DENSITY", "0625-CON-CONVECTION", UWR),
    ("0625-CON-EM-SPECTRUM", "0625-CON-RADIATION", UWR),
    ("0625-CON-WAVE-BASICS", "0625-CON-WAVE-FEATURES", DD),
    ("0625-CON-WAVE-FEATURES", "0625-CON-WAVE-SPEED-EQUATION", DD),
    ("0625-CON-WAVE-FEATURES", "0625-CON-TRANSVERSE-LONGITUDINAL", DD),
    ("0625-CON-WAVE-BASICS", "0625-CON-WAVE-BEHAVIOUR", DD),
    ("0625-CON-WAVE-BEHAVIOUR", "0625-CON-DIFFRACTION-GAP", DD),
    ("0625-CON-WAVE-BEHAVIOUR", "0625-CON-REFLECTION", DD),
    ("0625-CON-WAVE-BEHAVIOUR", "0625-CON-REFRACTION", DD),
    ("0625-CON-REFRACTION", "0625-CON-LENSES", DD),
    ("0625-CON-CRITICAL-ANGLE-TIR", "0625-CON-OPTICAL-FIBRES", DD),
    ("0625-CON-REFRACTION", "0625-CON-DISPERSION", DD),
    ("0625-CON-EM-SPECTRUM", "0625-CON-EM-USES", DD),
    ("0625-CON-EM-SPECTRUM", "0625-CON-EM-HAZARDS", DD),
    ("0625-CON-TRANSVERSE-LONGITUDINAL", "0625-CON-SOUND-PRODUCTION", DD),
    ("0625-CON-SOUND-PRODUCTION", "0625-CON-SOUND-RANGE", DD),
    ("0625-CON-SOUND-PRODUCTION", "0625-CON-SOUND-MEDIUM-SPEED", DD),
    ("0625-CON-SOUND-PRODUCTION", "0625-CON-LOUDNESS-PITCH", DD),
    ("0625-CON-REFLECTION", "0625-CON-ECHO", UWR),
    ("0625-CON-MAGNETIC-MATERIALS", "0625-CON-MAGNETIC-FIELD-LINES", DD),
    ("0625-CON-ELECTRIC-CHARGE", "0625-CON-ELECTRIC-CURRENT-IGCSE", DD),
    ("0625-CON-POTENTIAL-DIFFERENCE-IGCSE", "0625-CON-RESISTANCE-IGCSE", DD),
    ("0625-CON-ELECTRIC-CURRENT-IGCSE", "0625-CON-RESISTANCE-IGCSE", DD),
    ("0625-CON-CIRCUIT-ENERGY-TRANSFER", "0625-CON-ELECTRICAL-POWER-IGCSE", DD),
    ("0625-CON-ELECTRICAL-POWER-IGCSE", "0625-CON-KILOWATT-HOUR", DD),
    ("0625-CON-AC-DC", "0625-CON-KILOWATT-HOUR", UWR),
    ("0625-CON-ELECTRIC-CHARGE", "0625-CON-ELECTRIC-FIELD-IGCSE", DD),
    ("0625-CON-CIRCUIT-DIAGRAMS", "0625-CON-SERIES-CIRCUITS", DD),
    ("0625-CON-RESISTANCE-IGCSE", "0625-CON-SERIES-CIRCUITS", DD),
    ("0625-CON-SERIES-CIRCUITS", "0625-CON-PARALLEL-CIRCUITS", UWR),
    ("0625-CON-PARALLEL-CIRCUITS", "0625-CON-MAINS-SAFETY", UWR),
    ("0625-CON-ELECTRIC-CURRENT-IGCSE", "0625-CON-MAGNETIC-FIELD-CURRENT", DD),
    ("0625-CON-MAGNETIC-FIELD-LINES", "0625-CON-MAGNETIC-FIELD-CURRENT", DD),
    ("0625-CON-MAGNETIC-FIELD-CURRENT", "0625-CON-FORCE-ON-CONDUCTOR-IGCSE", DD),
    ("0625-CON-FORCE-ON-CONDUCTOR-IGCSE", "0625-CON-DC-MOTOR", DD),
    ("0625-CON-MAGNETIC-FIELD-LINES", "0625-CON-ELECTROMAGNETIC-INDUCTION-IGCSE", DD),
    ("0625-CON-ELECTROMAGNETIC-INDUCTION-IGCSE", "0625-CON-AC-GENERATOR", DD),
    ("0625-CON-AC-DC", "0625-CON-AC-GENERATOR", UWR),
    ("0625-CON-ELECTROMAGNETIC-INDUCTION-IGCSE", "0625-CON-TRANSFORMERS", DD),
    ("0625-CON-AC-DC", "0625-CON-TRANSFORMERS", UWR),
    ("0625-CON-AC-GENERATOR", "0625-CON-TRANSFORMERS", UWR),
    ("0625-CON-NUCLEAR-MODEL-IGCSE", "0625-CON-PROTON-NUCLEON-NUMBER-IGCSE", DD),
    ("0625-CON-PROTON-NUCLEON-NUMBER-IGCSE", "0625-CON-ISOTOPES-IGCSE", DD),
    ("0625-CON-ISOTOPES-IGCSE", "0625-CON-RADIOACTIVE-DECAY-NATURE", UWR),
    ("0625-CON-RADIOACTIVE-DECAY-NATURE", "0625-CON-IONISING-RADIATIONS-IGCSE", DD),
    ("0625-CON-RADIOACTIVE-DECAY-NATURE", "0625-CON-HALF-LIFE-IGCSE", DD),
    ("0625-CON-IONISING-RADIATIONS-IGCSE", "0625-CON-DECAY-EQUATIONS-IGCSE", DD),
    ("0625-CON-IONISING-RADIATIONS-IGCSE", "0625-CON-RADIATION-SAFETY", DD),
    ("0625-CON-BACKGROUND-RADIATION", "0625-CON-DETECTION-COUNT-RATE", DD),
    ("0625-CON-RADIOACTIVE-DECAY-NATURE", "0625-CON-BACKGROUND-RADIATION", UWR),
    ("0625-CON-SUN-STAR", "0625-CON-SOLAR-SYSTEM", UWR),
]
