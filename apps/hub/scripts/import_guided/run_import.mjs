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
  "r3-stageb1-v8": {
    manifest: "hub-import-manifest-v8.json",
    manifest_version: 8,
    lesson_kind: "hub-lesson-import-1.4", // legacy single-kind field; v8 uses lessonKinds below
    lessonKinds: { "hub-lesson-import-1.3": 100, "hub-lesson-import-1.4": 12 }, // generation-union census (stage-A pilots + S-B1 tranche at 1.4)
    adapter: "guided-lesson-0.5--hub-lesson-import-1.4",
    directive: "run the R3 mixed check types stage-B wave 1 chain — import the S-B1 tranche (the wave-1 authoring register: 10 notes / 24 lessons / 96 written items; operator execute trace 1a18bc1ca2cf48e5 'stage B proceed')",
    promo: {
      // promotion commit of record = the resources PR #230 MERGE commit (byte-identical
      // content to branch commit C cde7df89; message carries the execute trace)
      commit: "763e730afc815d88f0880b34d3d2594103318a95",
      tree: "fad4ffcd3bc50a88ae4a02d1ec155603ef08b2f5",
      parent: "a6c7f09532296ec57b7c1ec9292076d239c48303", // resources main at the merge
      trace: "1a18bc1ca2cf48e5",
    },
    integration_branch: null, // ancestry of record — hub run happens only after the resources PR merges
    artifact_pin: "71922d1510ee9e00400667670b40f36e1ae5d456", // the 100 untouched lessons keep the source-0.4 (1.3) pin
    artifact_pins_by_note: {
      // the 12 R3 notes (2 stage-A pilots + 10 S-B1) re-pin BOTH channels to the
      // source-0.5 generation: pilots -> stage-A commit A, S-B1 -> S-B1 commit A
      rn_2MpXPtNXvn8pQm3r: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_8T5GfPn2q7sY2YCh: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_2d6Yb8GwGfRRd6pZ: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_4SgDJv8rKxpQQSBh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_HZM2WRjPPT8Srcxt: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_JCfdFrHsCkrmMbFj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_TM4QVMgXVxs4vbfY: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_fQSYvKRMDBj3s2Bx: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_jNJ4gTmcHqdFqsNh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_kJg2gwF77vdFZZ2H: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_wTtM2fQVVjntRm64: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_xT8XsdJtDX5gNFXj: "78ad6a2073c669231bb40bd7266674a257c6003e",
    },
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the 100 untouched packages stay byte-identical
    checks_feed: true, // written-kind G-D branch: empty options + modelAnswer required + known-kind enum
    pilotDelta: {
      files: [
        "rn_2d6Yb8GwGfRRd6pZ.hub-lesson-import.json",
        "rn_4SgDJv8rKxpQQSBh.hub-lesson-import.json",
        "rn_HZM2WRjPPT8Srcxt.hub-lesson-import.json",
        "rn_JCfdFrHsCkrmMbFj.hub-lesson-import.json",
        "rn_TM4QVMgXVxs4vbfY.hub-lesson-import.json",
        "rn_fQSYvKRMDBj3s2Bx.hub-lesson-import.json",
        "rn_jNJ4gTmcHqdFqsNh.hub-lesson-import.json",
        "rn_kJg2gwF77vdFZZ2H.hub-lesson-import.json",
        "rn_wTtM2fQVVjntRm64.hub-lesson-import.json",
        "rn_xT8XsdJtDX5gNFXj.hub-lesson-import.json",
        "rn_2d6Yb8GwGfRRd6pZ.sme-question-package.json",
        "rn_4SgDJv8rKxpQQSBh.sme-question-package.json",
        "rn_HZM2WRjPPT8Srcxt.sme-question-package.json",
        "rn_JCfdFrHsCkrmMbFj.sme-question-package.json",
        "rn_TM4QVMgXVxs4vbfY.sme-question-package.json",
        "rn_fQSYvKRMDBj3s2Bx.sme-question-package.json",
        "rn_jNJ4gTmcHqdFqsNh.sme-question-package.json",
        "rn_kJg2gwF77vdFZZ2H.sme-question-package.json",
        "rn_wTtM2fQVVjntRm64.sme-question-package.json",
        "rn_xT8XsdJtDX5gNFXj.sme-question-package.json",
      ],
    },
    schemas: {
      hub: "/home/z/my-project/scripts/r3-survivors/hub-lesson-import.1.4.schema.json",
      pkg: "/home/z/my-project/scripts/r3-survivors/sme-question-package.1.1.schema.json",
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.4.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.1.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/scripts/r3-survivors/hub-import-manifest-v8.json",
      int3: "/home/z/my-project/scripts/r3-survivors/INT-3-transform-record-r3-stageb1.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261030-r3-stageb1.json`,
    identity: {
      notes: 112,
      lessons: 239,
      checks: 1307,
      keyPoints: 1212,
      distractors: 3565,
      glossaryTerms: 654,
      figures: 200,
      figures_module_mapped: 122,
      figures_note_level: 78,
      workedExamples_populated: 112,
      workedExamples_null: 0,
      authored_chars_conserved: 1452661,
      authored_chars_v3_baseline: 1347771,
      added_chars: 104890,
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
      checks_written: 112,
      checks_mcq: 1195,
      written_recall: 56,
      written_explain_why: 28,
      written_application: 28,
    },
    figures_feed: true,
    we_feed: true, // the v8 stream is the declared baseline; this feed's equality gate is per-note vs the INT-3 r3-stageb1 anchors (100 exact at v7; 2 pilots at stage-A exactly; 10 S-B1 notes carry the 96 written items' tokens)
    landing: "revision", // declared G-DELTA: exactly the 20 S-B1 files re-pin (10 lessons + 10 packages); everything else byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v8 manifest path not integration-relative: ${a.path}`);
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
  "r3-stageb3-v10": {
    manifest: "hub-import-manifest-v10.json",
    manifest_version: 10,
    lesson_kind: "hub-lesson-import-1.4", // legacy single-kind field; v10 uses lessonKinds below
    lessonKinds: { "hub-lesson-import-1.3": 76, "hub-lesson-import-1.4": 36 }, // generation-union census (2 stage-A pilots + 10 S-B1 + 12 S-B2 + 12 S-B3 at 1.4)
    adapter: "guided-lesson-0.5--hub-lesson-import-1.4",
    directive: "run the R3 mixed check types stage-B wave 3 chain — import the S-B3 tranche (the wave-3 authoring register: 12 notes / 24 lessons / 96 written items; operator ignition trace 1a18c9f53d7b8dd1 'wave 3 proceed'). Declared hub revision = 48 files: the 24 S-B2 re-issues (PR #237 generation, bytes fetched @ pin — the S-B2 hub import rides this cumulative manifest) + the 24 S-B3 re-issues",
    promo: {
      // promotion commit of record = the resources PR #240 MERGE commit (S-B3 commit C 1199c3c
      // content; merge-order convention: #237 merged first as e679c919, disclosed in receipts)
      commit: "163cb2f32848136ccf3cf1d29bb918b0e61a3fcd",
      tree: "77a6a1ea9464eb14b9e9731ec53e499cb46ff555",
      parent: "c09b05bb2645f637f3d4efb572810ebdd52c216f", // resources main first-parent at the #240 merge (advanced past e679c919 with unrelated lanes mid-wave; disclosed in receipts)
      trace: "1a18c9f53d7b8dd1",
    },
    integration_branch: null, // ancestry of record — hub run happens only after the resources PR merges
    artifact_pin: "71922d1510ee9e00400667670b40f36e1ae5d456", // the 76 untouched lessons keep the source-0.4 (1.3) pin
    artifact_pins_by_note: {
      // the 36 R3 notes (2 pilots + 10 S-B1 + 12 S-B2 + 12 S-B3) re-pin BOTH channels to
      // their source-0.5 generation commits
      rn_2MpXPtNXvn8pQm3r: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_8T5GfPn2q7sY2YCh: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_2d6Yb8GwGfRRd6pZ: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_4SgDJv8rKxpQQSBh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_HZM2WRjPPT8Srcxt: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_JCfdFrHsCkrmMbFj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_TM4QVMgXVxs4vbfY: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_fQSYvKRMDBj3s2Bx: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_jNJ4gTmcHqdFqsNh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_kJg2gwF77vdFZZ2H: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_wTtM2fQVVjntRm64: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_xT8XsdJtDX5gNFXj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_2VnK66PqbvFKdKYt: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_S7GPh8BBPBbmhYKm: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_cTk2cs2h2BKQ3y3B: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_QVmDs8X4szpds3cP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TWGVV6RXN3Ktqb9h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_RvgxXR36425BFMcx: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_YBWYstSRgM2QPzQq: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_R3ptwxGTTvdBFvyP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TsfqyK9BYMtN2Bfd: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_kb2VkFMdBTbmG33t: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_vzGMZxqQtWYVWB7h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_b3XCzdtfQddbJjVf: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_Syxyh4Fct8KFg8NQ: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mBqgkpZ3hbSBmWCC: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_N4HX8tqbdhTQcHyS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_VyXFNyxZHZGkxqTG: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_vXPcH3vS8wv7BFkK: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_pWzTTBv3B4yGFfj3: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_yj4y972FxCWnDnSg: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_Hkwmd9GSp3gdxxR5: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_4tzwS4GZjPybwtkS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_T55t3HNsgyZcXZtN: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mbcBZkygY4YpG2bf: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_8Nv33F4dD3kkZnY6: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4"
    },
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the 76 untouched packages stay byte-identical
    checks_feed: true, // written-kind G-D branch: empty options + modelAnswer required + known-kind enum
    pilotDelta: {
      files: [
        // 48 declared: 24 S-B2 re-issues (hub revision rides this manifest) + 24 S-B3 re-issues
        "rn_2VnK66PqbvFKdKYt.hub-lesson-import.json",
        "rn_S7GPh8BBPBbmhYKm.hub-lesson-import.json",
        "rn_cTk2cs2h2BKQ3y3B.hub-lesson-import.json",
        "rn_QVmDs8X4szpds3cP.hub-lesson-import.json",
        "rn_TWGVV6RXN3Ktqb9h.hub-lesson-import.json",
        "rn_RvgxXR36425BFMcx.hub-lesson-import.json",
        "rn_YBWYstSRgM2QPzQq.hub-lesson-import.json",
        "rn_R3ptwxGTTvdBFvyP.hub-lesson-import.json",
        "rn_TsfqyK9BYMtN2Bfd.hub-lesson-import.json",
        "rn_kb2VkFMdBTbmG33t.hub-lesson-import.json",
        "rn_vzGMZxqQtWYVWB7h.hub-lesson-import.json",
        "rn_b3XCzdtfQddbJjVf.hub-lesson-import.json",
        "rn_Syxyh4Fct8KFg8NQ.hub-lesson-import.json",
        "rn_mBqgkpZ3hbSBmWCC.hub-lesson-import.json",
        "rn_N4HX8tqbdhTQcHyS.hub-lesson-import.json",
        "rn_VyXFNyxZHZGkxqTG.hub-lesson-import.json",
        "rn_vXPcH3vS8wv7BFkK.hub-lesson-import.json",
        "rn_pWzTTBv3B4yGFfj3.hub-lesson-import.json",
        "rn_yj4y972FxCWnDnSg.hub-lesson-import.json",
        "rn_Hkwmd9GSp3gdxxR5.hub-lesson-import.json",
        "rn_4tzwS4GZjPybwtkS.hub-lesson-import.json",
        "rn_T55t3HNsgyZcXZtN.hub-lesson-import.json",
        "rn_mbcBZkygY4YpG2bf.hub-lesson-import.json",
        "rn_8Nv33F4dD3kkZnY6.hub-lesson-import.json",
        "rn_2VnK66PqbvFKdKYt.sme-question-package.json",
        "rn_S7GPh8BBPBbmhYKm.sme-question-package.json",
        "rn_cTk2cs2h2BKQ3y3B.sme-question-package.json",
        "rn_QVmDs8X4szpds3cP.sme-question-package.json",
        "rn_TWGVV6RXN3Ktqb9h.sme-question-package.json",
        "rn_RvgxXR36425BFMcx.sme-question-package.json",
        "rn_YBWYstSRgM2QPzQq.sme-question-package.json",
        "rn_R3ptwxGTTvdBFvyP.sme-question-package.json",
        "rn_TsfqyK9BYMtN2Bfd.sme-question-package.json",
        "rn_kb2VkFMdBTbmG33t.sme-question-package.json",
        "rn_vzGMZxqQtWYVWB7h.sme-question-package.json",
        "rn_b3XCzdtfQddbJjVf.sme-question-package.json",
        "rn_Syxyh4Fct8KFg8NQ.sme-question-package.json",
        "rn_mBqgkpZ3hbSBmWCC.sme-question-package.json",
        "rn_N4HX8tqbdhTQcHyS.sme-question-package.json",
        "rn_VyXFNyxZHZGkxqTG.sme-question-package.json",
        "rn_vXPcH3vS8wv7BFkK.sme-question-package.json",
        "rn_pWzTTBv3B4yGFfj3.sme-question-package.json",
        "rn_yj4y972FxCWnDnSg.sme-question-package.json",
        "rn_Hkwmd9GSp3gdxxR5.sme-question-package.json",
        "rn_4tzwS4GZjPybwtkS.sme-question-package.json",
        "rn_T55t3HNsgyZcXZtN.sme-question-package.json",
        "rn_mbcBZkygY4YpG2bf.sme-question-package.json",
        "rn_8Nv33F4dD3kkZnY6.sme-question-package.json"
      ],
    },
    schemas: {
      hub: "/home/z/my-project/scripts/r3-survivors/hub-lesson-import.1.4.schema.json",
      pkg: "/home/z/my-project/scripts/r3-survivors/sme-question-package.1.1.schema.json",
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.4.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.1.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/scripts/r3-survivors/hub-import-manifest-v10.json",
      int3: "/home/z/my-project/scripts/r3-survivors/INT-3-transform-record-r3-stageb3.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261030-r3-stageb3.json`,
    identity: {
      "notes": 112,
      "lessons": 239,
      "checks": 1499,
      "keyPoints": 1212,
      "distractors": 3565,
      "glossaryTerms": 654,
      "figures": 200,
      "figures_module_mapped": 122,
      "figures_note_level": 78,
      "workedExamples_populated": 112,
      "workedExamples_null": 0,
      "authored_chars_conserved": 1501204,
      "authored_chars_v3_baseline": 1347771,
      "added_chars": 153433,
      "captions_coalesced": 143,
      "captions_row_context": 16,
      "captions_inline": 3,
      "captions_none": 38,
      "binding_heading_unique": 90,
      "binding_sole_lesson": 0,
      "binding_content_overlap": 12,
      "binding_note_level": 78,
      "binding_unresolved": 20,
      "figures_binding_narrowed": 102,
      "figures_claims_changed": 12,
      "figures_wholesale_claims_kept": 2,
      "checks_written": 304,
      "checks_mcq": 1195,
      "written_recall": 152,
      "written_explain_why": 76,
      "written_application": 76
    },
    figures_feed: true,
    we_feed: true, // the v10 stream is the declared baseline; this feed's equality gate is per-note vs the INT-3 r3-stageb3 anchors (76 exact at v9; 24 prior-R3 at their own anchors exactly; 12 S-B3 notes carry the 96 written items' tokens)
    landing: "revision", // declared G-DELTA: exactly the 48 declared files re-pin (24 S-B2 + 24 S-B3); everything else byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v10 manifest path not integration-relative: ${a.path}`);
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
  "r3-stageb4-v11": {
    manifest: "hub-import-manifest-v11.json",
    manifest_version: 11,
    lesson_kind: "hub-lesson-import-1.4", // legacy single-kind field; v11 uses lessonKinds below
    lessonKinds: { "hub-lesson-import-1.3": 65, "hub-lesson-import-1.4": 47 }, // generation-union census (2 stage-A pilots + 10 S-B1 + 12 S-B2 + 12 S-B3 + 11 S-B4 at 1.4)
    adapter: "guided-lesson-0.5--hub-lesson-import-1.4",
    directive: "run the R3 mixed check types stage-B wave 4 chain — import the S-B4 tranche (the wave-4 authoring register: 11 notes / 22 lessons / 88 written items; operator ignition trace 1a18d09c1263e991 'stage-B wave 4 proceed'). Declared hub revision = 22 files: the 11 S-B4 re-issues (PR #242 generation, bytes fetched @ pin). The S-B2/S-B3 re-issues are already live on the hub at their v9/v10 pins and are re-proved byte-identical at this manifest",
    promo: {
      // promotion commit of record = the resources PR #242 MERGE commit (S-B4 commit C e5531961
      // content; merge-order convention: #240 merged 163cb2f first, then main advanced with the
      // unrelated F124 lane #241 to c0a0e69 — the wave-open main — disclosed in receipts)
      commit: "e76925db1921015a29bf8b18ab9644f44bdb9129",
      tree: "fc416dbca44ff958c86bdf97d3e77e86a9a0b8a1",
      parent: "c0a0e69011a38483dd695d4a84468facad11f4e1", // resources main first-parent at the #242 merge (= the wave-open main; disclosed in receipts)
      trace: "1a18d09c1263e991",
    },
    integration_branch: null, // ancestry of record — hub run happens only after the resources PR merges
    artifact_pin: "71922d1510ee9e00400667670b40f36e1ae5d456", // the 65 untouched lessons keep the source-0.4 (1.3) pin
    artifact_pins_by_note: {
      // the 47 R3 notes (2 pilots + 10 S-B1 + 12 S-B2 + 12 S-B3 + 11 S-B4) re-pin BOTH channels to
      // their source-0.5 generation commits
      rn_2MpXPtNXvn8pQm3r: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_8T5GfPn2q7sY2YCh: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_2d6Yb8GwGfRRd6pZ: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_4SgDJv8rKxpQQSBh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_HZM2WRjPPT8Srcxt: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_JCfdFrHsCkrmMbFj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_TM4QVMgXVxs4vbfY: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_fQSYvKRMDBj3s2Bx: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_jNJ4gTmcHqdFqsNh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_kJg2gwF77vdFZZ2H: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_wTtM2fQVVjntRm64: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_xT8XsdJtDX5gNFXj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_2VnK66PqbvFKdKYt: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_S7GPh8BBPBbmhYKm: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_cTk2cs2h2BKQ3y3B: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_QVmDs8X4szpds3cP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TWGVV6RXN3Ktqb9h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_RvgxXR36425BFMcx: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_YBWYstSRgM2QPzQq: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_R3ptwxGTTvdBFvyP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TsfqyK9BYMtN2Bfd: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_kb2VkFMdBTbmG33t: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_vzGMZxqQtWYVWB7h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_b3XCzdtfQddbJjVf: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_Syxyh4Fct8KFg8NQ: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mBqgkpZ3hbSBmWCC: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_N4HX8tqbdhTQcHyS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_VyXFNyxZHZGkxqTG: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_vXPcH3vS8wv7BFkK: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_pWzTTBv3B4yGFfj3: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_yj4y972FxCWnDnSg: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_Hkwmd9GSp3gdxxR5: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_4tzwS4GZjPybwtkS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_T55t3HNsgyZcXZtN: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mbcBZkygY4YpG2bf: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_8Nv33F4dD3kkZnY6: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_3YZNCXSQQqXTT6HR: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_FCnWFz9MhgsqnZGM: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_GkJG52NCN98ShGRm: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_Hp2nK8XpN2SmjdQc: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_J7ZcTWyRxRgWQ45R: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_KpvF2TWr5fYHk2Jz: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_MVnFKDMVkswzpmpw: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_jVwPmjqHbqQkXcjG: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_kdRjZHjHcpVZsD3h: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_rHKCkt3PTXDBpmJG: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_vfmJxw4VQgXKzXF3: "fa1f302050ba38b6b2e97760e88d32567d2b0c90"
    },
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the 65 untouched packages stay byte-identical
    checks_feed: true, // written-kind G-D branch: empty options + modelAnswer required + known-kind enum
    pilotDelta: {
      files: [
        // 22 declared: 11 S-B4 re-issues (hub revision rides this manifest)
        "rn_3YZNCXSQQqXTT6HR.hub-lesson-import.json",
        "rn_FCnWFz9MhgsqnZGM.hub-lesson-import.json",
        "rn_GkJG52NCN98ShGRm.hub-lesson-import.json",
        "rn_Hp2nK8XpN2SmjdQc.hub-lesson-import.json",
        "rn_J7ZcTWyRxRgWQ45R.hub-lesson-import.json",
        "rn_KpvF2TWr5fYHk2Jz.hub-lesson-import.json",
        "rn_MVnFKDMVkswzpmpw.hub-lesson-import.json",
        "rn_jVwPmjqHbqQkXcjG.hub-lesson-import.json",
        "rn_kdRjZHjHcpVZsD3h.hub-lesson-import.json",
        "rn_rHKCkt3PTXDBpmJG.hub-lesson-import.json",
        "rn_vfmJxw4VQgXKzXF3.hub-lesson-import.json",
        "rn_3YZNCXSQQqXTT6HR.sme-question-package.json",
        "rn_FCnWFz9MhgsqnZGM.sme-question-package.json",
        "rn_GkJG52NCN98ShGRm.sme-question-package.json",
        "rn_Hp2nK8XpN2SmjdQc.sme-question-package.json",
        "rn_J7ZcTWyRxRgWQ45R.sme-question-package.json",
        "rn_KpvF2TWr5fYHk2Jz.sme-question-package.json",
        "rn_MVnFKDMVkswzpmpw.sme-question-package.json",
        "rn_jVwPmjqHbqQkXcjG.sme-question-package.json",
        "rn_kdRjZHjHcpVZsD3h.sme-question-package.json",
        "rn_rHKCkt3PTXDBpmJG.sme-question-package.json",
        "rn_vfmJxw4VQgXKzXF3.sme-question-package.json"
      ],
    },
    schemas: {
      hub: "/home/z/my-project/scripts/r3-survivors/hub-lesson-import.1.4.schema.json",
      pkg: "/home/z/my-project/scripts/r3-survivors/sme-question-package.1.1.schema.json",
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.4.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.1.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/scripts/r3-survivors/hub-import-manifest-v11.json",
      int3: "/home/z/my-project/scripts/r3-survivors/INT-3-transform-record-r3-stageb4.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261030-r3-stageb4.json`,
    identity: {
      "notes": 112,
      "lessons": 239,
      "checks": 1587,
      "keyPoints": 1212,
      "distractors": 3565,
      "glossaryTerms": 654,
      "figures": 200,
      "figures_module_mapped": 122,
      "figures_note_level": 78,
      "workedExamples_populated": 112,
      "workedExamples_null": 0,
      "authored_chars_conserved": 1532885,
      "authored_chars_v3_baseline": 1347771,
      "added_chars": 185114,
      "captions_coalesced": 143,
      "captions_row_context": 16,
      "captions_inline": 3,
      "captions_none": 38,
      "binding_heading_unique": 90,
      "binding_sole_lesson": 0,
      "binding_content_overlap": 12,
      "binding_note_level": 78,
      "binding_unresolved": 20,
      "figures_binding_narrowed": 102,
      "figures_claims_changed": 12,
      "figures_wholesale_claims_kept": 2,
      "checks_written": 392,
      "checks_mcq": 1195,
      "written_recall": 196,
      "written_explain_why": 98,
      "written_application": 98
    },
    figures_feed: true,
    we_feed: true, // the v11 stream is the declared baseline; this feed's equality gate is per-note vs the INT-3 r3-stageb4 anchors (65 exact at v10; 36 prior-R3 at their own anchors exactly; 11 S-B4 notes carry the 88 written items' tokens)
    landing: "revision", // declared G-DELTA: exactly the 22 declared files re-pin (11 S-B4); everything else byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v11 manifest path not integration-relative: ${a.path}`);
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
  "r3-stageb5-v12": {
    manifest: "hub-import-manifest-v12.json",
    manifest_version: 12,
    lesson_kind: "hub-lesson-import-1.4", // legacy single-kind field; v12 uses lessonKinds below
    lessonKinds: { "hub-lesson-import-1.3": 53, "hub-lesson-import-1.4": 59 }, // generation-union census (2 stage-A pilots + 10 S-B1 + 12 S-B2 + 12 S-B3 + 11 S-B4 + 12 S-B5 at 1.4)
    adapter: "guided-lesson-0.5--hub-lesson-import-1.4",
    directive: "run the R3 mixed check types stage-B wave 5 chain — import the S-B5 tranche (the wave-5 authoring register: 12 notes / 26 lessons / 104 written items; operator ignition trace 1a18d9f731726de1 'stage-B wave 5'). Declared hub revision = 24 files: the 12 S-B5 re-issues (PR #243 generation, bytes fetched @ pin). The S-B2/S-B3/S-B4 re-issues are already live on the hub at their v9/v10/v11 pins and are re-proved byte-identical at this manifest",
    promo: {
      // promotion commit of record = the resources PR #243 MERGE commit (S-B5 commit C 1856b8cc
      // content; merge-order convention: #242 merged e76925db first, then main advanced with the
      // unrelated books lanes to e6dc252 — the wave-open main — disclosed in receipts)
      commit: "0e66325219293c23243c5721dc68199b47a6e71b",
      tree: "a16cf4252505c20814127361c4a4515ef16c86d3",
      parent: "e6dc252bbc5581e212fff1e6ca481921f18db16a", // resources main first-parent at the #243 merge (= the wave-open main; disclosed in receipts)
      trace: "1a18d9f731726de1",
    },
    integration_branch: null, // ancestry of record — hub run happens only after the resources PR merges
    artifact_pin: "71922d1510ee9e00400667670b40f36e1ae5d456", // the 53 untouched lessons keep the source-0.4 (1.3) pin
    artifact_pins_by_note: {
      // the 59 R3 notes (2 pilots + 10 S-B1 + 12 S-B2 + 12 S-B3 + 11 S-B4 + 12 S-B5) re-pin BOTH channels to
      // their source-0.5 generation commits
      rn_2MpXPtNXvn8pQm3r: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_8T5GfPn2q7sY2YCh: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_2d6Yb8GwGfRRd6pZ: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_4SgDJv8rKxpQQSBh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_HZM2WRjPPT8Srcxt: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_JCfdFrHsCkrmMbFj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_TM4QVMgXVxs4vbfY: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_fQSYvKRMDBj3s2Bx: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_jNJ4gTmcHqdFqsNh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_kJg2gwF77vdFZZ2H: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_wTtM2fQVVjntRm64: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_xT8XsdJtDX5gNFXj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_2VnK66PqbvFKdKYt: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_S7GPh8BBPBbmhYKm: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_cTk2cs2h2BKQ3y3B: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_QVmDs8X4szpds3cP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TWGVV6RXN3Ktqb9h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_RvgxXR36425BFMcx: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_YBWYstSRgM2QPzQq: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_R3ptwxGTTvdBFvyP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TsfqyK9BYMtN2Bfd: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_kb2VkFMdBTbmG33t: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_vzGMZxqQtWYVWB7h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_b3XCzdtfQddbJjVf: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_Syxyh4Fct8KFg8NQ: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mBqgkpZ3hbSBmWCC: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_N4HX8tqbdhTQcHyS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_VyXFNyxZHZGkxqTG: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_vXPcH3vS8wv7BFkK: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_pWzTTBv3B4yGFfj3: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_yj4y972FxCWnDnSg: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_Hkwmd9GSp3gdxxR5: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_4tzwS4GZjPybwtkS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_T55t3HNsgyZcXZtN: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mbcBZkygY4YpG2bf: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_8Nv33F4dD3kkZnY6: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_3YZNCXSQQqXTT6HR: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_FCnWFz9MhgsqnZGM: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_GkJG52NCN98ShGRm: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_Hp2nK8XpN2SmjdQc: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_J7ZcTWyRxRgWQ45R: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_KpvF2TWr5fYHk2Jz: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_MVnFKDMVkswzpmpw: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_jVwPmjqHbqQkXcjG: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_kdRjZHjHcpVZsD3h: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_rHKCkt3PTXDBpmJG: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_vfmJxw4VQgXKzXF3: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_3B8JxsSjJvR9B4fk: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_5WvdZNzzhHdjj2Qq: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_6M5JB7CjvwdDykMS: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_7Q8M9nVkr2FxCzxd: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_DGkNCJRcCN4VQ28p: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_Kd76WccxD9ytSJJC: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_QzYRzzmwRxk2gKqV: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_S2fg29M7cqvMj5kT: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_V9tPMnX6Hq2XnqcP: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_WJD4ZN4kQfzJNSPV: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_gBGX339WBpwyCrFF: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_jXXsc4wt2344BjxX: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1"
    },
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the 53 untouched packages stay byte-identical
    checks_feed: true, // written-kind G-D branch: empty options + modelAnswer required + known-kind enum
    pilotDelta: {
      files: [
        // 24 declared: the 12 S-B5 re-issues (hub revision rides this manifest)
        "rn_3B8JxsSjJvR9B4fk.hub-lesson-import.json",
        "rn_5WvdZNzzhHdjj2Qq.hub-lesson-import.json",
        "rn_6M5JB7CjvwdDykMS.hub-lesson-import.json",
        "rn_7Q8M9nVkr2FxCzxd.hub-lesson-import.json",
        "rn_DGkNCJRcCN4VQ28p.hub-lesson-import.json",
        "rn_Kd76WccxD9ytSJJC.hub-lesson-import.json",
        "rn_QzYRzzmwRxk2gKqV.hub-lesson-import.json",
        "rn_S2fg29M7cqvMj5kT.hub-lesson-import.json",
        "rn_V9tPMnX6Hq2XnqcP.hub-lesson-import.json",
        "rn_WJD4ZN4kQfzJNSPV.hub-lesson-import.json",
        "rn_gBGX339WBpwyCrFF.hub-lesson-import.json",
        "rn_jXXsc4wt2344BjxX.hub-lesson-import.json",
        "rn_3B8JxsSjJvR9B4fk.sme-question-package.json",
        "rn_5WvdZNzzhHdjj2Qq.sme-question-package.json",
        "rn_6M5JB7CjvwdDykMS.sme-question-package.json",
        "rn_7Q8M9nVkr2FxCzxd.sme-question-package.json",
        "rn_DGkNCJRcCN4VQ28p.sme-question-package.json",
        "rn_Kd76WccxD9ytSJJC.sme-question-package.json",
        "rn_QzYRzzmwRxk2gKqV.sme-question-package.json",
        "rn_S2fg29M7cqvMj5kT.sme-question-package.json",
        "rn_V9tPMnX6Hq2XnqcP.sme-question-package.json",
        "rn_WJD4ZN4kQfzJNSPV.sme-question-package.json",
        "rn_gBGX339WBpwyCrFF.sme-question-package.json",
        "rn_jXXsc4wt2344BjxX.sme-question-package.json"
      ],
    },
    schemas: {
      hub: "/home/z/my-project/scripts/r3-survivors/hub-lesson-import.1.4.schema.json",
      pkg: "/home/z/my-project/scripts/r3-survivors/sme-question-package.1.1.schema.json",
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.4.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.1.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/scripts/r3-survivors/hub-import-manifest-v12.json",
      int3: "/home/z/my-project/scripts/r3-survivors/INT-3-transform-record-r3-stageb5.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261031-r3-stageb5.json`,
    identity: {
      "notes": 112,
      "lessons": 239,
      "checks": 1691,
      "keyPoints": 1212,
      "distractors": 3565,
      "glossaryTerms": 654,
      "figures": 200,
      "figures_module_mapped": 122,
      "figures_note_level": 78,
      "workedExamples_populated": 112,
      "workedExamples_null": 0,
      "authored_chars_conserved": 1570204,
      "authored_chars_v3_baseline": 1347771,
      "added_chars": 222433,
      "captions_coalesced": 143,
      "captions_row_context": 16,
      "captions_inline": 3,
      "captions_none": 38,
      "binding_heading_unique": 90,
      "binding_sole_lesson": 0,
      "binding_content_overlap": 12,
      "binding_note_level": 78,
      "binding_unresolved": 20,
      "figures_binding_narrowed": 102,
      "figures_claims_changed": 12,
      "figures_wholesale_claims_kept": 2,
      "checks_written": 496,
      "checks_mcq": 1195,
      "written_recall": 248,
      "written_explain_why": 124,
      "written_application": 124
    },
    figures_feed: true,
    we_feed: true, // the v12 stream is the declared baseline; this feed's equality gate is per-note vs the INT-3 r3-stageb5 anchors (53 exact at v11; 47 prior-R3 at their own anchors exactly; 12 S-B5 notes carry the 104 written items' tokens)
    landing: "revision", // declared G-DELTA: exactly the 24 declared files re-pin (12 S-B5); everything else byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v12 manifest path not integration-relative: ${a.path}`);
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
  "r3-stageb6-v13": {
    manifest: "hub-import-manifest-v13.json",
    manifest_version: 13,
    lesson_kind: "hub-lesson-import-1.4", // legacy single-kind field; v12 uses lessonKinds below
    lessonKinds: { "hub-lesson-import-1.3": 41, "hub-lesson-import-1.4": 71 }, // generation-union census (2 stage-A pilots + 10 S-B1 + 12 S-B2 + 12 S-B3 + 11 S-B4 + 12 S-B5 + 12 S-B6 at 1.4)
    adapter: "guided-lesson-0.5--hub-lesson-import-1.4",
    directive: "run the R3 mixed check types stage-B wave 6 chain — import the S-B6 tranche (the wave-6 authoring register: 12 notes / 24 lessons / 96 written items; operator ignition trace 1a18dfb539a4c839 'wave 6'). Declared hub revision = 24 files: the 12 S-B6 re-issues (PR #245 generation, bytes fetched @ pin). The S-B2/S-B3/S-B4/S-B5 re-issues are already live on the hub at their v9/v10/v11/v12 pins and are re-proved byte-identical at this manifest",
    promo: {
      // promotion commit of record = the resources PR #246 MERGE commit (the merge-of-record fix:
      // PR #245 merged a2c2b6ce first but its merge message lacked the operator trace, so the hub
      // runner P0 gate fail-closed; PR #246 re-merged the IDENTICAL content — one empty commit
      // cf7d7482, tree 268787f8 byte-identical to the #245 merge tree — as the trace-bearing
      // promotion commit of record; mid-flight races disclosed in receipts: YCH12 lane at wave
      // open (3e918c44) and the SIB PR #244 race (census-0, zero file overlap))
      commit: "6b70de744337f41a1cbb9a8ad5ee8e501cd184dc",
      tree: "268787f891e9f4df4e2c0122705b677559224034",
      parent: "a2c2b6cec5d7aa31b1ac79ee5a291dc004ac7cdb", // resources main first-parent at the #246 merge (= the #245 merge commit)
      trace: "1a18dfb539a4c839",
    },
    integration_branch: null, // ancestry of record — hub run happens only after the resources PR merges
    artifact_pin: "71922d1510ee9e00400667670b40f36e1ae5d456", // the 53 untouched lessons keep the source-0.4 (1.3) pin
    artifact_pins_by_note: {
      // the 59 R3 notes (2 pilots + 10 S-B1 + 12 S-B2 + 12 S-B3 + 11 S-B4 + 12 S-B5) re-pin BOTH channels to
      // their source-0.5 generation commits
      rn_2MpXPtNXvn8pQm3r: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_8T5GfPn2q7sY2YCh: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_2d6Yb8GwGfRRd6pZ: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_4SgDJv8rKxpQQSBh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_HZM2WRjPPT8Srcxt: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_JCfdFrHsCkrmMbFj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_TM4QVMgXVxs4vbfY: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_fQSYvKRMDBj3s2Bx: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_jNJ4gTmcHqdFqsNh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_kJg2gwF77vdFZZ2H: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_wTtM2fQVVjntRm64: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_xT8XsdJtDX5gNFXj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_2VnK66PqbvFKdKYt: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_S7GPh8BBPBbmhYKm: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_cTk2cs2h2BKQ3y3B: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_QVmDs8X4szpds3cP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TWGVV6RXN3Ktqb9h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_RvgxXR36425BFMcx: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_YBWYstSRgM2QPzQq: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_R3ptwxGTTvdBFvyP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TsfqyK9BYMtN2Bfd: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_kb2VkFMdBTbmG33t: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_vzGMZxqQtWYVWB7h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_b3XCzdtfQddbJjVf: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_Syxyh4Fct8KFg8NQ: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mBqgkpZ3hbSBmWCC: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_N4HX8tqbdhTQcHyS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_VyXFNyxZHZGkxqTG: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_vXPcH3vS8wv7BFkK: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_pWzTTBv3B4yGFfj3: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_yj4y972FxCWnDnSg: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_Hkwmd9GSp3gdxxR5: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_4tzwS4GZjPybwtkS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_T55t3HNsgyZcXZtN: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mbcBZkygY4YpG2bf: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_8Nv33F4dD3kkZnY6: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_3YZNCXSQQqXTT6HR: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_FCnWFz9MhgsqnZGM: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_GkJG52NCN98ShGRm: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_Hp2nK8XpN2SmjdQc: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_J7ZcTWyRxRgWQ45R: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_KpvF2TWr5fYHk2Jz: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_MVnFKDMVkswzpmpw: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_jVwPmjqHbqQkXcjG: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_kdRjZHjHcpVZsD3h: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_rHKCkt3PTXDBpmJG: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_vfmJxw4VQgXKzXF3: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_3B8JxsSjJvR9B4fk: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_5WvdZNzzhHdjj2Qq: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_6M5JB7CjvwdDykMS: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_7Q8M9nVkr2FxCzxd: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_DGkNCJRcCN4VQ28p: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_Kd76WccxD9ytSJJC: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_QzYRzzmwRxk2gKqV: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_S2fg29M7cqvMj5kT: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_V9tPMnX6Hq2XnqcP: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_WJD4ZN4kQfzJNSPV: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_gBGX339WBpwyCrFF: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_jXXsc4wt2344BjxX: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_9WM8QhSxmYpGhjqd: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_BX88twwgffRMgx82: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_MMkxbt9y3M3XvXrc: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_ZWrmDYtNGnmFycPM: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_by5FDNfkqdBCkmXb: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_dTP52nzhYb96XrJx: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_nzW5ppBTV3ZnfSYY: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_p2FmkrXqZSzFngpg: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_qV5R2cKB59bSKD33: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_sX8yyBxHn8bS7t46: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_sf7s7s6bQ2cZv29s: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_xq9jy75y43kDXkvx: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51"
    },
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the 41 untouched packages stay byte-identical
    checks_feed: true, // written-kind G-D branch: empty options + modelAnswer required + known-kind enum
    pilotDelta: {
      files: [
        // 24 declared: the 12 S-B6 re-issues (hub revision rides this manifest)
        "rn_9WM8QhSxmYpGhjqd.hub-lesson-import.json",
        "rn_BX88twwgffRMgx82.hub-lesson-import.json",
        "rn_MMkxbt9y3M3XvXrc.hub-lesson-import.json",
        "rn_ZWrmDYtNGnmFycPM.hub-lesson-import.json",
        "rn_by5FDNfkqdBCkmXb.hub-lesson-import.json",
        "rn_dTP52nzhYb96XrJx.hub-lesson-import.json",
        "rn_nzW5ppBTV3ZnfSYY.hub-lesson-import.json",
        "rn_p2FmkrXqZSzFngpg.hub-lesson-import.json",
        "rn_qV5R2cKB59bSKD33.hub-lesson-import.json",
        "rn_sX8yyBxHn8bS7t46.hub-lesson-import.json",
        "rn_sf7s7s6bQ2cZv29s.hub-lesson-import.json",
        "rn_xq9jy75y43kDXkvx.hub-lesson-import.json",
        "rn_9WM8QhSxmYpGhjqd.sme-question-package.json",
        "rn_BX88twwgffRMgx82.sme-question-package.json",
        "rn_MMkxbt9y3M3XvXrc.sme-question-package.json",
        "rn_ZWrmDYtNGnmFycPM.sme-question-package.json",
        "rn_by5FDNfkqdBCkmXb.sme-question-package.json",
        "rn_dTP52nzhYb96XrJx.sme-question-package.json",
        "rn_nzW5ppBTV3ZnfSYY.sme-question-package.json",
        "rn_p2FmkrXqZSzFngpg.sme-question-package.json",
        "rn_qV5R2cKB59bSKD33.sme-question-package.json",
        "rn_sX8yyBxHn8bS7t46.sme-question-package.json",
        "rn_sf7s7s6bQ2cZv29s.sme-question-package.json",
        "rn_xq9jy75y43kDXkvx.sme-question-package.json"
      ],
    },
    schemas: {
      hub: "/home/z/my-project/scripts/r3-survivors/hub-lesson-import.1.4.schema.json",
      pkg: "/home/z/my-project/scripts/r3-survivors/sme-question-package.1.1.schema.json",
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.4.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.1.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/scripts/r3-survivors/hub-import-manifest-v13.json",
      int3: "/home/z/my-project/scripts/r3-survivors/INT-3-transform-record-r3-stageb6.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261031-r3-stageb6.json`,
    identity: {
      "notes": 112,
      "lessons": 239,
      "checks": 1787,
      "keyPoints": 1212,
      "distractors": 3565,
      "glossaryTerms": 654,
      "figures": 200,
      "figures_module_mapped": 122,
      "figures_note_level": 78,
      "workedExamples_populated": 112,
      "workedExamples_null": 0,
      "authored_chars_conserved": 1602286,
      "authored_chars_v3_baseline": 1347771,
      "added_chars": 254515,
      "captions_coalesced": 143,
      "captions_row_context": 16,
      "captions_inline": 3,
      "captions_none": 38,
      "binding_heading_unique": 90,
      "binding_sole_lesson": 0,
      "binding_content_overlap": 12,
      "binding_note_level": 78,
      "binding_unresolved": 20,
      "figures_binding_narrowed": 102,
      "figures_claims_changed": 12,
      "figures_wholesale_claims_kept": 2,
      "checks_written": 592,
      "checks_mcq": 1195,
      "written_recall": 296,
      "written_explain_why": 148,
      "written_application": 148
    },
    figures_feed: true,
    we_feed: true, // the v13 stream is the declared baseline; this feed's equality gate is per-note vs the INT-3 r3-stageb6 anchors (41 exact at v12; 59 prior-R3 at their own anchors exactly; 12 S-B6 notes carry the 96 written items' tokens)
    landing: "revision", // declared G-DELTA: exactly the 24 declared files re-pin (12 S-B6); everything else byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v13 manifest path not integration-relative: ${a.path}`);
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
  "r3-stageb8-v15": {
    manifest: "hub-import-manifest-v15.json",
    manifest_version: 15,
    lesson_kind: "hub-lesson-import-1.4", // legacy single-kind field; v12 uses lessonKinds below
    lessonKinds: { "hub-lesson-import-1.3": 18, "hub-lesson-import-1.4": 94 }, // generation-union census (2 stage-A pilots + 10 S-B1 + 12 S-B2 + 12 S-B3 + 11 S-B4 + 12 S-B5 + 12 S-B6 + 9 S-B7 + 14 S-B8 at 1.4)
    adapter: "guided-lesson-0.5--hub-lesson-import-1.4",
    directive: "run the R3 mixed check types stage-B wave 8 chain — import the S-B8 tranche (the wave-8 authoring register: 14 notes / 32 lessons / 128 written items; operator ignition trace 1a1900aa14eb84d5 'STAGE-B WAVE 8'). Declared hub revision = 28 files: the 14 S-B8 re-issues (PR #249 generation, bytes fetched @ pin). The S-B2/S-B3/S-B4/S-B5/S-B6/S-B7 re-issues are already live on the hub at their v9/v10/v11/v12/v13/v14 pins and are re-proved byte-identical at this manifest",
    promo: {
      // promotion commit of record = the resources PR #249 MERGE commit (trace-bearing merge
      // message first-time-right this wave; no mid-flight race: main at the #249 merge equals the
      // wave-open main of record 7819d8a4 — merge parents recorded in the receipt)
      commit: "88dfb3dee9d85c5e533c3d99646678bb588fb559",
      tree: "980bdb846a68bbce9e81e93f244c0b5f28fc69be",
      parent: "7819d8a4aed0aefd53a9709f737d73159868432c", // resources main first-parent at the #249 merge
      trace: "1a1900aa14eb84d5",
    },
    integration_branch: null, // ancestry of record — hub run happens only after the resources PR merges
    artifact_pin: "71922d1510ee9e00400667670b40f36e1ae5d456", // the 18 untouched lessons keep the source-0.4 (1.3) pin
    artifact_pins_by_note: {
      // the 94 R3 notes (2 pilots + 10 S-B1 + 12 S-B2 + 12 S-B3 + 11 S-B4 + 12 S-B5 + 12 S-B6 + 9 S-B7 + 14 S-B8) re-pin BOTH channels to
      // their source-0.5 generation commits
      rn_2MpXPtNXvn8pQm3r: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_8T5GfPn2q7sY2YCh: "80afdb8e02b628754f0e522d257e54d046ba5b0f",
      rn_2d6Yb8GwGfRRd6pZ: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_4SgDJv8rKxpQQSBh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_HZM2WRjPPT8Srcxt: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_JCfdFrHsCkrmMbFj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_TM4QVMgXVxs4vbfY: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_fQSYvKRMDBj3s2Bx: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_jNJ4gTmcHqdFqsNh: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_kJg2gwF77vdFZZ2H: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_wTtM2fQVVjntRm64: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_xT8XsdJtDX5gNFXj: "78ad6a2073c669231bb40bd7266674a257c6003e",
      rn_2VnK66PqbvFKdKYt: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_S7GPh8BBPBbmhYKm: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_cTk2cs2h2BKQ3y3B: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_QVmDs8X4szpds3cP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TWGVV6RXN3Ktqb9h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_RvgxXR36425BFMcx: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_YBWYstSRgM2QPzQq: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_R3ptwxGTTvdBFvyP: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_TsfqyK9BYMtN2Bfd: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_kb2VkFMdBTbmG33t: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_vzGMZxqQtWYVWB7h: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_b3XCzdtfQddbJjVf: "96c261a3a06e359dec72f63c67fd24d337adf463",
      rn_Syxyh4Fct8KFg8NQ: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mBqgkpZ3hbSBmWCC: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_N4HX8tqbdhTQcHyS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_VyXFNyxZHZGkxqTG: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_vXPcH3vS8wv7BFkK: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_pWzTTBv3B4yGFfj3: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_yj4y972FxCWnDnSg: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_Hkwmd9GSp3gdxxR5: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_4tzwS4GZjPybwtkS: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_T55t3HNsgyZcXZtN: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_mbcBZkygY4YpG2bf: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_8Nv33F4dD3kkZnY6: "da18433ed9e8351a2e8ce1282b8eaf5c362442d4",
      rn_3YZNCXSQQqXTT6HR: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_FCnWFz9MhgsqnZGM: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_GkJG52NCN98ShGRm: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_Hp2nK8XpN2SmjdQc: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_J7ZcTWyRxRgWQ45R: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_KpvF2TWr5fYHk2Jz: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_MVnFKDMVkswzpmpw: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_jVwPmjqHbqQkXcjG: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_kdRjZHjHcpVZsD3h: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_rHKCkt3PTXDBpmJG: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_vfmJxw4VQgXKzXF3: "fa1f302050ba38b6b2e97760e88d32567d2b0c90",
      rn_3B8JxsSjJvR9B4fk: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_5WvdZNzzhHdjj2Qq: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_6M5JB7CjvwdDykMS: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_7Q8M9nVkr2FxCzxd: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_DGkNCJRcCN4VQ28p: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_Kd76WccxD9ytSJJC: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_QzYRzzmwRxk2gKqV: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_S2fg29M7cqvMj5kT: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_V9tPMnX6Hq2XnqcP: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_WJD4ZN4kQfzJNSPV: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_gBGX339WBpwyCrFF: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_jXXsc4wt2344BjxX: "6fb25fc02d1a7acc71ee2231b547ac85e00705c1",
      rn_9WM8QhSxmYpGhjqd: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_BX88twwgffRMgx82: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_MMkxbt9y3M3XvXrc: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_ZWrmDYtNGnmFycPM: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_by5FDNfkqdBCkmXb: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_dTP52nzhYb96XrJx: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_nzW5ppBTV3ZnfSYY: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_p2FmkrXqZSzFngpg: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_qV5R2cKB59bSKD33: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_sX8yyBxHn8bS7t46: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_sf7s7s6bQ2cZv29s: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",
      rn_xq9jy75y43kDXkvx: "286b5ac81d43a28e5faa9f9e8ab16b67fbb12c51",

      rn_5g8Dd6y89tkCVJsN: "a8889009338bc5ce09edfed1d610d8cc9c9457b4",
      rn_6ZCysv9GnNQmc3w2: "a8889009338bc5ce09edfed1d610d8cc9c9457b4",
      rn_T6S7R66N2wSZpWyc: "a8889009338bc5ce09edfed1d610d8cc9c9457b4",
      rn_VvsXMdW3TB37JhWF: "a8889009338bc5ce09edfed1d610d8cc9c9457b4",
      rn_YWDXCCmjfjkJcs6c: "a8889009338bc5ce09edfed1d610d8cc9c9457b4",
      rn_pBp5Z5C2RHTKk7Wn: "a8889009338bc5ce09edfed1d610d8cc9c9457b4",
      rn_qb9TBhB6VmnFGjvf: "a8889009338bc5ce09edfed1d610d8cc9c9457b4",
      rn_v5JjfpT6grhtq3QW: "a8889009338bc5ce09edfed1d610d8cc9c9457b4",
      rn_vVdP57QhDYSVfZgy: "a8889009338bc5ce09edfed1d610d8cc9c9457b4",
      rn_3wZh9qRT7qFJn9QW: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_6478QfpYNQDjZSvt: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_DRQXrcSrmgQ7jcbZ: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_H6ZVkxvdNgYDvfFb: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_HNXFQt7vM32g6PMv: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_KTZjJ7sPdDt4tkTH: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_XJ8qXfzZJJFKXHnF: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_Zh6Pw56rjdMkPCD4: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_dgVRCKCwn4rTGxGZ: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_t68QRDhwR6r5gxYX: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_tvwj4VZ6yFscPJfD: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_w25KHshCMNQWwftj: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_x5m8QBWxtKvxQ9sx: "51a6ed34e715a270c1d1525d1cff903777337437",
      rn_y85XYRv5QfgZFQxv: "51a6ed34e715a270c1d1525d1cff903777337437"
    },
    pkg_pin: "4d857c472fd725597ac21db189542c8f12c82dba", // INT-0 — the 18 untouched packages stay byte-identical
    checks_feed: true, // written-kind G-D branch: empty options + modelAnswer required + known-kind enum
    pilotDelta: {
      files: [
        // 28 declared: the 14 S-B8 re-issues (hub revision rides this manifest)
        "rn_3wZh9qRT7qFJn9QW.hub-lesson-import.json",
        "rn_6478QfpYNQDjZSvt.hub-lesson-import.json",
        "rn_DRQXrcSrmgQ7jcbZ.hub-lesson-import.json",
        "rn_H6ZVkxvdNgYDvfFb.hub-lesson-import.json",
        "rn_HNXFQt7vM32g6PMv.hub-lesson-import.json",
        "rn_KTZjJ7sPdDt4tkTH.hub-lesson-import.json",
        "rn_XJ8qXfzZJJFKXHnF.hub-lesson-import.json",
        "rn_Zh6Pw56rjdMkPCD4.hub-lesson-import.json",
        "rn_dgVRCKCwn4rTGxGZ.hub-lesson-import.json",
        "rn_t68QRDhwR6r5gxYX.hub-lesson-import.json",
        "rn_tvwj4VZ6yFscPJfD.hub-lesson-import.json",
        "rn_w25KHshCMNQWwftj.hub-lesson-import.json",
        "rn_x5m8QBWxtKvxQ9sx.hub-lesson-import.json",
        "rn_y85XYRv5QfgZFQxv.hub-lesson-import.json",
        "rn_3wZh9qRT7qFJn9QW.sme-question-package.json",
        "rn_6478QfpYNQDjZSvt.sme-question-package.json",
        "rn_DRQXrcSrmgQ7jcbZ.sme-question-package.json",
        "rn_H6ZVkxvdNgYDvfFb.sme-question-package.json",
        "rn_HNXFQt7vM32g6PMv.sme-question-package.json",
        "rn_KTZjJ7sPdDt4tkTH.sme-question-package.json",
        "rn_XJ8qXfzZJJFKXHnF.sme-question-package.json",
        "rn_Zh6Pw56rjdMkPCD4.sme-question-package.json",
        "rn_dgVRCKCwn4rTGxGZ.sme-question-package.json",
        "rn_t68QRDhwR6r5gxYX.sme-question-package.json",
        "rn_tvwj4VZ6yFscPJfD.sme-question-package.json",
        "rn_w25KHshCMNQWwftj.sme-question-package.json",
        "rn_x5m8QBWxtKvxQ9sx.sme-question-package.json",
        "rn_y85XYRv5QfgZFQxv.sme-question-package.json"
      ],
    },
    schemas: {
      hub: "/home/z/my-project/scripts/r3-survivors/hub-lesson-import.1.4.schema.json",
      pkg: "/home/z/my-project/scripts/r3-survivors/sme-question-package.1.1.schema.json",
      hubRemote: "SME-GuidedLessons/integration/schema/hub-lesson-import.1.4.schema.json",
      pkgRemote: "SME-GuidedLessons/integration/schema/sme-question-package.1.1.schema.json",
    },
    survivors: {
      manifest: "/home/z/my-project/scripts/r3-survivors/hub-import-manifest-v15.json",
      int3: "/home/z/my-project/scripts/r3-survivors/INT-3-transform-record-r3-stageb8.json",
    },
    receipt: `/home/z/my-project/download/integration/HUB-IMPORT-RUN-20261031-r3-stageb8.json`,
    identity: {
      "notes": 112,
      "lessons": 239,
      "checks": 1991,
      "keyPoints": 1212,
      "distractors": 3565,
      "glossaryTerms": 654,
      "figures": 200,
      "figures_module_mapped": 122,
      "figures_note_level": 78,
      "workedExamples_populated": 112,
      "workedExamples_null": 0,
      "authored_chars_conserved": 1656599,
      "authored_chars_v3_baseline": 1347771,
      "added_chars": 308828,
      "captions_coalesced": 143,
      "captions_row_context": 16,
      "captions_inline": 3,
      "captions_none": 38,
      "binding_heading_unique": 90,
      "binding_sole_lesson": 0,
      "binding_content_overlap": 12,
      "binding_note_level": 78,
      "binding_unresolved": 20,
      "figures_binding_narrowed": 102,
      "figures_claims_changed": 12,
      "figures_wholesale_claims_kept": 2,
      "checks_written": 796,
      "checks_mcq": 1195,
      "written_recall": 398,
      "written_explain_why": 199,
      "written_application": 199
    },
    figures_feed: true,
    we_feed: true, // the v15 stream is the declared baseline; this feed's equality gate is per-note vs the INT-3 r3-stageb8 anchors (18 exact at v14; 80 prior-R3 at their own anchors exactly; 14 S-B8 notes carry the 128 written items' tokens)
    landing: "revision", // declared G-DELTA: exactly the 28 declared files re-pin (14 S-B8); everything else byte-identical
    relFor(a) {
      if (!a.path.startsWith("SME-GuidedLessons/integration/")) throw new Error(`v15 manifest path not integration-relative: ${a.path}`);
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
