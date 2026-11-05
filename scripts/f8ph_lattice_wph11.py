"""YPH11 Edexcel IAL Physics concept lattice — T-KG-PRE-19
(F8 rollout batch seventeen, the Edexcel science tranche 14, the physics
family; serves ial-physics-19, 171 served points — the full International
AS/A Level physics register, mechanics and materials through astrophysics).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel International Advanced Level Physics specification (WPH11-WPH16
2018 register), anchored to the served spine's point ids 1-171. The
spine's point text is the PDF-register render, so four equation-bearing
statement pairs whose text fragments split across two served points are
bound as single two-anchor concepts (resistance defined + the ohmic
condition 65/66; uniform-field E=V/d pair 96/97; gravitational potential
pair 157/158; standard-candle luminosity/intensity pair 164/166) — every
one of the 171 points is anchored, none excluded. The lattice runs the
register's fourteen territories in served order — kinematics, materials,
waves, dc electricity, further mechanics, circular motion, electric
fields and capacitors, magnetic fields, particle physics, thermal,
binding energy, radiation, simple harmonic motion, gravitation and
astrophysics — definitions before relationships, qualitative before
quantitative, core practicals bound to the relationship they measure.
The web carries the spec's real cross-territory dependencies as edges
(energy concepts -> intensity, e.m.f. -> induced e.m.f., electric-field
definition -> gravitational-field definition, Coulomb -> Newton's
gravitation, de Broglie -> why particle physics needs high energies,
mass-energy -> binding energy, conservation laws -> particle tracks and
equations, angular velocity -> SHM equations, centripetal force ->
orbits, Stefan/Wien -> the HR diagram). Four authored edges sit in
knowingly served-order-reversed territory (each a genuine dependency
the register serves backwards; dropped outright by the calibrated
in-order law — four served-order pairs counted and disclosed in the
receipt, the law working as designed):
  - W8-FARADAY -> W8-EMF-MOTION and W8-FARADAY -> W8-EMF-TRANSFORMER:
    Faraday's law (110) is what determines the magnitude of the induced
    e.m.f. whose factors 108/109 state qualitatively, served before it;
  - W10-KINETIC-THEORY -> W10-ABSOLUTE-ZERO: the kinetic-theory equation
    (132) is what makes KE proportional to absolute temperature precise
    (129), served before it;
  - W12-FREE-FORCED -> W12-RESONANCE: resonance (148) is the
    forced-oscillation-at-natural-frequency phenomenon (151), served
    before the free/forced distinction.
  Deliberately NOT authored where the direction is ambiguous: the suvat
  equations (1) and the vector definitions (4) carry no edge between
  them (the register teaches suvat first and the suvat equations do not
  need vector decomposition), and the background-radiation sources (137)
  root on the nuclear-model register (111) and chain in-order (137 ->
  138) rather than hanging off the spontaneous-decay register (141,
  served after both).

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # Mechanics (1-22)
    "W1-SUVAT": ["1"],
    "W1-GRAPHS": ["2"],
    "W1-GRAPH-DERIV": ["3"],
    "W1-VECTORS": ["4"],
    "W1-VECTOR-RESOLVE": ["5"],
    "W1-VECTOR-RESULTANT": ["6"],
    "W1-PROJECTILE": ["7"],
    "W1-FREE-BODY": ["8"],
    "W1-N2": ["9"],
    "W1-G-WEIGHT": ["10"],
    "W1-PRAC1": ["11"],
    "W1-N3": ["12"],
    "W1-MOMENTUM": ["13"],
    "W1-MOM-CONSERV": ["14"],
    "W1-MOMENT": ["15"],
    "W1-COG-MOMENTS": ["16"],
    "W1-WORK": ["17"],
    "W1-KE": ["18"],
    "W1-GPE": ["19"],
    "W1-ENERGY-CONSERV": ["20"],
    "W1-POWER": ["21"],
    "W1-EFFICIENCY": ["22"],
    # Materials (23-32)
    "W2-DENSITY": ["23"],
    "W2-UPTHRUST": ["24"],
    "W2-STOKES": ["25"],
    "W2-PRAC2": ["26"],
    "W2-HOOKE": ["27"],
    "W2-STRESS-STRAIN": ["28"],
    "W2-FE-GRAPHS": ["29"],
    "W2-SS-GRAPHS": ["30"],
    "W2-PRAC3": ["31"],
    "W2-STRAIN-ENERGY": ["32"],
    # Waves (33-63)
    "W3-DEFS": ["33"],
    "W3-VFL": ["34"],
    "W3-LONGITUDINAL": ["35"],
    "W3-TRANSVERSE": ["36"],
    "W3-GRAPHS": ["37"],
    "W3-PRAC4": ["38"],
    "W3-SUPERPOSITION": ["39"],
    "W3-PHASE-PATH": ["40"],
    "W3-STANDING": ["41"],
    "W3-STRING-SPEED": ["42"],
    "W3-PRAC5": ["43"],
    "W3-INTENSITY": ["44"],
    "W3-REFRACTION-N12": ["45"],
    "W3-CRITICAL": ["46"],
    "W3-TIR": ["47"],
    "W3-RI-MEASURE": ["48"],
    "W3-POLARISATION": ["49"],
    "W3-DIFFRACTION": ["50"],
    "W3-GRATING": ["51"],
    "W3-PRAC6": ["52"],
    "W3-ELECTRON-DIFFRACTION": ["53"],
    "W3-DE-BROGLIE": ["54"],
    "W3-TRANSMIT-REFLECT": ["55"],
    "W3-PULSE-ECHO": ["56"],
    "W3-PHOTON-WAVE": ["57"],
    "W3-PHOTON-E": ["58"],
    "W3-PHOTOELECTRIC": ["59"],
    "W3-WORK-FUNCTION": ["60"],
    "W3-EV": ["61"],
    "W3-PHOTOELECTRIC-EVIDENCE": ["62"],
    "W3-LINE-SPECTRA": ["63"],
    # dc electricity (64-80; 65/66 bound as one concept)
    "W4-CURRENT": ["64"],
    "W4-RESISTANCE": ["65", "66"],
    "W4-CONSERVE": ["67"],
    "W4-RESISTORS": ["68"],
    "W4-POWER": ["69"],
    "W4-IV-GRAPHS": ["70"],
    "W4-RESISTIVITY": ["71"],
    "W4-PRAC7": ["72"],
    "W4-NQVA": ["73"],
    "W4-POT-WIRE": ["74"],
    "W4-POT-DIVIDER": ["75"],
    "W4-POT-DIVIDER-VAR": ["76"],
    "W4-EMF": ["77"],
    "W4-PRAC8": ["78"],
    "W4-TEMP-RES": ["79"],
    "W4-ILLUM-RES": ["80"],
    # Further mechanics (81-86)
    "W5-IMPULSE": ["81"],
    "W5-PRAC9": ["82"],
    "W5-2D-MOMENTUM": ["83"],
    "W5-PRAC10": ["84"],
    "W5-ELASTIC-INELASTIC": ["85"],
    "W5-EK-P2": ["86"],
    # Circular motion (87-91)
    "W6-ANGULAR": ["87"],
    "W6-ANGULAR-VEL": ["88"],
    "W6-CENTRIPETAL-A": ["89"],
    "W6-CENTRIPETAL-F": ["90"],
    "W6-CENTRIPETAL-EQ": ["91"],
    # Electric fields and capacitors (92-104; 96/97 bound as one concept)
    "W7-EFIELD-DEF": ["92"],
    "W7-EFIELD-EQ": ["93"],
    "W7-COULOMB": ["94"],
    "W7-POINT-FIELD": ["95"],
    "W7-POTENTIAL-GRAD": ["96", "97"],
    "W7-RADIAL-POT": ["98"],
    "W7-FIELD-LINES": ["99"],
    "W7-CAPACITANCE": ["100"],
    "W7-CAP-ENERGY": ["101"],
    "W7-RC-CURVES": ["102"],
    "W7-PRAC11": ["103"],
    "W7-RC-EXPONENTIAL": ["104"],
    # Magnetic fields (105-110)
    "W8-FLUX": ["105"],
    "W8-FBQ": ["106"],
    "W8-FBI": ["107"],
    "W8-EMF-MOTION": ["108"],
    "W8-EMF-TRANSFORMER": ["109"],
    "W8-FARADAY": ["110"],
    # Particle physics (111-124)
    "W9-NUCLEON": ["111"],
    "W9-SCATTERING": ["112"],
    "W9-THERMIONIC": ["113"],
    "W9-ACCELERATORS": ["114"],
    "W9-RADIUS-TRACK": ["115"],
    "W9-CONSERVE-TRACKS": ["116"],
    "W9-HIGH-ENERGY": ["117"],
    "W9-MASS-ENERGY": ["118"],
    "W9-UNITS": ["119"],
    "W9-RELATIVISTIC": ["120"],
    "W9-QUARK-LEPTON": ["121"],
    "W9-ANTIPARTICLE": ["122"],
    "W9-CONSERVATION-LAWS": ["123"],
    "W9-PARTICLE-EQ": ["124"],
    # Thermal (125-132)
    "W10-SLH": ["125"],
    "W10-PRAC12": ["126"],
    "W10-PRAC13": ["127"],
    "W10-INTERNAL-ENERGY": ["128"],
    "W10-ABSOLUTE-ZERO": ["129"],
    "W10-IDEAL-GAS": ["130"],
    "W10-PRAC14": ["131"],
    "W10-KINETIC-THEORY": ["132"],
    # Binding energy (133-136)
    "W11-BINDING": ["133"],
    "W11-AMU": ["134"],
    "W11-FUSION-FISSION-CURVE": ["135"],
    "W11-FUSION-MECH": ["136"],
    # Radiation (137-142)
    "W11-BACKGROUND": ["137"],
    "W11-RADIATION-COMPARE": ["138"],
    "W11-NUCLEAR-EQ": ["139"],
    "W11-PRAC15": ["140"],
    "W11-SPONTANEOUS": ["141"],
    "W11-HALF-LIFE": ["142"],
    # Simple harmonic motion (143-153)
    "W12-SHM-COND": ["143"],
    "W12-SHM-EQ": ["144"],
    "W12-SHM-PERIODS": ["145"],
    "W12-SHM-XT": ["146"],
    "W12-SHM-VT": ["147"],
    "W12-RESONANCE": ["148"],
    "W12-PRAC16": ["149"],
    "W12-DAMPED-ENERGY": ["150"],
    "W12-FREE-FORCED": ["151"],
    "W12-FORCED-AMPLITUDE": ["152"],
    "W12-DAMPING-PLASTIC": ["153"],
    # Gravitation (154-160; 157/158 bound as one concept)
    "W13-GFIELD": ["154"],
    "W13-NEWTON-G": ["155"],
    "W13-G-POINT": ["156"],
    "W13-GRAV-POT": ["157", "158"],
    "W13-EG-COMPARE": ["159"],
    "W13-ORBITS": ["160"],
    # Astrophysics (161-171; 164/166 bound as one concept)
    "W14-BLACKBODY": ["161"],
    "W14-STEFAN": ["162"],
    "W14-WIEN": ["163"],
    "W14-STANDARD-CANDLE": ["164", "166"],
    "W14-PARALLAX": ["165"],
    "W14-HR": ["167"],
    "W14-HR-LIFE": ["168"],
    "W14-DOPPLER": ["169"],
    "W14-REDSHIFT": ["170"],
    "W14-HUBBLE": ["171"],
}

EDGES = [
    # --- Mechanics: kinematics ---
    ("W1-SUVAT", "W1-GRAPHS", UWR),
    ("W1-GRAPHS", "W1-GRAPH-DERIV", DD),
    ("W1-VECTORS", "W1-VECTOR-RESOLVE", DD),
    ("W1-VECTOR-RESOLVE", "W1-VECTOR-RESULTANT", DD),
    ("W1-VECTOR-RESOLVE", "W1-PROJECTILE", DD),
    ("W1-GRAPHS", "W1-PROJECTILE", UWR),
    ("W1-FREE-BODY", "W1-N2", DD),
    ("W1-VECTORS", "W1-FREE-BODY", UWR),
    ("W1-N2", "W1-G-WEIGHT", UWR),
    ("W1-GRAPHS", "W1-PRAC1", UWR),
    ("W1-SUVAT", "W1-PRAC1", UWR),
    ("W1-FREE-BODY", "W1-N3", DD),
    ("W1-MOMENTUM", "W1-MOM-CONSERV", DD),
    ("W1-N3", "W1-MOM-CONSERV", DD),
    ("W1-VECTORS", "W1-MOMENTUM", UWR),
    ("W1-MOMENT", "W1-COG-MOMENTS", DD),
    ("W1-FREE-BODY", "W1-COG-MOMENTS", UWR),
    ("W1-WORK", "W1-KE", DD),
    ("W1-WORK", "W1-GPE", DD),
    ("W1-KE", "W1-ENERGY-CONSERV", DD),
    ("W1-GPE", "W1-ENERGY-CONSERV", DD),
    ("W1-WORK", "W1-ENERGY-CONSERV", DD),
    ("W1-POWER", "W1-EFFICIENCY", UWR),
    ("W1-ENERGY-CONSERV", "W1-EFFICIENCY", DD),
    ("W1-WORK", "W1-POWER", DD),
    # --- Materials ---
    ("W2-DENSITY", "W2-UPTHRUST", DD),
    ("W2-UPTHRUST", "W2-STOKES", UWR),
    ("W2-STOKES", "W2-PRAC2", DD),
    ("W1-FREE-BODY", "W2-HOOKE", UWR),
    ("W1-FREE-BODY", "W2-STRESS-STRAIN", UWR),
    ("W2-HOOKE", "W2-STRESS-STRAIN", UWR),
    ("W2-STRESS-STRAIN", "W2-FE-GRAPHS", DD),
    ("W2-FE-GRAPHS", "W2-SS-GRAPHS", DD),
    ("W2-SS-GRAPHS", "W2-PRAC3", DD),
    ("W2-FE-GRAPHS", "W2-STRAIN-ENERGY", DD),
    ("W2-HOOKE", "W2-STRAIN-ENERGY", DD),
    # --- Waves: definitions and behaviour ---
    ("W3-DEFS", "W3-VFL", DD),
    ("W3-DEFS", "W3-LONGITUDINAL", UWR),
    ("W3-DEFS", "W3-TRANSVERSE", UWR),
    ("W3-TRANSVERSE", "W3-GRAPHS", DD),
    ("W3-LONGITUDINAL", "W3-GRAPHS", DD),
    ("W3-VFL", "W3-PRAC4", UWR),
    ("W3-DEFS", "W3-SUPERPOSITION", DD),
    ("W3-SUPERPOSITION", "W3-PHASE-PATH", DD),
    ("W3-SUPERPOSITION", "W3-STANDING", DD),
    ("W3-STANDING", "W3-STRING-SPEED", DD),
    ("W3-STRING-SPEED", "W3-PRAC5", DD),
    ("W1-POWER", "W3-INTENSITY", DD),
    ("W3-REFRACTION-N12", "W3-CRITICAL", DD),
    ("W3-CRITICAL", "W3-TIR", DD),
    ("W3-REFRACTION-N12", "W3-RI-MEASURE", DD),
    ("W3-TRANSVERSE", "W3-POLARISATION", DD),
    ("W3-DEFS", "W3-DIFFRACTION", DD),
    ("W3-DIFFRACTION", "W3-GRATING", DD),
    ("W3-GRATING", "W3-PRAC6", DD),
    ("W3-DIFFRACTION", "W3-ELECTRON-DIFFRACTION", DD),
    ("W3-ELECTRON-DIFFRACTION", "W3-DE-BROGLIE", DD),
    ("W3-VFL", "W3-TRANSMIT-REFLECT", UWR),
    ("W3-TRANSMIT-REFLECT", "W3-PULSE-ECHO", DD),
    # --- Waves: quantum ---
    ("W3-DEFS", "W3-PHOTON-WAVE", UWR),
    ("W3-PHOTON-WAVE", "W3-PHOTON-E", DD),
    ("W3-PHOTON-E", "W3-PHOTOELECTRIC", DD),
    ("W3-PHOTOELECTRIC", "W3-WORK-FUNCTION", DD),
    ("W3-PHOTON-E", "W3-EV", UWR),
    ("W3-WORK-FUNCTION", "W3-PHOTOELECTRIC-EVIDENCE", DD),
    ("W3-PHOTON-E", "W3-LINE-SPECTRA", DD),
    # --- dc electricity ---
    ("W4-CURRENT", "W4-RESISTANCE", DD),
    ("W4-CURRENT", "W4-CONSERVE", DD),
    ("W4-CONSERVE", "W4-RESISTORS", DD),
    ("W4-RESISTANCE", "W4-RESISTORS", UWR),
    ("W4-RESISTORS", "W4-POWER", DD),
    ("W4-RESISTANCE", "W4-IV-GRAPHS", DD),
    ("W4-RESISTANCE", "W4-RESISTIVITY", DD),
    ("W4-RESISTIVITY", "W4-PRAC7", DD),
    ("W4-RESISTIVITY", "W4-NQVA", DD),
    ("W4-RESISTIVITY", "W4-POT-WIRE", DD),
    ("W4-POT-WIRE", "W4-POT-DIVIDER", DD),
    ("W4-POT-DIVIDER", "W4-POT-DIVIDER-VAR", DD),
    ("W4-RESISTORS", "W4-EMF", UWR),
    ("W4-EMF", "W4-PRAC8", DD),
    ("W4-NQVA", "W4-TEMP-RES", DD),
    ("W4-NQVA", "W4-ILLUM-RES", DD),
    # --- Further mechanics ---
    ("W1-MOMENTUM", "W5-IMPULSE", DD),
    ("W1-N2", "W5-IMPULSE", DD),
    ("W5-IMPULSE", "W5-PRAC9", DD),
    ("W1-VECTOR-RESOLVE", "W5-2D-MOMENTUM", DD),
    ("W1-MOM-CONSERV", "W5-2D-MOMENTUM", DD),
    ("W5-2D-MOMENTUM", "W5-PRAC10", DD),
    ("W5-2D-MOMENTUM", "W5-ELASTIC-INELASTIC", DD),
    ("W1-KE", "W5-ELASTIC-INELASTIC", UWR),
    ("W1-MOMENTUM", "W5-EK-P2", DD),
    ("W1-KE", "W5-EK-P2", DD),
    ("W5-ELASTIC-INELASTIC", "W5-EK-P2", UWR),
    # --- Circular motion ---
    ("W6-ANGULAR", "W6-ANGULAR-VEL", DD),
    ("W6-ANGULAR-VEL", "W6-CENTRIPETAL-A", DD),
    ("W1-VECTORS", "W6-CENTRIPETAL-A", UWR),
    ("W1-N2", "W6-CENTRIPETAL-F", DD),
    ("W6-CENTRIPETAL-A", "W6-CENTRIPETAL-F", DD),
    ("W6-CENTRIPETAL-F", "W6-CENTRIPETAL-EQ", DD),
    # --- Electric fields and capacitors ---
    ("W7-EFIELD-DEF", "W7-EFIELD-EQ", DD),
    ("W7-EFIELD-DEF", "W7-COULOMB", DD),
    ("W7-COULOMB", "W7-POINT-FIELD", DD),
    ("W7-POINT-FIELD", "W7-POTENTIAL-GRAD", DD),
    ("W7-EFIELD-EQ", "W7-POTENTIAL-GRAD", DD),
    ("W7-POINT-FIELD", "W7-RADIAL-POT", DD),
    ("W7-EFIELD-DEF", "W7-FIELD-LINES", DD),
    ("W7-POTENTIAL-GRAD", "W7-CAPACITANCE", DD),
    ("W7-CAPACITANCE", "W7-CAP-ENERGY", DD),
    ("W7-CAP-ENERGY", "W7-RC-CURVES", UWR),
    ("W4-RESISTANCE", "W7-RC-CURVES", DD),
    ("W7-RC-CURVES", "W7-PRAC11", DD),
    ("W7-RC-CURVES", "W7-RC-EXPONENTIAL", DD),
    # --- Magnetic fields ---
    ("W8-FLUX", "W8-FBQ", DD),
    ("W8-FLUX", "W8-FBI", DD),
    ("W8-FLUX", "W8-EMF-MOTION", DD),
    ("W8-EMF-MOTION", "W8-EMF-TRANSFORMER", DD),
    ("W8-FARADAY", "W8-EMF-MOTION", DD),  # reversed (110 after 108) — disclosed
    ("W8-FARADAY", "W8-EMF-TRANSFORMER", DD),  # reversed (110 after 109) — disclosed
    ("W4-EMF", "W8-EMF-MOTION", UWR),
    # --- Particle physics ---
    ("W9-NUCLEON", "W9-SCATTERING", DD),
    ("W7-EFIELD-DEF", "W9-THERMIONIC", UWR),
    ("W9-THERMIONIC", "W9-ACCELERATORS", DD),
    ("W8-FBQ", "W9-ACCELERATORS", UWR),
    ("W8-FBQ", "W9-RADIUS-TRACK", DD),
    ("W9-ACCELERATORS", "W9-CONSERVE-TRACKS", UWR),
    ("W1-MOM-CONSERV", "W9-CONSERVE-TRACKS", DD),
    ("W3-DE-BROGLIE", "W9-HIGH-ENERGY", DD),
    ("W9-HIGH-ENERGY", "W9-MASS-ENERGY", UWR),
    ("W9-MASS-ENERGY", "W9-UNITS", DD),
    ("W9-UNITS", "W9-RELATIVISTIC", UWR),
    ("W9-SCATTERING", "W9-QUARK-LEPTON", DD),
    ("W9-CONSERVE-TRACKS", "W9-QUARK-LEPTON", UWR),
    ("W9-QUARK-LEPTON", "W9-ANTIPARTICLE", DD),
    ("W9-ANTIPARTICLE", "W9-CONSERVATION-LAWS", DD),
    ("W1-MOM-CONSERV", "W9-CONSERVATION-LAWS", UWR),
    ("W9-CONSERVATION-LAWS", "W9-PARTICLE-EQ", DD),
    # --- Thermal ---
    ("W10-SLH", "W10-PRAC12", UWR),
    ("W10-SLH", "W10-PRAC13", DD),
    ("W10-INTERNAL-ENERGY", "W10-ABSOLUTE-ZERO", DD),
    ("W10-INTERNAL-ENERGY", "W10-IDEAL-GAS", DD),
    ("W10-IDEAL-GAS", "W10-PRAC14", DD),
    ("W10-IDEAL-GAS", "W10-KINETIC-THEORY", DD),
    ("W10-KINETIC-THEORY", "W10-ABSOLUTE-ZERO", DD),  # reversed (132 after 129) — disclosed
    # --- Binding energy ---
    ("W9-MASS-ENERGY", "W11-BINDING", DD),
    ("W11-BINDING", "W11-AMU", UWR),
    ("W11-BINDING", "W11-FUSION-FISSION-CURVE", DD),
    ("W11-FUSION-FISSION-CURVE", "W11-FUSION-MECH", DD),
    # --- Radiation ---
    ("W9-NUCLEON", "W11-SPONTANEOUS", UWR),
    ("W9-NUCLEON", "W11-BACKGROUND", UWR),
    ("W11-BACKGROUND", "W11-RADIATION-COMPARE", DD),
    ("W11-RADIATION-COMPARE", "W11-NUCLEAR-EQ", DD),
    ("W11-RADIATION-COMPARE", "W11-PRAC15", DD),
    ("W11-SPONTANEOUS", "W11-HALF-LIFE", DD),
    # --- Simple harmonic motion ---
    ("W1-N2", "W12-SHM-COND", DD),
    ("W12-SHM-COND", "W12-SHM-EQ", DD),
    ("W6-ANGULAR-VEL", "W12-SHM-EQ", UWR),
    ("W12-SHM-EQ", "W12-SHM-PERIODS", DD),
    ("W12-SHM-EQ", "W12-SHM-XT", DD),
    ("W12-SHM-XT", "W12-SHM-VT", DD),
    ("W12-SHM-PERIODS", "W12-RESONANCE", UWR),
    ("W12-RESONANCE", "W12-PRAC16", DD),
    ("W12-RESONANCE", "W12-DAMPED-ENERGY", UWR),
    ("W12-SHM-COND", "W12-FREE-FORCED", UWR),
    ("W12-FREE-FORCED", "W12-RESONANCE", DD),  # reversed (151 after 148) — disclosed
    ("W12-FREE-FORCED", "W12-FORCED-AMPLITUDE", DD),
    ("W12-FORCED-AMPLITUDE", "W12-DAMPING-PLASTIC", DD),
    # --- Gravitation ---
    ("W7-EFIELD-DEF", "W13-GFIELD", UWR),
    ("W13-GFIELD", "W13-NEWTON-G", DD),
    ("W13-NEWTON-G", "W13-G-POINT", DD),
    ("W13-G-POINT", "W13-GRAV-POT", DD),
    ("W13-GRAV-POT", "W13-EG-COMPARE", DD),
    ("W7-RADIAL-POT", "W13-EG-COMPARE", UWR),
    ("W13-NEWTON-G", "W13-ORBITS", DD),
    ("W6-CENTRIPETAL-EQ", "W13-ORBITS", DD),
    # --- Astrophysics ---
    ("W3-PHOTON-WAVE", "W14-BLACKBODY", UWR),
    ("W14-BLACKBODY", "W14-STEFAN", DD),
    ("W14-BLACKBODY", "W14-WIEN", DD),
    ("W14-STEFAN", "W14-STANDARD-CANDLE", DD),
    ("W14-STEFAN", "W14-HR", DD),
    ("W14-WIEN", "W14-HR", DD),
    ("W14-HR", "W14-HR-LIFE", DD),
    ("W3-DEFS", "W14-DOPPLER", UWR),
    ("W14-DOPPLER", "W14-REDSHIFT", DD),
    ("W14-REDSHIFT", "W14-HUBBLE", DD),
]
