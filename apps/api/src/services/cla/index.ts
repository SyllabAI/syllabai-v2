/**
 * The CLA service module (T-MIG-069, refiled from T-MIG-067 per
 * R0-arbitration ruling2) — Wave-6 Contextual Learning Assistant.
 * Tranche-1a: the ResourceContext port (context.ts), the deterministic
 * §7 answer-leakage gate (leakage-policy.ts), the read-only tool registry
 * (tool-registry.ts). Tranche-1b: the context resolver (context-resolver.ts,
 * the four dependency-served kinds; SMART_LESSON/NOTE_SECTION defer per the
 * 053 t3/t4 gate). Tranche-2: the orchestration + the route. The frozen
 * sources are named per-file.
 */
export * from "./context";
export * from "./context-resolver";
export * from "./leakage-policy";
export * from "./tool-registry";
