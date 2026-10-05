/**
 * Servable-question taxonomy port (T-MIG-031 tranche 1).
 *
 * Frozen law (ServableQuestionService.taxonomy, syllabai-core @ 6cad6ef):
 * the servable-question taxonomy (session-112) — sections → topics with the
 * question counts the exam-questions browser sidebar and the practice topic
 * picker render. Computed under the SAME servability boundary as every list
 * path (this service is the one owner of that rule — the taxonomy cannot
 * drift from what GET /api/v1/questions?topicNodeId= actually serves).
 *
 *   - A question counts under a topic when the topic list would serve it
 *     there: PRIMARY mapping or any secondary question_topics mapping,
 *     deduped per question — so the sidebar count is exactly the length of
 *     the list a click loads.
 *   - rootId, when given, scopes the taxonomy to a subject's PART_OF subtree
 *     (unknown roots 404 exactly like the question list — graph.node(rootId)
 *     runs FIRST, before any question work).
 *   - Grouping rides the knowledge graph: each counted topic node is grouped
 *     under its PART_OF parent (the section — a UNIT node on 4CH1).
 *     Structural duplicate PART_OF edges exist (the seed wrote several); a
 *     topic with several distinct parents is grouped under the
 *     deterministically-LOWEST parent id so the response is stable.
 *   - Topics with no PART_OF parent, or mapped to nodes missing from the
 *     graph, are not browsable and are skipped — the taxonomy is the shape
 *     of what can be practised, not the syllabus.
 *   - Deduped census (session-116): a question mapped to several browsable
 *     topics counts ONCE per section and once in the view total — the
 *     sidebar's per-topic badges stay reachable counts (badge == list length
 *     on click), the section/view totals are the deduped numbers that kill
 *     the sum-the-sidebar double-counting confusion. The session-121 family
 *     census mirrors the same dedup at whole-question granularity, over the
 *     same browsability boundary (same family key /families groups by).
 *   - Sections are code-ordered (by the section node's code), topics within
 *     a section code-ordered — deterministic like every other read model.
 *   - Topics with zero servable questions do not appear; an empty census
 *     returns {sections: [], 0, 0}.
 */
import type {
  QuestionTopicTaxonomyView,
  StudentQuestionView,
  TaxonomySection,
} from "@syllabai/contracts";
import { NotFoundException } from "../identity/errors";
import type { QuestionFamilyAssembler } from "./families";
import type { ServableQuestions } from "./servable";
import type { SqlFn } from "./sql";

interface TopicRow {
  question_id: string;
  node_id: string;
}

interface NodeRow {
  id: string;
  code: string;
  title: string;
}

export class QuestionTaxonomy {
  constructor(
    private readonly sql: SqlFn,
    private readonly servable: ServableQuestions,
    private readonly families: QuestionFamilyAssembler,
  ) {}

