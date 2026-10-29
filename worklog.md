
---
Task ID: T-OEQ-MATHSB-SERVE-1 run-012 (operator trace 1a17c39d8babcbed: "fleet retry for the 78 matrixish + 22 superscript parts and 64 remaining figures")
Agent: r7a (Super Z, session web-da4ab8b1)
Task: Fleet-retry wave on the deep-water residual queues: rebuild the run-011 census (lost with the wiped workspace), retry the staged slices, extend the figure pipeline to the 64 hard crop cases, land fixes with gates.

Work Log:
- Plane of record verified: official-papers.json sha16 1c4b5e295a4eca8f == run-011 receipt stateOfRecord (workspace-wipe survivor; run-011 scripts/slices lost AGAIN despite the persistence law — they lived outside the repo).
- Census rebuilt per playbook taxonomy (slightly-broader law, published in the receipt): matrixish 83 raw hits/55 parts, unit-sup 52 parts, c-junk 2 parts, figures 64 entries. Slices w2-A1..A4/B1..B3/C1/w3-figures staged + persisted IN-REPO (.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-012/).
- Fleet probe PASS (1 cheap agent); wave dispatch 4-parallel FAILED (gateway context-deadline x4) and serial retry FAILED (x1) — run-011 outage window persists. Main-lane fallback executed per playbook §4.
- Tier-D deterministic: spaced standard-form flattens 12 fixes/10 parts. In-run overreach CAUGHT and REVERTED (first pass also converted glued ×102/×107 — syntactically ambiguous); plane rebuilt from backup, Tier-D re-scoped to spaced exponents only; 16 glued parts moved to eyes-on queue.
- Evidence pages: 68 QP/MS evidence groups rendered (215 PNGs); MS page-find recipe fixed (token+qnum scoring, top-2 render, direct string search) after voting mis-lands.
- Eyes-on fixes APPLIED (31 proposals, printed-page evidence per fix): 14 matrixish parts rebuilt (matrices A/B 2018-06 01R q26, surd families (6√5)/(125p⁹w³)^(2/3)/(5a²b³)²/(2a⁵b³)⁴/(√5−2)(√5+2)/(∛81)⁴=3^(16/3), moduli row |p|², √(20a²) family, figure-label notes, (2n−4) right angles); 3 foreign-row leak strips (2020-06+11 01R 17-b ©=Ⓒ part-label leak with 17-c rows MOVED home + codes, 2022-01 01 q25 tail, 2024-06 01 q19 tail); 2 superscript spans (2.34×10⁻², 2.40×10⁵).
- Figures: 64/64 crop-required entries cropped (adjacent-page ±1/±2 scan, whole-page census fallback, sliver guard, occurrence-indexed names; smallest 8.3KB); sampled eyes-on 2/2 real figures. PNGs staged LOCALLY — resources push + plane attach + URL gate DEFERRED to the PAT-gated landing (URL-gate-before-attach law).
- Gates ALL GREEN: marks 6600==6600 (66/1281/2443), mark-code question-level union preserved on every edit, KaTeX 59/59 parse OK, unbalanced-$ 0, furniture 0, c-junk residual 0, assets 562/64 untouched.

Stage Summary:
- Landed here: official-papers.json (fleet-retry wave) + receipt run-012 + playbook §7 additions + lane-artifacts (scripts/slices/manifests/proposals, in-repo persistence law).
- Open queue (staged, in-repo): matrixish remainder ~33 hits (12 groups listed in receipt), glued-×10N 16 parts, 64 crops pending push+attach, 213 run-011 review:true verdicts, PAT rotation.
- Landing needs the operator PAT (workspace wipe consumed credentials; none on disk) — push + PR + CI + resources push + crop attach execute on receipt.


---
Task ID: T-OEQ-MATHSB-SERVE-1 run-012 LANDING (PAT trace 1a17cbb508c05079)
Agent: r7a (Super Z, session web-da4ab8b1)
Task: Land the fleet-retry branch with the operator-supplied PAT.

