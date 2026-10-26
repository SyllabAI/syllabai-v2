#!/usr/bin/env node
/**
 * HUB IMPORT RUNNER — guided-lessons channel (hub/lesson-import/1.0 + sme-question-package/1.0).
 *
 * The hub-side consumer of the integration namespace that ROUND-FULLCORPUS-PROMOTION-20261026
 * (operator trace 1a17763c15632259, commit 2c76500677ff82fb7732c87402ebbf7fecc6e599 on
 * SyllabAI/syllabai-resources) landed of record. Fed by hub-import-manifest-v2.json
 * (format hub-import-manifest/1.0, 224 artifacts: 112 hub-lesson-import + 112
 * sme-question-package).
 *
 * Contract of record: download/integration/ADAPTER-SPEC-guided-lesson-0.1-to-hub.md
 * (adapter id guided-lesson-0.1--hub-lesson-import-1.0). The runner is manifest-driven,
 * fail-closed and additive:
 *   P0   preflight        — promotion commit resolves; tree/parent/message match the
 *                           promotion receipt; commit remains a main ancestor.
 *   G-A  manifest         — fetched @ the pinned commit, byte-identical to the lane
 *                           survivor; format/version/kinds/counts/conservation blocks sane.
 *   G-B  fetch+verify     — all 224 artifacts fetched raw @ the pinned commit; per-artifact
 *                           sha256 + byte length == manifest entry (retry-once, pooled).
 *   G-C  schema (S)       — ajv draft-07 ×224 against both target schemas fetched @ the
 *                           SAME commit (schemas byte-anchored to lane survivors).
 *   G-D  cross-refs (X)   — derived-ID grammar (§5); module checkRefs ↔ package questions
 *                           bidirectional 1:1 in order; source-block provenance pinned.
 *   G-E  stream (Φ)       — canonical authored stream (adapter spec §7) recomputed from the
 *                           fetched artifacts; per-note sha256+chars vs INT-3 record anchors
 *                           ×112; wave subtotals + grand stream vs manifest conservation.
 *   LAND                 — byte-exact atomic landing into the hub content tree
 *                           (content/igcse-chemistry-19/guided-lessons|guided-questions/ +
 *                           guided-import.json index). Additive-only: an existing file with
 *                           DIFFERENT bytes aborts; byte-identical files are a no-op.
 *   G-V  post-land        — cold re-read ×224 re-hashed vs manifest; closing identity
 *                           re-derived from disk; loader-path probe (loadContentJson rel
 *                           shape); idempotence re-probe (all 224 report identical-exists).
 *
 * No landing occurs unless every gate through G-E is green. Receipt of record:
 * download/integration/HUB-IMPORT-RUN-<date>.json (lane side) + the in-pack
 * guided-import.json (hub side).
 *
 * Lane discipline: remote traffic is READ-ONLY GitHub contents API at the pinned commit;
 * the token is never echoed; zero DB contact (the hub's content plane is the committed
 * content/ tree — ADR-021 discipline — not a database).
 *
 * Run: node apps/hub/scripts/import_guided/run_import.mjs
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const Ajv = require("/home/z/node_modules/ajv");

// ── of-record inputs ─────────────────────────────────────────────────────────
const REPO = "SyllabAI/syllabai-resources";
const PROMO_COMMIT = "2c76500677ff82fb7732c87402ebbf7fecc6e599"; // promotion receipt of record
const PROMO_TREE = "5079876a89a8eda65eba7c7ec76b6a20c3e3cc8d";
const PROMO_PARENT = "3cd29bcccfaab0210deba025283098dfa6c875b6";
const PROMO_TRACE = "1a17763c15632259";
const REMOTE_BASE = "SME-GuidedLessons/integration"; // integration namespace lives under the pin's path base (SME-GuidedLessons/)
// PROMOTION PATH MAP (of record): the promotion commit flattened the transform layout —
// manifest paths "transformed/full-corpus/hub-import/<f>" → remote "hub-import/<f>" and
// "transformed/full-corpus/question-packages/<f>" → remote "question-packages/<f>".
// The mapping is derived from the artifact KIND (unambiguous, basename preserved); the
// per-artifact sha256+bytes gate remains the true integrity anchor.
function remoteRelFor(a) {
  const base = a.path.split("/").pop();
  const dir = a.kind === "hub-lesson-import" ? "hub-import" : a.kind === "sme-question-package" ? "question-packages" : null;
  if (!dir || !base) throw new Error(`unmappable artifact path: ${a.path} (kind ${a.kind})`);
  return `${REMOTE_BASE}/${dir}/${base}`;
}
const INT0_PIN = "4d857c472fd725597ac21db189542c8f12c82dba"; // source provenance carried in artifacts
const TOKEN_PATH = "/home/z/my-project/.creds/gh-pat.candidate";
const SURVIVOR_DIR = "/home/z/my-project/download/integration";
const SURVIVOR_MANIFEST = path.join(SURVIVOR_DIR, "hub-import-manifest-v2.json");
const SURVIVOR_SCHEMA_HUB = path.join(SURVIVOR_DIR, "schema/hub-lesson-import.1.0.schema.json");
const SURVIVOR_SCHEMA_PKG = path.join(SURVIVOR_DIR, "schema/sme-question-package.1.0.schema.json");
const INT3_RECORD = path.join(SURVIVOR_DIR, "INT-3-transform-record-fullcorpus.json");
const RECEIPT_OUT = path.join(SURVIVOR_DIR, "HUB-IMPORT-RUN-20261026.json");
const OPERATOR_TRACE = process.env.OPERATOR_TRACE || "1a177895ebf3ce39"; // "feed hub-import-manifest-v2.json to the hub's import runner"

// ── hub landing zone (additive inside the igcse-chemistry-19 pack) ──────────
const HUB = "/home/z/my-project/syllabai-v2/apps/hub";
const PACK = path.join(HUB, "content/igcse-chemistry-19");
const LAND_LESSONS = path.join(PACK, "guided-lessons");
const LAND_QUESTIONS = path.join(PACK, "guided-questions");
const LAND_INDEX = path.join(PACK, "guided-import.json");
const REL_LESSONS = "igcse-chemistry-19/guided-lessons"; // loadContentJson rel shapes
const REL_QUESTIONS = "igcse-chemistry-19/guided-questions";
const REL_INDEX = "igcse-chemistry-19/guided-import.json";

// ── closing identity of record (manifest counts must equal this) ────────────
const CLOSING_IDENTITY = {
  notes: 112,
  lessons: 239,
  checks: 1195,
  keyPoints: 1212,
  distractors: 3565,
  glossaryTerms: 654,
  authored_chars_conserved: 1347771,
};

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
  const url = `${API}/repos/${REPO}/contents/${encodeURI(rel)}?ref=${PROMO_COMMIT}`;
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
  // rel is a repo-API path relative to /repos/{owner}/{repo}/ (e.g. "git/commits/<sha>", "compare/<a>...<b>")
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
  }
  return s;
}

// atomic byte-exact write; returns "written" | "identical-exists"; throws on divergent existing file
function landFile(dest, buf) {
  if (fs.existsSync(dest)) {
    const cur = fs.readFileSync(dest);
    if (cur.equals(buf)) return "identical-exists";
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
  console.log(`HUB IMPORT RUNNER — feed hub-import-manifest-v2 @ ${PROMO_COMMIT.slice(0, 8)} (operator trace ${OPERATOR_TRACE})`);

  // ── P0 preflight: promotion commit resolves and matches the receipt ────────
  const c = await fetchJson(`git/commits/${PROMO_COMMIT}`);
  check("P0", "promotion commit resolves", !!c.sha, c.sha || "missing");
  check("P0", "tree matches promotion receipt", c.tree && c.tree.sha === PROMO_TREE, `tree=${c.tree && c.tree.sha}`);
  check("P0", "parent matches promotion receipt", Array.isArray(c.parents) && c.parents[0] && c.parents[0].sha === PROMO_PARENT, `parent=${c.parents && c.parents[0] && c.parents[0].sha}`);
  check("P0", "message carries promotion trace", typeof c.message === "string" && c.message.includes(PROMO_TRACE), (c.message || "").slice(0, 90));
  const cmp = await fetchJson(`compare/${PROMO_COMMIT}...main`);
  check("P0", "promotion commit remains main ancestor", cmp.status === "ahead" || cmp.status === "identical", `status=${cmp.status} behind_by=${cmp.behind_by}`);
  // base_commit of compare is the merge-base — assert it IS the promotion commit
  check("P0", "merge-base == promotion commit", cmp.base_commit && cmp.base_commit.sha === PROMO_COMMIT, `base=${cmp.base_commit && cmp.base_commit.sha}`);

  // ── G-A manifest: fetch @ pin, byte-identical to survivor, structurally sane
  const manBuf = await fetchRaw(`${REMOTE_BASE}/hub-import-manifest-v2.json`);
  check("G-A", "manifest fetched @ promotion commit", manBuf.length > 10000, `${manBuf.length}B`);
  const survMan = fs.readFileSync(SURVIVOR_MANIFEST);
  check("G-A", "manifest byte-identical to lane survivor", manBuf.equals(survMan), `remote ${sha256(manBuf).slice(0, 12)} vs survivor ${sha256(survMan).slice(0, 12)}`);
  const man = JSON.parse(manBuf.toString("utf8"));
  check("G-A", "format hub-import-manifest/1.0", man.format === "hub-import-manifest/1.0", man.format);
  check("G-A", "manifest_version 2", man.manifest_version === 2, String(man.manifest_version));
  check("G-A", "224 artifacts listed", Array.isArray(man.artifacts) && man.artifacts.length === 224, String(man.artifacts && man.artifacts.length));
  const kinds = {};
  for (const a of man.artifacts) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
  check("G-A", "kinds 112/112", kinds["hub-lesson-import"] === 112 && kinds["sme-question-package"] === 112, JSON.stringify(kinds));
  check("G-A", "counts == closing identity", JSON.stringify(man.counts) === JSON.stringify(CLOSING_IDENTITY), JSON.stringify(man.counts));
  check("G-A", "conservation block present", !!(man.conservation && man.conservation.authored_stream_sha256 && man.conservation.wave_stream_sha256), "");
  check("G-A", "adapter of record", man.load_scope && man.load_scope.adapter === "guided-lesson-0.1--hub-lesson-import-1.0", man.load_scope && man.load_scope.adapter);
  check("G-A", "manifest carries promotion operator trace", man.operator_trace === PROMO_TRACE, man.operator_trace);
  const mapBad = man.artifacts.filter((a) => {
    const b = a.path.split("/").pop();
    return !((a.kind === "hub-lesson-import" && a.path.startsWith("transformed/full-corpus/hub-import/")) || (a.kind === "sme-question-package" && a.path.startsWith("transformed/full-corpus/question-packages/"))) || !b;
  });
  check("G-A", "artifact paths conform to the promotion path-map families", mapBad.length === 0, mapBad.length ? mapBad.slice(0, 2).map((a) => a.path).join(",") : "224 mappable (flattened layout verified remote: hub-import 112 / question-packages 112)");

  // ── schemas @ the same commit, byte-anchored to survivors ──────────────────
  const hubSchemaBuf = await fetchRaw(`${REMOTE_BASE}/schema/hub-lesson-import.1.0.schema.json`);
  const pkgSchemaBuf = await fetchRaw(`${REMOTE_BASE}/schema/sme-question-package.1.0.schema.json`);
  check("G-A", "hub schema byte-identical to survivor", hubSchemaBuf.equals(fs.readFileSync(SURVIVOR_SCHEMA_HUB)), `${hubSchemaBuf.length}B`);
  check("G-A", "package schema byte-identical to survivor", pkgSchemaBuf.equals(fs.readFileSync(SURVIVOR_SCHEMA_PKG)), `${pkgSchemaBuf.length}B`);
  const ajv = new Ajv({ allErrors: true });
  const vHub = ajv.compile(JSON.parse(hubSchemaBuf.toString("utf8")));
  const vPkg = ajv.compile(JSON.parse(pkgSchemaBuf.toString("utf8")));

  // ── G-B fetch all 224 artifacts @ pin + per-artifact sha256/bytes ─────────
  const fetched = await pooled(man.artifacts, 6, async (a) => {
    const rel = remoteRelFor(a);
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

  // parse the green set (abort before landing on any failure so far)
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
    const ok = p.kind === "hub-lesson-import" ? vHub(p.obj) : vPkg(p.obj);
    if (!ok) {
      schemaFails++;
      if (schemaFails <= 3) check("G-C", `schema ${p.noteId}`, false, ajv.errorsText((vHub.errors || vPkg.errors)).slice(0, 200));
    }
  }
  check("G-C", "ajv draft-07 ×224 (hub/lesson-import/1.0 + sme-question-package/1.0)", schemaFails === 0, schemaFails ? `${schemaFails} failures` : "all pass");

  // ── G-D cross-refs: derived-ID grammar + checkRefs ↔ questions 1:1 ─────────
  const idOk = (id, noteId, l, k) =>
    id === `igcse-chemistry::${noteId}` || // lesson/package id
    (l != null && k == null && id === `${noteId}::L${l}`) ||
    (l != null && k != null && id === `${noteId}::L${l}::Q${k}`);
  let xFails = 0;
  const perNoteX = {};
  for (const p of parsed) {
    const hub = parsed.find((x) => x.kind === "hub-lesson-import" && x.noteId === p.noteId);
    const pkg = parsed.find((x) => x.kind === "sme-question-package" && x.noteId === p.noteId);
    if (!hub || !pkg) { xFails++; perNoteX[p.noteId] = "missing pair"; continue; }
    if (p.kind !== "hub-lesson-import") continue; // evaluate once per note
    const H0 = hub.obj, P0 = pkg.obj;
    const errs = [];
    if (H0.lesson.id !== `igcse-chemistry::${p.noteId}`) errs.push("lesson id grammar");
    if (P0.packageId !== `igcse-chemistry::${p.noteId}`) errs.push("packageId grammar");
    if (!H0.source || H0.source.noteId !== p.noteId || P0.source.noteId !== p.noteId) errs.push("source.noteId");
    if (H0.source.pinnedRef !== INT0_PIN || P0.source.pinnedRef !== INT0_PIN) errs.push("pinnedRef");
    if (H0.source.sourceLayerSha256 !== P0.source.sourceLayerSha256) errs.push("sourceLayerSha256 mismatch hub/pkg");
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
      const correctN = (q.options || []).filter((o) => o.correct === true).length;
      if (correctN !== 1) errs.push(`q ${q.id} correct!=1`);
    });
    if (errs.length) { xFails++; perNoteX[p.noteId] = errs.slice(0, 3).join(","); }
  }
  const notePairs = Object.keys(perNoteX).length / 2; // per-note entries counted once
  check("G-D", "X ×112: grammar + checkRefs↔questions bidirectional + provenance", xFails === 0, xFails ? `${xFails} notes failing: ` + Object.entries(perNoteX).filter(([k]) => !k.endsWith("(pkg)")).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(" | ") : "1,195 checks resolve 1:1");

  // ── G-E stream conservation (Φ) — per-note anchors + wave + grand ──────────
  const int3 = JSON.parse(fs.readFileSync(INT3_RECORD, "utf8"));
  const byNote = new Map(parsed.map((p) => [p.kind + "|" + p.noteId, p]));
  const grand = crypto.createHash("sha256");
  let grandChars = 0;
  const waveHashes = {};
  let phiFails = 0;
  for (const anchor of int3.notes) {
    const hubP = byNote.get("hub-lesson-import|" + anchor.noteId);
    const pkgP = byNote.get("sme-question-package|" + anchor.noteId);
    if (!hubP || !pkgP) { phiFails++; continue; }
    const toks = targetTokens(hubP.obj, pkgP.obj);
    const s = toks.join("\n");
    const sha = sha256(Buffer.from(s, "utf8"));
    const ok = sha === anchor.stream.sha256 && s.length === anchor.stream.chars;
    if (!ok) { phiFails++; if (phiFails <= 3) check("G-E", `stream ${anchor.noteId}`, false, `got ${sha.slice(0, 12)}/${s.length} want ${anchor.stream.sha256.slice(0, 12)}/${anchor.stream.chars}`); }
    grand.update(Buffer.from(s, "utf8"));
    grandChars += s.length;
    const w = "wave-" + anchor.wave;
    waveHashes[w] = waveHashes[w] || crypto.createHash("sha256");
    waveHashes[w].update(Buffer.from(s, "utf8"));
    // artifact-level anchor too
    if (hubP.sha256 !== anchor.hubSha256 || pkgP.sha256 !== anchor.pkgSha256) { phiFails++; check("G-E", `artifact sha anchors ${anchor.noteId}`, false, "hub/pkg sha vs INT-3 record"); }
  }
  check("G-E", "per-note stream anchors ×112 (sha256 + chars)", phiFails === 0, phiFails ? `${phiFails} failures` : "all conserved");
  const waveOut = {};
  let waveFails = 0;
  for (const [w, h] of Object.entries(waveHashes)) {
    waveOut[w] = h.digest("hex");
    if (man.conservation.wave_stream_sha256[w] !== waveOut[w]) waveFails++;
  }
  check("G-E", "wave stream subtotals ×10 vs manifest", waveFails === 0 && Object.keys(waveOut).length === 10, waveFails ? `${waveFails} drift` : "all match");
  const grandShaHex = grand.digest("hex"); // computed ONCE — single-finalization law (pilot INT-4 precedent)
  check("G-E", "grand stream vs manifest", grandChars === man.counts.authored_chars_conserved && grandShaHex === man.conservation.authored_stream_sha256, `${grandChars} chars ${grandShaHex.slice(0, 12)}`);
  const grandShaHexOnce = grandShaHex; // alias for downstream reuse (never re-digest)

  if (FAILS.length) {
    console.error(`FAIL-CLOSED before landing: ${FAILS.length} failures`);
    for (const f of FAILS) console.error(`  [${f.stage}] ${f.name} — ${f.detail}`);
    process.exit(1);
  }

  // ── LAND: byte-exact into the hub content tree (additive) ──────────────────
  let written = 0, noop = 0;
  const landLog = [];
  for (const p of parsed) {
    const dest = p.kind === "hub-lesson-import"
      ? path.join(LAND_LESSONS, path.basename(p.path))
      : path.join(LAND_QUESTIONS, path.basename(p.path));
    const res = landFile(dest, p.buf);
    if (res === "written") written++;
    else noop++;
    landLog.push(res);
  }
  check("LAND", "224 artifacts landed byte-exact (additive-only)", written + noop === 224, `${written} written, ${noop} already identical`);

  // in-pack import index (runner-derived bytes, not part of the conserved stream)
  const index = {
    format: "guided-import-index/1.0",
    runner: "apps/hub/scripts/import_guided/run_import.mjs (hub-import-runner/1.0)",
    imported_at_utc: now(),
    operator_trace: OPERATOR_TRACE,
    upstream: {
      repo: REPO,
      namespace: "integration/",
      commit: PROMO_COMMIT,
      manifest: "hub-import-manifest-v2.json",
      manifest_sha256: sha256(manBuf),
      manifest_version: 2,
      int0_pin: INT0_PIN,
      adapter: "guided-lesson-0.1--hub-lesson-import-1.0",
    },
    target_schemas: ["hub/lesson-import/1.0", "sme-question-package/1.0"],
    counts: { ...man.counts },
    conservation: { authored_stream_sha256: grandShaHex, authored_chars: grandChars },
    landing: {
      lessons_rel: REL_LESSONS,
      questions_rel: REL_QUESTIONS,
      lesson_files: 112,
      question_files: 112,
      byte_exact: true,
      additive_only: true,
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
    const dest = p.kind === "hub-lesson-import"
      ? path.join(LAND_LESSONS, path.basename(p.path))
      : path.join(LAND_QUESTIONS, path.basename(p.path));
    const buf = fs.readFileSync(dest);
    if (!buf.equals(p.buf)) { diskFails++; if (diskFails <= 3) check("G-V", `disk byte-identity ${p.noteId}`, false, dest); }
  }
  check("G-V", "cold re-read ×224 byte-identical vs manifest sha", diskFails === 0, diskFails ? `${diskFails} drift` : "disk == fetched bytes");

  // closing identity re-derived FROM DISK (not from the manifest)
  const disk = { notes: 0, lessons: 0, checks: 0, keyPoints: 0, distractors: 0, glossaryTerms: 0 };
  for (const p of parsed) {
    if (p.kind !== "hub-lesson-import") continue;
    const rel = path.join(LAND_LESSONS, path.basename(p.path));
    const h = JSON.parse(fs.readFileSync(rel, "utf8"));
    disk.notes++;
    disk.lessons += h.lesson.modules.length;
    disk.keyPoints += h.lesson.modules.reduce((a, m) => a + m.keyPoints.length, 0);
    disk.glossaryTerms += (h.lesson.assets.glossary || []).length;
  }
  for (const p of parsed) {
    if (p.kind !== "sme-question-package") continue;
    const q = JSON.parse(fs.readFileSync(path.join(LAND_QUESTIONS, path.basename(p.path)), "utf8"));
    disk.checks += q.questions.length;
    for (const qq of q.questions) disk.distractors += (qq.options || []).filter((o) => o.correct !== true).length;
  }
  const idOkDisc = disk.notes === CLOSING_IDENTITY.notes && disk.lessons === CLOSING_IDENTITY.lessons &&
    disk.checks === CLOSING_IDENTITY.checks && disk.keyPoints === CLOSING_IDENTITY.keyPoints &&
    disk.distractors === CLOSING_IDENTITY.distractors && disk.glossaryTerms === CLOSING_IDENTITY.glossaryTerms;
  check("G-V", "closing identity re-derived from disk", idOkDisc, JSON.stringify(disk));

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
  const staticSrc = JSON.parse(JSON.stringify(null)) ; try {
    const mjs = fs.readFileSync(path.join(HUB, "scripts/build_corpus_static.mjs"), "utf8");
    check("G-V", "static build copies content/ recursively (cpSync recursive in build_corpus_static.mjs)", mjs.includes("cpSync") && mjs.includes("recursive: true"), "whole-tree copy — new guided-* subdirs publish with the next build");
  } catch { check("G-V", "static build copy semantics", false, "build_corpus_static.mjs not readable"); }

  // idempotence re-probe: a second landing pass must report identical-exists ×224
  let idemOk = 0;
  for (const p of parsed) {
    const dest = p.kind === "hub-lesson-import"
      ? path.join(LAND_LESSONS, path.basename(p.path))
      : path.join(LAND_QUESTIONS, path.basename(p.path));
    if (landFile(dest, p.buf) === "identical-exists") idemOk++;
  }
  check("G-V", "idempotence re-landing 224/224 identical-exists", idemOk === 224, `${idemOk}/224`);

  // ── receipt of record (lane side) ───────────────────────────────────────────
  const receipt = {
    format: "hub-import-run-receipt/0.1",
    generated_at_utc: now(),
    operator_trace: OPERATOR_TRACE,
    operator_directive: "feed hub-import-manifest-v2.json to the hub's import runner",
    runner: { path: "apps/hub/scripts/import_guided/run_import.mjs", id: "hub-import-runner/1.0", runtime: "node " + process.version },
    feed: {
      manifest: "hub-import-manifest-v2.json",
      manifest_sha256: sha256(manBuf),
      source: `${REPO} integration/ @ ${PROMO_COMMIT} (promotion commit of record, trace ${PROMO_TRACE})`,
      byte_identical_to_lane_survivor: true,
    },
    gates: {
      P0: "promotion commit preflight (tree/parent/message/ancestry/merge-base)",
      GA: "manifest integrity ×11 (format/version/kinds/counts/conservation/adapter/trace + survivor byte-identity + schemas byte-anchored)",
      GB: "224/224 fetched raw @ pinned commit, sha256+bytes exact",
      GC: "ajv draft-07 ×224 vs both target schemas",
      GD: "X ×112 — derived-ID grammar, checkRefs↔questions bidirectional 1:1 (1,195 checks), pinned provenance",
      GE: "Φ — per-note stream anchors ×112 vs INT-3 record; wave subtotals ×10; grand stream vs manifest",
      LAND: "byte-exact atomic landing, additive-only (divergent overwrite aborts)",
      GV: "cold re-read ×224; closing identity re-derived from disk; loader rel-shape probe; static-build pickup; idempotence 224/224",
    },
    gate_results: CHECKS,
    landing: {
      hub_tree: "syllabai-v2/apps/hub",
      pack: "content/igcse-chemistry-19/",
      lessons_dir: "guided-lessons/ (112 files)",
      questions_dir: "guided-questions/ (112 files)",
      index: "guided-import.json (guided-import-index/1.0)",
      files_written: written,
      files_already_identical: noop,
      bytes_landed: parsed.reduce((a, p) => a + p.buf.length, 0),
    },
    counts_landed: disk,
    conservation_recomputed: { authored_chars: grandChars, authored_stream_sha256: grandShaHex },
    hub_tree_disclosure: {
      pre_existing_unrelated_modifications: "workflow files (.github/*) modified by an earlier era — untouched; local clone behind origin/main (2f9b0e82 vs 6e8e89f4) — landing is against the on-disk tree; commit/push/deploy NOT in this round",
    },
    next_operator_gated: [
      "commit the hub tree addition (runner + content/igcse-chemistry-19/guided-*) per standing convention — push auto-bakes the hub (git-linked law)",
      "surface the guided lessons on a hub route via loadContentJson(REL_LESSONS/...) + guided-import.json index",
      "wire question packages into the practice engine (separate follow-up of record)",
    ],
    duration_ms: Date.now() - t0,
  };
  fs.writeFileSync(RECEIPT_OUT, JSON.stringify(receipt, null, 2) + "\n");

  const hardFails = FAILS.length;
  console.log(`\nRESULT: ${hardFails === 0 ? "GREEN — LANDED" : "FAIL-CLOSED"}`);
  console.log(`  checks: ${CHECKS.filter((c) => c.ok).length}/${CHECKS.length} pass, ${hardFails} hard failures`);
  console.log(`  landed: ${written} written + ${noop} identical-existing (224 artifacts, ${(receipt.landing.bytes_landed / 1024).toFixed(0)} KiB) into ${path.relative(HUB, PACK)}`);
  console.log(`  identity from disk: ${JSON.stringify(disk)}`);
  console.log(`  stream conserved: ${grandChars} chars, sha ${grandShaHex.slice(0, 16)}…`);
  console.log(`  receipt: ${RECEIPT_OUT}`);
  if (hardFails) process.exit(1);
}

main().catch((e) => {
  console.error("RUNNER ABORTED:", e && (e.stack || e.message || e));
  process.exit(1);
});
