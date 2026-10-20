# 4PH1 Physics Parse — Round-2 Polish Execution Plan (DRAFT r0)

**Author:** r0 (zai-web session web-752465e5) · **Date:** 2026-10-21
**Trace:** 1a15a1a5938d99a5 (operator: "draft the round-2 polish execution")
**Status:** DRAFT — awaiting operator GO. Execution is operator-gated (LLM quota = operator resource; the round-1/2 lane hit an ABSOLUTE account-level 429 wall 2026-10-19 23:26 → 2026-10-20 15:33 UTC across 20+ batches; chemistry precedent says the pool refills with time — one day has passed).
**Scope:** finish the 4PH1 LLM fidelity polish (68 pending chunks of the 300 selected), per the round-2 protocol already filed by the parse lane in `parsed/README.md` and `pipeline/worklog.md` (Task T-PARSE-4PH1-4-R2). Zero schema/id changes. No hub/Neon/serving writes — serving ingestion stays the separate operator-keyed 134e-adjacent step.

---

## 0. Ground truth (verified r0, run-001 receipt + this draft's re-derivation)

- Pending set = `evidence/llm_repair_ids_physics.json` (300 selected) minus unique `status=="ok"` ids in `evidence/llm_repairs_physics.jsonl` (232) = **68 ids**. Composition (matches the lane's own record exactly): 30 body, 10 worked_example, 7 learning_objectives, 5 table_data, 5 extension_work, **4 unit_questions (serving-critical)**, 3 key_point, 2 exam_hint, 1 appendix, 1 front_matter. Total 58,428 chars, avg 859/chunk.
- The stubborn id `phys_v1_u4_c0_pdf178_0398` failed 3× on 429 (quota casualty — `error` records do NOT count as done in the resume logic, so it retries naturally).
- Resume file nuance of record: 7 ids carry 2 ok-records with differing text (re-attempts); merge law is **latest-wins** (`repairs[id] = r`), deterministic and already the round-1 behavior — do not "fix".
- All runner hardening already committed: quota probe loop (PROBE_MAX/PROBE_WAIT env), per-call 120s timeout, 429 backoff 20s×attempt, quota-stop after 2 consecutive 429 chunks, progress log.
- Known cosmetic residual (r0 run-001): polished chunk `phys_v1_u1_c0_pdf066_0136` retains `TotalforQuestion2=19marks` camel-glue — the audit's camel pattern (`\b[a-z]{3,}[A-Z]…`) cannot match capital-initial glue, so it scores 0. Optional add-on (§3).

## 1. Phase A — Workspace reconstruction (no repo writes)

All runner paths are hardcoded to `/home/z/my-project/...`. Rebuild the lane layout from repo state alone (the kit was committed for exactly this):

```
BASE=books/pearson-edexcel/international-gcse/physics/4ph1
mkdir -p download/rag_physics data physics_work scripts
# corpus of record (post-round-1, committed):
curl raw main:$BASE/parsed/edexcel_igcse_physics_chunks_v1.jsonl > download/rag_physics/edexcel_igcse_physics_chunks_v1.jsonl
# selection list + resume state (evidence of record):
curl raw main:$BASE/pipeline/evidence/llm_repair_ids_physics.json  > data/llm_repair_ids_physics.json
curl raw main:$BASE/pipeline/evidence/llm_repairs_physics.jsonl    > data/llm_repairs_physics.jsonl
# chain scripts:
curl raw main:$BASE/pipeline/scripts/{llm_repair_physics.js,merge_llm_physics.py,audit_polish_physics.py,validate_physics.py,book_structure_physics.py} -> scripts/
# runner deps:
npm i z-ai-web-dev-sdk   # lane had to reinstall after every workspace reset
```

Pre-flight checks (ALL must pass before any LLM call):
1. `python3 -c` resume census: todo must print **68/300** (232 ok) — if it doesn't, STOP and reconcile against the lane record before proceeding.
2. `python3 scripts/validate_physics.py` → ALL CHECKS PASSED (baseline green).
3. **Pristine snapshot strategy** (merge's anchor check needs a pre-polish baseline): the lane-local `physics_work/` snapshot may not survive sandbox resets. Deterministic reconstruction: for each `llm_repaired` chunk, `text ← text_original`, drop `text_original`/`llm_repaired` → save as `physics_work/edexcel_igcse_physics_chunks_v1.jsonl`. Verify reconstruction: anchor keys (`id, unit_no, chapter_no, content_type, pdf_pages, book_pages, section, unit_name, chapter_title`) identical to committed corpus, chunk-id set identical, and re-run audit against it — it must reproduce the round-1 numbers of record (changed-chunk space runs 1008→3, camel 121→0, unicode-unit regressions 0). If reproduction fails, STOP — baseline untrusted.
4. Quota probe: `PROBE_MAX=1 CONC=1 node scripts/llm_repair_physics.js` with `data/llm_repairs_physics.jsonl` temporarily emptied is NOT needed — the runner's built-in probe loop already fires first; a clean probe clears in one "OK".

## 2. Phase B — Repair grind (the only LLM-consuming phase)

- Command of record (lane's own): `cd scripts && PROBE_MAX=1 CONC=1 node llm_repair_physics.js` in **repeated batches until todo=0**. Resume-safe: ok records in `data/llm_repairs_physics.jsonl` are skipped; appends only new records.
- Cadence discipline (do NOT hammer a recovering pool): one batch, then inspect `data/llm_repair_r2.log`; ≥30 s between batches; if the runner exits on quota-stop (2 consecutive 429 chunks), back off ≥15 min before the next probe. Hard ceiling per session: stop cleanly at todo=0 or after 3 consecutive quota-stopped batches.
- Expected volume: ~68 main calls + ~15% line-strict retries ≈ **78–85 calls** (pending corpus only 58K chars in). Budget well under the round-1 consumption.
- In-round integrity watchpoints per batch: ok/reject ratio sane (round 1 ended 232/232 after re-queues); no reject reasons other than sanity-guard classes; `phys_v1_u4_c0_pdf178_0398` finally lands (it should, on a refilled pool).

## 3. Phase C — Targeted add-on (OPTIONAL, operator flag, default ON)

One extra repair outside the 300-list: `phys_v1_u1_c0_pdf066_0136` (unit_questions, pdf 66–67, `TotalforQuestion2` camel-glue missed by the audit's capital-initial blind spot).
- Mechanics: in the workspace resume copy, delete that id's ok-record line, then run the same runner with `data/llm_repair_ids_physics.json` temporarily = `["phys_v1_u1_c0_pdf066_0136"]` (+1 call). Restore the 300-list file afterwards.
- Guard: same sanity checks; if the repair fails sanity twice, keep original and record the reject — cosmetic, never force it.
- If ON: expected end-state `llm_polished=300/300` including this chunk re-polished; if OFF: 300 polished + 1 disclosed cosmetic residual (also acceptable — it is question-bank furniture text).

## 4. Phase D — Merge (zero-LLM)

`python3 scripts/merge_llm_physics.py` — in-place apply, `text_original` preserved, `char_count` recomputed, markdown + report regenerated.
Gates (all mandatory):
- `llm_repaired: 300  text changed: ≥232` (68 new + any Phase-C delta; expect ~67–68 changed — some pending chunks may polish to identical text).
- **anchor check: PASS (0 drift)** against reconstructed pristine (id/unit/chapter/type/pages/section/unit_name/chapter_title untouched; chunk-id set unchanged).
- Report refresh: `llm_polished: 300`, `n_llm_polished` field noted ambiguous in run-001 (leave semantics as-is, do not rename — schema stability law).

## 5. Phase E — Audit + validate gates (zero-LLM)

- `python3 scripts/audit_polish_physics.py` → expected: corpus-wide `space_run` collapses from 451 toward the legit-long-word floor (the 68 pending hold most of the residual; r0 census: unpolished 18+ runs = 260, camel = 52 pre-round-2); unicode-unit regressions **0**; changed-chunk residuals only legit words.
- `python3 scripts/validate_physics.py` → **ALL CHECKS PASSED** (736 chunks, 28/28 chapters, 8/8 units, 0 order breaks, 47/47 question chunks page-anchored, dual numbering intact).
- r0-style independent spot-reads on ≥5 newly polished chunks (space restoration quality, no paraphrase, units/superscripts intact).

## 6. Phase F — Deliverable push (syllabai-resources, data plane)

Push set (ONLY these paths):
```
$BASE/parsed/edexcel_igcse_physics_chunks_v1.jsonl   (post-round-2 corpus)
$BASE/parsed/full_book_docling.md                    (regenerated)
$BASE/parsed/parse_report_v1.json                    (llm_polished 300)
$BASE/parsed/README.md                               (status → round 2 complete; Known limitations updated)
$BASE/pipeline/evidence/llm_repairs_physics.jsonl    (grown resume/evidence file)
$BASE/pipeline/worklog.md                            (T-PARSE-4PH1-4-R2 completion entry)
```
NOT touched: source/, docling_pages/, all other scripts (runner already committed), hub, Neon, pastpapers.
Discipline: fetch-first immediately before commit; PAT inline-URL one-shot only (remote stays scrubbed); **no force**; single commit; commit message leads `parse(t-parse-4ph1): round-2 polish COMPLETE …` with the gate numbers inline.

## 7. Bookkeeping (syllabai-v2)

- Receipt: `.syllabai/receipts/T-PARSE-4PH1/round2-execution-run-003-r0.json` (or next run number at execution time — fetch-first and renumber if the lane moved) carrying: todo derivation, per-phase gate outputs, quota timeline, final counts, anchor PASS.
- Dual worklog append (repo `.syllabai/worklog.md` + local), v2 push, scrub assertion (0 `ghp_/vcp_/napi_` full-value hits).

## 8. Success criteria / abort / rollback

- **SUCCESS:** todo=0 → merge anchor PASS → audit green → validate ALL CHECKS PASSED → push landed → receipt filed. End state: 300/300 polished (or 299/300 + 1 disclosed cosmetic if §3 OFF), corpus-wide glue at legit-word floor, zero anchor/schema/id drift.
- **ABORT (clean):** quota wall persists after 3 probe sessions → leave todo>0, push NOTHING to resources (partial evidence stays local), file a quota-timeline receipt instead. The kit is resume-safe; nothing decays.
- **ROLLBACK:** never needed mid-flight — the runner only appends workspace-side records; the corpus is rewritten solely by merge, gated on the anchor check; git history is the rollback of record (revert the single commit; no force).

## 9. Estimates

| Item | Value |
|---|---|
| LLM calls | ~78–85 (+1 if §3 ON) |
| Wall-clock (pool healthy) | 30–60 min grind + ~5 min zero-LLM chain |
| Zero-LLM chain | reconstruction, merge, audit, validate, push, receipt |
| Risk | LOW — proven resumable runner, byte-level originals preserved, anchor-gated merge, single-commit push |

## Appendix — pending-68 derivation (reproducible)

```python
import json
sel = json.load(open('llm_repair_ids_physics.json'))            # 300 ids
ok  = {r['id'] for r in map(json.loads, open('llm_repairs_physics.jsonl'))
       if r['status'] == 'ok'}                                  # 232 ids
pending = [i for i in sel if i not in ok]                       # == 68
```
Cross-checked against the lane's own T-PARSE-4PH1-4-R2 record (composition identical, incl. the 4 serving-critical unit_questions chunks).
