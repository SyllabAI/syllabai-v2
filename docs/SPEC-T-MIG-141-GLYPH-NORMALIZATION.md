# SPEC — T-MIG-141: Glyph Normalization of the Document-Chunk Corpus (Bank Patch + Intake Law)

| | |
|---|---|
| **ID** | T-MIG-141 — renumbered from the draft's T-MIG-140 at land time: the books-course-page lane (commit 0b98e404, receipt `.syllabai/receipts/T-MIG-140/run-001-books-course-page-option.json`) claimed 140 between draft and landing; 141 verified free against origin/main 41fb0117 |
| **Status** | DRAFT — operator review, then OPEN on claim |
| **Owner** | unassigned — claim via board protocol (no self-assign) |
| **Depends** | T-MIG-138 (`4ma1-past-paper-intake`) as MACHINERY-OF-RECORD: `mode=backfill-sharded` embedder, Actions-secrets hygiene, RPD-wall honest-artifact law. Dependency is on the machinery, not on open work. |
| **Provenance** | Audit traces 1a164f8de689ed05 (lineage), 1a164faea2aa5ac9 (backup census), 1a16504bce9a8a0d (quality audit) — scripts of record `scripts/t_neon_quality{,2,3}.py`, `t_spec_facts.py` (r7a lane, chat 1f3003b6) |
| **Write discipline** | All prod writes ride the CI gate (T-MIG-138 precedent). Lane-side DB contact is `t0_readonly` + `SET TRANSACTION READ ONLY` only. |

---

## 0. Executive summary

The Neon document-chunk corpus (14,314 chunks; 13,380 embedded, `gemini-embedding-001`, `embed_rev=2`) is structurally excellent — question-atomized, page-anchored, identity-headed, verbatim-faithful (6/6 fidelity probes vs the archive `parsed/` layer) — but it carries a **glyph contamination layer**: 25,399 Private-Use-Area (PUA) character instances across 85 distinct codepoints, plus ~1,900 raw control-char instances. Root cause: custom-encoded font glyphs (Symbol, Wingdings, ZapfDingbats, MyriadPro-class) whose PDF `ToUnicode` maps are absent or broken, so `pdftotext`-family extraction emits raw PUA/C0 codepoints. The epicenter is the 4MA1 batch (`t-mig-138-pdftotext-intake-v1`, 110 papers): **47% of its 5,468 chunks are hit, and what is lost is the mathematics itself** (−, ×, ÷, ±, π, √, big-bracket pieces). Chemistry (4CH1/4CH0) is hit at 9.3%/4.6% — reaction arrows (→, ⇌), MS arithmetic operators, MCQ ticks.

This spec: (A) builds an evidence-gated normalization map on the Official-ExamQuestion (OEQ) base, (B) patches chunk content in place under canary gates, (C) re-parses only chunks beyond map repair, (D) folds re-embed into the T-MIG-138 sharded machinery, (E) codifies the map as intake law in `syllabai-parser` so future batches are born clean.

**Verified mechanics this spec relies on** (probe of record, read-only):
- `document_chunks.content_tsv` is `GENERATED ALWAYS AS to_tsvector('english', content)` — a content UPDATE **auto-refreshes** the lexical index. No manual tsv step exists or is needed.
- `document_chunks.embed_rev` is uniformly `2` today; `embedding_model` uniformly `gemini-embedding-001`; 934 chunks have `embedding IS NULL` (the T-MIG-138 residual class).
- No triggers on `document_chunks` (0 rows in `pg_trigger`).
- Task registry: next free card = **T-MIG-141** (draft-time census said 140; race-guard re-census at land found 140 taken by commit 0b98e404 — books-course-page lane — and re-verified 141 free).

---

## 1. Evidence of record (the audit, 2026-10-23)

### 1.1 Contamination by spec

| spec | chunks | PUA-hit chunks | hit rate | control-char chunks | median len | tiny(<80) | huge(>6k) |
|---|---|---|---|---|---|---|---|
| 4MA1 | 5,468 | 2,572 | **47.0%** | 339 | 1,741 | 0 | 67 (max 11,612) |
| 4CH1 | 1,456 | 135 | 9.3% | 14 | 905 | 2 | 0 |
| 4CH0 | 1,274 | 58 | 4.6% | 65 | 912 | 1 | 0 |

Bank-wide PUA: **25,399 instances / 85 distinct codepoints**. Control chars: **~1,900 instances** (U+0003 ×402, U+001F ×393, U+001E ×318, U+001D ×204, U+0008 ×163, … 25 distinct). Clean on: U+FFFD (0), mojibake (0), URLs (0).

