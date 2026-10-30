# T-MG-INK-1 — the SDK decision gate: annotation/ink SDK verdict (decision record of record)

**Status**: verdict of record — the Phase-3 decision gate (plan of record `docs/MG-MARK-PARITY-PLAN.md` §3.3, "carded, not pre-decided") is **CLOSED: native canvas ink on pdf-pane v4**. This record lands before any surface code, per the gate's own law.

**Run**: T-MG-INK-1 run-001 (spike + verdict receipt; operator dispatch "Phase 3", trace `1a18bd3f2c4b0901`, session `web-123877e4-3cca-4eba-b72d-52233419378e`). Spike evidence: `.syllabai/lane-artifacts/T-MG-INK-1/run-001/` (measurements re-runnable via `measure.js` with esbuild + tldraw 5.6.0 from the npm registry).

## 1. The question

The hybrid-stack adjudication (plan §7) kept the annotation layer open between:

- **tldraw** — their stack: full tool suite incl. maths instruments, op-log built-in, store serialization observed live in the dossier (§1.7, A7); plan estimate "~300 KB+ gz".
- **native canvas ink** on pdf-pane v4 — zero deps, dpr-cap harmonious, but no op-log and maths instruments become bespoke work.

Plan §3.3 DEFAULT if the spike is inconclusive: tldraw headless (ink only, our toolbar). §5.5 precondition for ANY ink SDK: "a 300 KB+ gz ink SDK has a home only if lazy-loaded per-surface".

The spike evaluates: **bundle cost, dpr-cap interplay with pdf-pane's two-phase zoom, offline/persistence queue fit, licence** (plan §3.3 + §5.5). Measured, not asserted.

## 2. Evidence

### E1 — Licence (decisive)

tldraw 5.6.0 (latest, npm registry, 2026-10-30). Licence census first-hand from the installed tree (`@tldraw/*/LICENSE.md`, umbrella `tldraw/LICENSE.md`, canonical text fetched from `github.com/tldraw/tldraw` LICENSE.md @ main, sha256 `9578fcddc20e404b…` pinned in the spike artifacts):

| Package | Licence |
|---|---|
| `tldraw` (umbrella), `@tldraw/editor`, `@tldraw/driver` | **tldraw license** (proprietary; production-prohibited free tier) |
| `@tldraw/{tlschema,state,state-react,store,utils,validate}` | MIT (© 2024 tldraw Inc.) |

The tldraw license's free-tier **Conditions** include, verbatim:

> - Not to use the Software in Production Environments.
> - Not to disable, change, or interfere with the Software's License Key enforcement.

And its **Technical enforcement** clause:

> The Software includes technical measures to verify License Key validity, detect deployment environments, enforce usage restrictions based on license type, and ensure proper watermark display. The Software may collect and transmit usage data to tldraw for license compliance purposes.

Three independent disqualifiers for our use:

1. **Production use is prohibited on the free tier** — the ink layer is a production learner surface; the plan DEFAULT ("tldraw for ink only, headless mode, mounted over pdf-pane v4") therefore requires a paid commercial licence (procurement + operator decision the lane does not have) or a breach.
2. **Compliance telemetry to a third party rides the learner surface** — the SDK "may collect and transmit usage data to tldraw" from the exact component that records learner ink. The Phase-2 posture law (learner identity from JWT context, never the wire; user-signal PII posture) makes third-party compliance callbacks on a learner-data surface a posture violation regardless of licence fee.
3. **Termination is automatic on breach** of any licence term — an operational-risk class the repo's lane discipline does not accept on a core surface.

The MIT subpackages (`@tldraw/store` etc.) do not rescue the DEFAULT: the tool suite (canvas, tools, instruments) lives in `@tldraw/editor`/`driver` — the production-prohibited parts. MIT gets you only the doc format, which our own container shape covers (E4).

### E2 — Bundle cost (measured; esbuild minified ESM, gzip -9, react/react-dom external — the hub already ships `react@19.3.0`, which satisfies tldraw 5.6.0's peer `^18.2.0 || ^19.2.1`)

| Configuration | JS raw | JS gz | CSS gz | Total gz |
|---|---|---|---|---|
| A: `tldraw` full editor (their stack, `<Tldraw/>` mount) | 1,849,737 B | **560,987 B** | 14,531 B | **≈575.5 KB** |
| B: headless store core (`@tldraw/tlschema` + `@tldraw/store` + `@tldraw/state`) | 153,934 B | 46,212 B | — | ≈46.2 KB |
| C: native ink reference implementation (this spike, zero deps) | 3,124 B | **1,314 B** | — | **≈1.3 KB** |

- The full editor is ~2× the plan's "~300 KB+ gz" estimate (tldraw 5.x grew: it drags `@tiptap/*` rich-text, `radix-ui`, `react-intl`, `idb`, `lz-string` — a text-editor + i18n stack irrelevant to ink strokes). Even lazy-loaded per-surface (the §5.5 precondition), 575 KB gz buys a tool suite we would have to re-theme anyway: the DEFAULT clause itself specifies **our** toolbar, not theirs.
- Native: 1.3 KB gz, measured from a working reference implementation checked into the spike artifacts (`ink-native-ref.js` — pointer-capture strokes, undo/redo/clear, normalized coordinates, dpr-capped rendering, `{schema, shapes[]}` doc export/import). The zero-dep path is not a projection; it is running code.

