"""0606 Additional Maths concept lattice — T-KG-PRE-7
(F8 rollout batch five, cie-igcse-further-maths-additional-maths-25).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the 0606
Additional Mathematics syllabus (14 topics, 77 spec points), anchored to the
served spine's point ids.

Structural note of record: this spine's points[] order is NOT the syllabus
topic order (Series/12.x lands first, Calculus/14.x last). Every edge below
was authored and checked to run FORWARD in the served points[] order, so the
calibrated export's reversed-pair governance should report zero drops; the
natural pairs that the scramble would reverse (e.g. logs -> the substitution
equations that use e^x) are deliberately omitted from the web rather than
shipped out of order.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # Series (topic 4 / spine 12.x — first in served order)
    "MA0606-CON-BINOMIAL-THEOREM": ["12.1.1"],
    "MA0606-CON-BINOMIAL-TERM": ["12.2.1"],
    "MA0606-CON-AP-GP-RECOGNISE": ["12.3.1"],
    "MA0606-CON-AP-GP-FORMULAS": ["12.4.1"],
    "MA0606-CON-GP-CONVERGENCE": ["12.5.1"],
    # Circular measure (topic 3 / spine 9.x)
    "MA0606-CON-RADIANS": ["9.1.1"],
    # Factors of polynomials (topic 2 / spine 3.x)
    "MA0606-CON-FACTOR-THEOREM": ["3.1.1"],
    "MA0606-CON-POLY-FACTORS": ["3.2.1"],
    "MA0606-CON-CUBIC-SOLVE": ["3.3.1"],
    # Functions (topic 1 / spine 1.x)
    "MA0606-CON-FUNCTION-NOTATION": ["1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5"],
    "MA0606-CON-TRIG-GRAPHS-FN": ["1.4.1", "1.4.2", "1.4.3"],
    "MA0606-CON-INVERSE-FUNCTION": ["1.6.2"],
    # Quadratic functions (topic 5 / spine 2.x)
    "MA0606-CON-QUAD-INEQUALITIES": ["2.5.1", "2.5.2"],
    # Equations, inequalities and graphs (topic 6 / spine 4.x)
    "MA0606-CON-MODULUS-EQUATIONS": ["4.1.1", "4.1.2", "4.1.3", "4.1.4"],
    "MA0606-CON-MODULUS-INEQUALITIES": ["4.2.1", "4.2.2", "4.2.3", "4.2.4", "4.2.5", "4.2.6"],
    "MA0606-CON-SUBSTITUTION-QUAD": ["4.3.1", "4.3.2", "4.3.3"],
    "MA0606-CON-CUBIC-INEQUALITIES": ["4.5.1", "4.5.2", "4.5.3", "4.5.4"],
    # Simultaneous equations (topic 7 / spine 5.x)
    "MA0606-CON-SIMULTANEOUS-NONLINEAR": ["5.1.1", "5.1.2", "5.1.3"],
    # Logarithmic and exponential functions (topic 8 / spine 6.x)
    "MA0606-CON-LOG-LAWS": ["6.2.1", "6.2.2"],
    # Straight-line graphs (topic 9 / spine 7.x)
    "MA0606-CON-LINEARISATION": ["7.4.1", "7.4.2"],
    # Coordinate geometry of the circle (topic 10 / spine 8.x)
    "MA0606-CON-CIRCLE-EQUATION": ["8.1.2"],
    "MA0606-CON-LINE-CIRCLE": ["8.2.1", "8.2.2", "8.2.3"],
    "MA0606-CON-CIRCLE-CIRCLE": ["8.4.1", "8.4.2", "8.4.3"],
    # Trigonometry (topic 11 / spine 10.x)
    "MA0606-CON-TRIG-IDENTITIES": ["10.4.2"],
    "MA0606-CON-TRIG-EQUATIONS": ["10.5.1", "10.5.2", "10.5.3", "10.5.4"],
    "MA0606-CON-TRIG-PROOFS": ["10.6.1", "10.6.1a", "10.6.2"],
    # Permutations and combinations (topic 12 / spine 11.x)
    "MA0606-CON-PERM-COMB": ["11.3.1", "11.3.2", "11.3.3"],
    # Vectors in two dimensions (topic 13 / spine 13.x)
    "MA0606-CON-VECTOR-OPS": ["13.3.1"],
    "MA0606-CON-VECTOR-GEOMETRY": ["13.3.2"],
    # Calculus (topic 14 / spine 14.x — last in served order)
    "MA0606-CON-DIFF-NOTATION": ["14.2.2"],
    "MA0606-CON-DIFF-STANDARD": ["14.3.2", "14.3.3"],
    "MA0606-CON-INT-STANDARD": [
        "14.11.1", "14.12.1", "14.12.2", "14.12.3", "14.12.4", "14.12.5",
    ],
    "MA0606-CON-DEFINITE-INTEGRALS": ["14.13.1", "14.13.2", "14.13.3"],
    "MA0606-CON-KINEMATICS-GRAPHS": ["14.15.3"],
}

EDGES = [
    # Series
    ("MA0606-CON-BINOMIAL-THEOREM", "MA0606-CON-BINOMIAL-TERM", DD),
    ("MA0606-CON-AP-GP-RECOGNISE", "MA0606-CON-AP-GP-FORMULAS", DD),
    ("MA0606-CON-AP-GP-FORMULAS", "MA0606-CON-GP-CONVERGENCE", DD),
    # Circular measure feeds radian-based calculus
    ("MA0606-CON-RADIANS", "MA0606-CON-DIFF-STANDARD", UWR),
    ("MA0606-CON-RADIANS", "MA0606-CON-INT-STANDARD", UWR),
    # Polynomial factors
    ("MA0606-CON-FACTOR-THEOREM", "MA0606-CON-POLY-FACTORS", DD),
    ("MA0606-CON-POLY-FACTORS", "MA0606-CON-CUBIC-SOLVE", DD),
    ("MA0606-CON-FACTOR-THEOREM", "MA0606-CON-CUBIC-INEQUALITIES", UWR),
    ("MA0606-CON-CUBIC-SOLVE", "MA0606-CON-CUBIC-INEQUALITIES", UWR),
    # Functions
    ("MA0606-CON-FUNCTION-NOTATION", "MA0606-CON-INVERSE-FUNCTION", DD),
    # Equations and inequalities
    ("MA0606-CON-MODULUS-EQUATIONS", "MA0606-CON-MODULUS-INEQUALITIES", DD),
    # Simultaneous equations into circle geometry
    ("MA0606-CON-SIMULTANEOUS-NONLINEAR", "MA0606-CON-LINE-CIRCLE", UWR),
    # Logs into straight-line linearisation
    ("MA0606-CON-LOG-LAWS", "MA0606-CON-LINEARISATION", DD),
    # Circle geometry
    ("MA0606-CON-CIRCLE-EQUATION", "MA0606-CON-LINE-CIRCLE", DD),
    ("MA0606-CON-CIRCLE-EQUATION", "MA0606-CON-CIRCLE-CIRCLE", DD),
    # Trigonometry
    ("MA0606-CON-TRIG-IDENTITIES", "MA0606-CON-TRIG-EQUATIONS", UWR),
    ("MA0606-CON-TRIG-IDENTITIES", "MA0606-CON-TRIG-PROOFS", DD),
    ("MA0606-CON-TRIG-IDENTITIES", "MA0606-CON-INT-STANDARD", UWR),
    # Vectors
    ("MA0606-CON-VECTOR-OPS", "MA0606-CON-VECTOR-GEOMETRY", DD),
    # Calculus
    ("MA0606-CON-DIFF-NOTATION", "MA0606-CON-DIFF-STANDARD", DD),
    ("MA0606-CON-DIFF-STANDARD", "MA0606-CON-INT-STANDARD", DD),
    ("MA0606-CON-INT-STANDARD", "MA0606-CON-DEFINITE-INTEGRALS", DD),
    ("MA0606-CON-DEFINITE-INTEGRALS", "MA0606-CON-KINEMATICS-GRAPHS", UWR),
]
