/**
 * T-MIG-033 tranche 3 — SME admin services (frozen law @ 6cad6ef).
 *
 * Ports, constraint-for-constraint (line refs = SmeQuestionIngestService.java
 * unless noted):
 *   - SmeQuestionAdminController (:1-62)      → routes/sme.ts (the two
 *     surfaces + BankStatusView record :55-61)
 *   - SmeQuestionIngestService.ingest (:138-299) → ingest() below: the
 *     ADR-026 REPLACE, evidence-safe, in ONE transaction — every currently
 *     ACTIVE question whose external ref the package re-emits is
 *     deactivated (rows survive: attempts, the pending marking queue, BKT
 *     evidence and FK chains untouched) and the package is inserted fresh
 *     (questions PAST_PAPER + difficulty_source=SME, VALIDATED v1 versions,
 *     VALIDATED mark schemes with one mark point per part, secondary topic
 *     mappings, question→spec-point mappings AI_VALIDATED, stem/solution
 *     assets). The deactivation is SLICE-SCOPED to the package's own refs
 *     (:167-174): importing subject #2 leaves the serving 4CH1 pilot bank
 *     — and its real learner evidence — untouched.
 *   - the MIXED law (:63-70, :226-268): a STRUCTURED package question whose
 *     parts carry options is emitted in the production -pN/-s multi-row
 *     family shape (one MCQ row per option-bearing part `-pK` with the
 *     part's prompt as stem + its options, one `-s` structured row for the
 *     plain parts); every family row carries the same topic tags,
 *     difficulty and expected time.
 *   - validate() (:437-559): fail-closed — wrong package version, duplicate
 *     external refs (INCLUDING derived -pN/-s member refs, :537-547),
 *     unresolvable topic/spec codes, MCQs without exactly one correct
 *     option, part-marks mismatches, dangling or traversal-looking asset
 *     references — the whole package rejects (400) and the live bank stays
 *     untouched.
 *   - sourceDocIdOf (:315-319): the package's own source id, the
 *     chemistry-era constant only as fallback (fabricated-provenance guard).
 *   - contentTypeOf (:576-584): SVG deliberately DEMOTED to
 *     application/octet-stream (stored-XSS defense in depth — R14).
 *   - asset store (:279-289): no corpus key — an asset-bearing package
 *     replaces it wholesale; a package that ships NO assets leaves the
 *     serving store untouched.
 *   - SmeQuestionSpecPointRepository (:1-42): the spec-point mapping table
 *     writes this tranche performs; the batched read projection
 *     (findCodesByQuestionIdsIn :26-33) already lives with the learner
 *     question view (T-MIG-031) and is NOT re-ported here.
 *
 * Transaction shape: unzip + validate are pure memory work with zero DB
 * statements, so they run BEFORE sql.transaction opens (net behavior
 * identical to the @Transactional method — a failure still writes nothing);
 * every DB statement (KG resolution, deactivate, inserts, asset replace)
 * runs inside the one transaction and any failure rolls the whole package
 * back.
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; column lists and literals inline as static template text.
 * Multi-value predicates use the fleet's `= any(${ids}::type[])` convention.
 */
import type { SqlFn } from "../assessment/sql";
import { BadRequestError, type SubmitClock } from "../selfmark";
import {
  smePackageSchema,
  type SmeBankStatus,
  type SmeIngestSummary,
  type SmePackage,
  type SmeQuestion,
} from "@syllabai/contracts";
import { readEachZip, ZipFormatError, zipLimitsDefaults } from "./zip-safety";

// ── frozen constants (SmeQuestionIngestService :88-100) ─────────────────────

export const SUPPORTED_PACKAGE_VERSION = "1.0";
/**
 * Fallback source document id for packages that omit `source` (:89-95) —
 * the chemistry-era constant. Recording it on a maths row would be
 * fabricated provenance.
 */
export const SOURCE_DOCUMENT_ID = "sme-eq-igcse-chemistry-19";
export const EXTRACTION_METHOD = "sme-corpus-import-v1 (ADR-026)";