### E3 — dpr-cap / two-phase zoom interplay (code-law fit)

pdf-pane v4 (`apps/hub/src/components/pastpapers/pdf-pane.tsx`, 2,242 lines) is the rendering substrate with hard-won mechanics: windowed rendering (RENDER_RADIUS 3 / CLEAR_RADIUS 6 / MAX_RENDER_SCALE 4), and the s145 **two-phase zoom** — an instant compositor-only live phase (bitmaps CSS-stretched, zero rasterization) + a debounced 180 ms quality refreeze; paint dpr capped at 2 (`Math.min(window.devicePixelRatio || 1, 2)`, line 987).

- **Native rides it**: the Phase-1 overlay (`RegionOverlay.tsx`) already established the overlay law — NORMALIZED 0..1 per-page geometry rendered as CSS percentages over the page box ("zoom/dpr scaling is the browser's problem, not ours — no pixel math, no re-measure listeners"), and STANDALONE mounting (the monolith is never modified; it composes `<RegionOverlay>` from the hosting page). An ink canvas mounts the same way: the two-phase live phase stretches it with the page bitmap for free; at paint time it rasterizes at dpr ≤ 2 exactly like pdf-pane's own canvases.
- **tldraw fights it**: tldraw's editor owns its own camera/transform/DPR pipeline and wants to be the surface, not a layer under someone else's zoom law. Mounting it per-page-box over a windowed renderer with hysteresis-band canvas freeing means re-deriving their camera from OUR scroll/zoom state every step — bespoke integration work against a 575 KB SDK whose core value (owning the canvas) we must take away.

### E4 — Offline/persistence queue fit

- Our write law (plan §3.3 API, already designed): `PUT /api/v1/learner/pdf-drawings` with `revision` — last-write-wins, 409 on stale revision. Single writer per `(learnerId, documentRefType, documentRefId)`; no multi-writer concurrency exists or is planned.
- Observed data scale (dossier §1.7): a full live tldraw doc = 11,148 B / 17 shapes. Full-doc PUT per save is negligible at this scale.
- tldraw's op-log (`canvas.commit` + appliedOpIds, observed in the dossier §1.4/§1.5) solves multi-writer incremental sync — a problem we do not have. Adopting it buys complexity (op reconciliation, appliedOpIds bookkeeping) against zero present need; native full-doc LWW is the right-sized sync for single-writer small docs. Offline queueing of the PUT is our code either way (hub `api-cache.ts` seam); native owns its doc, so the queue payload is the plain doc.

### E5 — Maths instruments (the one real tldraw upside — deferred by the plan itself)

Ruler/protractor/compasses are built into tldraw but the plan already defers them to T-MG-INK-2 ("high delight, zero schema impact"). Under the native verdict they remain T-MG-INK-2 bespoke work — a constrained-line tool over the same stroke pipeline the native layer already has. The deferral costs nothing now and keeps the gate's consequences inside the phase's own carding.

## 3. Verdict

**Native canvas ink on pdf-pane v4.** The DEFAULT (tldraw headless) is NOT triggered because the spike is conclusive, not inconclusive: the licence alone disqualifies tldraw for a production learner surface (E1), and the bundle (E2) + integration (E3) + sync (E4) evidence all point the same direction with measured numbers.

Consequences:

1. **run-002 (schema + API)** proceeds exactly on plan §3.3 as written: `learner_pdf_drawings` (`doc jsonb NOT NULL`), UNIQUE `(learnerId, documentRefType, documentRefId)` + partial unique for `sourceUrl`-keyed rows, `GET/PUT /api/v1/learner/pdf-drawings` with revision LWW + 409. The doc container stays `{schema, shapes[]}` (the A7 anatomy) with OUR schema id (`"syllabai-ink/1"` in the reference implementation) — the jsonb column shape from the plan is unchanged by the verdict.
2. **run-003 (surface)**: ink layer mounts STANDALONE alongside pdf-pane v4 (RegionOverlay law), past-papers surface only (books/citations excluded — scope honesty), toolbar parity list (pen colour + thickness, undo/redo/clear, text boxes), perf pin (c): ink at 60 fps over the windowed renderer with dpr cap 2 — the native layer's paint cost is a single overlay canvas per visible page box, the same class of work the viewer already does per page.
3. **T-MG-INK-2** (maths instruments) unchanged: bespoke, over the native stroke pipeline.
4. **Op-log / `canvas.commit`-style incremental sync**: dead for this phase (E4) — revisitable only if a multi-writer requirement ever lands, and then under a licence that permits production.

**Reversal clause** (what would reopen the gate): a purchased tldraw commercial licence WITH an operator-approved data-posture ruling on the compliance telemetry, plus a measured need for multi-writer op-log sync or the built-in instrument suite. None of these exists today.

## 4. Provenance & discipline

- Zero writes to any target site; all evidence from the public npm registry, the repo's own code, and a public GitHub licence file (read-only GETs — the dossier precedent).
- All binaries sandbox-local; only text artifacts committed (the RECT-2 rule).
- Measurements re-runnable: `scripts/ink-spike/measure.js` in the artifacts (esbuild + tldraw 5.6.0; commands in `spike-log.json`).
- Fence census, identity zero-touch, and merge discipline: plan §4 gates as amended by the receipts of record (#458/#464/#468/#474).
