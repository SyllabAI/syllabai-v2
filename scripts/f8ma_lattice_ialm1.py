"""IAL Mechanics 1 (WME01) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, ial-maths-20-mechanics-1).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel IAL Mechanics 1 unit content (6 topics, 12 spec points), anchored
to the served spine's point ids. Every anchor is machine-verified against
the spine before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

M1's spine is a modelling ladder: vectors feed resolution, Newton's laws
feed everything dynamic, equilibrium carries the statics branch with the
two friction regimes, moments close the paper.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Mathematical models
    "IAM1-CON-MODELLING": ["1.1"],
    # 2 Vectors
    "IAM1-CON-VECTORS": ["2.1"],
    "IAM1-CON-VECTOR-KINEMATICS": ["2.2"],
    # 3 Kinematics
    "IAM1-CON-SUVAT": ["3.1"],
    # 4 Dynamics
    "IAM1-CON-NEWTON-LAWS": ["4.1"],
    "IAM1-CON-CONNECTED": ["4.2"],
    "IAM1-CON-MOMENTUM": ["4.3"],
    "IAM1-CON-FRICTION-MOTION": ["4.4"],
    # 5 Statics
    "IAM1-CON-FORCE-RESOLUTION": ["5.1"],
    "IAM1-CON-EQUILIBRIUM": ["5.2"],
    "IAM1-CON-FRICTION-STATIC": ["5.3"],
    # 6 Moments
    "IAM1-CON-MOMENTS": ["6.1"],
}

EDGES = [
    # Vectors into kinematics
    ("IAM1-CON-VECTORS", "IAM1-CON-VECTOR-KINEMATICS", DD),
    ("IAM1-CON-VECTOR-KINEMATICS", "IAM1-CON-SUVAT", UWR),
    # Dynamics ladder
    ("IAM1-CON-MODELLING", "IAM1-CON-NEWTON-LAWS", UWR),
    ("IAM1-CON-NEWTON-LAWS", "IAM1-CON-CONNECTED", DD),
    ("IAM1-CON-NEWTON-LAWS", "IAM1-CON-MOMENTUM", DD),
    ("IAM1-CON-NEWTON-LAWS", "IAM1-CON-FRICTION-MOTION", DD),
    # Statics branch
    ("IAM1-CON-VECTORS", "IAM1-CON-FORCE-RESOLUTION", DD),
    ("IAM1-CON-FORCE-RESOLUTION", "IAM1-CON-EQUILIBRIUM", DD),
    ("IAM1-CON-EQUILIBRIUM", "IAM1-CON-FRICTION-STATIC", DD),
    # Moments
    ("IAM1-CON-EQUILIBRIUM", "IAM1-CON-MOMENTS", UWR),
]
