/**
 * T-MIG-033 tranche 3 — SME question-bank admin services (frozen law
 * @ 6cad6ef).
 *
 * Ports, constraint-for-constraint:
 *   - SmeQuestionIngestService (:84-627)  → SmeQuestionIngestService
 *     (ADR-026 replace semantics, evidence-safe: slice-scoped deactivation of
 *     exactly the active rows the package re-emits + fresh insert of the
 *     corpus, fail-closed validation with the verbatim messages, mixed
 *     -pN/-s family emission, spec-point AI_VALIDATED mappings, asset-store
 *     wholesale replace ONLY when the package ships assets, SVG demotion).
 *   - SmeQuestionPackageDtos (:15-94)     → the parse tree in ./package.ts
 *     (Jackson readValue parity: ignoreUnknown, primitive defaults,
 *     type-mismatch = the not-valid-JSON translation).
 *   - SmeQuestionAdminController.BankStatusView (:55-61) → the view below.
 *   - ZipSafety (:32-153)                 → ./zip.ts (bounded walker).
 *
 * Transactionality: the frozen ingest is one @Transactional (evidence-safe
 * replace — attempts, pending marking queue, BKT evidence and FK chains
 * survive on the deactivated rows). The port runs every statement of the
 * replace inside the createSql adapter's begin/commit/rollback
 * (identity/users.ts transaction seam — the register-repository precedent),
 * so a mid-ingest failure rolls the whole slice back. Unit tests forward
 * the transaction to the base fakeSql (the statements themselves are the
 * tested surface; adapter atomicity is the driver's, proven live by the
 * T-MIG-044/046 Neon runs).
 *
 * Spring @PrePersist notes: Java stamps createdAt with a fresh
 * Instant.now() per entity persist (the ingest's `now` variable feeds only
 * the asset ingestedAt); the port stamps one clock.now() for the whole
 * ingest — sub-microsecond skew, never wire-observable. The java log.info
 * line is not wire-visible and is not replicated.
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; column lists inline as static template text. Multi-value
 * lookups use the fleet's `= any(${ids}::text[])` convention.
 */
import type { SqlFn } from "../assessment/sql";
import { BadRequestError, type SubmitClock } from "../selfmark";
import {
  NOT_VALID_PACKAGE_JSON,
  PackageFormatError,
  parsePackage,
  type SmeIngestSummary,
  type SmePackage,
  type SmeQuestion,
} from "./package";
import { ArchiveFormatError, readEach, zipLimitsDefaults, type ZipLimits } from "./zip";

/** the driver-agnostic sql seam + the adapter's transaction (per-module declared) */
export type TxSqlFn = SqlFn & {
  transaction: <T>(body: (tx: SqlFn) => Promise<T>) => Promise<T>;
};

// ── frozen constants (SmeQuestionIngestService :88-100) ─────────────────────

export const SUPPORTED_PACKAGE_VERSION = "1.0";
/**
 * Fallback source document id for packages that omit `source` — the
 * chemistry-era constant (SmeQuestionIngestService.java:95).
 */
export const SOURCE_DOCUMENT_ID = "sme-eq-igcse-chemistry-19";
export const EXTRACTION_METHOD = "sme-corpus-import-v1 (ADR-026)";

/** :98-99 */
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,511}$/;
/** :100 */
const ASSET_REF = /\(assets\/([^)\s]+)\)/g;

// ── views (frozen record component names — the DTO-boundary law) ────────────

/** SmeQuestionAdminController.BankStatusView (:55-61) — live bank snapshot. */
export interface BankStatusView {
  activeQuestions: number;
  activeMcq: number;
  activeStructured: number;
  specPointMappings: number;
  assets: number;
}

type AssetMap = Map<string, Uint8Array>;

interface ParsedPackage {
  pkg: SmePackage;
  assetBytes: AssetMap;
}

// ── pure helpers (package-visible laws) ─────────────────────────────────────

/** the package's own source document id, chemistry constant as fallback (:315-319) */
export function sourceDocIdOf(pkg: SmePackage): string {
  return pkg.source === null || pkg.source.trim() === ""
    ? SOURCE_DOCUMENT_ID
    : (pkg.source as string);
}