/** :98-99 — asset filename law (match() anchors fully). */
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,511}$/;
/** :100 — stem/solution markdown asset references: (assets/NAME) */
const ASSET_REF = /\(assets\/([^)\s]+)\)/g;

/** the transaction affordance the composition root's createSql exposes */
export interface SmeTxSql extends SqlFn {
  transaction: <T>(body: (tx: SqlFn) => Promise<T>) => Promise<T>;
}

export interface SmeModule {
  /** POST /admin/question-bank/ingest — the ADR-026 replace (:138-299). */
  ingest(zipBytes: Uint8Array): Promise<SmeIngestSummary>;
  /** GET /admin/question-bank/status — the live bank snapshot (:425-433). */
  status(): Promise<SmeBankStatus>;
}

/**
 * Every external ref the ingest will EMIT for one package question (:321-348)
 * — the base ref, plus the derived `-pK` MCQ member refs and the `-s`
 * structured member ref for mixed questions. Drives BOTH the slice-scoped
 * deactivation and the extended ref-uniqueness validation.
 */
export function emittedRowRefs(q: SmeQuestion): string[] {
  const refs = [q.externalRef ?? ""];
  if ("STRUCTURED" === (q.questionType ?? null) && q.parts != null) {
    let pIdx = 0;
    let anyOptionPart = false;
    let anyPlainPart = false;
    for (const p of q.parts) {
      if (p.options != null && p.options.length > 0) {
        anyOptionPart = true;
        pIdx++;
        refs.push(`${q.externalRef}-p${pIdx}`);
      } else {
        anyPlainPart = true;
      }
    }
    if (anyOptionPart && anyPlainPart) {
      refs.push(`${q.externalRef}-s`);
    }
  }
  return refs;
}

/** worked solution for a part label (:301-311) — null when the part is unknown. */
function solutionOf(q: SmeQuestion, label: string | null): string | null | undefined {
  if (q.parts == null) {
    return null;
  }
  for (const p of q.parts) {
    if (label === (p.label ?? null)) {
      return p.solutionMd ?? null;
    }
  }
  return null;
}

/** the package's own source document id, chemistry constant as fallback (:315-319) */
function sourceDocIdOf(pkg: SmePackage): string {
  const source = pkg.source ?? null;
  return source === null || source.trim() === ""
    ? SOURCE_DOCUMENT_ID
    : source;
}

/**
 * Extension → served media type (:571-584). SVG is deliberately DEMOTED to
 * application/octet-stream: it would otherwise be served inline from the app
 * origin (script-capable media type = stored-XSS shape on a learner-facing
 * path; ingestion is admin-gated, serving is defense in depth). Raster
 * images + PDF are the legitimate inline set.
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

/**
 * Java Set.add(E) returns true iff the element was NOT already present —
 * JS Set.add returns the set (always truthy), so duplicate detection goes
 * through this explicit helper (the :448 / :475 / :491 / :512 laws).
 */
function addTo(set: Set<string>, value: string): boolean {
  if (set.has(value)) {
    return false;
  }
  set.add(value);
  return true;
}

/** asset markdown references in one text field (:561-569) */
function collectRefs(md: string | null | undefined, into: Set<string>): void {
  if (md == null) {
    return;
  }
  for (const m of md.matchAll(ASSET_REF)) {
    into.add(m[1]!);
  }
}

/**
 * Fail-closed validation (:437-559) — every message verbatim. Java-primitive
 * binding defaults (int → 0, boolean → false) reproduce Jackson exactly:
 * absent marks/difficulty/time land in "bad marks/difficulty/time on X".
 */