  async taxonomy(rootId: string | null): Promise<QuestionTopicTaxonomyView> {
    // subject scope first: unknown root 404s here, before any question work
    // (knowledgeGraph.subtreeIds → graph.node(rootId) NotFoundException law)
    let scope: Set<string> | null = null;
    if (rootId !== null) {
      scope = new Set(await this.subtreeIds(rootId));
    }

    // candidates under the V20 paper gate + servability spec — the same
    // findAllActive + filterBlockedPapers + spec the list path runs
    const all = await this.servable.allActive();

    // The census works on the SERVABLE set with (type, primary topic, id,
    // externalRef) — but the per-topic reachability needs the topic mappings
    // incl. secondaries, which the servable projection does not carry. Query
    // them batched (findByQuestionIdIn).
    const servableIds = new Set(all.map((q) => q.id));
    const topicsByQuestion = new Map<string, Set<string>>();
    for (const q of all) {
      if (q.primaryTopicNodeId !== null) {
        topicsByQuestion.set(q.id, new Set([q.primaryTopicNodeId]));
      }
    }
    if (all.length > 0) {
      const mappings = (await this.sql`
        select question_id, node_id from question_topics
        where question_id = any(${[...servableIds]}::uuid[])`) as unknown as TopicRow[];
      for (const m of mappings) {
        const set = topicsByQuestion.get(m.question_id);
        if (set) set.add(m.node_id);
        else topicsByQuestion.set(m.question_id, new Set([m.node_id]));
      }
    }

    // per-topic census, scope-filtered — [total, mcq, structured]; the
    // family census rides the same loop (Set per topic, deduped by the
    // family key — the SAME key /families groups by, so a topic's
    // familyCount is exactly its whole-question list length)
    const countsByTopic = new Map<string, [number, number, number]>();
    const familyKeysByTopic = new Map<string, Set<string>>();
    const familyByQuestion = new Map<string, string>();
    for (const q of all) {
      familyByQuestion.set(q.id, this.families.familyKey(q.externalRef, q.id));
    }
    for (const q of all) {
      for (const nodeId of topicsByQuestion.get(q.id) ?? []) {
        if (scope !== null && !scope.has(nodeId)) continue;
        const counts = countsByTopic.get(nodeId) ?? [0, 0, 0];
        counts[0]++;
        if (q.type === "MCQ_SINGLE") counts[1]++;
        else if (q.type === "STRUCTURED") counts[2]++;
        countsByTopic.set(nodeId, counts);
        const keys = familyKeysByTopic.get(nodeId) ?? new Set<string>();
        keys.add(familyByQuestion.get(q.id)!);
        familyKeysByTopic.set(nodeId, keys);
      }
    }
    if (countsByTopic.size === 0) {
      return { sections: [], totalDistinctQuestions: 0, totalDistinctFamilies: 0 };
    }

    // node metadata for the counted topics…
    const nodeById = new Map<string, NodeRow>();
    for (const n of await this.nodesById([...countsByTopic.keys()])) {
      nodeById.set(n.id, n);
    }
    // …and their PART_OF parents (deduped against duplicate structural edges:
    // deterministically-lowest parent id wins the merge)
    const parentByTopic = new Map<string, string>();
    if (countsByTopic.size > 0) {
      const edges = await this.sql`
        select source_id, target_id from knowledge_edges
        where relation_type = 'PART_OF'
          and source_id = any(${[...countsByTopic.keys()]}::uuid[])`;
      for (const e of edges) {
        const source = String(e.source_id);
        const target = String(e.target_id);
        const existing = parentByTopic.get(source);
        if (existing === undefined || target < existing) {
          parentByTopic.set(source, target);
        }
      }
    }
    const parentById = new Map<string, NodeRow>();
    const parentValues = [...new Set(parentByTopic.values())];
    if (parentValues.length > 0) {
      for (const n of await this.nodesById(parentValues)) {
        parentById.set(n.id, n);
      }
    }

    // browsable topic -> its section: the same two guards the grouping has
    // always applied (node in the graph + PART_OF parent in the graph),
    // extracted once so the deduped census and the grouping can never
    // disagree on what is browsable
    const sectionByTopic = new Map<string, string>();
    for (const [topicId] of countsByTopic) {
      if (!nodeById.has(topicId)) continue; // mapping to a node outside the graph cannot be browsed
      const parent = parentByTopic.get(topicId);
      if (parent === undefined || !parentById.has(parent)) continue; // no PART_OF parent: not browsable from a section sidebar
      sectionByTopic.set(topicId, parent);
    }

    // deduped census (session-116): a question mapped to several browsable
    // topics counts ONCE per section and once in the view total
    const questionsBySection = new Map<string, Set<string>>();
    const distinctQuestions = new Set<string>();
    const familiesBySection = new Map<string, Set<string>>();
    const distinctFamilies = new Set<string>();
    for (const q of all) {
      for (const nodeId of topicsByQuestion.get(q.id) ?? []) {
        if (scope !== null && !scope.has(nodeId)) continue;
        const sectionId = sectionByTopic.get(nodeId);
        if (sectionId === undefined) continue; // not browsable: the per-topic census drops it too
        const qs = questionsBySection.get(sectionId) ?? new Set<string>();
        qs.add(q.id);
        questionsBySection.set(sectionId, qs);
        distinctQuestions.add(q.id);
        const familyKey = familyByQuestion.get(q.id)!;
        const fs = familiesBySection.get(sectionId) ?? new Set<string>();
        fs.add(familyKey);
        familiesBySection.set(sectionId, fs);
        distinctFamilies.add(familyKey);
      }
    }

    // group topics under their section, both code-ordered (deterministic)
    const topicsBySection = new Map<string, QuestionTopicTaxonomyView["sections"][number]["topics"]>();
    for (const [topicId, counts] of countsByTopic) {
      const sectionId = sectionByTopic.get(topicId);
      if (sectionId === undefined) continue; // not browsable (the guards above)
      const topic = nodeById.get(topicId)!;
      const list = topicsBySection.get(sectionId) ?? [];
      list.push({
        nodeId: topic.id,
        code: topic.code,
        title: topic.title,
        questionCount: counts[0],
        mcqCount: counts[1],
        structuredCount: counts[2],
        familyCount: familyKeysByTopic.get(topicId)?.size ?? 0,
      });
      topicsBySection.set(sectionId, list);
    }
    const sections: TaxonomySection[] = [...topicsBySection.entries()]
      .sort((a, b) => {
        const codeA = parentById.get(a[0])!.code;
        const codeB = parentById.get(b[0])!.code;
        return codeA < codeB ? -1 : codeA > codeB ? 1 : 0;
      })
      .map(([sectionId, topics]) => {
        const section = parentById.get(sectionId)!;
        return {
          nodeId: section.id,
          code: section.code,
          title: section.title,
          distinctQuestionCount: questionsBySection.get(sectionId)?.size ?? 0,
          distinctFamilyCount: familiesBySection.get(sectionId)?.size ?? 0,
          topics: [...topics].sort((a, b) =>
            a.code < b.code ? -1 : a.code > b.code ? 1 : 0,
          ),
        };
      });
    return {
      sections,
      totalDistinctQuestions: distinctQuestions.size,
      totalDistinctFamilies: distinctFamilies.size,
    };
  }