/**
 * Every external ref the ingest will EMIT for one package question — the
 * base ref, plus the derived `-pK` MCQ member refs and the `-s` structured
 * member ref for mixed questions (:321-348). Drives both the slice-scoped
 * deactivation and the extended ref-uniqueness validation.
 */
export function emittedRowRefs(q: SmeQuestion): string[] {
  const refs: string[] = [q.externalRef as string];
  if (q.questionType === "STRUCTURED" && q.parts !== null) {
    let pIdx = 0;
    let anyOptionPart = false;
    let anyPlainPart = false;
    for (const p of q.parts) {
      if (p.options !== null && p.options.length > 0) {
        anyOptionPart = true;
        pIdx++;
        refs.push((q.externalRef as string) + "-p" + pIdx);
      } else {
        anyPlainPart = true;
      }
    }
    if (anyOptionPart && anyPlainPart) {
      refs.push((q.externalRef as string) + "-s");
    }
  }
  return refs;
}

/**
 * Extension → served media type (R14, :571-584). SVG is deliberately
 * DEMOTED to application/octet-stream: it would otherwise be served inline
 * from the app origin (script-capable media type = stored-XSS shape on a
 * learner-facing path; ingestion is admin-gated, serving is defense in
 * depth). Raster images + PDF are the legitimate inline set.
 */
export function contentTypeOf(filename: string): string {
  const f = filename.toLowerCase();
  if (f.endsWith(".png")) return "image/png";
  if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
  if (f.endsWith(".gif")) return "image/gif";
  if (f.endsWith(".webp")) return "image/webp";
  if (f.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

/** solution md of the part with the given label, else null (:301-311) */
function solutionOf(q: SmeQuestion, label: string): string | null {
  if (q.parts === null) return null;
  for (const p of q.parts) {
    if (label === p.label) return p.solutionMd;
  }
  return null;
}

function collectRefs(md: string | null, into: Set<string>): void {
  if (md === null) return;
  ASSET_REF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ASSET_REF.exec(md)) !== null) {
    into.add(m[1]!);
  }
}

// ── the service ─────────────────────────────────────────────────────────────

export class SmeQuestionIngestService {
  constructor(
    private readonly sql: TxSqlFn,
    private readonly clock: SubmitClock,
  ) {}

  /**
   * ADR-026 replace ingest (:138-299). Pure parse + fail-closed validation
   * run BEFORE the transaction; every DB statement of the replace runs
   * inside one transaction (the frozen @Transactional).
   */
  async ingest(zipBytes: Uint8Array): Promise<SmeIngestSummary> {
    const parsed = this.unzip(zipBytes);
    const pkg = parsed.pkg;
    const assetBytes = parsed.assetBytes;
    this.validate(pkg, assetBytes);
    return this.replace(pkg, assetBytes);
  }