export function validateSmePackage(
  pkg: SmePackage | null,
  assetBytes: Map<string, Uint8Array>,
): void {
  if (pkg == null || pkg.questions == null || pkg.questions.length === 0) {
    throw new BadRequestError("package carries no questions");
  }
  if (SUPPORTED_PACKAGE_VERSION !== (pkg.packageVersion ?? null)) {
    throw new BadRequestError(
      `unsupported package version: ${pkg.packageVersion ?? null}`,
    );
  }
  const refs = new Set<string>();
  const referencedAssets = new Set<string>();
  for (const q of pkg.questions) {
    const ref = q.externalRef ?? null;
    if (
      ref === null ||
      ref.trim() === "" ||
      ref.length > 80 ||
      !addTo(refs, ref)
    ) {
      throw new BadRequestError(`bad or duplicate externalRef: ${ref}`);
    }
    if (
      (q.marks ?? 0) <= 0 ||
      (q.difficulty ?? 0) < 1 ||
      (q.difficulty ?? 0) > 5 ||
      (q.expectedTimeSeconds ?? 0) <= 0
    ) {
      throw new BadRequestError(`bad marks/difficulty/time on ${ref}`);
    }
    const isMcq = "MCQ_SINGLE" === (q.questionType ?? null);
    const isStructured = "STRUCTURED" === (q.questionType ?? null);
    if (!isMcq && !isStructured) {
      throw new BadRequestError(`unknown questionType on ${ref}`);
    }
    if (q.primaryTopicCode == null || q.primaryTopicCode.trim() === "") {
      throw new BadRequestError(`missing primaryTopicCode on ${ref}`);
    }
    if (isMcq) {
      if (q.options == null || q.options.length < 2) {
        throw new BadRequestError(`MCQ needs >=2 options: ${ref}`);
      }
      const correct = q.options.filter((o) => o.isCorrect === true).length;
      if (correct !== 1) {
        throw new BadRequestError(
          `MCQ must have exactly one correct option: ${ref}`,
        );
      }
      const labels = new Set<string>();
      for (const o of q.options) {
        if (o.label == null || !addTo(labels, o.label)) {
          throw new BadRequestError(`bad/duplicate option label: ${ref}`);
        }
      }
    } else {
      if (q.parts == null || q.parts.length === 0) {
        throw new BadRequestError(`STRUCTURED needs parts: ${ref}`);
      }
      const sum = q.parts.reduce((acc, p) => acc + (p.marks ?? 0), 0);
      if (sum !== (q.marks ?? 0)) {
        throw new BadRequestError(
          `part marks sum != question marks on ${ref}`,
        );
      }
      const labels = new Set<string>();
      for (const p of q.parts) {
        if (
          p.label == null ||
          p.label.trim() === "" ||
          !addTo(labels, p.label)
        ) {
          throw new BadRequestError(`bad/duplicate part label: ${ref}`);
        }
        // ADR-026 amendment (:495-518): option-bearing parts inside a
        // STRUCTURED question make it MIXED — each obeys the MCQ option
        // rules (the ingest emits it as a -pK MCQ row)
        if (p.options != null) {
          if (p.options.length < 2) {
            throw new BadRequestError(
              `option part needs >=2 options: ${ref} part ${p.label}`,
            );
          }
          const correct = p.options.filter((o) => o.isCorrect === true).length;
          if (correct !== 1) {
            throw new BadRequestError(
              `option part must have exactly one correct option: ${ref} part ${p.label}`,
            );
          }
          const optionLabels = new Set<string>();
          for (const o of p.options) {
            if (o.label == null || !addTo(optionLabels, o.label)) {
              throw new BadRequestError(
                `bad/duplicate option label on ${ref} part ${p.label}`,
              );
            }
          }
        }
      }
    }
    if (q.specPoints != null) {
      for (const sp of q.specPoints) {
        if (
          sp.code == null ||
          sp.code.trim() === "" ||
          (!("PRIMARY" === (sp.role ?? null)) && !("SECONDARY" === (sp.role ?? null)))
        ) {
          throw new BadRequestError(`bad spec point on ${ref}`);
        }
      }
    }
    collectRefs(q.stem, referencedAssets);
    collectRefs(q.solutionMd, referencedAssets);
    if (q.parts != null) {
      for (const p of q.parts) {
        collectRefs(p.prompt, referencedAssets);
        collectRefs(p.solutionMd, referencedAssets);
      }
    }
    // derived -pN/-s member refs join the uniqueness set (:537-547) — a
    // package that literally contains the ref a mixed emission would derive
    // must not pass validation (the DB unique constraint would only fire
    // after partial work inside the transaction)
    const emitted = emittedRowRefs(q);
    for (let i = 1; i < emitted.length; i++) {
      if (!addTo(refs, emitted[i]!)) {
        throw new BadRequestError(`duplicate externalRef: ${emitted[i]}`);
      }
    }
  }
  for (const name of referencedAssets) {
    if (!assetBytes.has(name)) {
      throw new BadRequestError(
        `referenced asset missing from package: ${name}`,
      );
    }
  }
  for (const name of assetBytes.keys()) {
    if (!SAFE_FILENAME.test(name)) {
      throw new BadRequestError(`unsafe asset filename: ${name}`);
    }
  }
}