Work Log:
- PAT verified (identity SyllabAI), env-only one-shot, never echoed/never on disk.
- Branch pushed c18e6eea..6ba0c467; resources push 6b9fe7d..073639f (64 PNGs, 0 collisions); URL gate 64/64 HEAD-200 PRE-ATTACH; 64 crops attached in-plane (crop set 626, crop-required 0); gates re-run ALL GREEN.
- PR #407: CI verify+hub success -> MERGED as 12f84228 == main tip; post-merge main CI verify+hub success; clean auto-merge over concurrent fleet commits (#405/#406/G-7 receipt) verified via compare API + content spot-check.
- Receipt JSON repaired (invalid \s escapes from raw-text authoring — lesson recorded: receipts via json.dump only).
- Vercel hub auto-deploys from main; next-session optional: live spot-check of fixed parts on the production player.

Stage Summary:
- run-012 CLOSED of record: census rebuilt + 43 text fixes + 64 figures attached, all gates green, self-improving docs (playbook §7 + receipts + worklogs) updated.
- Remaining staged queue unchanged: matrixish ~33 hits/12 groups, glued-×10N 16 parts, 213 review:true verdicts, PAT rotation.

---
Task ID: T-OEQ-MATHSB-SERVE-1 run-012-spotcheck (operator trace 1a17cd3843d94f99: "spot-check the fixed parts on the live player")
Agent: r7a (Super Z, session web-da4ab8b1)
Task: Live-player verification of the run-012 landed wave on production.

