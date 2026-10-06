/**
 * T-MIG-043 tranche 2 — the settled T-C11 concept graph as a structured
 * dependency layer for the NBA engine. Port of the frozen law
 * (syllabai-core @ 6cad6ef):
 *
 *   - recommendation/ConceptDependencyGraphLoader.java (the packaged
 *     snapshot loader: classpath resources, SHA-256-pinned, fail-closed)
 *   - recommendation/ConceptDependencyGraph.java (the validated-edge
 *     factory: HUMAN_VALIDATED-only, known relations, known endpoints,
 *     no duplicates — the single enforcement point)
 *
 * SNAPSHOT CONTRACT (2026-09-25, close of T-C11 Batch 11; core-sync GO
 * 2026-10-01): concept_edges.yaml / concepts.yaml / practicals.yaml are
 * BYTE-VERBATIM copies of the settled store (committed here verbatim under
 * concept-graph/ and hash-pinned below — any drift fails boot loudly
 * instead of silently changing recommendation inputs). 193 concept nodes +
 * 12 practical nodes / 488 edges / 277 semantic edges, of which 272
 * HUMAN_VALIDATED; the only non-validated semantic edges are the 3 frozen
 * pilot operator HOLDs and the 2 REVIEW_REQUIRED edges. Practical nodes
 * participate because 19 validated REQUIRES_PREREQUISITE edges name them;
 * since the 2026-10-01 practical-endpoint retarget those edges SOURCE at
 * the practicals' real spec statements, so each practical's spec_point code
 * is admitted as a known endpoint (official store content, pinned via
 * practicals.yaml).
 *
 * What this layer is NOT: learner state (edges here are curriculum-structure
 * facts, never mastery evidence) and NOT the runtime KG (PART_OF excluded —
 * curriculum anchoring stays the authoritative KG's job).
 *
 * Parse: Bun.YAML (plain data only — static packaged resources, never user
 * input, SafeConstructor parity). Hashes: Bun.CryptoHasher sha256.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── the frozen pins (ConceptDependencyGraphLoader.java :66-72) ──────────────

const EDGES_SHA256 = "8a651dd9e60bfefa7a164102db23b10b700672daebc6449c126332180db24aad";
const NODES_SHA256 = "24fa91ac7149682b1083ff47112362a11180bcfb7899c1343c6f536682447e3f";
const PRACTICALS_SHA256 = "e53e5f87606a2b5a5b7e534f0375d970498ea85a5655ca32e5bd4526dc9fa528";

/** The one relation the loader intentionally drops (structure belongs to the KG). */
const PART_OF = "PART_OF";

/** Semantic relation kinds of the settled T-C11 store (ConceptDependencyGraph enum). */
export const SEMANTIC_RELATIONS = [
  "REQUIRES_PREREQUISITE",
  "REMEDIATED_BY",
  "EXPLAINED_BY",
  "RELATED_TO",
  "COMMONLY_CONFUSED_WITH",
  "WRONG_ANSWER_PATTERN",
  "MISCONCEPTION_OF",
] as const;
export type SemanticRelation = (typeof SEMANTIC_RELATIONS)[number];

/** A validated dependency edge: source -[relation]-> target, all concept codes. */
export interface ConceptEdge {
  source: string;
  relation: SemanticRelation;
  target: string;
}

interface RawEdge {
  source: string;
  relation: string;
  target: string;
  validationStatus: string;
}

export interface ConceptDependencyGraph {
  /** Validated edges of one relation kind, deterministically ordered (source, target, relation). */
  edges(relation: SemanticRelation): ConceptEdge[];
  /** Total number of validated semantic edges carried by this layer. */
  validatedEdgeCount(): number;
  isEmpty(): boolean;
}

// ── fail-closed helpers (verbatim frozen error texts) ────────────────────────

function sha256Of(text: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}

function requireHash(text: string, expected: string, resource: string): void {
  const actual = sha256Of(text);
  if (actual !== expected) {
    throw new Error(
      "concept graph snapshot: SHA-256 drift in " +
        resource +
        " (expected " +
        expected +
        ", got " +
        actual +
        ") — re-copy the settled bytes, update the pin, and record the re-sync",
    );
  }
}

function parseRelation(relation: string | null | undefined): SemanticRelation | null {
  if (!relation) return null;
  return (SEMANTIC_RELATIONS as readonly string[]).includes(relation)
    ? (relation as SemanticRelation)
    : null;
}

function requireKnown(code: string, knownNodeCodes: Set<string>): void {
  if (!knownNodeCodes.has(code)) {
    throw new Error("concept graph: edge endpoint '" + code + "' is not a known graph node");
  }
}

function readNodeCodes(doc: Record<string, unknown> | null, listKey: string, resource: string): Set<string> {
  const nodes = doc == null ? null : doc[listKey];
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error("concept graph snapshot: no nodes in " + resource);
  }
  const codes = new Set<string>();
  for (const node of nodes) {
    const code = (node as Record<string, unknown>)?.["code"];
    if (typeof code !== "string" || code.length === 0) {
      throw new Error("concept graph snapshot: node without a code in " + resource);
    }
    codes.add(code);
  }
  return codes;
}

