/**
 * T-MIG-053 tranche-2 (r3a) — the teacher concept-graph snapshot loader.
 * Port of the frozen law (syllabai-core @ 6cad6ef):
 *
 *   - teacher/ConceptGraphSnapshotLoader.java :45-479 — six byte-verbatim
 *     copies of the syllabai-resources store, each pinned by SHA-256; any
 *     drift fails the seed loudly instead of silently re-seeding changed
 *     data (:455-463 — "re-sync the settled bytes and update the pin
 *     deliberately");
 *   - the store-fact count contract (:71-79): 4 sections / 28 subsections /
 *     182 spec points / 12 practicals / 193 concept nodes / 211 anchor
 *     PART_OF edges / 272 validated semantic edges / 5 EXCLUDED semantic
 *     edges (3 frozen pilot HOLDs + 2 REVIEW_REQUIRED — must never reach
 *     the KG, excluded BY COUNT so the exclusion is provable);
 *   - referential integrity (:174-244): subsection→section, SP→section+
 *     subsection, practical→SP, anchor endpoints (concept codes × SP codes),
 *     semantic endpoints (concept/misconception/practical codes + SP codes —
 *     the 2026-10-01 practical-endpoint retarget sources the 19 practical
 *     prerequisite edges at their real spec statements);
 *   - the structure-edges contract (:372-391): relationships.yaml carries
 *     exactly 182 SP→subsection + 28 subsection→section PART_OF edges;
 *   - the validated-edge provenance line (:250-266): "t-c11:settled"
 *     + |pass: + |method: + |validated_by: + |date:, bound to 300;
 *     rationale = derivation_notes bound to 500;
 *   - the T-C24 applicability passthrough (:317-334): the store's own
 *     object copied key-for-key — never interpreted, normalized, or
 *     defaulted; absent/null stays null;
 *   - subsection→section derivation (:293-298): the store's subsection
 *     codes embed their section (lastIndexOf('-')).
 *
 * REUSE-not-redeclare: concepts.yaml / concept_edges.yaml / practicals.yaml
 * are NOT re-copied — they are the byte-verbatim settled store already
 * merged on main under learner-me/concept-graph/ (043-t2, hash-pinned there
 * too); this loader reads THOSE bytes. The three V15 curriculum-substrate
 * files live here (spec points / topics / relationships) — the teacher band's
 * own pinned copies, SHAs equal to the frozen classpath resources.
 *
 * Determinism: sections by ordering, subsections by sectionCode+ordering,
 * spec points by globalOrder, practicals by ordering, concept nodes by code,
 * anchors by (conceptCode, specPointCode), validated edges by
 * (relation, source, target) — the frozen sort orders verbatim.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── the frozen pins (:47-68) ─────────────────────────────────────────────────

const SPEC_POINTS_RESOURCE = "concept-graph/specification_points.yaml";
const TOPICS_RESOURCE = "concept-graph/topics.yaml";
const RELATIONSHIPS_RESOURCE = "concept-graph/relationships.yaml";
const CONCEPTS_RESOURCE = "concept-graph/concepts.yaml";
const CONCEPT_EDGES_RESOURCE = "concept-graph/concept_edges.yaml";
const PRACTICALS_RESOURCE = "concept-graph/practicals.yaml";

const CONCEPTS_SHA256 =
  "24fa91ac7149682b1083ff47112362a11180bcfb7899c1343c6f536682447e3f";
const CONCEPT_EDGES_SHA256 =
  "8a651dd9e60bfefa7a164102db23b10b700672daebc6449c126332180db24aad";
const PRACTICALS_SHA256 =
  "e53e5f87606a2b5a5b7e534f0375d970498ea85a5655ca32e5bd4526dc9fa528";
const SPEC_POINTS_SHA256 =
  "b1fea69953205077e2fac94aee00b2b535234936f432b4e256bd6bd90715af0a";
const TOPICS_SHA256 =
  "a7b14cbdd34bb9fee8ce0e1155da784414b2d2fd57e942d0f2e932d259be9782";
const RELATIONSHIPS_SHA256 =
  "b3b7529222d77d800cb404724c80c9dffb3cdd584103edafd7c76b70a58a1249";

/** Store facts the loader fail-closes on (V15 snapshot contract, :71-79). */
export const SECTION_COUNT = 4;
export const SUBSECTION_COUNT = 28;
export const SPEC_POINT_COUNT = 182;
export const PRACTICAL_COUNT = 12;
export const CONCEPT_NODE_COUNT = 193;
export const ANCHOR_EDGE_COUNT = 211;
export const VALIDATED_SEMANTIC_EDGE_COUNT = 272;
/** 3 frozen pilot HOLDs + 2 REVIEW_REQUIRED — must never reach the KG. */
export const EXCLUDED_SEMANTIC_EDGE_COUNT = 5;