interface ParsedPackage {
  pkg: SmePackage | null;
  assetBytes: Map<string, Uint8Array>;
}

/** :590-626 — unzip under ZipSafety budgets, then bind package.json. */
export function unzipSmePackage(zipBytes: Uint8Array): ParsedPackage {
  const assetBytes = new Map<string, Uint8Array>();
  let packageJson: string | null = null;
  try {
    readEachZip(zipBytes, zipLimitsDefaults(), (name, data) => {
      if ("package.json" === name) {
        packageJson = new TextDecoder().decode(data);
      } else if (name.startsWith("assets/")) {
        assetBytes.set(name.slice("assets/".length), data);
      }
    });
  } catch (e) {
    if (e instanceof BadRequestError) {
      throw e;
    }
    if (e instanceof ZipFormatError) {
      // the IOException translation (:612-614)
      throw new BadRequestError(
        "could not read the corpus package (not a ZIP?)",
      );
    }
    throw e;
  }
  if (packageJson === null) {
    throw new BadRequestError("package.json missing from the corpus package");
  }
  let value: unknown;
  try {
    value = JSON.parse(packageJson);
  } catch {
    throw new BadRequestError(
      "package.json is not valid sme-question-package JSON",
    );
  }
  if (value === null) {
    // Jackson readValue("null") binds a null reference → validate() answers
    // "package carries no questions" (no JsonMappingException)
    return { pkg: null, assetBytes };
  }
  const parsed = smePackageSchema.safeParse(value);
  if (!parsed.success) {
    // the JsonMappingException translation (:620-624) — a binding-failure
    // class, never a new law (see the contracts header)
    throw new BadRequestError(
      "package.json is not valid sme-question-package JSON",
    );
  }
  return { pkg: parsed.data, assetBytes };
}

const defaultClock: SubmitClock = {
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
};

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Live factory — the composition root hands the createSql client (which
 * carries the begin/commit/rollback transaction affordance) and a clock.
 * No LLM seams: the SME ingest is deterministic corpus plumbing.
 */