/**
 * ConceptDependencyGraph.of — the fail-closed factory. Keeps ONLY
 * HUMAN_VALIDATED edges (Case-D exclusion of held/REVIEW_REQUIRED happens
 * here and nowhere else), verifies every relation is a known semantic kind
 * and every endpoint a known node code, and refuses duplicate validated
 * edges — any violation is a defect in the graph source, never silently
 * tolerated.
 */
export function conceptDependencyGraphOf(
  rawEdges: RawEdge[],
  knownNodeCodes: Set<string>,
): ConceptDependencyGraph {
  const byRelation = new Map<SemanticRelation, ConceptEdge[]>();
  const seen = new Set<string>();
  for (const raw of rawEdges) {
    if (raw.validationStatus !== "HUMAN_VALIDATED") {
      continue; // held (SUGGESTED) / REVIEW_REQUIRED / anything else: excluded
    }
    const relation = parseRelation(raw.relation);
    if (relation === null) {
      throw new Error(
        "concept graph: unknown relation '" + raw.relation + "' on edge " + raw.source + " -> " + raw.target,
      );
    }
    requireKnown(raw.source, knownNodeCodes);
    requireKnown(raw.target, knownNodeCodes);
    const key = raw.source + "\u0000" + relation + "\u0000" + raw.target;
    if (seen.has(key)) {
      throw new Error(
        "concept graph: duplicate validated edge " +
          raw.source +
          " -[" +
          raw.relation +
          "]-> " +
          raw.target,
      );
    }
    seen.add(key);
    const list = byRelation.get(relation);
    const edge: ConceptEdge = { source: raw.source, relation, target: raw.target };
    if (list) list.push(edge);
    else byRelation.set(relation, [edge]);
  }
  // frozen: each relation's list sorted by (source, target, relation)
  const frozen = new Map<SemanticRelation, ConceptEdge[]>();
  for (const [relation, list] of byRelation) {
    frozen.set(
      relation,
      [...list].sort(
        (a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.relation.localeCompare(b.relation),
      ),
    );
  }
  let count = 0;
  for (const list of frozen.values()) count += list.length;
  return {
    edges: (relation) => frozen.get(relation) ?? [],
    validatedEdgeCount: () => count,
    isEmpty: () => count === 0,
  };
}

// ── the loader (builds the singleton; fails boot on any violation) ──────────

function loadSnapshotYaml(file: string, expectedSha256: string): Record<string, unknown> {
  const resource = join(import.meta.dir, "concept-graph", file);
  const text = readFileSync(resource, "utf8");
  requireHash(text, expectedSha256, file);
  return Bun.YAML.parse(text) as Record<string, unknown>;
}

/**
 * Build the graph from the packaged settled snapshot. Exported for tests
 * (rebuild-from-disk assertions); the engine consumes the built-once
 * NBA_CONCEPT_GRAPH singleton below (the frozen @Component startup posture).
 */
export function buildConceptDependencyGraphFromSnapshot(): ConceptDependencyGraph {
  const edgesDoc = loadSnapshotYaml("concept_edges.yaml", EDGES_SHA256);
  const nodesDoc = loadSnapshotYaml("concepts.yaml", NODES_SHA256);
  const practicalsDoc = loadSnapshotYaml("practicals.yaml", PRACTICALS_SHA256);

  // frozen load(): the concept codes + the practicals' own codes + the
  // practicals' real spec statements (legal edge endpoints since the
  // 2026-10-01 retarget — official store content, pinned via practicals.yaml)
  const knownNodeCodes = readNodeCodes(nodesDoc, "nodes", "concepts.yaml");
  for (const code of readNodeCodes(practicalsDoc, "practicals", "practicals.yaml")) {
    knownNodeCodes.add(code);
  }
  const practicals = practicalsDoc == null ? null : practicalsDoc["practicals"];
  if (Array.isArray(practicals)) {
    for (const p of practicals) {
      const sp = (p as Record<string, unknown>)?.["spec_point"];
      if (typeof sp !== "string" || sp.length === 0) {
        throw new Error("concept graph snapshot: practical without a spec_point in practicals.yaml");
      }
      knownNodeCodes.add(sp);
    }
  }

  const edgeList = edgesDoc == null ? null : edgesDoc["edges"];
  if (!Array.isArray(edgeList) || edgeList.length === 0) {
    throw new Error("concept graph snapshot: no edges in concept_edges.yaml");
  }
  const rawEdges: RawEdge[] = [];
  for (const e of edgeList) {
    const m = e as Record<string, unknown>;
    const source = m["source"];
    const target = m["target"];
    if (typeof source !== "string" || typeof target !== "string") {
      throw new Error("concept graph snapshot: edge without source/target in concept_edges.yaml");
    }
    rawEdges.push({
      source,
      target,
      relation: typeof m["relation"] === "string" ? (m["relation"] as string) : "",
      validationStatus:
        typeof m["validation_status"] === "string" ? (m["validation_status"] as string) : "",
    });
  }
  // PART_OF edges are dropped at the loader (structure belongs to the KG);
  // the factory's relation validation would reject them, mirroring the frozen
  // skip that happens before any validation.
  const semantic = rawEdges.filter((e) => e.relation !== PART_OF);
  return conceptDependencyGraphOf(semantic, knownNodeCodes);
}

/** The engine's graph: built once at module load (fail-fast boot parity). */
export const NBA_CONCEPT_GRAPH: ConceptDependencyGraph = buildConceptDependencyGraphFromSnapshot();