/** the settled T-C11 store's own semantic relations (relationOf :400-412 —
 *  anything else is a loud conflict, "refusing to guess") */
export const SETTLED_RELATIONS = [
  "REQUIRES_PREREQUISITE",
  "REMEDIATED_BY",
  "WRONG_ANSWER_PATTERN",
  "COMMONLY_CONFUSED_WITH",
  "MISCONCEPTION_OF",
  "EXPLAINED_BY",
  "RELATED_TO",
] as const;
export type SettledRelation = (typeof SETTLED_RELATIONS)[number];

// ── the snapshot model (:104-146) ────────────────────────────────────────────

export interface SnapshotSection {
  code: string;
  title: string;
  ordering: number;
}
export interface SnapshotSubsection {
  code: string;
  title: string;
  sectionCode: string;
  ordering: number;
}
export interface SnapshotSpecPoint {
  code: string;
  officialCode: string;
  wording: string;
  sectionCode: string;
  subsectionCode: string;
  ordering: number;
  globalOrder: number;
  cPoint: boolean;
  practical: boolean;
  /** T-C24 verbatim passthrough — the store's own object or null. */
  applicability: Record<string, unknown> | null;
}
export interface SnapshotPractical {
  code: string;
  specPointCode: string;
  summary: string;
  ordering: number;
}
export interface SnapshotConceptNode {
  code: string;
  family: "CONCEPT" | "MISCONCEPTION";
  title: string;
  aliases: string[];
}
export interface SnapshotAnchorEdge {
  conceptCode: string;
  specPointCode: string;
  role: string;
}
export interface SnapshotValidatedEdge {
  source: string;
  target: string;
  relation: SettledRelation;
  confidence: number | null;
  rationale: string;
  provenance: string;
}

export interface ConceptGraphSnapshot {
  sections: SnapshotSection[];
  subsections: SnapshotSubsection[];
  specPoints: SnapshotSpecPoint[];
  practicals: SnapshotPractical[];
  conceptNodes: SnapshotConceptNode[];
  anchorEdges: SnapshotAnchorEdge[];
  validatedSemanticEdges: SnapshotValidatedEdge[];
}

// ── fail-closed helpers (frozen error texts verbatim) ────────────────────────

function sha256Hex(bytes: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex");
}

function requireSha256(path: string, bytes: string, expected: string): void {
  const actual = sha256Hex(bytes);
  if (actual !== expected) {
    throw new Error(
      "concept graph snapshot drift: " + path + " sha256 " + actual +
        " != pinned " + expected +
        " — re-sync the settled bytes and update the pin deliberately",
    );
  }
}

function require(condition: boolean, what: string): void {
  if (!condition) throw new Error("concept graph snapshot: " + what);
}

function readResource(path: string, dir: string): string {
  // the frozen classpath layout is concept-graph/<file>.yaml relative to the
  // band dir — the V2 copy mirrors it under teacher/concept-graph/
  try {
    return readFileSync(join(dir, path), "utf8");
  } catch (e) {
    throw new Error("concept graph snapshot missing: " + path);
  }
}

function doc(text: string, resource: string): Record<string, unknown> {
  const parsed = Bun.YAML.parse(text) as unknown;
  require(parsed != null && typeof parsed === "object" && !Array.isArray(parsed),
    resource + " is not a YAML mapping");
  return parsed as Record<string, unknown>;
}

