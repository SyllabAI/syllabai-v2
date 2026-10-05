/**
 * Integration tier — the T-MIG-020 content-review SQL against a REAL Neon
 * database (T-MIG-010 precedent: same INTEGRATION_DATABASE_URL env contract,
 * copy-on-write branch of production per BASELINE_DB.md, or production with
 * the same read-only discipline).
 *
 * Requires: INTEGRATION_DATABASE_URL — postgresql://…ep-….neon.tech/…
 * Skipped (loudly, by design) when the URL is absent — CI runs the unit
 * tier; the integration run's receipt is attached to the PR (§2.5).
 *
 * Environment note (receipt run-003): this sandbox's DNS allowlist blocks
 * *.neon.tech (api.neon.tech included) — the tier is UNBLOCKED by the
 * operator's Neon PAT but cannot execute from this sandbox; it runs as-is
 * in any DNS-unlocked environment (CI with the secret, or operator side).
 *
 * READ-ONLY LAW: every statement here is a SELECT. No INSERT/UPDATE/DELETE/
 * DDL — production integrity per BASELINE_DB.md §4. PII law: assertions and
 * logs carry COUNTS and BOOLEANS only, never row payloads.
 */
import { describe, expect, test } from "bun:test";
import { buildContentModule } from "../../src/services/content";
import { createSql } from "../../src/services/identity/users";
import type { SqlFn } from "../../src/services/content/sql";

const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const integrationTest = DB_URL ? test : test.skip;
const NIL = "00000000-0000-0000-0000-000000000000";

const module_ = DB_URL
  ? buildContentModule(createSql(DB_URL) as unknown as SqlFn)
  : null;

describe("T-MIG-020 content-review SQL against live Neon (read-only)", () => {
  integrationTest("documents: PK lookup + corpus-law gate on a nil uuid", async () => {
    const m = module_!;
    expect(await m.documents.findById(NIL)).toBeNull();
    expect(await m.documents.existsCitable(NIL)).toBe(false);
    const top = await m.documents.findTopByDocumentIdOrderByDocVersionDesc("no-such-doc-id");
    expect(top).toBeNull();
  });

  integrationTest("exam papers: PK miss, suggested/validated counts", async () => {
    const m = module_!;
    expect(await m.examPapers.findById(NIL)).toBeNull();
    const suggested = await m.examPapers.findSuggested();
    const validated = await m.examPapers.findValidated();
    console.log(`[neon-smoke] exam_papers suggested=${suggested.length} validated=${validated.length}`);
    expect(suggested.length).toBeGreaterThanOrEqual(0);
    expect(validated.length).toBeGreaterThanOrEqual(0);
  });

  integrationTest("review queues v1/v2/v3 run over the real store", async () => {
    const m = module_!;
    const v1 = await m.review.reviewQueue();
    console.log(
      `[neon-smoke] review-queue papers=${v1.papers.length} suggestedVersions=${v1.suggestedVersions} suggestedSchemes=${v1.suggestedSchemes}`,
    );
    expect(v1.suggestedVersions).toBeGreaterThanOrEqual(0);
    const v2 = await m.review.enrichedReviewQueue();
    expect(v2.papers.length).toBe(v1.papers.length); // same findSuggested driver
    const v3 = await m.review.enrichedReviewQueueV3();
    console.log(`[neon-smoke] review-queue-v3 practicableTopicCount=${v3.practicableTopicCount}`);
    expect(v3.practicableTopicCount).toBeGreaterThanOrEqual(0);
  });

  integrationTest("aggregate censuses return well-formed rows", async () => {
    const m = module_!;
    const versionCensus = await m.questionVersions.countByPaperAndState();
    const schemeCensus = await m.markSchemes.countByPaperAndState();
    const census = await m.questions.countAndMappedByPaper();
    const links = await m.markSchemes.countQuestionsWithSchemesByPaper();
    console.log(
      `[neon-smoke] censuses versions=${versionCensus.length} schemes=${schemeCensus.length} paper-census=${census.length} scheme-links=${links.length}`,
    );
    for (const r of [...versionCensus, ...schemeCensus]) {
      expect(r.count).toBeGreaterThanOrEqual(0);
    }
    for (const r of census) {
      expect(r.mapped).toBeLessThanOrEqual(r.total);
    }
  });

  integrationTest("batch loaders + audit union accept uuid arrays over the wire", async () => {
    const m = module_!;
    const questions = await m.questions.findByIds([NIL]);
    expect(questions.size).toBe(0);
    const nodes = await m.knowledgeNodes.findByIds([NIL]);
    expect(nodes.size).toBe(0);
    const schemes = await m.markSchemes.findFirstByQuestionVersionIds([NIL]);
    expect(schemes.size).toBe(0);
    const audit = await m.reviewAudit.findPaperAudit(NIL, [NIL], [NIL], [NIL]);
    expect(audit).toEqual([]);
  });

  integrationTest("question topic rows: unknown question → the captured 404 law", async () => {
    const m = module_!;
    expect(m.review.questionTopicRows(NIL)).rejects.toThrow(
      `question ${NIL} not found`,
    );
  });
});