export function buildSmeModule(sql: SmeTxSql, clock: SubmitClock = defaultClock): SmeModule {
  const ingest = async (zipBytes: Uint8Array): Promise<SmeIngestSummary> => {
    const parsed = unzipSmePackage(zipBytes);
    const pkg = parsed.pkg;
    const assetBytes = parsed.assetBytes;
    validateSmePackage(pkg, assetBytes);
    const questions = pkg!.questions!;

    return sql.transaction(async (tx) => {
      const nowIso = clock.now().toISOString();
      const sourceDocId = sourceDocIdOf(pkg!);

      // ── resolve KG codes once (:145-162) — validation guarantees presence,
      //    NOT resolvability: an unknown code is still a 400
      const byCode = new Map<string, string>();
      const needed: string[] = [];
      for (const q of questions) {
        if (q.primaryTopicCode != null && !needed.includes(q.primaryTopicCode)) {
          needed.push(q.primaryTopicCode);
        }
        for (const t of q.secondaryTopicCodes ?? []) {
          if (!needed.includes(t)) needed.push(t);
        }
        for (const sp of q.specPoints ?? []) {
          if (sp.code != null && !needed.includes(sp.code)) needed.push(sp.code);
        }
      }
      for (const code of needed) {
        const rows = await tx`select id from knowledge_nodes where code = ${code}`;
        if (rows.length === 0) {
          throw new BadRequestError(`unknown KG code: ${code}`);
        }
        byCode.set(code, rows[0]!.id as string);
      }

      // ── slice-scoped replace (:167-174): deactivate exactly the active
      //    rows this package re-emits
      const emittedRefs = questions.flatMap((q) => emittedRowRefs(q));
      const deactivated = (
        await tx`update questions set active = false where active = true and external_ref = any(${emittedRefs}::text[]) returning 1`
      ).length;

      let mcq = 0;
      let structured = 0;
      let partsN = 0;
      let optionsN = 0;
      let markPointsN = 0;
      let spN = 0;
      let topicN = 0;

      /** one Question row (:350-359): PAST_PAPER provenance, SME difficulty source */
      const insertQuestionRow = async (
        ref: string,
        questionType: string,
        stem: string | null,
        marks: number,
        q: SmeQuestion,
      ): Promise<string> => {
        const id = clock.newId();
        await tx`insert into questions (id, external_ref, question_type, stem, marks, difficulty, expected_time_seconds, command_word, primary_topic_node_id, provenance, active, version, created_at, exam_paper_id, difficulty_source) values (${id}, ${ref}, ${questionType}, ${stem}, ${marks}, ${q.difficulty ?? 0}, ${q.expectedTimeSeconds ?? 0}, ${q.commandWord ?? null}, ${byCode.get(q.primaryTopicCode!)}, 'PAST_PAPER', true, 1, ${nowIso}, null, ${q.difficultySource ?? null})`;
        return id;
      };

      /** the VALIDATED v1 version + validated mark scheme (:361-377); 1 mark point */
      const insertVersionAndScheme = async (
        questionId: string,
        stem: string | null,
        marks: number,
        difficulty: number,
        expectedTimeSeconds: number,
        commandWord: string | null,
        solutionMd: string | null,
        markPointMarks: number,
      ): Promise<void> => {
        const versionId = clock.newId();
        await tx`insert into question_versions (id, question_id, version, stem, marks, difficulty, expected_time_seconds, command_word, validation_state, source_document_id, extraction_confidence, extraction_method, created_at) values (${versionId}, ${questionId}, 1, ${stem}, ${marks}, ${difficulty}, ${expectedTimeSeconds}, ${commandWord}, 'VALIDATED', ${sourceDocId}, null, ${EXTRACTION_METHOD}, ${nowIso})`;
        const schemeId = clock.newId();
        await tx`insert into mark_schemes (id, question_version_id, version_label, source_document_id, validation_state, extraction_method, created_at, general_guidance) values (${schemeId}, ${versionId}, '1', ${sourceDocId}, 'VALIDATED', ${EXTRACTION_METHOD}, ${nowIso}, null)`;
        const mpId = clock.newId();
        await tx`insert into mark_points (id, mark_scheme_id, question_part_id, ref, ordering, text, marks, acceptance_criteria, extraction_confidence, created_at) values (${mpId}, ${schemeId}, null, 'a', 0, ${solutionMd ?? stem}, ${markPointMarks}, ${"[]"}::jsonb, null, ${nowIso})`;
      };

      /** structured body (:379-409): part rows in order + one mark point per part */
      const insertStructuredBody = async (
        questionId: string,
        q: SmeQuestion,
        parts: NonNullable<SmeQuestion["parts"]>,
      ): Promise<number> => {
        const totalMarks = parts.reduce((acc, p) => acc + (p.marks ?? 0), 0);
        const versionId = clock.newId();
        await tx`insert into question_versions (id, question_id, version, stem, marks, difficulty, expected_time_seconds, command_word, validation_state, source_document_id, extraction_confidence, extraction_method, created_at) values (${versionId}, ${questionId}, 1, ${q.stem ?? ""}, ${totalMarks}, ${q.difficulty ?? 0}, ${q.expectedTimeSeconds ?? 0}, ${q.commandWord ?? null}, 'VALIDATED', ${sourceDocId}, null, ${EXTRACTION_METHOD}, ${nowIso})`;
        const schemeId = clock.newId();
        await tx`insert into mark_schemes (id, question_version_id, version_label, source_document_id, validation_state, extraction_method, created_at, general_guidance) values (${schemeId}, ${versionId}, '1', ${sourceDocId}, 'VALIDATED', ${EXTRACTION_METHOD}, ${nowIso}, null)`;
        const partRows: Array<{ partId: string; part: (typeof parts)[number] }> = [];
        let order = 0;
        for (const part of parts) {
          const partId = clock.newId();
          await tx`insert into question_parts (id, question_version_id, label, prompt, command_word, marks, ordering, created_at) values (${partId}, ${versionId}, ${part.label ?? null}, ${part.prompt ?? null}, ${part.commandWord ?? null}, ${part.marks ?? 0}, ${order++}, ${nowIso})`;
          partRows.push({ partId, part });
        }
        let mpOrder = 0;
        for (const { partId, part } of partRows) {
          const sol = solutionOf(q, part.label ?? null);
          const mpId = clock.newId();
          await tx`insert into mark_points (id, mark_scheme_id, question_part_id, ref, ordering, text, marks, acceptance_criteria, extraction_confidence, created_at) values (${mpId}, ${schemeId}, ${partId}, ${part.label ?? null}, ${mpOrder++}, ${sol ?? part.prompt ?? null}, ${part.marks ?? 0}, ${"[]"}::jsonb, null, ${nowIso})`;
        }
        return partRows.length;
      };

      /** secondary topic mappings (:411-421) — every family row carries the SAME tags */
      const insertTopicRows = async (
        q: SmeQuestion,
        rowId: string,
      ): Promise<number> => {
        const secondaries = q.secondaryTopicCodes ?? [];
        for (const t of secondaries) {
          await tx`insert into question_topics (id, question_id, node_id, is_primary, created_at) values (${clock.newId()}, ${rowId}, ${byCode.get(t)}, false, ${nowIso})`;
        }
        return secondaries.length;
      };

      const insertOptions = async (
        rowId: string,
        options: NonNullable<SmeQuestion["options"]>,
      ): Promise<number> => {
        let order = 0;
        for (const o of options) {
          await tx`insert into question_options (id, question_id, label, option_text, is_correct, misconception_node_id, ordering, created_at) values (${clock.newId()}, ${rowId}, ${o.label ?? null}, ${o.text ?? null}, ${o.isCorrect === true}, null, ${order++}, ${nowIso})`;
        }
        return options.length;
      };

      for (const q of questions) {
        const isMcq = "MCQ_SINGLE" === (q.questionType ?? null);
        let primaryRow: string | null = null; // first emitted row of this family
        if (isMcq) {
          mcq++;
          primaryRow = await insertQuestionRow(
            q.externalRef!,
            "MCQ_SINGLE",
            q.stem ?? "",
            q.marks ?? 0,
            q,
          );
          await insertVersionAndScheme(
            primaryRow,
            q.stem ?? "",
            q.marks ?? 0,
            q.difficulty ?? 0,
            q.expectedTimeSeconds ?? 0,
            q.commandWord ?? null,
            q.solutionMd == null ? (q.stem ?? null) : q.solutionMd,
            q.marks ?? 0,
          );
          markPointsN++;
          optionsN += await insertOptions(primaryRow, q.options ?? []);
          await insertTopicRows(q, primaryRow);
          topicN += q.secondaryTopicCodes == null ? 0 : q.secondaryTopicCodes.length;
        } else {
          const optionParts = (q.parts ?? []).filter(
            (p) => p.options != null && p.options.length > 0,
          );
          const plainParts = (q.parts ?? []).filter(
            (p) => !(p.options != null && p.options.length > 0),
          );
          if (optionParts.length === 0) {
            // pure structured question — the original single-row shape (:213-225)
            structured++;
            primaryRow = await insertQuestionRow(
              q.externalRef!,
              "STRUCTURED",
              q.stem ?? "",
              q.marks ?? 0,
              q,
            );
            partsN += await insertStructuredBody(primaryRow, q, q.parts ?? []);
            markPointsN += (q.parts ?? []).length;
            await insertTopicRows(q, primaryRow);
            topicN += q.secondaryTopicCodes == null ? 0 : q.secondaryTopicCodes.length;
          } else {
            // MIXED question (:226-267) — the production -pN/-s multi-row
            // family shape (QuestionFamilyAssembler reassembles the base ref)
            structured++;
            let pIdx = 0;
            for (const p of optionParts) {
              pIdx++;
              const mcqRow = await insertQuestionRow(
                `${q.externalRef}-p${pIdx}`,
                "MCQ_SINGLE",
                p.prompt ?? null,
                p.marks ?? 0,
                q,
              );
              if (primaryRow === null) {
                primaryRow = mcqRow;
              }
              await insertVersionAndScheme(
                mcqRow,
                p.prompt ?? null,
                p.marks ?? 0,
                q.difficulty ?? 0,
                q.expectedTimeSeconds ?? 0,
                p.commandWord ?? null,
                p.solutionMd == null ? (p.prompt ?? null) : p.solutionMd,
                p.marks ?? 0,
              );
              markPointsN++;
              optionsN += await insertOptions(mcqRow, p.options ?? []);
              await insertTopicRows(q, mcqRow);
              topicN += q.secondaryTopicCodes == null ? 0 : q.secondaryTopicCodes.length;
            }
            if (plainParts.length > 0) {
              const structuredRow = await insertQuestionRow(
                `${q.externalRef}-s`,
                "STRUCTURED",
                q.stem ?? "",
                plainParts.reduce((acc, p) => acc + (p.marks ?? 0), 0),
                q,
              );
              partsN += await insertStructuredBody(structuredRow, q, plainParts);
              markPointsN += plainParts.length;
              await insertTopicRows(q, structuredRow);
              topicN += q.secondaryTopicCodes == null ? 0 : q.secondaryTopicCodes.length;
            }
          }
        }
        if (q.specPoints != null && primaryRow != null) {
          for (const sp of q.specPoints) {
            await tx`insert into question_spec_points (id, question_id, spec_point_node_id, role, provenance, validation_state, created_at) values (${clock.newId()}, ${primaryRow}, ${byCode.get(sp.code!)}, ${sp.role ?? null}, ${sp.provenance ?? "AI_VALIDATED"}, 'AI_VALIDATED', ${nowIso})`;
            spN++;
          }
        }
      }

      // the asset store has no corpus key (:279-289) — an asset-bearing
      // package replaces it wholesale, but a package that ships no assets
      // must leave the serving store untouched
      if (assetBytes.size > 0) {
        await tx`delete from question_asset`;
        for (const [name, bytes] of assetBytes) {
          await tx`insert into question_asset (filename, content_type, size_bytes, bytes, ingested_at) values (${name}, ${contentTypeOf(name)}, ${bytes.length}, ${"\\x" + toHex(bytes)}::bytea, ${nowIso})`;
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
        corpusVersion: pkg!.corpusVersion ?? null,
      };
    });
  };

  /** live bank snapshot (:425-433) — counts of what is serving right now */
  const status = async (): Promise<SmeBankStatus> => {
    const activeRows = await sql`select count(*)::int as n from questions where active = true`;
    const mcqRows = await sql`select count(*)::int as n from questions where active = true and question_type = 'MCQ_SINGLE'`;
    const spRows = await sql`select count(*)::int as n from question_spec_points`;
    const assetRows = await sql`select count(*)::int as n from question_asset`;
    const active = Number(activeRows[0]?.n ?? 0);
    const mcq = Number(mcqRows[0]?.n ?? 0);
    return {
      activeQuestions: active,
      activeMcq: mcq,
      activeStructured: active - mcq,
      specPointMappings: Number(spRows[0]?.n ?? 0),
      assets: Number(assetRows[0]?.n ?? 0),
    };
  };

  return { ingest, status };
}
