"""9709 Paper 4 (Mechanics) concept lattice — T-KG-PRE-7
(F8 rollout batch five, cie-as-maths-20-mechanics + cie-a-level-maths-20-mechanics).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 9709
2020-2025 syllabus Mechanics paper (5 topics, 22 spec points), anchored to the
served spine's point ids. The AS and A-level Mechanics served spines carry
identical point sets (same paper), so one lattice serves both courses fresh.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 4.1 Forces and equilibrium
    "MAM-CON-FORCE-ID": ["4.1.1"],
    "MAM-CON-FORCE-VECTOR": ["4.1.2"],
    "MAM-CON-EQUILIBRIUM": ["4.1.3"],
    "MAM-CON-CONTACT-FORCES": ["4.1.4", "4.1.5"],
    "MAM-CON-FRICTION": ["4.1.6"],
    "MAM-CON-NEWTON-THIRD": ["4.1.7"],
    # 4.2 Kinematics of motion in a straight line
    "MAM-CON-SCALAR-VECTOR-MOTION": ["4.2.1"],
    "MAM-CON-MOTION-GRAPHS": ["4.2.2"],
    "MAM-CON-KINEMATICS-CALCULUS": ["4.2.3"],
    "MAM-CON-CONSTANT-ACCEL": ["4.2.4"],
    # 4.3 Momentum
    "MAM-CON-MOMENTUM": ["4.3.1"],
    "MAM-CON-MOMENTUM-CONSERVATION": ["4.3.2"],
    # 4.4 Newton's laws of motion
    "MAM-CON-NEWTON-SECOND": ["4.4.1"],
    "MAM-CON-MASS-WEIGHT": ["4.4.2"],
    "MAM-CON-VERTICAL-PLANE-MOTION": ["4.4.3"],
    "MAM-CON-CONNECTED-PARTICLES": ["4.4.4"],
    # 4.5 Energy, work and power
    "MAM-CON-WORK": ["4.5.1"],
    "MAM-CON-ENERGY-FORMS": ["4.5.2"],
    "MAM-CON-ENERGY-WORK-RELATION": ["4.5.3"],
    "MAM-CON-POWER": ["4.5.4"],
    "MAM-CON-POWER-APPLICATIONS": ["4.5.5"],
}

EDGES = [
    # Force concepts build up
    ("MAM-CON-FORCE-ID", "MAM-CON-FORCE-VECTOR", DD),
    ("MAM-CON-FORCE-VECTOR", "MAM-CON-EQUILIBRIUM", DD),
    ("MAM-CON-FORCE-ID", "MAM-CON-CONTACT-FORCES", DD),
    ("MAM-CON-CONTACT-FORCES", "MAM-CON-FRICTION", DD),
    ("MAM-CON-FORCE-ID", "MAM-CON-NEWTON-THIRD", UWR),
    # Kinematics
    ("MAM-CON-SCALAR-VECTOR-MOTION", "MAM-CON-MOTION-GRAPHS", DD),
    ("MAM-CON-SCALAR-VECTOR-MOTION", "MAM-CON-KINEMATICS-CALCULUS", DD),
    ("MAM-CON-MOTION-GRAPHS", "MAM-CON-KINEMATICS-CALCULUS", UWR),
    ("MAM-CON-SCALAR-VECTOR-MOTION", "MAM-CON-CONSTANT-ACCEL", UWR),
    ("MAM-CON-MOTION-GRAPHS", "MAM-CON-CONSTANT-ACCEL", UWR),
    # Momentum
    ("MAM-CON-SCALAR-VECTOR-MOTION", "MAM-CON-MOMENTUM", UWR),
    ("MAM-CON-MOMENTUM", "MAM-CON-MOMENTUM-CONSERVATION", DD),
    # Newton's second law and its applications
    ("MAM-CON-FORCE-VECTOR", "MAM-CON-NEWTON-SECOND", DD),
    ("MAM-CON-FORCE-ID", "MAM-CON-NEWTON-SECOND", UWR),
    ("MAM-CON-NEWTON-SECOND", "MAM-CON-VERTICAL-PLANE-MOTION", DD),
    ("MAM-CON-MASS-WEIGHT", "MAM-CON-VERTICAL-PLANE-MOTION", UWR),
    ("MAM-CON-FRICTION", "MAM-CON-VERTICAL-PLANE-MOTION", UWR),
    ("MAM-CON-NEWTON-SECOND", "MAM-CON-CONNECTED-PARTICLES", DD),
    ("MAM-CON-NEWTON-THIRD", "MAM-CON-CONNECTED-PARTICLES", UWR),
    # Energy, work and power
    ("MAM-CON-FORCE-VECTOR", "MAM-CON-WORK", DD),
    ("MAM-CON-WORK", "MAM-CON-ENERGY-WORK-RELATION", DD),
    ("MAM-CON-ENERGY-FORMS", "MAM-CON-ENERGY-WORK-RELATION", DD),
    ("MAM-CON-WORK", "MAM-CON-POWER", DD),
    ("MAM-CON-POWER", "MAM-CON-POWER-APPLICATIONS", DD),
    ("MAM-CON-ENERGY-WORK-RELATION", "MAM-CON-POWER-APPLICATIONS", UWR),
    ("MAM-CON-NEWTON-SECOND", "MAM-CON-POWER-APPLICATIONS", UWR),
]
