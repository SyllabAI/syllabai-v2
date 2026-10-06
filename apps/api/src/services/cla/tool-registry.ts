/**
 * The server-owned read-only tool registry (T-MIG-067 tranche-1a) — frozen
 * source: syllabai-core @ 6cad6ef cla/ClaToolRegistry.java :1-203, ported
 * line-against-line (CLA contract §4).
 *
 * Policy properties, enforced by construction:
 *  - Server-owned: the composition of tools for a request is fixed and
 *    deterministic — the provider never selects tools (LIM §3.10); there is
 *    no agent loop and the per-request tool budget IS the fixed composition.
 *  - Read-only: every tool only calls read paths of existing services
 *    (knowledge graph reads, learner's own state reads). No tool can write
 *    the canonical KG, mastery, misconception state, or validation state.
 *  - Authorization-aware: GET_LEARNER_STATE reads the requesting learner's
 *    OWN state only, scoped to the resolved context subtree; there is no
 *    cross-learner read path.
 *  - Auditable: every invocation returns a ToolTrace (tool, arguments
 *    reference, result size, latency) that the pipeline logs into research
 *    telemetry (§4.4).
 *
 * v2 seams (REUSE-not-redeclare): the graph reads are 053's landed
 * knowledgePrerequisites/knowledgeMisconceptions (the single KG read
 * implementations); the learner's own state reads are the tutor port's
 * LearnerModelPort (skillStates + misconceptionReadings — the SAME
 * staleness-relaxed readings the tutor chain consumes).
 */
import {
  knowledgeMisconceptions,
  knowledgePrerequisites,
  type NodeView,
} from "../knowledge";
import {
  ArgumentError,
  type LearnerModelPort,
  type MisconceptionReading,
  type SkillState,
  type SqlFn,
} from "../tutor";
import type { SubmitClock } from "../selfmark";
import type { ClaResourceContext } from "./context";

/** Tool :56-60 — the closed tool set. */
export type ClaTool = "GET_SPECIFICATION_CONTEXT" | "GET_RELATED_CONCEPTS" | "GET_LEARNER_STATE";

export const CLA_TOOLS: readonly ClaTool[] = [
  "GET_SPECIFICATION_CONTEXT",
  "GET_RELATED_CONCEPTS",
  "GET_LEARNER_STATE",
];

/** ToolTrace :63 — audit record of one tool invocation (contract §4.4). */
export interface ClaToolTrace {
  tool: string;
  args: string;
  resultSize: number;
  latencyMs: number;
}

/** ToolResult :66 — bounded read result of a tool execution. */
export interface ClaToolResult {
  tool: ClaTool;
  resultSize: number;
}

/** SpecAnchor :69 — spec-chain entry of the anchored context (GET_SPECIFICATION_CONTEXT). */
export interface ClaSpecAnchor {
  nodeId: string;
  code: string;
  type: string;
  title: string;
  depth: number;
}

/**
 * OwnLearnerState :74-79 — the learner's OWN measured state, scoped to the
 * context (GET_LEARNER_STATE); misconceptions carry staleness-relaxed
 * probabilities (ADR-032).
 */
export interface ClaOwnLearnerState {
  skills: SkillState[];
  misconceptions: MisconceptionReading[];
}

export function ownLearnerStateIsEmpty(s: ClaOwnLearnerState): boolean {
  return s.skills.length === 0 && s.misconceptions.length === 0;
}

/** RelatedMisconception :82 — misconception nodes attached to the anchored topic. */
export interface ClaRelatedMisconception {
  nodeId: string;
  title: string;
}

/** RelatedConcepts :150-152 — prerequisite chain + attached misconceptions. */
export interface ClaRelatedConcepts {
  prerequisites: Array<{ id: string; code: string; type: string; title: string; depth: number }>;
  misconceptions: ClaRelatedMisconception[];
}

export const MAX_SPEC_CHAIN = 8;
export const MAX_PREREQUISITES = 12;
export const MAX_MISCONCEPTIONS = 6;

/** PrerequisiteView read shape (knowledgePrerequisites rows). */
type PrereqRow = { id: string; code: string; type: string; title: string; depth: number };

/** the registry's injected reads (the frozen constructor's two collaborators:
 *  the KnowledgeGraphService reads ride the 053 KnowledgeDeps shape, the
 *  LearnerModelService rides the tutor port) */
export interface ClaToolRegistryDeps extends KnowledgeDepsShape {
  learnerModel: Pick<LearnerModelPort, "skillStates" | "misconceptionReadings">;
}

export interface KnowledgeDepsShape {
  sql: SqlFn;
  clock: SubmitClock;
}

/**
 * enabledFor :96-113 — enablement by (context kind, mode) pair (contract
 * §4.1). All six served kinds enable ALL three tools with every served
 * mode; any other kind is rejected — the registry, not the caller, decides.
 * (mode is part of the frozen signature and deliberately unused: the
 * composition is fixed and deterministic.)
 */
export function enabledFor(kind: ClaResourceContext["kind"], _mode: string): ClaTool[] {
  if (
    kind !== "KG_TOPIC" &&
    kind !== "SPECIFICATION_POINT" &&
    kind !== "PAST_PAPER_QUESTION" &&
    kind !== "QUESTION_PART" &&
    kind !== "SMART_LESSON" &&
    kind !== "NOTE_SECTION"
  ) {
    throw new ArgumentError("context kind not supported by this runtime step: " + kind);
  }
  return [...CLA_TOOLS];
}