Work Log:
- State recovery: workspace wiped again post-landing; repo re-cloned; fetch-first found run-012 ALREADY LANDED (PR #407 merged 12f84228 == main tip fe6ae6d6, resources 073639f, crops attached, crop set 626) — the landing executed after the previous session's summary point.
- Deployment currency PROVEN: GET /corpus/igcse-maths-b-16/official-papers.json live sha16 d56a2fb95a1e617f == repo tip bytes (build_corpus_static.mjs runs at every Vercel build; post-merge deploy current).
- Probe rig persisted in-repo (lane-artifacts run-012/spotcheck/): targets by pid (17 parts / 15 paper pages), presence+absence windows auto-built from the d829a526..HEAD diff (RSC-escape-safe, \uXXXX unescape), page-wide leak signatures, crop HEAD checks.
- TEXT WAVE LIVE: all 19 target parts' presence probes found (zero misses); 5 pages browser-verified: 3.4 ×10⁸, 2.40 × 10⁵, 2.34×10⁻², |p|² moduli + x=−21/5, (125p⁹w³)^(2/3), √(20a²) family, (√5−2)(√5+2), (∛81)⁴=3^(16/3), (2n−4), moved-home 17-c rows, and the 2019-06 02 4-d pmatrix product rendering as proper bracketed KaTeX matrices.
- F1 (actionable): 58/64 run-012 crops RENDER-INVISIBLE — attach updated assets[] only; the player renders figures solely from inline problemMd links; "Figure not shown" note still shows on all 58 (browser-proven on january-2019 q7/q21-a; PNGs HEAD-200). Old-crop path intact (asset_13 + q4 grids render).
- F2 (actionable): 25 stale markPoints[].textMd mirrors — the player renders markPoints when solutionMd ≠ MP[0].textMd, so run-012 fixes UN-HID stale OCR: 17-b © leak row renders in the official mark-scheme points (2020-06 + 2020-11 twins), q19 furniture+Q20 tail renders, Tier-D parts show flattened rows beside fixed answers. Leak strips visually incomplete until mirror sync.
- F3 (by-design, disclosed): SME questions.json still carries pre-run-012 text (AM-leak ×1, © ×2, furniture ×31) — official-plane wave; rides page payloads but is dropped at render for covered paper keys.
- F4/F5 new leads: 2024-06 02R q2-a/2-b foreign %-profit/chairs solution rows; truncated furniture variants rendering (2018-06 q27 tail, 2019-01 q10-b header); 2019-06 4-e problemMd inverse-matrix junk. Open queue corroborated live (glued ×1099/×10110, "4 xy 2").
- Landed: receipt run-012-spotcheck.json (json.dump law) + playbook §7 laws 7–10 + lane-artifacts spotcheck/ (scripts + probe JSONs + live results) + 8 evidence screenshots in download/t-oeq-mathsb/run012-spotcheck/.

Stage Summary:
- run-012 VERIFIED LIVE and correct on the text plane; two mechanical follow-up waves queued: markPoints mirror sync (25) + inline-link injection (58 crops); F4/F5 eyes-on leads recorded. Bookkeeping-only commit (.syllabai/** + worklog), fetch-first, no force; read-only spot-check, no credentials used on the live site; PAT rotation STILL PENDING.

---
Task ID: T-OEQ-MATHSB-SERVE-1 run-013
Agent: r7a (Super Z, session web-da4ab8b1, chat 1f3003b6, trace 1a17e7858b7ea40d)
Task: "run the mirror-sync + inline-link" — the two follow-up waves queued by run-012-spotcheck (F1 58/64 crops render-invisible, F2 25 stale markPoints mirror hits).

Work Log:
- State recovery: fetch-first (main 03d16e31; moved again to bb629a40 mid-run — merged into branch with zero path contact, no force). Census rebuilt from the plane: Wave A = 23 parts (16 byte-exact stale mirrors + 7 pre-existing divergences re-exposed by run-012 solutionMd edits; the spot-check's "25" = probe HITS over 10 probed pids, all inside the 23 — reconciled in receipt + playbook law 11); Wave B = 58 manifest crops across 56 parts (the 6 already-linked exemplars render a shared-stem figure and stay untouched; legacy asset_7_diagram/asset_24_diagram twins metadata-only).
- URL gate 58/58 HEAD-200 BEFORE attach (law 7d); eyes-on + sha256: 2023-11 8-d and 2025-11 9-b twin crops byte-identical -> one link each (deduped), q7 run-012 crop is the clean full grid-curve figure.
- Fail-closed apply (scripts/run013_apply.py): in-memory edit + G1-G10 battery, write only on all-green. First two runs correctly refused (gate bugs caught: shadowed snapshot, wrong diff baseline, over-strict furniture/window scopes vs pre-existing F5-class content); corrected to delta semantics; final run ALL GREEN: census 66/1281/2443/6600 EXACT, diff scope 79 fields EXACT (23 textMd + 56 problemMd), mirror parity 23/23, inline structure 56/56, PUA/FFFD/(c) 0, $-parity, no new furniture, render-visible stale mirrors 29->1 (survivor offp_2019-06_02r_5-d pre-existing, queued), serialization byte-law. Plane d56a2fb95a1e617f -> 3bf89d920d1b6bb0.
- Landing: branch r7a-pp-inline-mirror-013 -> PR #411 -> CI hub+verify SUCCESS (head + post-merge 7b0073e5 first-hand) -> merged 7b0073e5. Local main synced (4eb4158f incl. later bookkeeping).
- Live verification: deployment currency ~90s post-merge (live /corpus sha16 == 3bf89d920d1b6bb0); payload battery 39 pages ALL GREEN (56/56 inline links, note counts == 4x plane counts = flight-duplication law, 23/23 stale windows absent); browser: q7 figure renders inline 590x728 with callout gone (screenshot), 17-b mark-scheme modal clean (240 000 B1, no (c) leak row, no furniture; screenshot). Two new playbook laws (11 wave-census hits!=parts; 12 flight-duplication + chunk-split probe forensics).

Stage Summary:
- run-013 COMPLETE: spot-check F1+F2 closed end-to-end (census -> URL gate -> fail-closed apply -> PR/CI/merge -> byte/payload/pixel live verification). Bookkeeping: receipt .syllabai/receipts/T-OEQ-MATHSB-SERVE-1/run-013-mirror-sync-inline-link.json + playbook §7 run-013 additions + lane artifacts run-013/ + screenshots download/t-oeq-mathsb/run013/. Queue remaining: F4/F5 eyes-on leads, 213 run-011 crops review passes, PAT rotation pending. fetch-first, no force; PAT env-only via askpass.

---
Task ID: run-017 tranche 1 (trace 1a180f0984579d39, operator order "Make symbol-loss restoration the next repair wave (run-016/017): proper census, then fix each part eyes-on against the original paper" + Official-ExamQuestion corpus/pipeline pointers)
Agent: r0 (Super Z, zai-web session web-752465e5-2985-476b-86a3-0bf785493dc5)

Work Log:
- Pipeline docs read as ordered (Official-ExamQuestion README/AGENTS: ADR-039 fix-and-disclose, G0-G9 gates, pastpapers byte-frozen source, /0.2 provenance schema). QP/MS of record located in syllabai-pastpapers (sparse clone, PAT scrubbed).
- Census of record (S1 digit-letter-digit in plain text): 702 matches / 345 parts / 65 papers (300 problemMd) — line-context LOWER bound; in-run found undercount classes: cross-line splits (q13 '2\nx 2'), glued superscripts (order-24 '20002'=2000^2), operator-adjacent (q21 '3 x+ 6'=3^(x+6)).
- Tranche 1 = operator's linked paper 2026-06 4MB1-01, complete: 10 pages rendered 150dpi and READ (QP p2/p9/p17/p19/p24 + MS p6/p12/p21+3 zooms/p23/p27) — every repaired expression read off the page: q1 6x<20-2x; q13 proportional-to-sqrt(w) radical + y=64/x^2 row set; q21 3^(x+6)/9^x/5^x + full working-column rebuild (5^{"4"} ft-convention zoom-verified, answer 1875 = 5^4x3); q23 w^3 x w^-5 / 5x^0 / (8a^3b^9)^(1/3) / (36c^4d^2)^(1/2)/(3c^-5d^3) + answers w^-2/5/2ab^3/2c^7d^-2; q26 x^2=2-y^2, 3y-x=4 + full quadratic row rebuild.
- Fail-closed apply (scripts/run017_patch.py): FIRST apply correctly refused by gates (dry-run logic lacked assignment — write was a no-op, caught by diff-scope gate 1!=19; reset + fixed). Final apply: 15 fields + 7 markPoints[0] mirrors = 22 changed fields EXACT. Gates ALL GREEN: census 66/1281/2443/6600 EXACT, marks map identical, PUA/FFFD 0, $-balance 0, diff scope EXACT, mirror law 7/7 byte-exact, S1 residual on paper 0, serialization byte-law round-trip PASS. Plane eabd5ca8b643f93f -> df4985715db07b0b.
- Source corpus (ADR-039): 2026-06/4MB1-01/topic.json — 19 fields + 8 mark_points mirrors, edit_status extracted->corrected on 8 parts, edits[] +29, value_trace stamped, indent=1 round-trip PASS. Disclosed: questions.md render now stale (regen queued).
- Disclosures: q1 stray mark-column '2' dropped (interleave artifact, part.marks carries it); KaTeX spans where structure demands; order-24 bearings NOT touched (glued-sup real, MS page unread — tranche-2 lead, no half-evidenced edits).
- FINDING for operator: run-016 (PR #421) committed .syllabai bookkeeping ONLY (18 files, zero content-plane) yet its message/receipt claim plane eabd5ca8->5fc8abdb with 53 rebuilds — official-papers.json at tip is still eabd5ca8 and still carried all the damage this run fixed. Not adjudicated here; flagged in receipt newLeadsQueued.

Stage Summary:
- run-017 tranche 1 CLOSED END-TO-END: census filed, linked paper fully symbol-restored vs printed evidence (hub 22 fields + corpus 19 fields + disclosures), receipts + lane artifacts in-repo. Tranche-2 queued: whole-field census (345+ parts / 65 papers, severity-first), order-24 bearings rebuild, run-016 discrepancy adjudication. fetch-first, no force; PAT inline-only, scrubbed.
---
Task ID: run-017 tranche 2-r2 (trace 1a181a0eb215e04d) — COLLISION RECONCILIATION LANDING
Agent: r0 (Super Z, zai-web session web-752465e5-2985-476b-86a3-0bf785493dc5)

Work Log:
- Mid-wave collision: the r7a lane landed r7a-pp-symbolloss-t2-017 on main (53 fields: 2025-06 P1 32 + 1R 19 + 2026-06 P1 2) while my 77-field wave sat on PR #428 (base 515edc81) — #428 went dirty on the single-line plane.
- Three-way reconciliation onto main@dd20b81b: r7a-only 38 fields KEPT; my 62 mine-only APPLIED; overlap 15 = 3 text-identical + 12 ADJUDICATED to this wave (all 12 content-consistent with the printed pages on both sides — zero contradictions; kept tranche-1 house dialect + printed part labels r7a dropped). Ledger artifact filed.
- Final patch: 2023-11 Q24 p18 general-ratio section rebuilt from a fresh MS p18 read (last S1 residual on my papers eliminated). r7a's 2025-06 P1 keeps 8 S1 hits (their scope, disclosed, tranche-3).
- Gates on the union: census 66/1281/2443/6600 EXACT, marks-map identical, FFFD/PUA 0, $-balance 0-new, mirror byte-exact on all touched parts, S1 residual 0 on my 3 papers, byte-law round-trip PASS. Plane a11ad0ccc1923806 -> 0c75d58f837ec61f.
- CI channel: branch push AND pull_request events dropped for this lane's PRs all run (0 check-runs ever on run-017-symbol-loss-tranche2); re-trigger empty commit + close/reopen both dead-ended; main itself RED (verify T-MIG-136/T-CONSUME-EDX-1 shim test failing on the MATHSB-ANCHORS stage-3 flip 260c11c9/dd20b81b — hub GREEN, verify RED, deterministic). Merge NOT executed (landing law: no merge onto red main; CI channel dead). PR left ready + escalation filed. fetch-first, no force; PAT inline-only, scrubbed.

Stage Summary:
- run-017 tranche 2 content COMPLETE and reconciled: 0c75d58f837ec61f awaits a green window (main verify fix by the MATHSB-ANCHORS lane) + a working CI channel. Escalations: (1) red main T-MIG-136 shim test; (2) PR CI event-drop for this lane; (3) r7a 2025-06 P1 residual 8 S1 hits; (4) corpus topic.json ADR-039 sync for the 3 papers rides next resources PR.

---
Task ID: T-HUB-LOOSE-COPY-1 run-001 (operator trace 1a187582eb9b9ab5: "file the honest-copy fix as a small PR")
Agent: main agent (Super Z, session web-528c0352)
Task: Replace the maths-b loose card's now-false "still in progress upstream" promise with the adjudicated terminal truth, course-aware, without touching bundle bytes or the 82 in-progress courses' copy.

Work Log:
- State check first hand: sandbox re-reset (2nd) recovered — local main was stale c55927e7 (-609), ff-aligned to 2559034b; census at HEAD: igcse-maths-b-16 codeless 2/199 (Mathematical Symbols + Listing Outcomes, the T-SPEC-2B terminal stays); 83 courses carry code-less notes (some fully uncoded) — hence course-aware design, not a fleet-wide claim.
- apps/hub/src/lib/loose-copy.ts: looseAnchorCopy(course) — ADJUDICATED_NO_SPEC_HOME (igcse-maths-b-16 only, receipt-cited) ?? DEFAULT_COPY byte-preserving the legacy sentence.
- Both surfaces wired: revision-notes unmapped card (title+body) and guided-lessons unmapped heading (title); grouping law untouched.
- Gates: bun install --frozen-lockfile (952 pkgs) → bun run typecheck green → build:hub EXIT 0 (corpus-verify prebuild + next build).
- Commits: code a0e43856 + this artifacts commit; branch t-hub-loose-copy-1/r0 → PR (small); card + receipt under .syllabai/.

Stage Summary:
- run-001 SHIPPED as small PR; post-merge followup: Vercel deploy + live spot-check of the new adjudicated copy.