### 1.2 What is lost, by class (context samples verbatim from the audit)

| class | codepoints (count) | live sample (hole rendered as space) |
|---|---|---|
| math operators | U+F02D minus (991), U+F03D equals (819), U+F02B plus (624), U+F0B1 ± (392), U+F0B8 ÷ (283), U+F0B4 × (4,263) | `"84  69 OR 15"` · `"2.8  80 OR 0.035 (mol)"` · `"(0.266  6.0 x 1023 =)"` |
| math glyphs | U+F070 π (569), U+F084 √ (520) | `"y =  ( x + 4) for 0.25  x  8"` · `" r 2   r h"` |
| big-bracket pieces | U+F0E6/F0E7/F0E8/F0F6/F0F7/F0F8 (≈8,700), U+F8EF (17), cf. OEQ's U+F8F9–FB trio | `"[ x =]cos −1   (= 48.64...)"` · `"...  11.2   ...  7.4  "` |
| chemistry arrows | U+F083 (31), U+F022 (26), U+F0E0 (25) — hypotheses ⇌ / → | `"N2O4(g)  2NO2(g)"` · `"C2H5OH + 3 O2  2 CO2 + 3 H2O"` · `"2Li + F2  2LiF"` |
| ticks / bullets | U+F0FC (21, OEQ cross-confirmed ✓), U+F0B7 (39), U+F09F (20), U+F0A2 (5,146) | `"Add ticks () to the table"` · `"(3 marks):  note: divide percentages…"` |

### 1.3 Pipeline of record × quality

| provenance / extraction_method | papers | chunks | avg len | PUA-hit | verdict |
|---|---|---|---|---|---|
| `t-mig-138-pdftotext-intake-v1` | 110 (4MA1) | 5,468 | 1,741 | 47% | **the bad batch** — page-level, no atomization, no glyph normalization |
| `glm-ocr-qp-v1+glm-ocr-ms-v1` | 48 | 1,485 | 917 | 6.3% | atomized, clean headers |
| `pdflane-atoms-draft-v1` | 41 | 1,120 | 898 | 8.5% | atomized, clean headers |
| `tc75/tc60-governed-batch-v1` | 5 | 125 | ~900 | ~4% | cleanest |

### 1.4 Adjacent anomalies (out of scope here, registered in Appendix D)

2017 specimen 1C: QP doc `1477fa77…` claims `chunk_count=17` / actual **0**; MS doc `67999dd9…` claims 12 / actual **0** — registered but never chunked. `spec_codes` non-empty on only 398/1,456 4CH1 chunks (27%).

---

## 2. Goals / Non-goals

**Goals**
- G1: every exam-paper chunk that *can* be repaired by mapping is repaired **in place** — chunk row id, boundaries, header line, and metadata untouched.
- G2: chunks beyond map repair are re-parsed from the byte-frozen archive under identity gates (hybrid leg).
- G3: all repaired rows re-embed through the T-MIG-138 machinery with honest RPD artifacts, then pass drift + fidelity gates.
- G4: the map becomes **intake law** in `syllabai-parser` (single canonical table, Python + Java consumers, conformance-tested) — future batches are born clean.
- G5: every substitution carries evidence; the run ships with a receipt whose census hashes pin the scope of record.