  /** the transactional replace (:145-298 minus the pure prologue) */
  private async replace(pkg: SmePackage, assetBytes: AssetMap): Promise<SmeIngestSummary> {
    const questions = pkg.questions ?? [];
    return this.sql.transaction(async (tx) => {
      // ── resolve KG codes once (validation guarantees presence) (:146-162)
      const byCode = new Map<string, string>();
      const needed: string[] = [];
      const seenCode = new Set<string>();
      const addNeeded = (code: string | null) => {
        if (code !== null && !seenCode.has(code)) {
          seenCode.add(code);
          needed.push(code);
        }
      };
      for (const q of questions) {
        addNeeded(q.primaryTopicCode);
        if (q.secondaryTopicCodes !== null) {
          for (const t of q.secondaryTopicCodes) addNeeded(t);
        }
        if (q.specPoints !== null) {
          for (const sp of q.specPoints) addNeeded(sp.code);
        }
      }
      if (needed.length > 0) {
        // batched findByCode (Java resolves per code; the missing-code error
        // is raised in the SAME first-missing insertion order)
        const rows = (await tx`
          select id, code from knowledge_nodes where code = any(${needed}::text[])
        `) as unknown as Array<{ id: string; code: string }>;
        const found = new Map(rows.map((r) => [r.code, r.id]));
        for (const code of needed) {
          const id = found.get(code);
          if (id === undefined) {
            throw new BadRequestError("unknown KG code: " + code);
          }
          byCode.set(code, id);
        }
      }

      const now = this.clock.now().toISOString();
      const sourceDocId = sourceDocIdOf(pkg);

      // slice-scoped replace (:167-174): deactivate exactly the active rows
      // this package re-emits — subject #2's import never touches the
      // serving 4CH1 pilot bank
      const emittedRefs: string[] = [];
      for (const q of questions) {
        emittedRefs.push(...emittedRowRefs(q));
      }
      const deactivatedRows = (await tx`
        update questions set active = false
        where active = true and external_ref = any(${emittedRefs}::text[])
        returning id
      `) as unknown as Array<{ id: string }>;
      const deactivated = deactivatedRows.length;

      let mcq = 0,
        structured = 0,
        partsN = 0,
        optionsN = 0,
        markPointsN = 0,
        spN = 0,
        topicN = 0;

      for (const q of questions) {
        const isMcq = q.questionType === "MCQ_SINGLE";
        let primaryRow: string | null = null; // first emitted row of this family
        if (isMcq) {
          mcq++;
          primaryRow = await this.saveCorpusRow(tx, sourceDocId, q.externalRef as string, "MCQ_SINGLE", q.stem === null ? "" : q.stem, q.marks, q, byCode.get(q.primaryTopicCode as string) as string);
          await this.saveVersionAndScheme(
            tx, primaryRow, sourceDocId, q.stem === null ? "" : q.stem, q.marks,
            q.difficulty, q.expectedTimeSeconds, q.commandWord,
            q.solutionMd === null ? q.stem : q.solutionMd, q.marks,
          );
          markPointsN++;
          let order = 0;
          for (const o of q.options ?? []) {
            await this.insertOption(tx, primaryRow, o, order++);
            optionsN++;
          }
          topicN += await this.saveTopicRows(tx, q, byCode, primaryRow);
        } else {
          const optionParts: SmeQuestion["parts"] = [];
          const plainParts: SmeQuestion["parts"] = [];
          for (const p of q.parts ?? []) {
            if (p.options !== null && p.options.length > 0) optionParts.push(p);
            else plainParts.push(p);
          }
          if (optionParts.length === 0) {
            // pure structured question — the original single-row shape
            structured++;
            primaryRow = await this.saveCorpusRow(tx, sourceDocId, q.externalRef as string, "STRUCTURED", q.stem === null ? "" : q.stem, q.marks, q, byCode.get(q.primaryTopicCode as string) as string);
            partsN += await this.saveStructuredBody(tx, primaryRow, sourceDocId, q, q.parts ?? []);
            markPointsN += q.parts?.length ?? 0;
            topicN += await this.saveTopicRows(tx, q, byCode, primaryRow);
          } else {
            // MIXED question — the production -pN/-s multi-row family shape
            // (QuestionFamilyAssembler reassembles the base ref) (:226-268)
            structured++;
            let pIdx = 0;
            for (const p of optionParts) {
              pIdx++;
              const mcqRow = await this.saveCorpusRow(tx, sourceDocId, (q.externalRef as string) + "-p" + pIdx, "MCQ_SINGLE", p.prompt as string, p.marks, q, byCode.get(q.primaryTopicCode as string) as string);
              if (primaryRow === null) primaryRow = mcqRow;
              await this.saveVersionAndScheme(
                tx, mcqRow, sourceDocId, p.prompt as string, p.marks,
                q.difficulty, q.expectedTimeSeconds, p.commandWord,
                p.solutionMd === null ? p.prompt : p.solutionMd, p.marks,
              );
              markPointsN++;
              let order = 0;
              for (const o of p.options ?? []) {
                await this.insertOption(tx, mcqRow, o, order++);
                optionsN++;
              }
              topicN += await this.saveTopicRows(tx, q, byCode, mcqRow);
            }
            if (plainParts.length > 0) {
              const plainMarks = plainParts.reduce((sum, p) => sum + p.marks, 0);
              const structuredRow = await this.saveCorpusRow(tx, sourceDocId, (q.externalRef as string) + "-s", "STRUCTURED", q.stem === null ? "" : q.stem, plainMarks, q, byCode.get(q.primaryTopicCode as string) as string);
              partsN += await this.saveStructuredBody(tx, structuredRow, sourceDocId, q, plainParts);
              markPointsN += plainParts.length;
              topicN += await this.saveTopicRows(tx, q, byCode, structuredRow);
            }
          }
        }
        if (q.specPoints !== null && primaryRow !== null) {
          for (const sp of q.specPoints) {
            await tx`
              insert into question_spec_points (id, question_id, spec_point_node_id,
                role, provenance, validation_state, created_at)
              values (${this.clock.newId()}, ${primaryRow}, ${byCode.get(sp.code as string) as string},
                ${sp.role}, ${sp.provenance === null ? "AI_VALIDATED" : sp.provenance}, ${"AI_VALIDATED"}, ${now})
            `;
            spN++;
          }
        }
      }

      // the asset store has no corpus key — an asset-bearing package still
      // replaces it wholesale (ADR-026), but a package that ships no assets
      // (the layer-3 maths package) must leave the serving store untouched
      // (:279-289)
      if (assetBytes.size > 0) {
        await tx`delete from question_asset`;
        for (const [name, bytes] of assetBytes) {
          await tx`
            insert into question_asset (filename, content_type, size_bytes, bytes, ingested_at)
            values (${name}, ${contentTypeOf(name)}, ${bytes.length}, ${bytes}, ${now})
          `;
        }
      }

      return {
        questions: questions.length,
        mcq,
        structured,
        parts: partsN,
        options: optionsN,
        markPoints: markPointsN,
        specPointMappings: spN,
        topicMappings: topicN,
        assets: assetBytes.size,
        deactivated,
        corpusVersion: pkg.corpusVersion,
      };
    });
  }

