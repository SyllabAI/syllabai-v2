# ADR-BOOK-0002: media-embed sources manifest + external video pilot (Cognito, 4CH1)

| | |
|---|---|
| **Status** | **ACCEPTED** (2026-10-27) — drafted under operator "Go" (trace 1a179b7708279ae1); direction previously endorsed by operator ("we can use Cognito's videos", trace 1a179adedb4682cd); acceptance = the operator's implementation order **"run the T-BOOK-066 chain"** (trace 1a179c0ba4ff04ed), which is the review outcome of record for this document. Implementation = T-BOOK-066 (this trace). |
| **Band** | `T-BOOK-xxx` (interactive books) |
| **Task** | T-BOOK-066 |
| **Date** | 2026-10-27 |
| **Basis** | f-0039 (Cognito feature-gap census, open); `docs/books/research/COGNITO-LESSON-ANALYSIS-2026-10-27.md`; BOOK-PACK-SPEC §4 `media-embed` + lint law 4; ADR-BOOK-0001 decisions 9/11; f-0038 (serve-plane audit correction — the in-lesson assessment loop is already shipped; video is the one gap class left) |
| **Supersedes** | nothing — **concretizes** ADR-BOOK-0001 decision 9 ("`media-embed` requires a licensing row") into a schema, an embed law, and a pilot scope |

## Decision summary

External course videos enter the lessons through the **existing `media-embed`
block type**, wired to a curated, lint-gated **sources manifest** at
`books/4ch1/meta/media-sources.yaml`. Pilot = one pack
(`u1-c01-states-of-matter`). No new block type; no pack prose change; PDF of
record unchanged; honest-empty law unchanged.

## Decisions

### 1. No new block type — `media-embed` grows a `sourceId`

The 11-type freeze (ADR-BOOK-0001, BOOK-PACK-SPEC §4) stands. The change is a
**payload-shape amendment to `media-embed`**: the payload gains a required
`sourceId` string resolving to a manifest row (checkRefs-style resolve law —
unresolved `sourceId` = lint fail). Blocks authored before this ADR (none carry
video fleet-wide — `media-embed` is honest-empty today, verified in f-0039) are
unaffected. This is exactly the "changing a payload shape = ADR first" clause
the pack spec names as this document's trigger.

### 2. The sources manifest (`books/4ch1/meta/media-sources.yaml`)

Append-only curated rows, one per external asset, sibling of `book.yaml` in the
book-meta plane:

```yaml
- id: cog-1-6-elements-compounds-mixtures   # slug, unique (lint: no dupes)
  provider: cognito                          # pilot enum of record: cognito
  kind: video                                # video | animation | 3d
  title: "Elements, compounds and mixtures"
  url: "https://cognito.org/…"               # provider page of record (human-facing)
  youtube_id: "…"                            # embeddable asset id (nocookie embed)
  specRefs: ["1.6"]                          # official codes; lint: ⊆ chapter join set
  hosting_pack: "u1-c02-…"                   # exactly one pack of record (lint-checked)
  attribution: "Video © Cognito (cognito.org) — embedded via YouTube"
  licensing_row:                             # lint law 4: REQUIRED, else lint FAILS
    basis: "public-embed"
    ref: "YouTube ToS embed; no re-host, no download, no subtitle extraction"
    reviewed_by: "operator (trace 1a179adedb4682cd)"
    reviewed_date: "2026-10-27"
  checked_date: "2026-10-27"                 # embeddability + spec-match verified by fetch
  recheck_days: 90                           # stale → G4 warn; licensing_row absent → G4 error
  status: curated                            # curated | retired (retired → honest-empty, hidden)
```

### 3. Embed law (attention-leak containment)

`youtube-nocookie.com` embeds only; `rel=0`, no autoplay, no playlists, no
endscreens; title + provider attribution rendered **in-card** (never in lesson
prose — lesson-prose@2.0.0 voice law untouched); fallback = plain link card to
`url` if the embed is blocked; poster may use the provider thumbnail. The card
frames the video as apparatus ("watch", return-to-lesson affordance), not as
the lesson itself.

### 4. Licensing basis of record + accepted limits

