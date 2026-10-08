/**
 * GraphKnowledgeRetriever port (T-MIG-060 tranche 1) — frozen source
 * @ 6cad6ef: GraphKnowledgeRetriever.java :46-187, line-against-line, plus
 * the batched KG reads it composes (KnowledgeGraphService.prerequisiteChains
 * :132-140 / misconceptionsForTopics :154-162; KnowledgeNodeRepository.java
 * :77-95 the recursive-CTE prerequisite walk + :126-133 the MISCONCEPTION_OF
 * edges — ported VERBATIM as sql).
 *
 * KG-side retrieval (T-024): deterministic intent resolution over the
 * curriculum structure. Query tokens are matched against UNIT/TOPIC/SUBTOPIC
 * titles (whole-token, case-insensitive); match score is specificity — the
 * fraction of the node title the query actually names. No LLM invents
 * entities here (Master Spec §7). Known v0 limitation, documented honestly
 * (:37-43): matching is title-only with plural normalization but no real
 * stemming or synonymy.
 *
 * §7: only VALIDATED curriculum nodes may inform what serves to learners —
 * SUGGESTED/UNVALIDATED seeds are invisible to the tutor until a teacher
 * validates them. T-C07: additionally restricted to the active curriculum's
 * intent surface.
 */
import type { SqlFn } from "./sql";
import { inList } from "./session-store";
import {
  type KnowledgeContext,
  type MatchedTopic,
  type MisconceptionSignal,
  type PrerequisiteLink,
} from "./context";

/** Single-token precision floor (productization §7, :65). */
export const SINGLE_TOKEN_MIN_SPECIFICITY = 0.5;

/** STOP_TOKENS (:67-70) — the exact frozen set. */
const STOP_TOKENS = new Set([
  "the", "and", "for", "are", "what", "which", "how", "does", "why", "with",
  "from", "into", "this", "that", "explain", "describe", "state", "define",
  "about", "help", "me", "my", "can", "you", "give", "using", "use", "when",
]);

/**
 * Query/title tokenizer (:156-183): lowercase, alphanumeric split, stop
 * tokens and 1–2 char fragments dropped, and a symmetric plural
 * normalization (trailing "s" stripped when 4+ chars) applied to BOTH sides.
 * Symmetry keeps the match deterministic: both sides use this exact
 * function, never a stemmer with a vocabulary.
 */
export function tokensOf(text: string | null | undefined): Set<string> {
  if (text == null || text.trim().length === 0) return new Set();
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP_TOKENS.has(raw)) continue;
    tokens.add(normalizePlural(raw));
  }
  return tokens;
}

