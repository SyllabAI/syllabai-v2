/**
 * T-MIG-053 tranche-2 (r3a) — the teacher band barrel: class analytics
 * (ClassAnalyticsService :42-758) + the concept-graph pair
 * (TeacherConceptGraphController :39-137, ConceptGraphSeedService :69-471,
 * ConceptGraphSnapshotLoader :45-479) + the KnowledgeGraphService seam
 * pieces the band needs (kg.ts). Frozen scope map (the card):
 * ClassAnalyticsController :27-71 (overview :46 / learners :56 /
 * topics/{nodeId}/drill-down :66), TeacherConceptGraphController
 * (activate :66 / edges :87).
 *
 * FENCE (tranche-2 doctrine per 041/043/052/053-t1): contracts + services
 * + fakeSql pins — NO routes/mounts, no hub-flip. The 052-t2 routes band
 * stays r9-hubx's (merged #89) and the 043-t2 NBA engine stays w0a's
 * (merged #85) — both hands-off here.
 */
export * from "./analytics";
export * from "./concept-edges";
export * from "./concept-seed";
export * from "./kg";
export * from "./snapshot";