Cognito videos are publicly viewable on YouTube; **official embeds are
YouTube-ToS-compliant**; no download, no re-host, no subtitle stripping, no
Kognity content ever (proprietary, paywalled — f-0039 records the Kognity
reading is legally closed). Recorded limitation: the provider can disable
embedding or withdraw a video at any time — the `checked_date`/`recheck_days`
gate catches rot, and the honest-empty revert (decision 7) is the failure
mode, never a dead player. **Accepted trade-off (operator-endorsed, f-0039):**
provider brand visibility inside our lessons for the pilot.

### 5. Lint law 4 concretized (G4 rule)

BOOK-PACK-SPEC lint law 4 already says "`media-embed` requires a licensing row
in `meta` or fails" — this ADR makes it checkable: every `media-embed.sourceId`
must resolve to a manifest row; `status: curated`; `licensing_row` present with
`reviewed_date`; `checked_date` fresh within `recheck_days` (stale = warn);
`specRefs ⊆ hosting pack's chapter join set`; `hosting_pack` exists in the
spine. Implemented in the G4 validator lane (the `validate-u1c01-pack.ts`
pattern, index-driven).

### 6. Pilot scope + curation protocol

- **Pilot pack: `u1-c01-states-of-matter`** (course-entry chapter, retrofit
  r3-stable, highest prior touch-count). Fallback `u1-c02` if the 1.6-band
  Cognito videos map more cleanly than the 1.1–1.5 band at curation time.
- Pilot packs carry **≤ 2 media-embed blocks** (density guard; revisit
  post-pilot — this ADR does not legislate fleet density).
- **Curation protocol** (implementation step, not done here — no URLs are
  pinned in this ADR because none have been fetch-verified yet): enumerate the
  pack's specRefs → enumerate Cognito's Edexcel-IGCSE Triple TOC → pick ≤ 2
  best-fit videos → **fetch-verify each** (embeddable, spec-matched, page of
  record live) → write manifest rows with `checked_date` → G4 → authoring lane.
- **Chain of record for implementation (T-BOOK-066):** manifest rows (v2, this
  repo) + `media-embed` block(s) in the pilot pack (syllabai-resources —
  **authoring PR + law-7 flip receipt**, pack bytes are not ops tx) + v2 bake
  (`import_lesson_packs.py`, fetch-first, PAT env-only) + gates (G4 29/29 +
  4 books suites + T-C20 post-deploy) + live poll verify.

### 7. Rollback = retire, not delete

Preferred: flip the manifest row to `status: retired` → renderer honest-empty
(hidden) — zero pack bytes. Guaranteed: a reverse authoring PR removing the
block (the standing flip laws cover it). Either path restores the pre-pilot
state; no orphan `sourceId` may remain (lint enforces).

### 8. What stays ours (anti-dilution law)

Adoption copies **interaction patterns**, not content philosophy. Cognito is
video-first with bullet-density notes; our lessons remain textbook-grade prose
(lesson-prose@2.0.0, f-0039 positioning note). The video card is supplementary
apparatus — prose, checks (`mcq-embed`), the spec-join assessment loop, and the
mark-scheme language layer remain the spine of the lesson.

## Consequences

- ADR-BOOK-0001 decision 9 ("media-embed requires a licensing row") becomes
  mechanically checkable; decision 11 (licensing as serving law) is restated
  per-row via the manifest.
- T-BOOK-066 opens as the implementation lane (manifest + lint + pilot pack +
  bake + gates). f-0039 candidate 1 becomes closeable via a superseding ledger
  entry once the pilot is live and T-C20-green.
- f-0038's playbook bullet (serve-plane audit) is unaffected — separate one-line PR.
- Renderer verification: T-BOOK-006 built the media-embed cards lane; the
  renderer wiring is re-verified as T-BOOK-066's first step before any curation.

## What this ADR does not decide

Candidates ② (key-points checklist block) and ③ (next/prev lesson nav) from
f-0039 — awaiting separate operator rulings (② needs its own ADR if ruled;
③ is a hub serving-surface change under existing laws). Any provider beyond
Cognito (Freesciencelessons et al. may join the same manifest post-pilot by
ruling). Monetization/entitlement of the video layer (rides the existing
VALIDATED-only serving laws). Transcript extraction or auto-caption reuse
(forbidden by the licensing basis until separately ruled).