/**
 * GET_SPECIFICATION_CONTEXT :116-122 — the anchored topic + its ancestor
 * chain, walked from the loaded subject tree down to the anchored topic.
 * The tree is LOADED BY THE CALLER (the frozen registry takes the resolved
 * NodeView; the service owns the read).
 */
export function specificationContext(
  context: ClaResourceContext,
  subjectTree: NodeView,
): { tool: ClaTool; args: string; value: ClaSpecAnchor[] } {
  const chain: ClaSpecAnchor[] = [];
  collectChain(subjectTree, context.topicNodeId, 0, chain);
  return {
    tool: "GET_SPECIFICATION_CONTEXT",
    args: "root=" + context.rootId + ",topic=" + context.topicNodeId,
    value: [...chain],
  };
}

/**
 * GET_RELATED_CONCEPTS :125-136 — prerequisite chain + attached
 * misconceptions, bounded by the frozen caps in the frozen order.
 */
export async function relatedConcepts(
  deps: ClaToolRegistryDeps,
  context: ClaResourceContext,
): Promise<{ tool: ClaTool; args: string; value: ClaRelatedConcepts }> {
  const prerequisites = (await knowledgePrerequisites(deps, context.topicNodeId)) as PrereqRow[];
  const misconceptionNodes = await knowledgeMisconceptions(deps, context.topicNodeId);
  const misconceptions: ClaRelatedMisconception[] = misconceptionNodes
    .slice(0, MAX_MISCONCEPTIONS)
    .map((m) => ({ nodeId: m.id, title: m.title }));
  return {
    tool: "GET_RELATED_CONCEPTS",
    args: "topic=" + context.reference,
    value: {
      prerequisites: prerequisites.slice(0, MAX_PREREQUISITES),
      misconceptions,
    },
  };
}

/**
 * GET_LEARNER_STATE :139-151 — the requesting learner's OWN measured state,
 * scoped to the anchored topic and its prerequisite nodes. Nothing is
 * fabricated: an unmeasured topic yields an empty (honest) result.
 */
export async function learnerState(
  deps: ClaToolRegistryDeps,
  learnerId: string,
  scopeNodeIds: ReadonlySet<string>,
): Promise<{ tool: ClaTool; args: string; value: ClaOwnLearnerState }> {
  const skills = (await deps.learnerModel.skillStates(learnerId)).filter((s) =>
    scopeNodeIds.has(s.nodeId),
  );
  const misconceptions = (await deps.learnerModel.misconceptionReadings(learnerId)).filter((r) =>
    scopeNodeIds.has(r.misconceptionNodeId),
  );
  return {
    tool: "GET_LEARNER_STATE",
    args: "learner=SELF,scope=" + scopeNodeIds.size + "-nodes",
    value: { skills: [...skills], misconceptions: [...misconceptions] },
  };
}

/**
 * ToolResultWith.resultSize :154-166 — the value-shaped size law: a list
 * sizes by length, RelatedConcepts by prerequisites+misconceptions,
 * OwnLearnerState by skills+misconceptions, default 1.
 */
export function toolResultSize(
  value: ClaSpecAnchor[] | ClaRelatedConcepts | ClaOwnLearnerState | unknown,
): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === "object") {
    const v = value as ClaRelatedConcepts | ClaOwnLearnerState;
    if ("prerequisites" in v && "misconceptions" in v) {
      return v.prerequisites.length + v.misconceptions.length;
    }
    if ("skills" in v && "misconceptions" in v) {
      return v.skills.length + v.misconceptions.length;
    }
  }
  return 1;
}

/** the audit trace for one invocation (the pipeline measures latencyMs with
 *  its own clock; this helper pins the size law and the shape) */
export function toolTrace(tool: ClaTool, args: string, value: unknown, latencyMs: number): ClaToolTrace {
  return {
    tool,
    args,
    resultSize: toolResultSize(value),
    latencyMs: Math.max(0, latencyMs),
  };
}

/**
 * collectChain :170-189 — walk the tree from the root down to the anchored
 * topic, collecting the chain; depth-capped at 8, backtracking off paths
 * that do not reach the target.
 */
function collectChain(node: NodeView, targetId: string, depth: number, chain: ClaSpecAnchor[]): boolean {
  if (node === null || node === undefined || depth > MAX_SPEC_CHAIN || chain.length >= MAX_SPEC_CHAIN) {
    return false;
  }
  chain.push({ nodeId: node.id, code: node.code, type: node.type, title: node.title, depth });
  if (node.id === targetId) {
    return true;
  }
  if (node.children !== null && node.children !== undefined) {
    for (const child of node.children) {
      if (collectChain(child, targetId, depth + 1, chain)) {
        return true;
      }
    }
  }
  chain.pop(); // not on the path to the target — backtrack
  return false;
}

/**
 * learnerStateScope :192-199 — the set of node ids the learner-state read
 * may see for this context: the anchored topic + its prerequisite ids.
 */
export function learnerStateScope(topicNodeId: string, prerequisites: PrereqRow[]): Set<string> {
  const scope = new Set<string>();
  scope.add(topicNodeId);
  for (const p of prerequisites) {
    scope.add(p.id);
  }
  return scope;
}