**Non-goals**
- N1: no re-chunking / re-atomization of the bank beyond the Phase-C leg; no chunk-shape policy change (the 67 huge 4MA1 chunks are a separate card).
- N2: no edits to Official-ExamQuestion (syllabai-resources). OEQ is a **map donor**, not an edit surface; cross-repo alignment to `table.v1.json` is OEQ's own future call.
- N3: no schema changes (no new columns/tables in prod; embed staging uses the existing `embed_rev` convention).
- N4: no LLM in the patch loop (deterministic substitution only — ADR-037's "the converter extracts; it never authors" transposed to the DB layer).
- N5: Student Books corpus (T-MIG-133, 823 chunks, embeddings NULL) is out of scope.
- N6: 2017 specimen stale counters + `spec_codes` backfill → separate cards (Appendix D).

---

## 3. Phase A — the normalization map (evidence-gated)

### 3.1 Authoritative source precedence

1. **OEQ base set** (canary-pinned, cross-confirmed this audit): extract the exact `normalize_pua` table from `syllabai-resources/scripts/official_examq_extract.py` at the exporter-of-record commit. Known members (from CHANGELOG 0.13.x of record): `U+01FB → U+0394 (Δ)` (F52), `U+F050 → U+2713 (✓)` (Wingdings2 tick), `U+F8F9/F8FA/F8FB → U+23A4/23A5/23A6` (Symbol big-bracket right trio, positional), plus the F033 ZapfDingbats tick and F0FC Wingdings tick → `U+2713` (F0FC cross-confirmed ×21 in 4CH1 with `"Add ticks ()"` contexts).
2. **Encoding-law hypotheses** (Symbol `0xF000+X` law) for the remainder of the 85-codepoint census — each a *candidate* until evidenced (§3.3): `F02B→+`, `F02D→U+2212 (−)`, `F03D→=`, `F070→U+03C0 (π)`, `F084→U+221A (√)`, `F0B1→U+00B1 (±)`, `F0B4→U+00D7 (×)`, `F0B8→U+00F7 (÷)`, `F0B7→U+2022 (•)`, bracket-piece family `F0E6–F0F8 → U+239B..U+23DC` positional pieces, control-char class → per-glyph resolution or space-fallback (§3.4).
3. **Arrows caution**: `F022`/`F0E0`/`F083` contexts demand →/⇌, but the naive Symbol law (0x22=∀, 0xE0=spade) contradicts content — these likely come from a MyriadPro-class custom encoding. They are **mandatory-evidence** entries: no map lands without a rendered-page proof.

### 3.2 Canonical artifact

`syllabai-parser: tools/glyph-normalization/table.v1.json` — the single home of the map. Schema per entry:

```json
{
  "from": "U+F02D",
  "to": "U+2212",
  "count": 991,
  "evidence": {
    "source": "4MA1/1H 2025-06 p.14 render @150dpi",
    "render_ref": "evidence/T-MIG-141/F02D_p14.png",
    "verified_by": "<lane>",
    "verified_at": "<iso>"
  },
  "canary": "C-Glyph-F02D"
}
```

### 3.3 Evidence standard per entry (the F48 law, transposed)

An entry may land only when ALL hold:
- **Rendered proof**: the glyph's source PDF page rendered at 150 dpi, the printed character eyeballed and named (OEQ CROP-REVIEW pattern).
- **Census match**: the entry's `count` equals the DB census for that codepoint at run time (drift ⇒ re-census before patch).
- **Canary pin**: a machine-checkable assertion in the Phase-B canary suite.
- **Wrong-map disproof (F52 method, inverted)**: applying a deliberately wrong mapping to a probe set must produce a measurable, deterministic content delta ≠ 0; applying the correct map must produce *exactly* the expected substitutions and nothing else. A map whose application changes nothing it should have changed is a disproof.

### 3.4 Control-char class policy

Same evidence standard. If a control codepoint resolves to a printed glyph → map it. If unresolved after the evidence pass → replace with a single space **inside scoped chunks only**, logged per-instance in the receipt (never silently).

### 3.5 Transform ordering law

Multi-character positional sequences (bracket trios/quintets) map **before** single characters; longest-sequence-first overall; a single left-to-right pass, no re-scanning of replaced spans (idempotence assert: `normalize(normalize(x)) == normalize(x)`).

---

## 4. Phase B — in-place patch of `document_chunks`

### 4.1 Scope query (pin of record)

Rows = distinct `document_chunks` joined through `documents`/`exam_papers` (QP or MS doc wiring) matching `content ~ '[\uE000-\uF8FF]' OR content ~ '[\u0000-\u0008\u000B\u000C\u000E-\u001F]'`. Expected census at spec time: **2,765 rows** (2,572 + 135 + 58, overlap-free by spec-level aggregation; re-derive exactly at run). The chunk **id list is hashed (sha256) and recorded in the receipt before any write**; the post-run re-query must yield the identical id set.

### 4.2 Staging & write mechanics

- Patch runs as deterministic script (no LLM), one transaction per paper-batch, sized to stay clear of Neon txn limits.
- Per patched row: `content` ← mapped text; `embed_rev` ← `1` (**stale marker**); `embedding` is **kept** (stale vector keeps serving — retrieval continuity beats a hole; the flip to `embed_rev=2` + fresh vector happens in Phase D).
- `content_tsv` auto-refreshes (GENERATED ALWAYS — verified, §0). Assert this in the dry-run receipt by comparing `content_tsv` pre/post on a sample.
- **Before-images**: full pre-patch `content` of every scoped row archived to the receipt's evidence dir (compressed, checksummed) — the rollback artifact.
- **Protected control group**: 200 random out-of-scope chunks (100 clean, 100 untouched-PUA from non-exam corpora if present) pinned by id + content hash; must be **byte-identical** post-run.
- Prod writes ride the CI gate (Actions job with the DB secret), mirroring T-MIG-138's governed-batch pattern. Lane machines never hold write credentials.

### 4.3 Phase-B gates (fail closed)

| gate | proves |
|---|---|
| G-A identity | chunk id set, `chunk_index`, `page_start/page_end`, `atom_number`, `kind` unchanged for every scoped row |
| G-B header integrity | each chunk's canonical header line (`… 4CH1 \| Jun 2024 \| 4CH1/1C \| Paper 1C \| Q1 \| p.3`) byte-identical |
| G-C bounded delta | diff per row = exactly the expected substitutions (insert/delete count zero; the F52 zero-delta disproof run included) |
| G-D zero-PUA post-state | scoped rows match neither artifact regex post-run |
| G-E control group | the 200 pinned rows byte-identical |

A gate failure aborts before commit of subsequent batches; already-committed batches roll back from before-images.

---

## 5. Phase C — hybrid re-parse leg (beyond map repair)

**Trigger criteria** (any): chunk holds ≥3 distinct PUA codepoints that remain unmapped after Phase A; or contains bracket-piece classes with no positional-pairing map; or PUA density >2% of characters. Expected population: small (the audit's samples suggest the bracket-heavy 4MA1 MS scaffolds dominate); the census quantifies it at run.

**Method**: the affected **papers** (not rows) re-parse from the byte-frozen `syllabai-pastpapers` PDFs through the `syllabai-parser` pipeline (opendataloader / GLM-OCR path — the bank's canonical parser; OEQ output is **not** an input, per the one-way provenance law). The paper's document is re-atomized and its chunks replaced wholesale (delete+insert in one transaction, `document_id` stable, chunk row ids may change — disclosed in the receipt). Identity gates: `sha256(QP/MS)` against the archive `manifest.yaml`; paper totals (Σ marks) sanity vs the bank's `exam_questions` where present; per-paper chunk-count delta disclosed.

**Ordering**: Phase C runs BEFORE Phase D and stamps its new rows `embed_rev=1` so one re-embed wave covers both legs.

---

## 6. Phase D — re-embed fold-in (T-MIG-138 machinery)

- **Selector**: `embedding IS NULL OR embed_rev < 2` — one wave covers the 934-chunk residual of record AND every patched/re-parsed row. Estimate at spec time: residual 934 + patched ~2,765 + Phase-C replacements (census at run).
- **Machinery**: `mode=backfill-sharded` (the proven 4-key matrix), RPD-wall honesty (429-class rows + not-attempted rows recorded per shard, exit 0), secrets via the Actions sealed API, values never printed.
- **Post-embed gates**:
  - **Drift bound (hard)**: for a stratified sample of patched rows (≥300), cosine(old vector, new vector) **median ≥ 0.85** per spec-batch. Below ⇒ operator ruling, never silent accept.
  - **Neighbor preservation (report)**: top-10 neighbor Jaccard old-vs-new, reported per spec (soft gate first season).
  - On success per row: `embedding` ← new vector, `embedding_model` ← `gemini-embedding-001`, `embedded_at` ← now, `embed_rev` ← 2.
  - Secrets hygiene: T138_* keys hygiene-deleted after the LAST tranche (T-MIG-138's own closure law).

---

## 7. Phase E — intake law (`syllabai-parser`)

- **Canonical table**: `tools/glyph-normalization/table.v1.json` (§3.2) — the only map home. Provenance comments cite this audit + OEQ F48/F52.
- **Python reference impl**: `normalize_pua(text, table)` in `tools/glmocr/` (name-aligned with OEQ's), consumed by `tools/ocr_batch/` so every future OCR/extraction batch normalizes at intake.
- **Java consumer**: the canonical pipeline (`GlmOcrPaperAtomizer` path) reads the same JSON — **no second map**.
- **Conformance**: extend the existing Python/Java conformance harness (the 16/16 fixture pattern) with glyph fixtures: each table class pinned by a fixture pair; CI fails on drift.
- **Born-clean law**: a batch whose post-intake census still contains PUA/C0 outside the table's mapped set fails the batch gate → review, never silent serve.
- **Canary**: `C-intake-zero-pua` — the next real batch must census PUA=0 post-normalization.

---

## 8. Acceptance evidence (the whole card)

1. **C1 zero-PUA**: post-run, scoped rows match neither artifact regex (full re-census attached).
2. **C2 control group**: 200 pinned rows byte-identical (hashes in receipt).
3. **C3 header integrity**: header lines unchanged on every patched row.
4. **C4 wrong-map disproof**: the inverted F52 probe artifact (wrong map ⇒ measurable delta; correct map ⇒ exact expected substitutions).
5. **C5 fidelity probes**: the 6/6-class phrase probes vs the repo `parsed/` layer re-run **post-patch** — 6/6 still HIT (substitutions must not break verbatim phrases), plus arrow/operator phrases newly HIT where maps repaired them.
6. **C6 drift**: median self-cosine ≥ 0.85 (hard) + neighbor Jaccard report (soft), per spec-batch.
7. **C7 substitution-only**: corpus-wide insert/delete delta = 0 outside Phase-C replacement papers (count disclosed).
8. **C8 conformance**: py/java glyph conformance 16/16-class green; intake canary pinned.
9. **C9 census hash pin**: pre-run scope hash == post-run scope id set.

## 9. Rollback & safety

Before-images are the rollback unit (per-batch restore script shipped with the receipt). Rollback restores `content` AND re-marks `embed_rev=1` (vectors stale again — Phase D re-runs). No force-push anywhere; cross-repo work in `syllabai-parser` follows the same fetch-first / union-merge / no-force protocol; `t0_readonly` discipline for every probe.

## 10. Receipts & worklog

`.syllabai/receipts/T-MIG-141/run-<n>-<leg>-<lane>.json` per leg (map / patch / reparse / embed / intake), each with census hashes, gate results, negative controls, and the disclosure block. Worklog append per the T-C42 template. Dual worklog sync per protocol.

---

## Appendix A — PUA census of record (top codepoints; full 85-census re-derived at run)

| CP | instances | hypothesis (UNPROVEN until evidence pass) |
|---|---|---|
| U+F0A2 | 5,146 | Symbol ∗ / anchor glyph — footer-dense contexts (`*P68726A0328*`) |
| U+F0B4 | 4,263 | × (U+00D7) |
| U+F0F7/F0E7/F0F8/F0E8/F0E6/F0F6 | ≈8,731 | big-bracket/paren pieces (U+239B..U+23DC family, positional) |
| U+F02D | 991 | − (U+2212) |
| U+F03D | 819 | = (U+003D) |
| U+F02B | 624 | + (U+002B) |
| U+F070 | 569 | π (U+03C0) |
| U+F084 | 520 | √ (U+221A) |
| U+F0B1 | 392 | ± (U+00B1) |
| U+F0B8 | 283 | ÷ (U+00F7) |
| U+F02D-class in 4CH1 | 28 | − in MS arithmetic ("75  30 OR 45") |
| U+F0B7 | 39 (4CH1) | • (U+2022) MS-note bullet |
| U+F083 | 31 | ⇌ (U+21CC) — mandatory-evidence |
| U+F022 / U+F0E0 | 26 / 25 | → (U+2192) — mandatory-evidence (custom-font class) |
| U+F0FC | 21 | ✓ (U+2713) — OEQ cross-confirmed |
| U+F09F | 20 | Wingdings-class bullet |
| U+F8EF | 17 | bracket piece (OEQ trio family) |

## Appendix B — control-char census

U+0003 ×402 · U+001F ×393 · U+001E ×318 · U+001D ×204 · U+0008 ×163 · U+001C ×49 · U+0015 ×30 · U+0002 ×77 · U+0014 ×39 … (25 distinct, ~1,900 instances). Hypothesis: Symbol/ZapfDingbats low-code slots through broken ToUnicode. Policy per §3.4.

## Appendix C — clean-bill facts the patch must not disturb

Zero U+FFFD / mojibake / URLs · chunk length medians 905/912/1741 · atomization ~90% · header lines 100% · fidelity 6/6 · `content_tsv` GENERATED ALWAYS · `embed_rev=2` uniform · `gemini-embedding-001` uniform · no triggers.

## Appendix D — out-of-scope register (separate cards)

1. **2017 specimen 1C**: stale `chunk_count` (17/12 claimed, 0 actual) — re-ingest or unregister.
2. **spec_codes backfill** (4CH1 27% populated) — pairs naturally with T-MIG-137's kg-join work.
3. **67 huge 4MA1 chunks** (6k–11.6k chars) — chunk-shape policy card.
4. **OEQ alignment**: OEQ's own map adoption of `table.v1.json` — OEQ's call, its repo.