  /** knowledgeNodes.findAllById (batched). */
  private async nodesById(ids: string[]): Promise<NodeRow[]> {
    if (ids.length === 0) return [];
    return (await this.sql`
      select id, code, title from knowledge_nodes
      where id = any(${ids}::uuid[])`) as unknown as NodeRow[];
  }

  /**
   * The node ids of a root's whole PART_OF subtree (inclusive) — verbatim
   * port of KnowledgeNodeRepository.findSubtreeIds (recursive CTE), with the
   * graph.node(rootId) 404-first contract (KnowledgeGraphService.subtreeIds
   * :174-177). Read-only; the CTE is declared here because the content
   * lane's CurriculumScopeResolver keeps its copy private (fence law: import
   * the EXPORTED shape or declare your own — the exported shape does not fit
   * this contract; disclosed in the task yaml).
   *
   * PUBLIC since tranche-2 (fence-internal, disclosed): the route layer
   * composes it for QuestionController.list/families' rootId paths — the
   * frozen controller calls knowledgeGraph.subtreeIds(rootId) DIRECTLY for
   * those two endpoints (:48, :67), the same 404-first resolver /topics gets
   * inside the service. One implementation, three call sites, exactly like
   * the frozen topology.
   */
  async subtreeIds(rootId: string): Promise<string[]> {
    const node = await this.sql`
      select id from knowledge_nodes where id = ${rootId}`;
    if (node.length === 0) {
      throw new NotFoundException("knowledge node", rootId);
    }
    const rows = await this.sql`
      WITH RECURSIVE subtree AS (
          SELECT n.id
          FROM knowledge_nodes n
          WHERE n.id = ${rootId}
          UNION
          SELECT e.source_node_id
          FROM knowledge_edges e
          JOIN subtree s ON e.target_node_id = s.id
          WHERE e.relation_type = 'PART_OF'
      )
      SELECT n.id FROM knowledge_nodes n WHERE n.id IN (SELECT id FROM subtree)`;
    return rows.map((r) => String(r.id));
  }
}