  /** live bank snapshot for the admin status endpoint (:424-433) */
  async status(): Promise<BankStatusView> {
    const activeRows = (await this.sql`
      select count(*)::int as count from questions where active = true
    `) as unknown as Array<{ count: number }>;
    const mcqRows = (await this.sql`
      select count(*)::int as count from questions
      where active = true and question_type = 'MCQ_SINGLE'
    `) as unknown as Array<{ count: number }>;
    const specRows = (await this.sql`
      select count(*)::int as count from question_spec_points
    `) as unknown as Array<{ count: number }>;
    const assetRows = (await this.sql`
      select count(*)::int as count from question_asset
    `) as unknown as Array<{ count: number }>;
    const active = activeRows[0]?.count ?? 0;
    const mcq = mcqRows[0]?.count ?? 0;
    return {
      activeQuestions: active,
      activeMcq: mcq,
      activeStructured: active - mcq, // the frozen law: structured = active − mcq (:430)
      specPointMappings: specRows[0]?.count ?? 0,
      assets: assetRows[0]?.count ?? 0,
    };
  }

  // ── ADR-026 helpers (Java private statics, ported as methods over tx) ────

  /** one Question row: PAST_PAPER provenance, SME difficulty source (:350-359) */
  private async saveCorpusRow(
    tx: SqlFn,
    sourceDocId: string,
    ref: string,
    type: "MCQ_SINGLE" | "STRUCTURED",
    stem: string,
    marks: number,
    q: SmeQuestion,
    primaryTopicNodeId: string,
  ): Promise<string> {
    const id = this.clock.newId();
    await tx`
      insert into questions (id, external_ref, question_type, stem, marks, difficulty,
        expected_time_seconds, command_word, primary_topic_node_id, provenance,
        difficulty_source, active, version, created_at)
      values (${id}, ${ref}, ${type}, ${stem}, ${marks}, ${q.difficulty},
        ${q.expectedTimeSeconds}, ${q.commandWord}, ${primaryTopicNodeId}, ${"PAST_PAPER"},
        ${q.difficultySource}, ${true}, ${1}, ${this.clock.now().toISOString()})
    `;
    void sourceDocId; // the Java helper carries it for symmetry; the row itself does not use it
    return id;
  }

