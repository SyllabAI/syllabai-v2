# Editor-gates fixtures — the engine's test corpus (ADR-044 run-011)

**Disclosure of record:** the reference Workbench MVP's original fixture
files lived in recycled sandbox storage and are gone (ADR-044 header,
companion-evidence line). These fixtures are **reconstructions**: they are
modeled on the served question shape of record (hub contracts
`ExamQuestion`/`QuestionPart` — `qstn_*` / `qstnprt_*` ids, `problemMd` /
`solutionMd` / `marks` / `choices` with `textMd`+`isCorrect`) and on the
T-OEQ-PHYS-FORMAT-1 domain (the Tier 1 typography lane's territory). The
"three wave-D-repaired physics questions" regression pins are rebuilt here
as gates-clean corpus-shaped questions; every fixture in `questions/` MUST
pass the engine with zero refusals (pinned by `src/index.test.ts`), and the
delta test corpus in the suite carries one case per refusal class and the
tier classifier's boundary cases.

If the original MVP fixtures ever resurface, they may be substituted in a
follow-up run — the engine's laws do not change, only the corpus rides.
