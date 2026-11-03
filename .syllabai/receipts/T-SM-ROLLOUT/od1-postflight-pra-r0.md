# OD-1 PR-A — Production Postflight + Flip Lane (r0)

Traces 1a19ac1b716ca581 (postflight) · 1a19acce80b402f5 (gate ①) · 1a19b4b9892b6c9d (gate ②) · 1a19b6582110bbe5 (gate ③) · 2026-11-02.
AuthORITY: PR #611 merged as `fc793dfc` on `main` (two-parent `b964f4a` + `ef7dbac`), CI 2/2 at head `ef7dbac`. Law of record: the multi-axis R4 consumption law r0 (MA-1..MA-12) — for the axis-suffixed part-bound LEVELS scheme-sets, the SET (all LEVELS siblings of one question_part, one printed grid) is the R4 unit.

---

## 1. Production data audit (read-only, live Neon — pre-flip)

| Metric | Value |
| --- | --- |
| Census: axis-suffixed part-bound LEVELS schemes | **492** (matches the law scope of record) across **147** part-sets |
| Validation state (pre-flip) | 492/492 SUGGESTED |
| Label shape hygiene (`<base>#<axis>`) | 0 malformed |
| Sets passing MA-1..MA-5 (mirror audit, exact guard semantics incl. non-`#` siblings) | **145 / 147** (0 non-`#` siblings exist — the census IS the sibling scope) |
| Refusing sets | **2** (MA-4 only): `1-b-ii#a1` on part `24169bfc-0cc5-48ca-b89b-9b972263e113`, `2-c#a1` on part `db3536e3-6851-4a61-b644-7df9f5a13146` — same capture defect: a1 axis L3=L4=4-4 with gap 2→4; sibling a2 axes clean 1/2/3/4; MA-5 closes at 8 (part marks) once repaired |
| Bands on census schemes | 1,081 incl. 43 zero-mark cells kept verbatim (kept, not bands — MA-3) |
| MA-10 predicate pre-lane (whole DB) | **0** parts with ≥2 VALIDATED part-bound LEVELS siblings |
| `smart_mark_results` | 368 rows; 0 `MULTI_AXIS_DISPATCH_NOT_WIRED` (running build predated the law) |

## 2. Gate ① EXECUTED — the redeploy of record

**Deployment `dpl_QGtNhEWx4ZMp7Gjo4by3XWk5mtwa` — READY, production, aliased.**