function normalizePlural(token: string): string {
  if (token.length >= 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

interface StructureNodeRow {
  id: string;
  code: string;
  title: string;
  validation_status: string;
}

export interface KgGraphPort {
  /** VALIDATED UNIT/TOPIC/SUBTOPIC/SUBJECT structure nodes (the matcher
   *  only ever sees VALIDATED rows — the filter may live in the port). */
  structureNodes(): Promise<StructureNodeRow[]>;
  /** Batched transitive prerequisite closures (deepest-first per origin). */
  prerequisiteChains(
    topicIds: string[],
  ): Promise<Map<string, Array<{ id: string; title: string; depth: number }>>>;
  /** Batched misconception attachments (MISCONCEPTION_OF edges INTO the topic). */
  misconceptionsForTopics(topicIds: string[]): Promise<Map<string, Array<{ id: string; title: string }>>>;
}

/**
 * The default KG port over the baseline tables (knowledge_nodes /
 * knowledge_edges). SQL ported verbatim from the frozen repository queries.
 */
export function buildSqlKgGraph(sql: SqlFn): KgGraphPort {
  return {
    async structureNodes() {
      return (await sql`
        select id, code, title, validation_status
        from knowledge_nodes
        where node_type in ('SUBJECT', 'UNIT', 'TOPIC', 'SUBTOPIC')
          and validation_status = 'VALIDATED'`) as unknown as StructureNodeRow[];
    },
    async prerequisiteChains(topicIds) {
      if (topicIds.length === 0) return new Map();
      // T-MIG-094: the 093 inList scalar-param law — a bound JS array is a
      // single wire value and 500s the Neon WebSocket wire (fakeSql cannot
      // expose binding semantics; construction pinned in
      // test/tutor/kg-retriever-wire.test.ts at the adapter boundary).
      const rows = (await sql(
        ...inList(
          `with recursive prereq as (
            select e.source_node_id as origin_id, e.target_node_id as node_id, 1 as depth
            from knowledge_edges e
            where e.source_node_id in (`,
          topicIds,
          `) and e.relation_type = 'REQUIRES_PREREQUISITE'
          union
            select p.origin_id, e.target_node_id, p.depth + 1
            from knowledge_edges e
            join prereq p on e.source_node_id = p.node_id
            where e.relation_type = 'REQUIRES_PREREQUISITE' and p.depth < 10
        )
        select origin_id, node_id, max(depth) as depth
        from prereq
        group by origin_id, node_id
        order by origin_id, depth desc, node_id`,
        ),
      )) as unknown as Array<{
        origin_id: string;
        node_id: string;
        depth: number;
      }>;
      if (rows.length === 0) return new Map();
      const prereqIds = [...new Set(rows.map((r) => r.node_id))];
      const nodeRows = (await sql(
        ...inList("select id, title from knowledge_nodes where id in (", prereqIds, ")"),
      )) as unknown as Array<{
        id: string;
        title: string;
      }>;
      const titleById = new Map(nodeRows.map((n) => [n.id, n.title]));
      const result = new Map<string, Array<{ id: string; title: string; depth: number }>>();
      for (const r of rows) {
        if (!result.has(r.origin_id)) result.set(r.origin_id, []);
        result.get(r.origin_id)!.push({
          id: r.node_id,
          title: titleById.get(r.node_id) ?? "",
          depth: Number(r.depth),
        });
      }
      return result;
    },
    async misconceptionsForTopics(topicIds) {
      if (topicIds.length === 0) return new Map();
      // MISCONCEPTION_OF runs misconception → topic (source = the
      // misconception, §7 seed contract): select edges pointing AT the topic
      // and return their sources (the JpaKnowledgeGraphRepository live-fix
      // note — both directions inverted pre-fix, misconceptions never showed).
      const rows = (await sql(
        ...inList(
          `select e.target_node_id as topic_id, n.id, n.title
        from knowledge_edges e
        join knowledge_nodes n on n.id = e.source_node_id
        where e.relation_type = 'MISCONCEPTION_OF'
          and e.target_node_id in (`,
          topicIds,
          `)
        order by e.target_node_id, n.title`,
        ),
      )) as unknown as Array<{
        topic_id: string;
        id: string;
        title: string;
      }>;
      const result = new Map<string, Array<{ id: string; title: string }>>();
      for (const r of rows) {
        if (!result.has(r.topic_id)) result.set(r.topic_id, []);
        result.get(r.topic_id)!.push({ id: r.id, title: r.title });
      }
      return result;
    },
  };
}

/**
 * retrieve (:79-154) — deterministic intent + pedagogical context. Scope is
 * MANDATORY (T-C07): retrieval never runs unscoped.
 */
export async function kgRetrieve(
  graph: KgGraphPort,
  query: string,
  maxTopics: number,
  scope: { surface: ReadonlySet<string> } | null,
): Promise<KnowledgeContext> {
  if (scope == null) {
    throw new Error(
      "curriculum scope is mandatory — retrieval never runs unscoped (T-C07)",
    );
  }
  const queryTokens = tokensOf(query);
  if (queryTokens.size === 0) {
    return { topics: [], prerequisites: [], misconceptions: [] };
  }

  const nodes = await graph.structureNodes();
  const matches = new Map<
    string,
    { node: StructureNodeRow; named: number; specificity: number }
  >();
  for (const node of nodes) {
    if (!scope.surface.has(node.id)) continue;
    if (node.validation_status !== "VALIDATED") continue;
    const titleTokens = tokensOf(node.title);
    if (titleTokens.size === 0) continue;
    let named = 0;
    for (const t of titleTokens) if (queryTokens.has(t)) named++;
    if (named === 0) continue;
    const specificity = named / titleTokens.size;
    if (named === 1 && specificity < SINGLE_TOKEN_MIN_SPECIFICITY) {
      continue; // one generic token in a long title is not "about"
    }
    matches.set(node.id, { node, named, specificity });
  }

  const ranked: MatchedTopic[] = [...matches.values()]
    .sort(
      (a, b) =>
        b.specificity - a.specificity || compareStrings(a.node.code, b.node.code),
    )
    .slice(0, Math.max(1, maxTopics))
    .map((m) => ({
      nodeId: m.node.id,
      code: m.node.code,
      title: m.node.title,
      matchScore: m.specificity,
    }));

  // M3 tranche 2: the pedagogical context of ALL matched topics is gathered
  // in two batched reads — output order: ranked-topic order outside,
  // per-topic query order inside.
  const topicIds = ranked.map((t) => t.nodeId);
  const chains =
    topicIds.length === 0
      ? new Map<string, Array<{ id: string; title: string; depth: number }>>()
      : await graph.prerequisiteChains(topicIds);
  const misByTopic =
    topicIds.length === 0
      ? new Map<string, Array<{ id: string; title: string }>>()
      : await graph.misconceptionsForTopics(topicIds);

  const prerequisites: PrerequisiteLink[] = [];
  const misconceptions: MisconceptionSignal[] = [];
  for (const topic of ranked) {
    for (const withDepth of chains.get(topic.nodeId) ?? []) {
      prerequisites.push({
        forTopicId: topic.nodeId,
        nodeId: withDepth.id,
        title: withDepth.title,
        depth: withDepth.depth,
      });
    }
    for (const misconception of misByTopic.get(topic.nodeId) ?? []) {
      misconceptions.push({
        forTopicId: topic.nodeId,
        nodeId: misconception.id,
        title: misconception.title,
      });
    }
  }
  return { topics: ranked, prerequisites, misconceptions };
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