  /** the VALIDATED v1 version + validated scheme every MCQ row carries; 1 mark point (:361-377) */
  private async saveVersionAndScheme(
    tx: SqlFn,
    questionId: string,
    sourceDocId: string,
    stem: string,
    marks: number,
    difficulty: number,
    expectedTimeSeconds: number,
    commandWord: string | null,
    solutionMd: string | null,
    markPointMarks: number,
  ): Promise<void> {
    const versionId = this.clock.newId();
    await tx`
      insert into question_versions (id, question_id, version, stem, marks, difficulty,
        expected_time_seconds, command_word, validation_state, source_document_id,
        extraction_confidence, extraction_method, created_at)
      values (${versionId}, ${questionId}, ${1}, ${stem}, ${marks}, ${difficulty},
        ${expectedTimeSeconds}, ${commandWord}, ${"VALIDATED"}, ${sourceDocId},
        ${null}, ${EXTRACTION_METHOD}, ${this.clock.now().toISOString()})
    `;
    const schemeId = this.clock.newId();
    await tx`
      insert into mark_schemes (id, question_version_id, version_label, source_document_id,
        validation_state, extraction_method, created_at)
      values (${schemeId}, ${versionId}, ${"1"}, ${sourceDocId}, ${"VALIDATED"}, ${EXTRACTION_METHOD}, ${this.clock.now().toISOString()})
    `;
    await tx`
      insert into mark_points (id, mark_scheme_id, question_part_id, ref, ordering, text,
        marks, acceptance_criteria, extraction_confidence, created_at)
      values (${this.clock.newId()}, ${schemeId}, ${null}, ${"a"}, ${0},
        ${solutionMd === null ? stem : solutionMd}, ${markPointMarks},
        ${JSON.stringify([])}, ${null}, ${this.clock.now().toISOString()})
    `;
  }

  /** structured body: part rows in order + one mark point per part; returns the part count (:379-409) */
  private async saveStructuredBody(
    tx: SqlFn,
    questionId: string,
    sourceDocId: string,
    q: SmeQuestion,
    parts: NonNullable<SmeQuestion["parts"]>,
  ): Promise<number> {
    const plainMarks = parts.reduce((sum, p) => sum + p.marks, 0);
    const versionId = this.clock.newId();
    await tx`
      insert into question_versions (id, question_id, version, stem, marks, difficulty,
        expected_time_seconds, command_word, validation_state, source_document_id,
        extraction_confidence, extraction_method, created_at)
      values (${versionId}, ${questionId}, ${1}, ${q.stem === null ? "" : q.stem}, ${plainMarks},
        ${q.difficulty}, ${q.expectedTimeSeconds}, ${q.commandWord}, ${"VALIDATED"},
        ${sourceDocId}, ${null}, ${EXTRACTION_METHOD}, ${this.clock.now().toISOString()})
    `;
    const schemeId = this.clock.newId();
    await tx`
      insert into mark_schemes (id, question_version_id, version_label, source_document_id,
        validation_state, extraction_method, created_at)
      values (${schemeId}, ${versionId}, ${"1"}, ${sourceDocId}, ${"VALIDATED"}, ${EXTRACTION_METHOD}, ${this.clock.now().toISOString()})
    `;
    let order = 0;
    const partRows: Array<{ id: string; label: string; prompt: string; marks: number }> = [];
    for (const p of parts) {
      const partId = this.clock.newId();
      await tx`
        insert into question_parts (id, question_version_id, label, prompt, command_word, marks, ordering, created_at)
        values (${partId}, ${versionId}, ${p.label}, ${p.prompt}, ${p.commandWord}, ${p.marks}, ${order++}, ${this.clock.now().toISOString()})
      `;
      partRows.push({ id: partId, label: p.label as string, prompt: p.prompt as string, marks: p.marks });
    }
    let mpOrder = 0;
    for (const part of partRows) {
      const sol = solutionOf(q, part.label);
      await tx`
        insert into mark_points (id, mark_scheme_id, question_part_id, ref, ordering, text,
          marks, acceptance_criteria, extraction_confidence, created_at)
        values (${this.clock.newId()}, ${schemeId}, ${part.id}, ${part.label}, ${mpOrder++},
          ${sol === null ? part.prompt : sol}, ${part.marks}, ${JSON.stringify([])}, ${null}, ${this.clock.now().toISOString()})
      `;
    }
    return partRows.length;
  }

