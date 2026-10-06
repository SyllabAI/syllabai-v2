/**
 * The CLA service module (T-MIG-067) — Wave-6 Contextual Learning Assistant.
 * Tranche-1a: the ResourceContext port (context.ts), the deterministic
 * §7 answer-leakage gate (leakage-policy.ts), the read-only tool registry
 * (tool-registry.ts). Tranche-1b: the context resolver. Tranche-2: the
 * orchestration + the route. The frozen sources are named per-file.
 */
export * from "./context";
export * from "./leakage-policy";
export * from "./tool-registry";
