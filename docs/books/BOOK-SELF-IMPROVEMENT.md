# Book Pipeline — Self-Improvement Law (findings, retros, metrics)

> The books pipeline is required to **improve itself**: every defect must end
> in a system change (playbook / pack-spec / lint / prompt / schema / ADR), not
> just a content patch. This doc is the law for how that happens. Binding.

## 1. The core rule

> **A defect is not fixed when the pack is fixed. It is fixed when the system
> that produced the defect changed.**

Corollaries:
- Every finding carries a `root_cause` and a `system_change` decision
  (`applied` / `proposed` / `none` + justification).
- The same `root_cause` appearing **twice** anywhere in the book program
  triggers a mandatory system-change PR before the next pack merges. No
  exceptions, no operator sign-off needed for lint/prompt/playbook edits
  (ADR-level changes still need the operator).
- "Operator noticed it in production" is a pipeline failure class of its own:
  anything that reaches a learner unflagged gets severity S1 in the ledger.

## 2. The findings ledger (`books/<qual>/qa/findings.jsonl`)

Append-only, one JSON object per line. Never rewrite or delete a line — a
retracted finding gets a superseding entry (`status: wontfix`, reason).

```json
{
  "id": "F-BOOK-0001",
  "date": "2026-10-21",
  "book": "4ch1",
  "pack": "c05",
  "stage": "S1",
  "gate": "G2",
  "severity": "S2",
  "kind": "fact|licensing|schema|terminology|ocr|spine|platform|process",
  "description": "Mole ladder step 3 used 24.0 instead of 24.3 for Mg",
  "evidence": ".syllabai/receipts/T-BOOK-010/g2-c05.json#violations[2]",
  "root_cause": "atomic-mass table not in the S1 author prompt's required-context list",
  "fix": "pack corrected",
  "system_change": {
    "type": "prompt|lint|playbook|pack-spec|schema|adr|none",
    "ref": "docs/books/prompts/s1-author.md#changelog",
    "status": "applied|proposed|none"
  },
  "found_by": "agent-id or human",
  "status": "open|fixed|wontfix",
  "fixed_in": "PR/commit ref"
}
```

### Severity

| Sev | Meaning | Response |
|---|---|---|
| **S1** | Licensing breach, PII, learner-facing wrong science, systemic trust break | **Stop the line.** Freeze pack merges, escalate operator immediately, finding same day |
| **S2** | Gate violation caught late, wrong mark-scheme vocabulary, dangling refs, spine/join defects, anything shipped that a gate should have caught | Finding **in the same PR** that fixes it; root cause + system change mandatory |
| **S3** | Style, doc drift, near-misses that gates already catch | Optional ledger entry; must be batched into the phase retro |

### Where findings come from

1. **Gate receipts** (G1–G4): the machine feed. Publisher aggregates violations per run.
2. **Human spot-checks**: the 20% sample per phase (plan §6). Every human correction is a finding with `found_by`.
3. **Live instrumentation** (T-BOOK-040): tutor citation-miss rate on book pages, check drop-off, honest-empty hits, learner flag button.
4. **Cross-book reviews**: when a second subject starts, its S2/S3 reviewer also re-samples the pilot book — different eyes, same ledger format.

## 3. Retrospectives (per phase, mandatory)

At the end of each phase (Phase A = after Unit 1 packs ship), the publisher
agent writes `docs/books/retro/<date>-<scope>.md` with fixed sections:

```markdown
# Retro — Phase A (4CH1 c01–c10), <date>
## What broke            (findings F-BOOK-xxxx …, by severity)
## Near-misses           (caught by gates — proof the gates work; or near-missed)
## System changes made   (playbook/lint/prompt/schema, with finding refs)
## Metrics               (from qa/metrics.json — see §4)
## Playbook deltas for Phase B  (concrete, PR-linked)
```

A retro with no system-change proposals is suspicious by default ("everything
went fine" is disconfirmed by the ledger, or the ledger is underfed — either
is a process finding).

## 4. Metrics (`books/<qual>/qa/metrics.json`, regenerated per phase)

- Gate pass rate by gate × pack (G1–G4)
- Violations by `kind` (trend: which defect classes dominate)
- Rework count: packs failing a gate twice+
- Authored words / block count per pack vs budget
- Findings by severity, mean time-to-system-change for S2
- Post-launch: citation-resolve rate, check completion, honest-empty hit rate

These feed the retro AND the phase plan: the next phase's pack budget and lint
priorities are set from the previous phase's metrics, not from vibes.

## 5. Prompt registry (`docs/books/prompts/`)

One versioned file per pipeline sub-stage (`s0-outline.md`, `s1-author.md`,
`s2-fact-review.md`, `s3-examiner-voice.md`, `s4-publish.md`, gate prompts).
Rules:

- Semver in the file header + a changelog section at the bottom. Changes via
  PR only; every change must reference the finding(s) that motivated it
  (or `chore` with justification).
- Pack receipts record the exact prompt versions used (PLAYBOOK §versioning) —
  this is what makes a regression attributable to a prompt change within one
  diff.
- Prompt changes that alter gate semantics (what G2/G3/G4 accept) are
  ADR-adjacent: propose, don't land unilaterally.

## 6. Escalation (books-specific addendum to AGENT_COORDINATION §6)

- Licensing questions: never resolve locally. S1, stop, operator decides.
  The posture of record (book questions = page jumps; no reflow; PhET-only
  embeds) lives in PLAN-4CH1 §4/§9 and ADR-0xx — change it by ADR, not by
  improvisation.
- Schema gaps (`book.block/1` can't express a needed payload): file the finding,
  propose the ADR, keep authoring in a `draft` pack — never widen the contract
  in the same PR as the content that needs it.