  /** secondary topic mappings — every row of a family carries the SAME tags (:411-421) */
  private async saveTopicRows(
    tx: SqlFn,
    q: SmeQuestion,
    byCode: Map<string, string>,
    row: string,
  ): Promise<number> {
    if (q.secondaryTopicCodes === null) return 0;
    for (const t of q.secondaryTopicCodes) {
      await tx`
        insert into question_topics (id, question_id, node_id, is_primary, created_at)
        values (${this.clock.newId()}, ${row}, ${byCode.get(t) as string}, ${false}, ${this.clock.now().toISOString()})
      `;
    }
    return q.secondaryTopicCodes.length;
  }

  /** one option row (misconceptionNodeId null — the corpus carries none) */
  private async insertOption(
    tx: SqlFn,
    questionId: string,
    o: { label: string | null; text: string | null; isCorrect: boolean },
    order: number,
  ): Promise<void> {
    await tx`
      insert into question_options (id, question_id, label, option_text, is_correct,
        misconception_node_id, ordering, created_at)
      values (${this.clock.newId()}, ${questionId}, ${o.label}, ${o.text}, ${o.isCorrect},
        ${null}, ${order}, ${this.clock.now().toISOString()})
    `;
  }

  // ── validation (fail-closed; :435-559) ────────────────────────────────────