- **Bake source** `main @ 93959b9df10e9c58d04b27ba2a27b32f7baf8a65` (the operator's pin; contains `fc793dfc` = PR #611).
- **Recipe** the 092/093/107/124 bundle recipe of record: worktree-only shims (Bun.CryptoHasher → node:crypto; Bun.YAML.parse → js-yaml v4 named-export `load`; 6 concept-graph YAMLs inlined byte-verbatim via `bun --loader .yaml:text`; path-preserving Hono→Vercel Node adapter entry) → `bun build --target=node --format=cjs --define import.meta.dir=__dirname` → 3,749,038-byte CJS stage (`api/index.js` + `vercel.json` 2 rewrites + `.vercel/project.json`). Shims never committed; the committed source of record stays pristine.
- **Boot pins**: all 6 YAML sha256 pins match the of-record figures (`24fa91ac`, `8a651dd9`, `e53e5f87`, `b1fea699`, `a7b14cbd`, `b3b75292`) — verified twice: bundle audit + fail-closed at require (in-process).
- **Bundle byte-proof**: LAW needles present (`multiAxisSetCoverageViolations`, `MULTI_AXIS_DISPATCH_NOT_WIRED`, `LEVELS multi-axis set band coverage invalid`, `assertBandCaptureWired`); INTACT needles present (`actuator/health`, `NO_SCHEME_POINTS`, pins, `__dirname`, hub-content join); ABSENT (`new Bun.CryptoHasher`, `Bun.YAML.parse`, `import.meta.dir`) — residue: none.
- **Guards**: fetch-first (1 commit ahead, `.syllabai/worklog.md` bookkeeping-only, zero API-plane delta — disclosed, T-MIG-124 pinned-sha precedent); in-flight clear; rollback anchor `dpl_BVPKU53dKcvqDWX5EhGjAH1JfZp5` READY and re-aliasable.
- **Fire**: `vercel@62.7.0 deploy --prod --yes` from the stage — "Ready in 13s".
- **Artifact proof**: deployment stores `/src/api/index.js` uid `55dd7920b366e67c4c39aae743a99cf8198f120c` == local bake sha1 — **byte-identical**.
- **Live probes**: `/actuator/health` 200 UP · `/api/v1/health` 401 (the unauth law) · `/` 404 — deployment URL + both prod aliases.
- **Disclosures**: deployment meta `gitDirty:"1"`, `gitCommitSha:null` (CLI skipped git provenance this run — the byte-exact artifact proof + this receipt carry provenance); bundle 3.15→3.75 MB (merged waves + this law).

## 3. Carrier incident during gate ② (disclosed, resolved first-hand)

At ~07:00 UTC a **GitHub auto-deploy** (`dpl_BtJMouyQxZ9dzJVFeUonX6SzUA2r`, commit `00836892e4` — PR #628, a **hub-only** MathsGenie toolbar change) landed on the **API carrier** and took the apex alias; the carrier served a hub build with no API function — `/actuator/health` 404 from ~07:00 to ~07:36 UTC (the 6955 incident class). Response of record:

1. **Restored** the apex alias to `dpl_QGtNhEWx4ZMp7Gjo4by3XWk5mtwa` (POST aliases; `oldDeploymentId: dpl_BtJMouyQxZ…`); both prod aliases re-verified first-hand (200 UP, 401 law intact).
2. **Disconnected** the git integration from the carrier (DELETE `/v9/projects/prj_FN5XQUMb/link`; re-check 404) — the carrier is CLI-only by standing law; no future push can re-clobber the plane mid-flip.

## 4. Gate ② EXECUTED — the flip lane through the real seam

**Result: 488 flipped, 4 refused — the exact predicted outcome.**

| Law | Result |
| --- | --- |
| Armed assertions (pre-act, fail-closed) | deployment READY + aliased; artifact byte-proof re-verified; health 200 on apex AND deployment URL; no foreign in-flight deploys; census 492 SUGGESTED |
| Exact-semantics pre-audit | 147 parts / 492 schemes; 0 non-`#` siblings; 2 violating parts = 4 refusal ids; 488 to flip |
| Probe auth (real seams) | `POST /api/v1/auth/register` (STUDENT) → DB role grant `user_roles` + TEACHER (the administrator-provisioning surface — ADMIN self-registration is forbidden by design, no admin endpoint exists) → `POST /api/v1/auth/login` → roles `["STUDENT","TEACHER"]`, `GET /me` verified; **all probe users disabled post-act** (inert audit rows, pattern `pf-gate2-probe-…@staging.syllabai.dev`) |
| The flip | `POST /api/v1/teacher/content/mark-schemes/:id/validate` (no body), serial, one HTTPS request per scheme (F-C reconnect law trivially satisfied); two passes (a sandbox process reaping split the run — resumable by design; the resume pass read fresh state and flipped only the remaining 311 SUGGESTED; DB truth reconciled: 181 + 307 = 488) |
| **Flipped** | **488** — census after: **488 VALIDATED / 4 SUGGESTED** |
| **Refused** | **4** — exactly the predicted ids/labels: `1-b-ii#a1`, `1-b-ii#a2` (part `24169bfc…`) and `2-c#a1`, `2-c#a2` (part `db3536e3…`); every 409 body carries the verbatim law voice: *"LEVELS multi-axis set band coverage invalid — axis \"1-b-ii#a1\" mark ranges are not contiguous (gap): level 2 ends at 2 but level 3 starts at 4 (expected 3) (OD-1 MA-4)…"*; zero unexpected statuses, zero unexpected refusals |
| MA-10 posture | predicate parts (whole DB): **0 pre-lane → 145 post-flip** — the 145 clean sets are now multi-axis grids of record; ALL LEVELS dispatch on them honestly refuses with `MULTI_AXIS_DISPATCH_NOT_WIRED` until PR-B wires the per-axis leg |
| Dispatch surface untouched | `smart_mark_results` total unchanged (368); `MULTI_AXIS_DISPATCH_NOT_WIRED` rows: 0 (no dispatch attempted by this lane) |
| Refusal posture | the 4 defect schemes stay SUGGESTED, untouched by the guard (the verbatim law holds — no row edited, no clamp); they are the gate-③ data-repair queue |

**Verdict: the multi-axis R4 consumption law is the production truth for all 147 sets — 145 live as VALIDATED multi-axis grids, 2 sit in the honest refusal queue pending re-capture of their a1 axes.**

## 5. Remaining gates

4. **Receipt PR** (bookkeeping-only `.syllabai/**`) carrying this document.
5. **PR-B** (per-axis dispatch leg) lifts the MA-10 refusals on the 145→147 flipped grids.

## 6. Gate ③ EXECUTED — the a1 re-capture + re-flip (trace 1a19b6582110bbe5)

**Result: the 2 a1-axis defect sets repaired by re-capture, then re-flipped — 492/492 VALIDATED, 147/147 sets, MA-10 predicate parts 147.**

### 6.1 The printed-source re-read (first-hand)

Both defect grids were re-read from the verbatim past-paper mark schemes of record (`Syllabai/syllabai-pastpapers@main`, PDFs sha256-pinned in the packet):

| Paper | Grid | Printed Knowledge & Application column | Parallel Analysis column |
| --- | --- | --- | --- |
| 9609/21 May/June 2022 (`5879a409…`), PDF p.9 | 1(b)(ii) | 2b=4, **2a=4**, 1=2, (1) | 2b=4, 2a=3, 1=2, (1) |
| 9609/22 February/March 2022 (`000e6f4c…`), PDF p.20 | 2(c) | 2b=4, **2a=4**, 1b=2, 1a=1 | 2b=4, 2a=3, 1b=2, 1a=1 |

**Diagnosis of record: the defect is in the PUBLISHED grids** — each Knowledge & Application column prints its "2a" rung as **4** where the parallel Analysis cell of the same rung prints **3**, while both axis columns are capped "(4 marks)" and the parts total 8. The OD-1 capture (`glm-ocr-qp-v1+glm-ocr-ms-v1`) was faithful to the print; MA-4 (chain 1,2,4,4 → gap 2→4) refused the set. These are the "2 printed contiguity quirks" PR #604 F-B pre-registered. Both pages were read visually first-hand (rendered crops in `download/gate3/`).

### 6.2 The re-capture ruling + packet

Packet of record: `download/gate3/od1-gate3-a1-recapture-r0.json`. The "2a" rung resolves to **3** on the print's own internal evidence: (i) the parallel Analysis cell prints 3; (ii) both axes are capped "(4 marks)"; (iii) the part column prints 8 = 4 + 4; (iv) a 4/4 pair on rungs 2a/2b would give identical marks for a strictly weaker descriptor. No clamp of live rows: the a1 axis was re-captured against the printed grid — descriptors re-set verbatim to the correct rungs (the capture had 2b/2a transposed onto L3/L4, plus the word-order garbles "benefits two"/"benefit one"), marks re-set to 3-3 (L3) / 4-4 (L4). The printed "0 / No creditable content" rows stay out of birth per ADR-040 §2.1 (verbatim text preserved in the drafts of record).

### 6.3 The data-plane repair (fail-closed, one tx)

`scripts/gate3_repair.py` — downstream-zero check first (answers / human_marks / smart_mark_results touching the 2 parts or 4 schemes = **0**, matching PR #604 F-B), pre-state asserted row-by-row on all 8 bands (any drift aborts), then ONE transaction with 4 optimistic-concurrency UPDATEs (rowcount exactly 1 per leg; the first run aborted fail-closed on my own wrong sibling-state assumption before any write — re-run passed): `1-b-ii#a1` L3 4-4→3-3 + L3/L4 descriptors re-mapped; `2-c#a1` likewise. After-image re-read in-tx; both axes chain 1/2/3/4; axis-top sums 4+4=8.

### 6.4 The re-flip through the real seam

Same armed-assertions discipline as gate ②: deployment `dpl_QGtNhEWx4ZMp7Gjo4by3XWk5mtwa` READY + aliased, artifact byte-proof `55dd7920…` re-verified, health 200 on apex AND deployment URL, no foreign in-flight deploys, census exactly 488 VALIDATED / 4 SUGGESTED with the exact 4 refusal ids. Probe account `pf-gate3-probe-3a790b72@staging.syllabai.dev` (register → DB TEACHER grant → login, **disabled post-act**), then `POST /api/v1/teacher/content/mark-schemes/:id/validate` — **4 requests, 4× HTTP 200, zero refusals** (the live `multiAxisSetCoverageViolations` re-adjudicated the repaired sets on the wire and accepted). Audit rows of record: 4× `VALIDATE mark_scheme SUGGESTED→VALIDATED` in `content_review_audit`, actor = the probe, 09:01:27–09:01:29Z.

### 6.5 Post-state (mirror audit re-run, exact guard semantics)

| Metric | Value |
| --- | --- |
| Census | **492/492 VALIDATED** (0 SUGGESTED) across **147/147 sets** |
| Sets violating MA-1..MA-5 | **0 / 147** |
| Bands on census schemes | **1,081** (byte-stable — same rows repaired in place, none added/removed) |
| MA-10 predicate parts | **147** (145 → 147) |
| `smart_mark_results` | 368 total, 0 `MULTI_AXIS_DISPATCH_NOT_WIRED` (dispatch surface untouched) |
| Probe users | gate-③ probe disabled (inert audit row) |

**The multi-axis R4 consumption law now holds in production with zero exceptions: every one of the 147 printed grids is a VALIDATED set whose axis tops close on the part's marks.** Remaining for the OD-1 lane: the receipt PR (gate ④) and PR-B's per-axis dispatch leg to lift the MA-10 honest refusals.

**Disclosures (gate ③):** (a) the S21 a2 sibling's L1/L2 descriptors transpose the print's word order ("Limited analysis of benefit one/benefits two" vs printed "of one benefit/two benefits") — law-clean, VALIDATED, outside the a1 scope of this order; recorded in the packet for a future verbatim pass, not edited here; (b) the re-flip runner's Phase-D receipt write crashed on a wrong audit-table column name AFTER all 4 flips committed; the receipt was rebuilt from DB truth (audit rows re-read first-hand) and the probe was disabled in that rebuild — no double flips are possible (4 audit rows exactly, and the post-census 492 is closed-form); (c) band rows carry no capture-provenance stamp for human re-capture (vocabulary gap) — `extraction_method`/`extraction_confidence` left untouched; the packet + this section carry the provenance.
