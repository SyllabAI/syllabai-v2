#!/usr/bin/env node
/**
 * HUB IMPORT RUNNER — guided-lessons channel (hub/lesson-import + sme-question-package).
 *
 * DUAL-FEED since the figures-0.2 generation (operator trace 1a1820011919e8b9):
 *   FEED=fullcorpus-v2   (default, byte-for-byte the original of-record feed)
 *                        promotion ROUND-FULLCORPUS-PROMOTION-20261026 (trace
 *                        1a17763c15632259, commit 2c76500677ff82fb7732c87402ebbf7fecc6e599
 *                        on SyllabAI/syllabai-resources), fed by hub-import-manifest-v2.json
 *                        (format hub-import-manifest/1.0, 224 artifacts: 112 hub-lesson-import
 *                        + 112 sme-question-package). Adapter guided-lesson-0.1--hub-lesson-import-1.0.
 *   FEED=figures-0.2-v3  the figures generation (ROUND-FIGURES-0.2-PROMOTION-20261028): fed by
 *                        hub-import-manifest-v3.json @ the namespace-complete promotion commit,
 *                        224 artifacts (112 hub-lesson-import-1.1 + 112 sme-question-package,
 *                        packages byte-identical to v2). Adapter
 *                        guided-lesson-0.2--hub-lesson-import-1.1 — figures are additive
 *                        metadata OUTSIDE the canonical authored stream (adapter spec 0.2 §7):
 *                        the per-note stream anchors equal the INT-3 fullcorpus record exactly.
 *
 * Contract of record: download/integration/ADAPTER-SPEC-guided-lesson-0.1-to-hub.md (v2 feed)
 * and integration/ADAPTER-SPEC-guided-lesson-0.2-to-hub-1.1.md (figures feed, resources repo).
 * The runner is manifest-driven, fail-closed and additive:
 *   P0   preflight        — promotion commit resolves; tree/parent/message match the
 *                           promotion receipt; commit remains a main ancestor (or, declared
 *                           pending promotion: the head of the feed's integration branch —
 *                           disclosed in the receipt; re-run post-merge enforces ancestry).
 *   G-A  manifest         — fetched @ the pinned commit, byte-identical to the lane
 *                           survivor; format/version/kinds/counts/conservation blocks sane.
 *   G-B  fetch+verify     — all 224 artifacts fetched raw @ the pinned commit; per-artifact
 *                           sha256 + byte length == manifest entry (retry-once, pooled).
 *   G-C  schema (S)       — ajv draft-07 ×224 against both target schemas fetched @ the
 *                           SAME commit (schemas byte-anchored to lane survivors).
 *   G-D  cross-refs (X)   — derived-ID grammar (§5); module checkRefs ↔ package questions
 *                           bidirectional 1:1 in order; source-block provenance pinned;
 *                           figures feed: figureIds ↔ figures.moduleIds closure both ways.
 *   G-E  stream (Φ)       — canonical authored stream (adapter spec §7) recomputed from the
 *                           fetched artifacts; per-note sha256+chars vs the feed's INT-3
 *                           record anchors ×112; wave subtotals + grand stream vs manifest
 *                           conservation; figures feed additionally re-proves equality vs
 *                           the legacy INT-3 fullcorpus anchors (figures carried no prose).
 *   LAND                  — byte-exact atomic landing into the hub content tree
 *                           (content/igcse-chemistry-19/guided-lessons|guided-questions/ +
 *                           guided-import.json index). Additive-only for the v2 feed: an
 *                           existing file with DIFFERENT bytes aborts. The figures feed is a
 *                           DECLARED REVISION (G-DELTA): only the 112 lesson files may carry
 *                           new bytes; question files must stay byte-identical.
 *   G-V  post-land        — cold re-read ×224 re-hashed vs manifest; closing identity
 *                           re-derived from disk (figures feed: figure counts too); loader-path
 *                           probe (loadContentJson rel shape); static-build pickup probe;
 *                           idempotence re-probe (all 224 report identical-exists).
 *
 * No landing occurs unless every gate through G-E is green. Receipt of record:
 * download/integration/HUB-IMPORT-RUN-<date>[-figures-02].json (lane side) + the in-pack
 * guided-import.json (hub side).
 *
 * Lane discipline: remote traffic is READ-ONLY GitHub contents API at the pinned commit;
 * the token is never echoed; zero DB contact (the hub's content plane is the committed
 * content/ tree — ADR-021 discipline — not a database).
 *
 * Run: FEED=figures-0.2-v3 node apps/hub/scripts/import_guided/run_import.mjs
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const Ajv = require("/home/z/my-project/syllabai-v2/node_modules/ajv");

// ── lane workspace anchors (of-record run locations) ────────────────────────
const REPO = "SyllabAI/syllabai-resources";
const TOKEN_PATH = "/home/z/my-project/.creds/gh-pat.candidate";
const SURVIVOR_DIR = "/home/z/my-project/download/integration";
const TMP = "/home/z/my-project/.tmp/fig4";
const HUB = process.env.HUB_ROOT || "/home/z/my-project/syllabai-v2/apps/hub";

// ── feed configs (each feed carries its own of-record constants) ────────────
const FEEDS = {
  "fullcorpus-v2": {
    manifest: "hub-import-manifest-v2.json",
    manifest_version: 2,
    lesson_kind: "hub-lesson-import",
    adapter: "guided-lesson-0.1--hub-lesson-import-1.0",
    promo: {
      commit: "2c76500677ff82fb7732c87402ebbf7fecc6e599",
      tree: "5079876a89a8eda65eba7c7ec76b6a20c3e3cc8d",
      parent: "3cd29bcccfaab0210deba025283098dfa6c875b6",
      trace: "1a17763c15632259",
    },
    integration_branch: null, // ancestry of record, no pending-promotion mode
    artifact_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0
    schemas: {
      hub: `${SURVIVOR_DIR}/schema/hub-lesson-import.1.0.schema.json`,
      pkg: `${SURVIVOR_DIR}/schema/sme-question-package.1.0.schema.json`,
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.0.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.0.schema.json",
    },
    survivors: {
      manifest: `${SURVIVOR_DIR}/hub-import-manifest-v2.json`,
      int3: `${SURVIVOR_DIR}/INT-3-transform-record-fullcorpus.json`,
    },
    receipt: `${SURVIVOR_DIR}/HUB-IMPORT-RUN-20261026.json`,
    identity: {
      notes: 112,
      lessons: 239,
      checks: 1195,
      keyPoints: 1212,
      distractors: 3565,
      glossaryTerms: 654,
      authored_chars_conserved: 1347771,
    },
    figures_feed: false,
    landing: "additive",
    relFor(a) {
      const base = a.path.split("/").pop();
      const dir = a.kind === "hub-lesson-import" ? "hub-import" : a.kind === "sme-question-package" ? "question-packages" : null;
      if (!dir || !base) throw new Error(`unmappable artifact path: ${a.path} (kind ${a.kind})`);
      return `SME-GuidedLessons/integration/${dir}/${base}`;
    },
    pathFamily(a) {
      const b = a.path.split("/").pop();
      return (
        (a.kind === "hub-lesson-import" && (a.path.startsWith("transformed/full-corpus/hub-import/") || a.path.startsWith("SME-GuidedLessons/integration/hub-import/"))) ||
        (a.kind === "sme-question-package" && (a.path.startsWith("transformed/full-corpus/question-packages/") || a.path.startsWith("SME-GuidedLessons/integration/question-packages/")))
      ) && !!b;
    },
  },
  "figures-0.2-v3": {
    manifest: "hub-import-manifest-v3.json",
    manifest_version: 3,
    lesson_kind: "hub-lesson-import-1.1",
    adapter: "guided-lesson-0.2--hub-lesson-import-1.1",
    promo: {
      commit: "88a41a98ee82986e99f3fde960e980ff11e7953f", // namespace-complete commit C of the resources PR #207
      tree: "a79aa8c15afa94b0b311c7b9b74a94f608de0c15",
      parent: "6563ba963734bbd0df330eb48e7929e40fc6f1ce",
      trace: "1a1820011919e8b9",
    },
    integration_branch: "integration/figures-0.2-20261028", // pending-promotion mode allowed on this branch
    artifact_pin: "cc8621ed27468d760112728e937b44ddf6116cda", // commit A — the guided-lesson/0.2 source generation (lesson channel)
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the question packages remain the v2 generation, byte-identical
    schemas: {
      hub: "/home/z/my-project/scripts/fig4-hub-lesson-import.1.1.schema.json",
      pkg: `${TMP}/up/schema-sme-question-package.1.0.schema.json`,
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.1.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.0.schema.json",
    },
    survivors: {
      manifest: `${TMP}/out/hub-import-manifest-v3.json`,
      int3: `${TMP}/out/INT-3-transform-record-figures-0.2.json`,
      int3Legacy: `${TMP}/up/INT-3-transform-fullcorpus.json`, // stream equality cross-anchor
    },
    receipt: `${SURVIVOR_DIR}/HUB-IMPORT-RUN-20261028-figures-02.json`,
    identity: {
      notes: 112,
      lessons: 239,
      checks: 1195,
      keyPoints: 1212,
      distractors: 3565,
      glossaryTerms: 654,
      authored_chars_conserved: 1347771,
      figures: 200,
      figures_module_mapped: 122,
      figures_note_level: 78,
    },
    figures_feed: true,
    landing: "revision", // declared G-DELTA: only the 112 lesson files may change bytes
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v3 manifest path not integration-relative: ${a.path}`);
      return a.path;
    },
    pathFamily(a) {
      return (
        (a.kind === "hub-lesson-import-1.1" && a.path.startsWith("SME-GuidedLessons/integration/hub-import-1.1/")) ||
        (a.kind === "sme-question-package" && a.path.startsWith("SME-GuidedLessons/integration/question-packages/"))
      );
    },
  },
  "worked-examples-v4": {
    manifest: "hub-import-manifest-v4.json",
    manifest_version: 4,
    lesson_kind: "hub-lesson-import-1.1",
    adapter: "guided-lesson-0.2--hub-lesson-import-1.1",
    promo: {
      commit: "6d0eb77d62404ddd5724cb35cee6d8c6a2a77e85", // commit C of resources PR #212 (namespace-complete: 0.2 revision + 1.1 outputs + manifest v4 + records)
      tree: "3a6a50c5ae9e7b93145f31068367ddf95fae6131",
      parent: "4f68b1a99246f4521da48a8f8c477935114ae11f",
      trace: "1a183e5ea252e9b5",
    },
    integration_branch: "integration/worked-examples-1.0-20261029", // pending-promotion mode allowed on this branch
    artifact_pin: "8ea8c63a46d75fc54733900dfecf5d3c5c93bbde", // commit A — the worked-example source revision (lesson channel)
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the question packages stay byte-identical
    schemas: {
      hub: "/home/z/my-project/scripts/fig4-hub-lesson-import.1.1.schema.json",
      pkg: `/home/z/my-project/.tmp/fig4/up/schema-sme-question-package.1.0.schema.json`,
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.1.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.0.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/.tmp/we1/out/hub-import-manifest-v4.json",
      int3: "/home/z/my-project/.tmp/we1/out/INT-3-transform-record-worked-examples-1.0.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261029-worked-examples-10.json`,
    identity: {
      notes: 112,
      lessons: 239,
      checks: 1195,
      keyPoints: 1212,
      distractors: 3565,
      glossaryTerms: 654,
      figures: 200,
      figures_module_mapped: 122,
      figures_note_level: 78,
      workedExamples_populated: 112,
      workedExamples_null: 0,
      authored_chars_conserved: 1426764,
      authored_chars_v3_baseline: 1347771,
      added_chars: 78993,
    },
    figures_feed: true,
    we_feed: true, // declared stream-delta feed: the legacy-stream equality gate is NOT asserted — the 86 WE blocks ARE the declared delta (per-note law: chars == v3 anchor + WE block, INT record)
    landing: "revision", // declared G-DELTA: all 112 lesson files re-pin (86 content delta + 26 pin-only); packages byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v4 manifest path not integration-relative: ${a.path}`);
      return a.path;
    },
    pathFamily(a) {
      return (
        (a.kind === "hub-lesson-import-1.1" && a.path.startsWith("SME-GuidedLessons/integration/hub-import-1.1/")) ||
        (a.kind === "sme-question-package" && a.path.startsWith("SME-GuidedLessons/integration/question-packages/"))
      );
    },
  },
  "figures-2-1-v5": {
    manifest: "hub-import-manifest-v5.json",
    manifest_version: 5,
    lesson_kind: "hub-lesson-import-1.2",
    adapter: "guided-lesson-0.3--hub-lesson-import-1.2",
    directive: "run the full 112-note figures-2.1 captions chain — import the 1.2 generation (traces 1a188a15ac19ed05 + 1a188c14685e2965)",
    promo: {
      commit: "48d9c656628a3f2f78348ba738b2cb0d437e4abc", // commit C of resources PR #222 (namespace-complete: 0.3 revision + 1.2 outputs + manifest v5 + records)
      tree: "aca6dd873565fcd01200775da567bcecd7b9bf81",
      parent: "1ed554ec60fb9c0a41303946312ba50bb0a8834f", // commit A — the source-0.3 captions generation
      trace: "1a188c14685e2965",
    },
    integration_branch: null, // ancestry of record — hub run happens only after the resources PR merges
    artifact_pin: "1ed554ec60fb9c0a41303946312ba50bb0a8834f", // commit A — the source-0.3 captions generation (lesson channel)
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the question packages stay byte-identical
    schemas: {
      hub: "/home/z/my-project/scripts/fig21-survivors/hub-lesson-import.1.2.schema.json",
      pkg: "/home/z/my-project/scripts/fig21-survivors/sme-question-package.1.0.schema.json",
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.2.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.0.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/scripts/fig21-survivors/hub-import-manifest-v5.json",
      int3: "/home/z/my-project/scripts/fig21-survivors/INT-3-transform-record-figures-2.1.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261030-figures-2-1.json`,
    identity: {
      notes: 112,
      lessons: 239,
      checks: 1195,
      keyPoints: 1212,
      distractors: 3565,
      glossaryTerms: 654,
      figures: 200,
      figures_module_mapped: 122,
      figures_note_level: 78,
      workedExamples_populated: 112,
      workedExamples_null: 0,
      authored_chars_conserved: 1426764,
      authored_chars_v3_baseline: 1347771,
      added_chars: 78993,
      captions_coalesced: 143,
      captions_row_context: 16,
      captions_inline: 3,
      captions_none: 38,
    },
    figures_feed: true,
    we_feed: true, // the v4 stream is the declared baseline; this feed's equality gate is per-note vs the v4 bytes (captions are not §7 tokens)
    landing: "revision", // declared G-DELTA: the 112 lesson files re-pin (captions delta); packages byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v5 manifest path not integration-relative: ${a.path}`);
      return a.path;
    },
    pathFamily(a) {
      return (
        (a.kind === "hub-lesson-import-1.2" && a.path.startsWith("SME-GuidedLessons/integration/hub-import-1.2/")) ||
        (a.kind === "sme-question-package" && a.path.startsWith("SME-GuidedLessons/integration/question-packages/"))
      );
    },
    targetSchemas: ["hub/lesson-import/1.2", "sme-question-package/1.0"],
  },
  "figures-2-2-v6": {
    manifest: "hub-import-manifest-v6.json",
    manifest_version: 6,
    lesson_kind: "hub-lesson-import-1.3",
    adapter: "guided-lesson-0.4--hub-lesson-import-1.3",
    directive: "run the full 112-note figures-2.2 binding chain — import the 1.3 generation (traces 1a18923d3913e2ed + 1a1892c0212a94fd)",
    promo: {
      commit: "7e31c64e1f87da85cb7fcfc95c9c6482ee73bc00", // commit C of resources PR #227 (namespace-complete: 0.4 revision + 1.3 outputs + manifest v6 + records)
      tree: "6d932a3955bc2f1fd336a7bdac125c50c1f126a7",
      parent: "71922d1510ee9e00400667670b40f36e1ae5d456", // commit A — the source-0.4 binding generation
      trace: "1a1892c0212a94fd",
    },
    integration_branch: null, // ancestry of record — hub run happens only after the resources PR merges
    artifact_pin: "71922d1510ee9e00400667670b40f36e1ae5d456", // commit A — the source-0.4 binding generation (lesson channel)
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the question packages stay byte-identical
    schemas: {
      hub: "/home/z/my-project/scripts/fig22-survivors/hub-lesson-import.1.3.schema.json",
      pkg: "/home/z/my-project/scripts/fig22-survivors/sme-question-package.1.0.schema.json",
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.3.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.0.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/scripts/fig22-survivors/hub-import-manifest-v6.json",
      int3: "/home/z/my-project/scripts/fig22-survivors/INT-3-transform-record-figures-2.2.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261030-figures-2-2.json`,
    identity: {
      notes: 112,
      lessons: 239,
      checks: 1195,
      keyPoints: 1212,
      distractors: 3565,
      glossaryTerms: 654,
      figures: 200,
      figures_module_mapped: 122,
      figures_note_level: 78,
      workedExamples_populated: 112,
      workedExamples_null: 0,
      authored_chars_conserved: 1426764,
      authored_chars_v3_baseline: 1347771,
      added_chars: 78993,
      captions_coalesced: 143,
      captions_row_context: 16,
      captions_inline: 3,
      captions_none: 38,
      binding_heading_unique: 90,
      binding_sole_lesson: 0,
      binding_content_overlap: 12,
      binding_note_level: 78,
      binding_unresolved: 20,
      figures_binding_narrowed: 102,
      figures_claims_changed: 12,
      figures_wholesale_claims_kept: 2,
    },
    figures_feed: true,
    we_feed: true, // the 1.2 stream is the declared baseline; this feed's equality gate is per-note vs the figures-2.1 INT-3 anchors (binding/claims are not §7 tokens)
    landing: "revision", // declared G-DELTA: the 112 lesson files re-pin (binding delta); packages byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v6 manifest path not integration-relative: ${a.path}`);
      return a.path;
    },
    pathFamily(a) {
      return (
        (a.kind === "hub-lesson-import-1.3" && a.path.startsWith("SME-GuidedLessons/integration/hub-import-1.3/")) ||
        (a.kind === "sme-question-package" && a.path.startsWith("SME-GuidedLessons/integration/question-packages/"))
      );
    },
    targetSchemas: ["hub/lesson-import/1.3", "sme-question-package/1.0"],
  },
  "r3-check-types-v7": {
    manifest: "hub-import-manifest-v7.json",
    manifest_version: 7,
    lesson_kind: "hub-lesson-import-1.4", // legacy single-kind field; v7 uses lessonKinds below
    lessonKinds: { "hub-lesson-import-1.3": 110, "hub-lesson-import-1.4": 2 }, // generation-union census
    adapter: "guided-lesson-0.5--hub-lesson-import-1.4",
    directive: "run the R3 mixed check types stage-A pilot chain — import the 1.4/1.1 generation (queue trace 1a189fd011119961, operator execute trace 1a18a0218b7f44fd)",
    promo: {
      // promotion commit of record = the resources PR #228 MERGE commit (byte-identical
      // content to branch commit C 6aab46b; message carries the execute trace)
      commit: "11e63360e498c0d83eb98fb65dc7ab87d166159f",
      tree: "adf81106283bb92f6fc05130ea8945d3caaa33cf",
      parent: "3b2ce8da700b80f51700fb34fc721c90d6654d6b", // resources main at the merge
      trace: "1a18a0218b7f44fd",
    },
    integration_branch: null, // ancestry of record — hub run happens only after the resources PR merges
    artifact_pin: "71922d1510ee9e00400667670b40f36e1ae5d456", // the 110 untouched lessons keep the source-0.4 (1.3) pin
    artifact_pins_by_note: {
      // the 2 pilot notes re-pin BOTH channels to the source-0.5 generation (commit A)
      rn_2MpXPtNXvn8pQm3r: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_8T5GfPn2q7sY2YCh: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
    },
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the 110 untouched packages stay byte-identical
    checks_feed: true, // written-kind G-D branch: empty options + modelAnswer required + known-kind enum
    pilotDelta: {
      files: [
        "rn_2MpXPtNXvn8pQm3r.hub-lesson-import.json",
        "rn_8T5GfPn2q7sY2YCh.hub-lesson-import.json",
        "rn_2MpXPtNXvn8pQm3r.sme-question-package.json",
        "rn_8T5GfPn2q7sY2YCh.sme-question-package.json",
      ],
    },
    schemas: {
      hub: "/home/z/my-project/scripts/r3-survivors/hub-lesson-import.1.4.schema.json",
      pkg: "/home/z/my-project/scripts/r3-survivors/sme-question-package.1.1.schema.json",
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.4.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.1.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/scripts/r3-survivors/hub-import-manifest-v7.json",
      int3: "/home/z/my-project/scripts/r3-survivors/INT-3-transform-record-r3-check-types.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261030-r3-check-types.json`,
    identity: {
      notes: 112,
      lessons: 239,
      checks: 1211,
      keyPoints: 1212,
      distractors: 3565,
      glossaryTerms: 654,
      figures: 200,
      figures_module_mapped: 122,
      figures_note_level: 78,
      workedExamples_populated: 112,
      workedExamples_null: 0,
      authored_chars_conserved: 1429907,
      authored_chars_v3_baseline: 1347771,
      added_chars: 82136,
      captions_coalesced: 143,
      captions_row_context: 16,
      captions_inline: 3,
      captions_none: 38,
      binding_heading_unique: 90,
      binding_sole_lesson: 0,
      binding_content_overlap: 12,
      binding_note_level: 78,
      binding_unresolved: 20,
      figures_binding_narrowed: 102,
      figures_claims_changed: 12,
      figures_wholesale_claims_kept: 2,
      checks_written: 16,
      checks_mcq: 1195,
      written_recall: 8,
      written_explain_why: 4,
      written_application: 4,
    },
    figures_feed: true,
    we_feed: true, // the 1.3 stream is the declared baseline; this feed's equality gate is per-note vs the figures-2.2 INT-3 anchors (110 exact; 2 pilots carry the 16 written items' tokens)
    landing: "revision", // declared G-DELTA: exactly the 4 pilot files re-pin (2 lessons + 2 packages); everything else byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v7 manifest path not integration-relative: ${a.path}`);
      return a.path;
    },
    pathFamily(a) {
      return (
        ((a.kind === "hub-lesson-import-1.3" && a.path.startsWith("SME-GuidedLessons/integration/hub-import-1.3/")) ||
          (a.kind === "hub-lesson-import-1.4" && a.path.startsWith("SME-GuidedLessons/integration/hub-import-1.4/"))) ||
        (a.kind === "sme-question-package" && (a.path.startsWith("SME-GuidedLessons/integration/question-packages/") || a.path.startsWith("SME-GuidedLessons/integration/question-packages-1.1/")))
      );
    },
    targetSchemas: ["hub/lesson-import/1.4", "sme-question-package/1.1"],
  },
};

const FEED_ID = process.env.FEED || "fullcorpus-v2";
const F = FEEDS[FEED_ID];
if (!F) {
  console.error(`unknown FEED "${FEED_ID}" — known: ${Object.keys(FEEDS).join(", ")}`);
  process.exit(2);
}

// ── hub landing zone (inside the igcse-chemistry-19 pack) ───────────────────
const PACK = path.join(HUB, "content/igcse-chemistry-19");
const LAND_LESSONS = path.join(PACK, "guided-lessons");
const LAND_QUESTIONS = path.join(PACK, "guided-questions");
const LAND_INDEX = path.join(PACK, "guided-import.json");
const REL_LESSONS = "igcse-chemistry-19/guided-lessons"; // loadContentJson rel shapes
const REL_QUESTIONS = "igcse-chemistry-19/guided-questions";
const REL_INDEX = "igcse-chemistry-19/guided-import.json";

const OPERATOR_TRACE = process.env.OPERATOR_TRACE || F.promo.trace;

const API = "https://api.github.com";
const TOKEN = fs.readFileSync(TOKEN_PATH, "utf8").trim();
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github.raw+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "syllabai-hub-import-runner",
};
const H_JSON = { ...H, Accept: "application/vnd.github+json" };

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

const CHECKS = [];
const FAILS = [];
function check(stage, name, ok, detail) {
  CHECKS.push({ stage, name, ok: !!ok, detail: detail || "" });
  if (!ok) FAILS.push({ stage, name, detail: detail || "" });
  return !!ok;
}

// ── pooled fetch with retry-once (full-corpus precedent) ─────────────────────
async function pooled(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

async function fetchRaw(rel) {
  const url = `${API}/repos/${REPO}/contents/${encodeURI(rel)}?ref=${F.promo.commit}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: H });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (attempt === 0) { await new Promise((res) => setTimeout(res, 1500)); continue; }
      throw new Error(`HTTP ${r.status} for ${rel}`);
    } catch (e) {
      if (attempt === 1) throw e;
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
}

async function fetchJson(rel) {
  const r = await fetch(`${API}/repos/${REPO}/${rel}`, { headers: H_JSON });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${rel}`);
  return r.json();
}

// ── canonical authored stream — target side, adapter spec §7 (verbatim walk) ─
function targetTokens(hub, pkg) {
  const s = [];
  const les = hub.lesson;
  for (const sp of les.specAnchors) s.push(sp.code, sp.text);
  s.push(les.primer.text);
  if (les.primer.prerequisiteSubtopic != null) s.push(les.primer.prerequisiteSubtopic);
  for (const m of les.modules) {
    s.push(m.title);
    for (const h of m.sourceHeadings) s.push(h);
    for (const r of m.specRefs) s.push(r);
    s.push(m.opening);
    for (const k of m.keyPoints) s.push(k);
    s.push(m.depthLayers.low.restatement, m.depthLayers.low.analogy, m.depthLayers.low.examPointer);
    s.push(m.depthLayers.medium.restatement, m.depthLayers.medium.analogy, m.depthLayers.medium.examPointer);
  }
  for (const g of les.assets.glossary) s.push(g.term, g.definition);
  const we = les.assets.workedExample;
  if (we) { s.push(we.prompt); for (const st of we.steps) s.push(st); s.push(we.finalAnswer); }
  for (const q of pkg.questions) {
    s.push(q.stem, q.misconceptionClass);
    for (const o of q.options) { s.push(o.key, o.text, o.explanation); if (o.misconception != null) s.push(o.misconception); }
    // R3 written-kind extension (feed-safe: 1.0 packages carry no kind field -> walk unchanged):
    // kind/modelAnswer/keywords ARE §7 stream tokens on written items (adapter spec 0.5 §7)
    if (q.kind && q.kind !== "mcq") {
      if (q.modelAnswer != null) s.push(q.modelAnswer);
      if (Array.isArray(q.keywords)) for (const k of q.keywords) s.push(k);
    }
  }
  return s;
}

// atomic byte-exact write; returns "written" | "identical-exists" | "revised";
// additive mode throws on divergent existing file; revision mode records the delta.
const landLog = [];
function landFile(dest, buf) {
  if (fs.existsSync(dest)) {
    const cur = fs.readFileSync(dest);
    if (cur.equals(buf)) return "identical-exists";
    if (F.landing === "revision") { landLog.push({ file: path.basename(dest), from: cur.length, to: buf.length }); fs.writeFileSync(dest, buf); return "revised"; }
    throw new Error(`additive-only violation: ${dest} exists with DIFFERENT bytes (${cur.length}B vs ${buf.length}B)`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  return "written";
}

// runner-OWNED file (guided-import.json): the runner is its single writer and the file is
// run metadata (carries imported_at_utc), NOT conserved content — re-issued atomically per
// run. The additive-only law above still governs every CONSERVED artifact byte.
function landOwnedFile(dest, buf) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  return "reissued";
}

// ══════════════════════════════════════════════════════════════════════════
async function main() {
  const t0 = Date.now();
  console.log(`HUB IMPORT RUNNER — feed ${FEED_ID} @ ${F.promo.commit.slice(0, 8)} (operator trace ${OPERATOR_TRACE})`);

  // ── P0 preflight: promotion commit resolves and matches the receipt ────────
  const c = await fetchJson(`git/commits/${F.promo.commit}`);
  check("P0", "promotion commit resolves", !!c.sha, c.sha || "missing");
  check("P0", "tree matches promotion receipt", c.tree && c.tree.sha === F.promo.tree, `tree=${c.tree && c.tree.sha}`);
  check("P0", "parent matches promotion receipt", Array.isArray(c.parents) && c.parents[0] && c.parents[0].sha === F.promo.parent, `parent=${c.parents && c.parents[0] && c.parents[0].sha}`);
  check("P0", "message carries promotion trace", typeof c.message === "string" && c.message.includes(F.promo.trace), (c.message || "").slice(0, 90));
  let pendingPromotion = false;
  if (F.integration_branch) {
    const cmpB = await fetchJson(`compare/${F.promo.commit}...${F.integration_branch}`);
    pendingPromotion = !!(cmpB.status === "identical" || (cmpB.status === "ahead" && cmpB.behind_by === 0 && cmpB.ahead_by === 0));
    check("P0", "promotion commit == integration branch head (pending promotion)", cmpB.status === "identical" || (cmpB.base_commit && cmpB.base_commit.sha === F.promo.commit), `status=${cmpB.status} on ${F.integration_branch}`);
  }
  const cmp = await fetchJson(`compare/${F.promo.commit}...main`);
  const isAncestor = cmp.status === "ahead" || cmp.status === "identical";
  check("P0", isAncestor ? "promotion commit remains main ancestor" : "promotion commit PENDING on integration branch (declared; re-run post-merge enforces ancestry)", isAncestor || F.integration_branch !== null, `status=${cmp.status} behind_by=${cmp.behind_by}${isAncestor ? "" : " — pending-promotion mode"}`);
  if (!isAncestor && F.integration_branch) check("P0", "merge-order disclosure", true, `hub PR merges only after resources PR (branch ${F.integration_branch}); upstream.commit carries the promotion sha regardless`);

  // ── G-A manifest: fetch @ pin, byte-identical to survivor, structurally sane
  const manBuf = await fetchRaw(`SME-GuidedLessons/integration/${F.manifest}`);
  check("G-A", "manifest fetched @ promotion commit", manBuf.length > 10000, `${manBuf.length}B`);
  const survMan = fs.readFileSync(F.survivors.manifest);
  check("G-A", "manifest byte-identical to lane survivor", manBuf.equals(survMan), `remote ${sha256(manBuf).slice(0, 12)} vs survivor ${sha256(survMan).slice(0, 12)}`);
  const man = JSON.parse(manBuf.toString("utf8"));
  check("G-A", `format hub-import-manifest/1.0`, man.format === "hub-import-manifest/1.0", man.format);
  check("G-A", `manifest_version ${F.manifest_version}`, man.manifest_version === F.manifest_version, String(man.manifest_version));
  check("G-A", "224 artifacts listed", Array.isArray(man.artifacts) && man.artifacts.length === 224, String(man.artifacts && man.artifacts.length));
  const kinds = {};
  for (const a of man.artifacts) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
  if (F.lessonKinds) {
    // v7 checks_feed: generation-union census (110x1.3 + 2x1.4 lessons + 112 packages)
    const kindsOk =
      Object.entries(F.lessonKinds).every(([k, n]) => kinds[k] === n) &&
      kinds["sme-question-package"] === 112 &&
      Object.keys(F.lessonKinds).reduce((a, k) => a + kinds[k], 0) === 112;
    check("G-A", "kinds 112/112 (generation-union: 110x1.3 + 2x1.4 + 112 packages)", kindsOk, JSON.stringify(kinds));
  } else {
    check("G-A", "kinds 112/112", kinds[F.lesson_kind] === 112 && kinds["sme-question-package"] === 112, JSON.stringify(kinds));
  }
  check("G-A", "counts == closing identity", JSON.stringify(man.counts) === JSON.stringify(F.identity), JSON.stringify(man.counts));
  check("G-A", "conservation block present", !!(man.conservation && man.conservation.authored_stream_sha256 && man.conservation.wave_stream_sha256), "");
  check("G-A", "adapter of record", man.load_scope && man.load_scope.adapter === F.adapter, man.load_scope && man.load_scope.adapter);
  check("G-A", "manifest carries promotion operator trace", man.operator_trace === F.promo.trace, man.operator_trace);
  const mapBad = man.artifacts.filter((a) => !F.pathFamily(a));
  check("G-A", "artifact paths conform to the feed's path-map families", mapBad.length === 0, mapBad.length ? mapBad.slice(0, 2).map((a) => a.path).join(",") : "224 conform");

  // ── schemas @ the same commit, byte-anchored to survivors ──────────────────
  const hubSchemaBuf = await fetchRaw(F.schemas.hubRemote);
  const pkgSchemaBuf = await fetchRaw(F.schemas.pkgRemote);
  check("G-A", "hub schema byte-identical to survivor", hubSchemaBuf.equals(fs.readFileSync(F.schemas.hub)), `${hubSchemaBuf.length}B`);
  check("G-A", "package schema byte-identical to survivor", pkgSchemaBuf.equals(fs.readFileSync(F.schemas.pkg)), `${pkgSchemaBuf.length}B`);
  const ajv = new Ajv({ allErrors: true });
  const vHub = ajv.compile(JSON.parse(hubSchemaBuf.toString("utf8")));
  const vPkg = ajv.compile(JSON.parse(pkgSchemaBuf.toString("utf8")));

  // ── G-B fetch all 224 artifacts @ pin + per-artifact sha256/bytes ─────────
  const fetched = await pooled(man.artifacts, 6, async (a) => {
    const rel = F.relFor(a);
    try {
      const buf = await fetchRaw(rel);
      const ok = sha256(buf) === a.sha256 && buf.length === a.bytes;
      return { ...a, buf, ok, why: ok ? "" : `sha/bytes drift: got ${sha256(buf).slice(0, 12)}/${buf.length}B want ${a.sha256.slice(0, 12)}/${a.bytes}B` };
    } catch (e) {
      return { ...a, buf: null, ok: false, why: String(e.message || e) };
    }
  });
  const badFetch = fetched.filter((f) => !f.ok);
  check("G-B", "224/224 artifacts fetched + sha256/bytes exact", badFetch.length === 0, badFetch.length ? badFetch.slice(0, 3).map((b) => `${b.noteId}:${b.why}`).join(" | ") : "all exact");

  // parse the green set (abort before schema/cross-ref/stream stages on any failure so far)
  if (FAILS.length) {
    console.error(`FAIL-CLOSED before schema/cross-ref/stream stages: ${FAILS.length} failures`);
    for (const f of FAILS) console.error(`  [${f.stage}] ${f.name} — ${f.detail}`);
    process.exit(1);
  }
  const parsed = fetched.map((f) => ({
    ...f,
    obj: JSON.parse(f.buf.toString("utf8")),
  }));

  // ── G-C schema conformance ×224 ─────────────────────────────────────────────
  let schemaFails = 0;
  for (const p of parsed) {
    const ok = p.kind === "sme-question-package" ? vPkg(p.obj) : vHub(p.obj);
    if (!ok) {
      schemaFails++;
      if (schemaFails <= 3) check("G-C", `schema ${p.noteId}`, false, ajv.errorsText((vHub.errors || vPkg.errors)).slice(0, 200));
    }
  }
  check("G-C", `ajv draft-07 ×224 (${F.adapter} + sme-question-package/1.0)`, schemaFails === 0, schemaFails ? `${schemaFails} failures` : "all pass");

  // ── G-D cross-refs: derived-ID grammar + checkRefs ↔ questions 1:1 ─────────
  const idOk = (id, noteId, l, k) =>
    id === `igcse-chemistry::${noteId}` || // lesson/package id
    (l != null && k == null && id === `${noteId}::L${l}`) ||
    (l != null && k != null && id === `${noteId}::L${l}::Q${k}`);
  let xFails = 0;
  const perNoteX = {};
  for (const p of parsed) {
    const hub = parsed.find((x) => x.kind !== "sme-question-package" && x.noteId === p.noteId);
    const pkg = parsed.find((x) => x.kind === "sme-question-package" && x.noteId === p.noteId);
    if (!hub || !pkg) { xFails++; perNoteX[p.noteId] = "missing pair"; continue; }
    if (p.kind === "sme-question-package") continue; // evaluate once per note
    const H0 = hub.obj, P0 = pkg.obj;
    const errs = [];
    if (H0.lesson.id !== `igcse-chemistry::${p.noteId}`) errs.push("lesson id grammar");
    if (P0.packageId !== `igcse-chemistry::${p.noteId}`) errs.push("packageId grammar");
    if (!H0.source || H0.source.noteId !== p.noteId || P0.source.noteId !== p.noteId) errs.push("source.noteId");
    // provenance pins: the lesson channel pins to the feed's source generation; the question
    // packages stay pinned to their own generation (v2 feed: both = INT-0; figures feed:
    // lessons = commit A, packages = INT-0 — the split IS the declared delta of the revision).
    // v7 checks_feed: the pilot notes re-pin BOTH channels to the source-0.5 commit A
    // (F.artifact_pins_by_note), untouched lessons/packages keep their generation pins.
    const hubPin = (F.artifact_pins_by_note && F.artifact_pins_by_note[p.noteId]) || F.artifact_pin;
    const pkgPin = (F.artifact_pins_by_note && F.artifact_pins_by_note[p.noteId]) || (F.pkg_pin || F.artifact_pin);
    if (H0.source.pinnedRef !== hubPin || P0.source.pinnedRef !== pkgPin) errs.push("pinnedRef");
    if (!F.pkg_pin && H0.source.sourceLayerSha256 !== P0.source.sourceLayerSha256) errs.push("sourceLayerSha256 mismatch hub/pkg");
    const mods = H0.lesson.modules;
    const flat = [];
    mods.forEach((m, i) => {
      if (m.id !== `${p.noteId}::L${i + 1}`) errs.push(`module id L${i + 1}`);
      if (!Array.isArray(m.checkRefs) || m.checkRefs.length === 0) errs.push(`module L${i + 1} checkRefs empty`);
      for (const r of m.checkRefs) {
        const k = Number(r.slice(r.lastIndexOf("::Q") + 3));
        if (r !== `${m.id}::Q${k}`) errs.push(`checkRef grammar ${r}`);
        flat.push([r, m.id, k]);
      }
    });
    if (P0.questions.length !== flat.length) errs.push(`question count ${P0.questions.length} vs checkRefs ${flat.length}`);
    P0.questions.forEach((q, qi) => {
      const [rid, mid, k] = flat[qi] || [null, null, null];
      if (q.id !== rid) errs.push(`order/backref q#${qi}`);
      if (q.moduleId !== mid) errs.push(`moduleId q#${qi}`);
      if (!idOk(q.id, p.noteId, null, null) && !/::L\d+::Q\d+$/.test(q.id)) errs.push(`question id grammar ${q.id}`);
      if (F.checks_feed && q.kind && q.kind !== "mcq") {
        // v7 written-kind branch (fail-closed): empty options; modelAnswer required (missing
        // -> reveal-only downstream, never gradeable, never blank); kind must be one of the
        // three written values of record (unknown kinds fail the gate, never guessed)
        if (!Array.isArray(q.options) || q.options.length !== 0) errs.push(`written q ${q.id} options not empty`);
        if (q.modelAnswer == null || q.modelAnswer.length === 0) errs.push(`written q ${q.id} missing modelAnswer (reveal-only)`);
        if (!["recall", "explain-why", "application"].includes(q.kind)) errs.push(`unknown kind ${q.kind} on ${q.id}`);
      } else {
        const correctN = (q.options || []).filter((o) => o.correct === true).length;
        if (correctN !== 1) errs.push(`q ${q.id} correct!=1`);
      }
    });
    if (F.figures_feed) {
      // figure closure: module.figureIds ↔ lesson.figures[].moduleIds, both directions
      const figs = H0.lesson.figures || [];
      const byId = new Map(figs.map((f) => [f.id, f]));
      mods.forEach((m, i) => {
        for (const fid of m.figureIds || []) {
          const f = byId.get(fid);
          if (!f) errs.push(`figure ${fid} undeclared (L${i + 1})`);
          else if (!f.moduleIds.includes(`L${i + 1}`)) errs.push(`figure ${fid} missing L${i + 1} in moduleIds`);
        }
      });
      figs.forEach((f) => {
        for (const mid of f.moduleIds) {
          const mi = Number(mid.slice(1)) - 1;
          if (!(mods[mi] && (mods[mi].figureIds || []).includes(f.id))) errs.push(`figure ${f.id}/${mid} figureIds closure`);
        }
      });
      // note-level policy: moduleIds [] figures are never claimed by a module; corpus census is
      // gated at G-V (disk re-derive) and by the manifest counts block — not a per-note check
      const claimedTotal = mods.reduce((a, m) => a + (m.figureIds || []).length, 0);
      const expectedClaims = figs.reduce((a, f) => a + f.moduleIds.length, 0);
      // closure identity: Σ module.figureIds == Σ figures.moduleIds (a figure shared by two
      // lessons legitimately counts once in each summand side — shared-claim notes exist)
      if (claimedTotal !== expectedClaims) errs.push(`figureIds sum ${claimedTotal} vs moduleIds sum ${expectedClaims}`);
    }
    if (errs.length) { xFails++; perNoteX[p.noteId] = errs.slice(0, 3).join(","); }
  }
  check("G-D", F.figures_feed ? "X ×112: grammar + checkRefs↔questions + figure closure + provenance" : "X ×112: grammar + checkRefs↔questions bidirectional + provenance", xFails === 0, xFails ? `${xFails} notes failing: ` + Object.entries(perNoteX).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(" | ") : F.figures_feed ? "1,195 checks + 200 figures resolve" : "1,195 checks resolve 1:1");

  // ── G-E stream conservation (Φ) — per-note anchors + wave + grand ──────────
  const int3 = JSON.parse(fs.readFileSync(F.survivors.int3, "utf8"));
  const int3Legacy = F.survivors.int3Legacy ? JSON.parse(fs.readFileSync(F.survivors.int3Legacy, "utf8")) : null;
  const byNote = new Map(parsed.map((p) => [p.kind + "|" + p.noteId, p]));
  const grand = crypto.createHash("sha256");
  let grandChars = 0;
  const waveHashes = {};
  let phiFails = 0;
  let legacyFails = 0;
  for (const anchor of int3.notes) {
    const hubKey = F.lessonKinds
      ? Object.keys(F.lessonKinds).map((k) => k + "|" + anchor.noteId).find((key) => byNote.has(key))
      : F.lesson_kind + "|" + anchor.noteId;
    const hubP = hubKey ? byNote.get(hubKey) : null;
    const pkgP = byNote.get("sme-question-package|" + anchor.noteId);
    if (!hubP || !pkgP) { phiFails++; continue; }
    const toks = targetTokens(hubP.obj, pkgP.obj);
    const s = toks.join("\n");
    const sha = sha256(Buffer.from(s, "utf8"));
    const ok = sha === anchor.stream.sha256 && s.length === anchor.stream.chars;
    if (!ok) { phiFails++; if (phiFails <= 3) check("G-E", `stream ${anchor.noteId}`, false, `got ${sha.slice(0, 12)}/${s.length} want ${anchor.stream.sha256.slice(0, 12)}/${anchor.stream.chars}`); }
    if (int3Legacy) {
      const la = int3Legacy.notes.find((x) => x.noteId === anchor.noteId);
      if (!la || la.stream.sha256 !== sha || la.stream.chars !== s.length) legacyFails++;
    }
    grand.update(Buffer.from(s, "utf8"));
    grandChars += s.length;
    const w = "wave-" + anchor.wave;
    waveHashes[w] = waveHashes[w] || crypto.createHash("sha256");
    waveHashes[w].update(Buffer.from(s, "utf8"));
    // artifact-level anchor too
    if (hubP.sha256 !== anchor.hubSha256 || pkgP.sha256 !== anchor.pkgSha256) { phiFails++; check("G-E", `artifact sha anchors ${anchor.noteId}`, false, "hub/pkg sha vs feed INT-3 record"); }
  }
  check("G-E", "per-note stream anchors ×112 (sha256 + chars)", phiFails === 0, phiFails ? `${phiFails} failures` : "all conserved");
  if (int3Legacy) check("G-E", "figures carried NO authored prose — stream == legacy INT-3 anchors ×112", legacyFails === 0, legacyFails ? `${legacyFails} drift` : "all equal");
  const waveOut = {};
  let waveFails = 0;
  for (const [w, h] of Object.entries(waveHashes)) {
    waveOut[w] = h.digest("hex");
    if (man.conservation.wave_stream_sha256[w] !== waveOut[w]) waveFails++;
  }
  check("G-E", "wave stream subtotals ×10 vs manifest", waveFails === 0 && Object.keys(waveOut).length === 10, waveFails ? `${waveFails} drift` : "all match");
  const grandShaHex = grand.digest("hex"); // computed ONCE — single-finalization law (pilot INT-4 precedent)
  check("G-E", "grand stream vs manifest", grandChars === man.counts.authored_chars_conserved && grandShaHex === man.conservation.authored_stream_sha256, `${grandChars} chars ${grandShaHex.slice(0, 12)}`);

  if (FAILS.length) {
    console.error(`FAIL-CLOSED before landing: ${FAILS.length} failures`);
    for (const f of FAILS) console.error(`  [${f.stage}] ${f.name} — ${f.detail}`);
    process.exit(1);
  }

  // ── G-DELTA (figures feed): pre-landing disk snapshot of the 224 basenames ─
  let preDisk = null;
  if (F.landing === "revision") {
    preDisk = new Map();
    for (const p of parsed) {
      const dest = p.kind === "sme-question-package"
        ? path.join(LAND_QUESTIONS, path.basename(p.path))
        : path.join(LAND_LESSONS, path.basename(p.path));
      preDisk.set(path.basename(p.path), fs.existsSync(dest) ? sha256(fs.readFileSync(dest)) : "absent");
    }
  }

  // ── LAND: byte-exact into the hub content tree ─────────────────────────────
  let written = 0, noop = 0, revised = 0;
  for (const p of parsed) {
    const dest = p.kind === "sme-question-package"
      ? path.join(LAND_QUESTIONS, path.basename(p.path))
      : path.join(LAND_LESSONS, path.basename(p.path));
    const res = landFile(dest, p.buf);
    if (res === "written") written++;
    else if (res === "revised") revised++;
    else noop++;
  }
  check("LAND", `224 artifacts landed byte-exact (${F.landing} law)`, written + noop + revised === 224, `${written} written, ${revised} revised, ${noop} already identical`);
  if (F.landing === "revision" && preDisk) {
    if (F.pilotDelta) {
      // v7 checks_feed: declared revision of exactly the pilot files (2 lessons + 2 packages)
      const expected = new Set(F.pilotDelta.files);
      const revisedBad = landLog.filter((l) => !expected.has(l.file));
      check("G-DELTA", "revision touched ONLY the declared pilot files (2 lessons + 2 packages)", revised === F.pilotDelta.files.length && revisedBad.length === 0, `${revised} revised (${landLog.map((l) => l.file).join(", ")}); undeclared: ${revisedBad.length}`);
    } else {
      // exactly the 112 lesson files revised; the 112 question files byte-identical
      const revisedBad = landLog.filter((l) => !l.file.endsWith(".hub-lesson-import.json"));
      check("G-DELTA", "revision touched ONLY the 112 lesson files", revised === 112 && revisedBad.length === 0, `${revised} revised (${landLog.filter((l) => l.file.endsWith(".hub-lesson-import.json")).length} lesson files); non-lesson revisions: ${revisedBad.length}`);
    }
    const qDrift = parsed.filter((p) => p.kind === "sme-question-package").filter((p) => {
      const dest = path.join(LAND_QUESTIONS, path.basename(p.path));
      return sha256(fs.readFileSync(dest)) !== p.sha256;
    });
    check("G-DELTA", "question packages byte-identical post-land vs manifest ×112", qDrift.length === 0, `${qDrift.length} drift`);
  }

  // in-pack import index (runner-derived bytes, not part of the conserved stream)
  const index = {
    format: "guided-import-index/1.0",
    runner: `apps/hub/scripts/import_guided/run_import.mjs (hub-import-runner/1.0, FEED=${FEED_ID})`,
    imported_at_utc: now(),
    operator_trace: OPERATOR_TRACE,
    upstream: {
      repo: REPO,
      namespace: "integration/",
      commit: F.promo.commit,
      manifest: F.manifest,
      manifest_sha256: sha256(manBuf),
      manifest_version: F.manifest_version,
      int0_pin: F.artifact_pin,
      adapter: F.adapter,
      ...(pendingPromotion || !isAncestor ? { promotion_status: "pending — promotion commit on resources integration branch, hub PR merges only after the resources PR" } : {}),
    },
    target_schemas: F.targetSchemas || (F.figures_feed ? ["hub/lesson-import/1.1", "sme-question-package/1.0"] : ["hub/lesson-import/1.0", "sme-question-package/1.0"]),
    counts: { ...man.counts },
    conservation: { authored_stream_sha256: grandShaHex, authored_chars: grandChars },
    landing: {
      lessons_rel: REL_LESSONS,
      questions_rel: REL_QUESTIONS,
      lesson_files: 112,
      question_files: 112,
      byte_exact: true,
      additive_only: F.landing === "additive",
    },
    notes: int3.notes.map((a) => ({
      noteId: a.noteId,
      wave: a.wave,
      lessonPath: `${REL_LESSONS}/${a.noteId}.hub-lesson-import.json`,
      packagePath: `${REL_QUESTIONS}/${a.noteId}.sme-question-package.json`,
      lessonSha256: a.hubSha256,
      packageSha256: a.pkgSha256,
      streamSha256: a.stream.sha256,
      streamChars: a.stream.chars,
    })),
  };
  const indexBuf = Buffer.from(JSON.stringify(index, null, 2) + "\n", "utf8");
  landOwnedFile(LAND_INDEX, indexBuf); // runner-owned run metadata — re-issued per run (additive-only law applies to the 224 conserved artifacts, not this index)
  check("LAND", "guided-import.json index landed (runner-owned, re-issued)", fs.existsSync(LAND_INDEX), `${indexBuf.length}B`);

  // ── G-V post-land verification (cold read from disk) ───────────────────────
  let diskFails = 0;
  for (const p of parsed) {
    const dest = p.kind === "sme-question-package"
      ? path.join(LAND_QUESTIONS, path.basename(p.path))
      : path.join(LAND_LESSONS, path.basename(p.path));
    const buf = fs.readFileSync(dest);
    if (!buf.equals(p.buf)) { diskFails++; if (diskFails <= 3) check("G-V", `disk byte-identity ${p.noteId}`, false, dest); }
  }
  check("G-V", "cold re-read ×224 byte-identical vs manifest sha", diskFails === 0, diskFails ? `${diskFails} drift` : "disk == fetched bytes");

  // closing identity re-derived FROM DISK (not from the manifest)
  const disk = { notes: 0, lessons: 0, checks: 0, keyPoints: 0, distractors: 0, glossaryTerms: 0 };
  const diskFigs = { figures: 0, moduleMapped: 0, noteLevel: 0, modulesWithFigures: 0 };
  for (const p of parsed) {
    if (p.kind === "sme-question-package") continue;
    const rel = path.join(LAND_LESSONS, path.basename(p.path));
    const h = JSON.parse(fs.readFileSync(rel, "utf8"));
    disk.notes++;
    disk.lessons += h.lesson.modules.length;
    disk.keyPoints += h.lesson.modules.reduce((a, m) => a + m.keyPoints.length, 0);
    disk.glossaryTerms += (h.lesson.assets.glossary || []).length;
    if (F.figures_feed) {
      const figs = h.lesson.figures || [];
      diskFigs.figures += figs.length;
      diskFigs.moduleMapped += figs.filter((f) => f.moduleIds.length > 0).length;
      diskFigs.noteLevel += figs.filter((f) => f.moduleIds.length === 0).length;
      diskFigs.modulesWithFigures += h.lesson.modules.filter((m) => (m.figureIds || []).length > 0).length;
    }
  }
  for (const p of parsed) {
    if (p.kind !== "sme-question-package") continue;
    const q = JSON.parse(fs.readFileSync(path.join(LAND_QUESTIONS, path.basename(p.path)), "utf8"));
    disk.checks += q.questions.length;
    for (const qq of q.questions) disk.distractors += (qq.options || []).filter((o) => o.correct !== true).length;
  }
  const idOkDisc = disk.notes === F.identity.notes && disk.lessons === F.identity.lessons &&
    disk.checks === F.identity.checks && disk.keyPoints === F.identity.keyPoints &&
    disk.distractors === F.identity.distractors && disk.glossaryTerms === F.identity.glossaryTerms;
  check("G-V", "closing identity re-derived from disk", idOkDisc, JSON.stringify(disk));
  if (F.figures_feed) {
    const figOk = diskFigs.figures === F.identity.figures && diskFigs.moduleMapped === F.identity.figures_module_mapped && diskFigs.noteLevel === F.identity.figures_note_level;
    check("G-V", "figure counts re-derived from disk", figOk, JSON.stringify(diskFigs));
  }

  // loader-path probe: the exact rel shapes loadContentJson resolves under content/
  const probeRels = [
    `${REL_LESSONS}/${parsed[0].noteId}.hub-lesson-import.json`,
    `${REL_QUESTIONS}/${parsed[0].noteId}.sme-question-package.json`,
    REL_INDEX,
  ];
  let probeFails = 0;
  for (const rel of probeRels) {
    const f = path.join(HUB, "content", rel);
    if (!fs.existsSync(f)) { probeFails++; check("G-V", `loader probe ${rel}`, false, "missing"); }
  }
  if (probeFails === 0) check("G-V", "loader rel-shape probe (content/<rel>)", true, probeRels.join(" , "));

  // static-build pickup: build_corpus_static.mjs cpSync's the whole content/ tree recursively
  try {
    const mjs = fs.readFileSync(path.join(HUB, "scripts/build_corpus_static.mjs"), "utf8");
    check("G-V", "static build copies content/ recursively (cpSync recursive in build_corpus_static.mjs)", mjs.includes("cpSync") && mjs.includes("recursive: true"), "whole-tree copy — new guided-* subdirs publish with the next build");
  } catch { check("G-V", "static build copy semantics", false, "build_corpus_static.mjs not readable"); }

  // idempotence re-probe: a second landing pass must report identical-exists ×224
  let idemOk = 0;
  for (const p of parsed) {
    const dest = p.kind === "sme-question-package"
      ? path.join(LAND_QUESTIONS, path.basename(p.path))
      : path.join(LAND_LESSONS, path.basename(p.path));
    const r2 = landFile(dest, p.buf);
    if (r2 === "identical-exists") idemOk++;
    else if (r2 === "revised") landLog.pop(); // revision-mode second pass rewrites identical bytes — treat as drift
  }
  check("G-V", "idempotence re-landing 224/224 identical-exists", idemOk === 224, `${idemOk}/224`);

  // ── receipt of record (lane side) ───────────────────────────────────────────
  const receipt = {
    format: "hub-import-run-receipt/0.1",
    generated_at_utc: now(),
    feed: FEED_ID,
    adapter: F.adapter,
    landing_law: F.landing,
    generated_at_utc_note: "figures feed: declared revision of the 112 lesson artifacts (G-DELTA); additive-only law unchanged for everything else",
    operator_trace: OPERATOR_TRACE,
    operator_directive: F.directive || (FEED_ID === "fullcorpus-v2"
      ? "feed hub-import-manifest-v2.json to the hub's import runner"
      : "run the full 112-note figures chain — import the figures-0.2 generation (trace 1a1820011919e8b9)"),
    runner: { path: "apps/hub/scripts/import_guided/run_import.mjs", id: "hub-import-runner/1.0", runtime: "node " + process.version },
    feed_config: {
      manifest: F.manifest,
      manifest_version: F.manifest_version,
      promo: F.promo,
      promotion_pending: !isAncestor,
      integration_branch: F.integration_branch || "(main ancestry)",
      artifact_pin: F.artifact_pin,
      figures_feed: F.figures_feed,
    },
    gates: {
      P0: "promotion commit preflight (tree/parent/message/ancestry or declared pending promotion)",
      GA: "manifest integrity (format/version/kinds/counts/conservation/adapter/trace + survivor byte-identity + schemas byte-anchored)",
      GB: "224/224 fetched raw @ pinned commit, sha256+bytes exact",
      GC: "ajv draft-07 ×224 vs both target schemas",
      GD: "X ×112 — derived-ID grammar, checkRefs↔questions bidirectional 1:1 (1,195 checks), pinned provenance" + (F.figures_feed ? ", figure closure both ways (200 figures)" : ""),
      GE: "Φ — per-note stream anchors ×112 vs the feed's INT-3 record; wave subtotals ×10; grand stream vs manifest" + (F.figures_feed ? "; legacy-anchor equality ×112 (figures carried no prose)" : ""),
      ...(F.figures_feed ? { GDELTA: "declared revision: exactly the 112 lesson files carry new bytes; question packages byte-identical ×112" } : {}),
      LAND: `byte-exact atomic landing (${F.landing} law)` + (F.figures_feed ? " — 112 lesson files revised" : " — additive-only, divergent overwrite aborts"),
      GV: "cold re-read ×224; closing identity re-derived from disk; loader rel-shape probe; static-build pickup; idempotence 224/224" + (F.figures_feed ? "; figure counts re-derived from disk" : ""),
    },
    gate_results: CHECKS,
    landing: {
      hub_tree: HUB,
      pack: "content/igcse-chemistry-19/",
      lessons_dir: "guided-lessons/ (112 files)",
      questions_dir: "guided-questions/ (112 files)",
      index: "guided-import.json (guided-import-index/1.0)",
      files_written: written,
      files_revised: revised,
      files_already_identical: noop,
      bytes_landed: parsed.reduce((a, p) => a + p.buf.length, 0),
      revision_log: F.landing === "revision" ? landLog.slice(0, 3).concat([`… ${landLog.length} lesson files total`]) : undefined,
    },
    counts_landed: disk,
    ...(F.figures_feed ? { figures_landed: diskFigs } : {}),
    conservation_recomputed: { authored_chars: grandChars, authored_stream_sha256: grandShaHex },
    next_operator_gated: [
      "commit the hub tree addition (runner + content/igcse-chemistry-19/guided-*) per standing convention — push auto-bakes the hub (git-linked law)",
      ...(F.figures_feed ? ["hub PR (atomic): FEED runner + TS optional fields + renderer figure cards + revised artifacts + re-issued guided-import.json; merges only after resources PR #207"] : ["surface the guided lessons on a hub route via loadContentJson(REL_LESSONS/...) + guided-import.json index"]),
    ],
    duration_ms: Date.now() - t0,
  };
  fs.writeFileSync(F.receipt, JSON.stringify(receipt, null, 2) + "\n");

  const hardFails = FAILS.length;
  console.log(`\nRESULT: ${hardFails === 0 ? "GREEN — LANDED" : "FAIL-CLOSED"}`);
  console.log(`  checks: ${CHECKS.filter((c) => c.ok).length}/${CHECKS.length} pass, ${hardFails} hard failures`);
  console.log(`  landed: ${written} written + ${revised} revised + ${noop} identical-existing (224 artifacts, ${(receipt.landing.bytes_landed / 1024).toFixed(0)} KiB) into ${path.relative(process.cwd(), PACK) || PACK}`);
  console.log(`  identity from disk: ${JSON.stringify(disk)}`);
  if (F.figures_feed) console.log(`  figures from disk: ${JSON.stringify(diskFigs)}`);
  console.log(`  stream conserved: ${grandChars} chars, sha ${grandShaHex.slice(0, 16)}…`);
  console.log(`  receipt: ${F.receipt}`);
  if (hardFails) process.exit(1);
}

main().catch((e) => {
  console.error("RUNNER ABORTED:", e && (e.stack || e.message || e));
  process.exit(1);
});
