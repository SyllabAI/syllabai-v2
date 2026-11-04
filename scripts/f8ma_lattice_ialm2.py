"""IAL Mechanics 2 (WME02) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, ial-maths-20-mechanics-2).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel IAL Mechanics 2 unit content (5 topics, 13 spec points), anchored
to the served spine's point ids. Every anchor is machine-verified against
the spine before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

M2 assumes M1 (its debts are M1's lattice, landed in this batch): the web
below records dependencies INTERNAL to the M2 point set — projectile
motion, variable acceleration with vector calculus, centre of mass, work
and energy, restitution, rigid-body statics.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Kinematics
    "IAM2-CON-VERTICAL-MOTION": ["1.1"],
    "IAM2-CON-PROJECTILES": ["1.2"],
    "IAM2-CON-VARIABLE-ACCEL": ["1.3"],
    "IAM2-CON-VECTOR-CALCULUS": ["1.4"],
    # 2 Centre of mass
    "IAM2-CON-COM-DISCRETE": ["2.1"],
    "IAM2-CON-COM-FIGURES": ["2.2"],
    "IAM2-CON-LAMINA-EQUILIBRIUM": ["2.3"],
    # 3 Work and energy
    "IAM2-CON-ENERGY": ["3.1"],
    # 4 Momentum and restitution
    "IAM2-CON-MOMENTUM-VECTOR": ["4.1"],
    "IAM2-CON-RESTITUTION": ["4.2"],
    "IAM2-CON-SUCCESSIVE-IMPACTS": ["4.3"],
    # 5 Statics of rigid bodies
    "IAM2-CON-MOMENTS": ["5.1"],
    "IAM2-CON-RIGID-EQUILIBRIUM": ["5.2"],
}

EDGES = [
    # Kinematics cluster
    ("IAM2-CON-VERTICAL-MOTION", "IAM2-CON-PROJECTILES", DD),
    ("IAM2-CON-VERTICAL-MOTION", "IAM2-CON-VARIABLE-ACCEL", UWR),
    ("IAM2-CON-VARIABLE-ACCEL", "IAM2-CON-VECTOR-CALCULUS", DD),
    # Centre of mass cluster
    ("IAM2-CON-COM-DISCRETE", "IAM2-CON-COM-FIGURES", DD),
    ("IAM2-CON-COM-FIGURES", "IAM2-CON-LAMINA-EQUILIBRIUM", DD),
    # Work and energy
    ("IAM2-CON-PROJECTILES", "IAM2-CON-ENERGY", UWR),
    ("IAM2-CON-VARIABLE-ACCEL", "IAM2-CON-ENERGY", UWR),
    # Restitution cluster
    ("IAM2-CON-MOMENTUM-VECTOR", "IAM2-CON-RESTITUTION", DD),
    ("IAM2-CON-RESTITUTION", "IAM2-CON-SUCCESSIVE-IMPACTS", DD),
    # Rigid bodies
    ("IAM2-CON-MOMENTS", "IAM2-CON-RIGID-EQUILIBRIUM", DD),
]
