# T-SME-SEL-W7-1 run-002 — closeout: post-merge verification + the Revision Notes selector review (operator order "Wave 7")

Follows run-001 (PR #949, squash-merged `8f5a14525` as part of main). Operator order (trace `1a1cfaff18f9fa4d`): "Wave 7" — read as the closeout of the wave-7 assignment, whose remaining open part is the Revision Notes selector review ordered alongside the selector-page fixes ("…and also review and report back to me about the Revision Notes selector pages"). READ-ONLY review; the only writes are this receipt, the task-card status flip, the census script, and the worklog entries.

## Post-merge verification (main `8f5a14525`, re-confirmed)

- `verify_sme_wave7` PASS; `verify_sme_wave1` + `cosmetics1` PASS; `verify_sme_wire_r0` PASS (90 courses / 2,574 sets / 43,232 questions; 2,574 placed / 0 unplaced; gen-row homes 21).
- CI on the squash commit: census + verify + hub ALL success.
- Known pre-existing main debt (disclosed at the merge): `verify_sme_wave6` 2 failures — PR #953's official adds bumped spec points 33→36 on cie-{a-level,as}-maths-20-pure-1 without re-pinning the wave-6 SPINE constants; reproduced at clean main 650bf9c7 before the merge. Still open; needs its own disclosed pin-refresh.

## The Revision Notes selector review (read-only; live-probed 2026-11-12)

### How the selector works today

`/courses/<course>/revision-notes` (page.tsx + notes-index.tsx) renders the OFFICIAL spec tree — `buildSpecTreeIndex().tree.topics` (TOPIC → SUBTOPIC `<details>` groups, RevisionDojo pattern) — with the MathsGenie toolbar (search + Resume), the scroll-to-end read-tick law, notes-only progress rings, guided-lesson pills, the explicit "Exam technique (not spec-tied)" card for contentKind=exam-technique notes (RN-DEBRIS-11 run-005 law), and the loose-notes card for the remainder. Notes anchor to rows via `subtopicOfNote`: first specPointCode that resolves through `subtopicOfSpecPoint`, then topicSlug-as-subtopic-code, then specPointIds. Legacy `?spec=` deep links resolve server-side. The SME picker layer (`tree.smeSections`) renders ONLY on exam-questions — the wave-1 law keeps official topics as the anchoring truth everywhere else.

### Central finding — the corpus already carries SME's own organization, unused

Every revision note corpus-wide carries `sectionSlug` + `topicSlug` — the live SaveMyExams revision-notes tree's own section/topic slugs (100% coverage on every course sampled, including all worst-loose courses; `sourceUrl` pins the live page). Deep-compared against the LIVE SME revision-notes trees (fresh `__NEXT_DATA__` fetches 2026-11-12 — the RN pages carry sections/topics/subtopics the same way the topic-questions pages do):

| course | live SME RN tree | corpus notes | pairing |
| --- | --- | --- | --- |
| igcse-physics-19 (Edexcel) | 8 sections / 24 topics / 127 subtopics | 127 | 127/127 into the tree; per-section counts EXACT (8/8 sections, 24/24 topics) |
| igcse-chemistry-19 (Edexcel) | 4 / 28 / 112 | 112 | 112/112; per-section EXACT |
| igcse-biology-19 (Edexcel) | 6 / 24 / 154 | 142 | 142/142; SME added section 6-exam-skills (12 notes) post-attestation |
| cie-a-level-computer-science-19 | 21 / 48 / 145 | 144 | 144/144 into 21/21 sections, 47/48 topics; 1 live subtopic post-dates the corpus |
| igcse-english-literature-16 (Edexcel) | 6 / 24 / 161 | 136 | 136/136; live drift +25 (exam-skills 11, literary-heritage 10, modern-drama 4) |
| cie-igcse-maths-25-extended | 10 / 56 / 189 | 189 | 189/189 (SME's teacher-only-mock-exams section correctly has no notes) |

The note IS SME's subtopic page content (counts align per-section), keyed by its section+topic slugs; SME's third level is not carried as a slug. The corpus is therefore the SME RN tree at selector-relevant granularity, and the hub renders a DIFFERENT organization (the official spine) on this selector.

### The gap it creates (fleet census via the real runtime placement, `rn_selector_census.ts`)

- 103 note-bearing courses, 9,151 notes: 6,319 anchored (69.1%), 169 on the exam-technique card, **2,663 loose (29.1%)**.
- 79 courses carry a loose tail. Worst: cie-a-level-chemistry-25 169/239 (71%), cie-igcse-maths-25-extended 147/189 (78%), cie-igcse-maths-international-maths-23-extended 145/178 (81%), cie-a-level-economics-23 95/159, cie-a-level-physics-25 95/201, cie-a-level-computer-science-19 88/144 (61%).
- 2 courses show ONLY the loose card (zero anchored): cie-igcse-english-language-25 (53 notes), cie-as-maths-20-pure-2 (39 notes).
- 100% of loose notes carry `sectionSlug`+`topicSlug` — the strand is missing spine rows, not missing data.
- What works well: Edexcel-19 sciences anchor 100% (specPointCodes resolve against the spec-derived spine — physics 127/127, chemistry 112/112, biology 142/142), though rows are spec-statement subtopics rather than SME's topic list. The IAL maths family anchors ~100% (sme-native tree). The toolbar/resume/tick/rings treatment is consistent.

### Recommendation (for the desk; NOT executed here)

The questions-selector treatment (waves 1–7) is mechanically available for the notes selector: per course, append SME_REFERENCE section rows + topic rows mirroring the live `/revision-notes/` picker (the same live-fetch recipe, `provenanceTier: SME_REFERENCE`, picker URL + fetch date), and place notes by their carried `sectionSlug`/`topicSlug` — an `smeRowOfNote` beside `smeRowOfQuestionSet`, with the single-match first-branch law. Effects: the 2,663-note loose tail resolves into SME's own organization; both selectors mirror SME; drift rows (biology/LIT exam-skills et al.) mirror verbatim under the wave-3 partial-coverage law; official spine stays untouched (homes-parity probe as before). Scope is larger than any questions wave (103 courses) — slice by family, worst tails first, or gate behind the same mirror-law exclusions. The `verify_sme_wire_r0`-style fleet gate would need a notes-dimension twin.

Receipt: `.syllabai/receipts/T-SME-SEL-W7-1/run-002-rn-selector-review.md`. Census engine: `apps/hub/scripts/rn_selector_census.ts` (committed; read-only, real-runtime placement). No corpus bytes touched; no DB contact; bookkeeping-only commit, fetch-first, no force.