function list(value: unknown, key: string, resource: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(resource + ": missing/empty '" + key + "' list");
  }
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("missing/blank string field");
  }
  return value;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function intOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("concept graph snapshot: missing/invalid integer field");
  }
  return Math.trunc(value);
}

function bound(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

/** the T-C24 applicability passthrough (:325-334) */
function applicabilityOf(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = v;
  }
  return out;
}

/** 4CH1-S1-a → 4CH1-S1 (store subsection codes embed their section, :293-298) */
function sectionOfSubsection(subsectionCode: string): string {
  const i = subsectionCode.lastIndexOf("-");
  require(i > 0, "subsection code shape: " + subsectionCode);
  return subsectionCode.slice(0, i);
}

/** the provenance line of a validated semantic edge (:250-266) */
function validatedEdgeOf(m: Record<string, unknown>): SnapshotValidatedEdge {
  const provenance = (m["provenance"] != null && typeof m["provenance"] === "object"
    ? (m["provenance"] as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const pass = str(provenance["extraction_pass"]);
  const method = str(provenance["derivation_method"]);
  const validatedBy = str(m["validated_by"]);
  const validatedDate = str(m["validated_date"]);
  const provenanceLine = bound(
    "t-c11:settled" +
      (pass === "" ? "" : "|pass:" + pass) +
      (method === "" ? "" : "|method:" + method) +
      (validatedBy === "" ? "" : "|validated_by:" + validatedBy) +
      (validatedDate === "" ? "" : "|date:" + validatedDate),
    300,
  );
  const confidence =
    typeof m["confidence"] === "number" ? (m["confidence"] as number) : null;
  const relation = string(m["relation"]) as SettledRelation;
  require((SETTLED_RELATIONS as readonly string[]).includes(relation),
    "settled store relation '" + String(m["relation"]) +
      "' has no runtime RelationType mapping — refusing to guess");
  return {
    source: string(m["source"]),
    target: string(m["target"]),
    relation,
    confidence,
    rationale: bound(str(provenance["derivation_notes"]), 500),
    provenance: provenanceLine,
  };
}

// ── parse (:150-248) ─────────────────────────────────────────────────────────

export function parseConceptGraphSnapshot(bytes: {
  specPoints: string;
  topics: string;
  relationships: string;
  concepts: string;
  conceptEdges: string;
  practicals: string;
}): ConceptGraphSnapshot {
  const specDoc = doc(bytes.specPoints, SPEC_POINTS_RESOURCE);
  const topicsDoc = doc(bytes.topics, TOPICS_RESOURCE);
  const relDoc = doc(bytes.relationships, RELATIONSHIPS_RESOURCE);
  const conceptsDoc = doc(bytes.concepts, CONCEPTS_RESOURCE);
  const edgesDoc = doc(bytes.conceptEdges, CONCEPT_EDGES_RESOURCE);
  const practicalsDoc = doc(bytes.practicals, PRACTICALS_RESOURCE);

  const sections: SnapshotSection[] = list(topicsDoc["topics"], "topics", TOPICS_RESOURCE)
    .map((t) => {
      const m = t as Record<string, unknown>;
      return {
        code: string(m["code"]),
        title: string(m["title"]),
        ordering: intOf(m["ordering"]),
      };
    })
    .sort((a, b) => a.ordering - b.ordering);

  const subsections: SnapshotSubsection[] = list(
    topicsDoc["subtopics"],
    "subtopics",
    TOPICS_RESOURCE,
  )
    .map((t) => {
      const m = t as Record<string, unknown>;
      const code = string(m["code"]);
      return {
        code,
        title: string(m["title"]),
        sectionCode: sectionOfSubsection(code),
        ordering: intOf(m["ordering"]),
      };
    })
    .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode) || a.ordering - b.ordering);

  const specPoints: SnapshotSpecPoint[] = list(
    specDoc["specification_points"],
    "specification_points",
    SPEC_POINTS_RESOURCE,
  )
    .map((t) => {
      const m = t as Record<string, unknown>;
      return {
        code: string(m["code"]),
        officialCode: string(m["official_code"]),
        wording: string(m["official_wording"]),
        sectionCode: string(m["section"]),
        subsectionCode: string(m["subsection"]),
        ordering: intOf(m["ordering"]),
        globalOrder: intOf(m["global_order"]),
        cPoint: m["c_point"] === true,
        practical: m["practical"] === true,
        applicability: applicabilityOf(m["applicability"]),
      };
    })
    .sort((a, b) => a.globalOrder - b.globalOrder);

  const practicals: SnapshotPractical[] = list(
    practicalsDoc["practicals"],
    "practicals",
    PRACTICALS_RESOURCE,
  )
    .map((t) => {
      const m = t as Record<string, unknown>;
      return {
        code: string(m["code"]),
        specPointCode: string(m["spec_point"]),
        summary: string(m["summary"]),
        ordering: intOf(m["ordering"]),
      };
    })
    .sort((a, b) => a.ordering - b.ordering);

  const conceptNodes: SnapshotConceptNode[] = list(conceptsDoc["nodes"], "nodes", CONCEPTS_RESOURCE)
    .map((t) => {
      const m = t as Record<string, unknown>;
      const family = string(m["family"]);
      require(family === "CONCEPT" || family === "MISCONCEPTION",
        "concept node family " + family);
      const aliases: string[] = [];
      if (Array.isArray(m["aliases"])) {
        for (const a of m["aliases"] as unknown[]) {
          if (typeof a === "string" && a.length > 0) aliases.push(a);
        }
      }
      return {
        code: string(m["code"]),
        family: family as SnapshotConceptNode["family"],
        title: string(m["title"]),
        aliases,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  require(sections.length === SECTION_COUNT, "section count");
  require(subsections.length === SUBSECTION_COUNT, "subsection count");
  require(specPoints.length === SPEC_POINT_COUNT, "spec point count");
  require(practicals.length === PRACTICAL_COUNT, "practical count");
  require(conceptNodes.length === CONCEPT_NODE_COUNT, "concept node count");

  // referential integrity of the curriculum substrate (:174-190)
  const sectionCodes = new Set(sections.map((s) => s.code));
  const subsectionCodes = new Set(subsections.map((s) => s.code));
  const spCodes = new Set(specPoints.map((s) => s.code));
  for (const s of subsections) {
    require(sectionCodes.has(s.sectionCode),
      "subsection " + s.code + " references unknown section " + s.sectionCode);
  }
  for (const sp of specPoints) {
    require(sectionCodes.has(sp.sectionCode) && subsectionCodes.has(sp.subsectionCode),
      "spec point " + sp.code + " references unknown section/subsection");
  }
  for (const p of practicals) {
    require(spCodes.has(p.specPointCode),
      "practical " + p.code + " references unknown spec point " + p.specPointCode);
  }

  // the structure edges contract (:372-391)
  let spToSubsection = 0;
  let subsectionToSection = 0;
  for (const t of list(relDoc["edges"], "edges", RELATIONSHIPS_RESOURCE)) {
    const m = t as Record<string, unknown>;
    require(string(m["relation"]) === "PART_OF", "structure edge relation");
    const from = string(m["from"]);
    const to = string(m["to"]);
    if (spCodes.has(from)) {
      spToSubsection++;
      require(subsectionCodes.has(to), "SP " + from + " -> unknown " + to);
    } else {
      subsectionToSection++;
      require(subsectionCodes.has(from), "structure from " + from);
    }
  }
  require(spToSubsection === SPEC_POINT_COUNT, "SP→subsection edge count");
  require(subsectionToSection === SUBSECTION_COUNT, "subsection→section edge count");

  // the concept graph layer (:192-244)
  const nodeCodes = new Set<string>();
  for (const n of conceptNodes) {
    require(!nodeCodes.has(n.code), "duplicate concept node code " + n.code);
    nodeCodes.add(n.code);
  }
  for (const p of practicals) nodeCodes.add(p.code);

  const anchors: SnapshotAnchorEdge[] = [];
  const validated: SnapshotValidatedEdge[] = [];
  let excluded = 0;
  let seenPartOf = 0;
  for (const e of list(edgesDoc["edges"], "edges", CONCEPT_EDGES_RESOURCE)) {
    const m = e as Record<string, unknown>;
    const relation = string(m["relation"]);
    const status = string(m["validation_status"]);
    if (relation === "PART_OF") {
      seenPartOf++;
      anchors.push({
        conceptCode: string(m["source"]),
        specPointCode: string(m["target"]),
        role: string(m["role"]),
      });
      continue;
    }
    if (status === "HUMAN_VALIDATED") {
      validated.push(validatedEdgeOf(m));
    } else {
      excluded++; // 3 pilot HOLDs + 2 REVIEW_REQUIRED — never materialized
    }
  }
  require(seenPartOf === ANCHOR_EDGE_COUNT, "anchor PART_OF edge count");
  require(validated.length === VALIDATED_SEMANTIC_EDGE_COUNT, "validated semantic edge count");
  require(excluded === EXCLUDED_SEMANTIC_EDGE_COUNT, "excluded semantic edge count");

  anchors.sort(
    (a, b) =>
      a.conceptCode.localeCompare(b.conceptCode) ||
      a.specPointCode.localeCompare(b.specPointCode),
  );
  validated.sort(
    (a, b) =>
      a.relation.localeCompare(b.relation) ||
      a.source.localeCompare(b.source) ||
      a.target.localeCompare(b.target),
  );

  for (const a of anchors) {
    require(nodeCodes.has(a.conceptCode) && spCodes.has(a.specPointCode),
      "anchor edge " + a.conceptCode + " -> " + a.specPointCode + " has an unknown endpoint");
  }
  const semanticEndpoints = new Set(nodeCodes);
  for (const c of spCodes) semanticEndpoints.add(c);
  for (const e of validated) {
    require(semanticEndpoints.has(e.source) && semanticEndpoints.has(e.target),
      "semantic edge " + e.source + " -> " + e.target + " has an unknown endpoint");
  }

  return {
    sections,
    subsections,
    specPoints,
    practicals,
    conceptNodes,
    anchorEdges: anchors,
    validatedSemanticEdges: validated,
  };
}

/**
 * ConceptGraphSnapshotLoader.load — the six pinned reads. The three T-C11
 * files are the byte-verbatim copies already merged under learner-me/
 * concept-graph/ (043-t2; single copy on disk, hash-pinned in both bands);
 * the three V15 substrate files live under teacher/concept-graph/.
 */
export function loadConceptGraphSnapshot(
  teacherDir: string = import.meta.dir,
): ConceptGraphSnapshot {
  const learnerDir = join(teacherDir, "../learner-me/concept-graph");
  const specPoints = readResource(SPEC_POINTS_RESOURCE, teacherDir);
  const topics = readResource(TOPICS_RESOURCE, teacherDir);
  const relationships = readResource(RELATIONSHIPS_RESOURCE, teacherDir);
  const concepts = readFileSync(join(learnerDir, "concepts.yaml"), "utf8");
  const conceptEdges = readFileSync(join(learnerDir, "concept_edges.yaml"), "utf8");
  const practicals = readFileSync(join(learnerDir, "practicals.yaml"), "utf8");
  requireSha256(SPEC_POINTS_RESOURCE, specPoints, SPEC_POINTS_SHA256);
  requireSha256(TOPICS_RESOURCE, topics, TOPICS_SHA256);
  requireSha256(RELATIONSHIPS_RESOURCE, relationships, RELATIONSHIPS_SHA256);
  requireSha256(CONCEPTS_RESOURCE, concepts, CONCEPTS_SHA256);
  requireSha256(CONCEPT_EDGES_RESOURCE, conceptEdges, CONCEPT_EDGES_SHA256);
  requireSha256(PRACTICALS_RESOURCE, practicals, PRACTICALS_SHA256);
  return parseConceptGraphSnapshot({ specPoints, topics, relationships, concepts, conceptEdges, practicals });
}
