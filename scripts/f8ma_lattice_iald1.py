"""IAL Decision Mathematics 1 (WDM01) concept lattice — T-KG-PRE-8
(F8 rollout batch six, the maths family tranche 3, ial-maths-20-decision-1).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel IAL Decision Mathematics 1 unit content (5 topics, 15 spec
points), anchored to the served spine's point ids. Every anchor is
machine-verified against the spine before any byte is written
(0-unmapped pass law, enforced in kg_f8ma_generate.py).

D1's spine is an algorithm catalogue: the general algorithm idea feeds the
network algorithms, the TSP block hangs off the MST and shortest paths,
critical-path scheduling hangs off activity networks, and linear
programming closes the paper.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported
pair INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1 Algorithms
    "IAD1-CON-ALGORITHMS": ["1.1", "1.2"],
    # 2 Networks
    "IAD1-CON-MST": ["2.1"],
    "IAD1-CON-DIJKSTRA": ["2.2"],
    # 3 Route problems
    "IAD1-CON-ROUTE-INSPECTION": ["3.1"],
    "IAD1-CON-TSP": ["3.2"],
    "IAD1-CON-TSP-BOUNDS": ["3.3"],
    "IAD1-CON-NEAREST-NEIGHBOUR": ["3.4"],
    # 4 Critical path analysis
    "IAD1-CON-ACTIVITY-NETWORKS": ["4.1", "4.2"],
    "IAD1-CON-CRITICAL-PATH": ["4.3"],
    "IAD1-CON-FLOAT-GANTT": ["4.4"],
    # 5 Linear programming
    "IAD1-CON-LP-FORMULATION": ["5.1"],
    "IAD1-CON-LP-GRAPHICAL": ["5.2"],
    "IAD1-CON-LP-INTEGER": ["5.3"],
}

EDGES = [
    # Algorithm idea into network algorithms
    ("IAD1-CON-ALGORITHMS", "IAD1-CON-MST", UWR),
    ("IAD1-CON-ALGORITHMS", "IAD1-CON-DIJKSTRA", UWR),
    # Route problems
    ("IAD1-CON-DIJKSTRA", "IAD1-CON-ROUTE-INSPECTION", UWR),
    ("IAD1-CON-DIJKSTRA", "IAD1-CON-TSP", UWR),
    ("IAD1-CON-TSP", "IAD1-CON-TSP-BOUNDS", DD),
    ("IAD1-CON-MST", "IAD1-CON-TSP-BOUNDS", DD),
    ("IAD1-CON-TSP", "IAD1-CON-NEAREST-NEIGHBOUR", DD),
    # Critical path cluster
    ("IAD1-CON-ACTIVITY-NETWORKS", "IAD1-CON-CRITICAL-PATH", DD),
    ("IAD1-CON-CRITICAL-PATH", "IAD1-CON-FLOAT-GANTT", DD),
    # Linear programming cluster
    ("IAD1-CON-LP-FORMULATION", "IAD1-CON-LP-GRAPHICAL", DD),
    ("IAD1-CON-LP-GRAPHICAL", "IAD1-CON-LP-INTEGER", UWR),
]