  validate(pkg: SmePackage, assetBytes: AssetMap): void {
    const questions = pkg.questions;
    if (questions === null || questions.length === 0) {
      throw new BadRequestError("package carries no questions");
    }
    if (SUPPORTED_PACKAGE_VERSION !== pkg.packageVersion) {
      throw new BadRequestError("unsupported package version: " + pkg.packageVersion);
    }
    const refs = new Set<string>();
    const referencedAssets = new Set<string>();
    for (const q of questions) {
      const ref = q.externalRef;
      if (
        ref === null ||
        ref.trim() === "" ||
        ref.length > 80 ||
        refs.has(ref)
      ) {
        throw new BadRequestError("bad or duplicate externalRef: " + ref);
      }
      refs.add(ref);
      if (q.marks <= 0 || q.difficulty < 1 || q.difficulty > 5 || q.expectedTimeSeconds <= 0) {
        throw new BadRequestError("bad marks/difficulty/time on " + ref);
      }
      const isMcq = q.questionType === "MCQ_SINGLE";
      const isStructured = q.questionType === "STRUCTURED";
      if (!isMcq && !isStructured) {
        throw new BadRequestError("unknown questionType on " + ref);
      }
      if (q.primaryTopicCode === null || q.primaryTopicCode.trim() === "") {
        throw new BadRequestError("missing primaryTopicCode on " + ref);
      }
      if (isMcq) {
        if (q.options === null || q.options.length < 2) {
          throw new BadRequestError("MCQ needs >=2 options: " + ref);
        }
        const correct = q.options.filter((o) => o.isCorrect).length;
        if (correct !== 1) {
          throw new BadRequestError("MCQ must have exactly one correct option: " + ref);
        }
        const labels = new Set<string>();
        for (const o of q.options) {
          if (o.label === null || labels.has(o.label)) {
            throw new BadRequestError("bad/duplicate option label: " + ref);
          }
          labels.add(o.label);
        }
      } else {
        if (q.parts === null || q.parts.length === 0) {
          throw new BadRequestError("STRUCTURED needs parts: " + ref);
        }
        const sum = q.parts.reduce((s, p) => s + p.marks, 0);
        if (sum !== q.marks) {
          throw new BadRequestError("part marks sum != question marks on " + ref);
        }
        const labels = new Set<string>();
        for (const p of q.parts) {
          if (p.label === null || p.label.trim() === "" || labels.has(p.label)) {
            throw new BadRequestError("bad/duplicate part label: " + ref);
          }
          labels.add(p.label);
          // ADR-026 amendment: option-bearing parts inside a STRUCTURED
          // question make it MIXED — each obeys the MCQ option rules (the
          // ingest emits it as a -pK MCQ row) (:495-518)
          if (p.options !== null) {
            if (p.options.length < 2) {
              throw new BadRequestError(
                "option part needs >=2 options: " + ref + " part " + p.label,
              );
            }
            const correct = p.options.filter((o) => o.isCorrect).length;
            if (correct !== 1) {
              throw new BadRequestError(
                "option part must have exactly one correct option: " + ref + " part " + p.label,
              );
            }
            const optionLabels = new Set<string>();
            for (const o of p.options) {
              if (o.label === null || optionLabels.has(o.label)) {
                throw new BadRequestError(
                  "bad/duplicate option label on " + ref + " part " + p.label,
                );
              }
              optionLabels.add(o.label);
            }
          }
        }
      }
      if (q.specPoints !== null) {
        for (const sp of q.specPoints) {
          if (
            sp.code === null ||
            sp.code.trim() === "" ||
            (sp.role !== "PRIMARY" && sp.role !== "SECONDARY")
          ) {
            throw new BadRequestError("bad spec point on " + ref);
          }
        }
      }
      collectRefs(q.stem, referencedAssets);
      collectRefs(q.solutionMd, referencedAssets);
      if (q.parts !== null) {
        for (const p of q.parts) {
          collectRefs(p.prompt, referencedAssets);
          collectRefs(p.solutionMd, referencedAssets);
        }
      }
      // derived -pN/-s member refs join the uniqueness set — a package that
      // literally contains the ref a mixed emission would derive must not
      // pass validation (:537-547)
      const emitted = emittedRowRefs(q);
      for (let i = 1; i < emitted.length; i++) {
        if (refs.has(emitted[i]!)) {
          throw new BadRequestError("duplicate externalRef: " + emitted[i]);
        }
        refs.add(emitted[i]!);
      }
    }
    for (const name of referencedAssets) {
      if (!assetBytes.has(name)) {
        throw new BadRequestError("referenced asset missing from package: " + name);
      }
    }
    for (const name of assetBytes.keys()) {
      if (!SAFE_FILENAME.test(name)) {
        throw new BadRequestError("unsafe asset filename: " + name);
      }
    }
  }

  // ── package extraction (:586-626) ─────────────────────────────────────────

  unzip(zipBytes: Uint8Array, limits: ZipLimits = zipLimitsDefaults()): ParsedPackage {
    const assetBytes: AssetMap = new Map();
    let packageJson: string | null = null;
    try {
      readEach(zipBytes, limits, (name, data) => {
        if (name === "package.json") {
          packageJson = new TextDecoder().decode(data);
        } else if (name.startsWith("assets/")) {
          assetBytes.set(name.slice("assets/".length), data);
        }
      });
    } catch (e) {
      if (e instanceof BadRequestError) throw e; // budget/guard failures keep their verbatim messages
      if (e instanceof ArchiveFormatError) {
        throw new BadRequestError("could not read the corpus package (not a ZIP?)");
      }
      throw e;
    }
    if (packageJson === null) {
      throw new BadRequestError("package.json missing from the corpus package");
    }
    try {
      return { pkg: parsePackage(packageJson), assetBytes };
    } catch (e) {
      if (e instanceof PackageFormatError) {
        throw new BadRequestError(NOT_VALID_PACKAGE_JSON);
      }
      throw e;
    }
  }
}

// ── module composition ───────────────────────────────────────────────────────

export interface SmeModule {
  ingestService: SmeQuestionIngestService;
}

export function buildSmeModule(sql: TxSqlFn, clock: SubmitClock): SmeModule {
  return { ingestService: new SmeQuestionIngestService(sql, clock) };
}
