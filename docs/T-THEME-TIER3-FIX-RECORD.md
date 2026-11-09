# T-THEME-TIER3-FIX — Tier-3 theme audit fix record (run-001)

**Status: CLOSED** — merged, deployed, machine-verified, visually verified.
**Surfaces:** `apps/hub/src/app/globals.css` · `apps/hub/src/components/theme-toggle.tsx`
**PR:** #865 (`patch/tier3-theme-audit-fixes-1` → `main`), merge commit `a3561bd`
**Merged:** 2026-11-08T17:44:19Z · CI `verify` ✓ `hub` ✓ · Vercel auto-deploy live
**Diff:** 2 files, +91 / −7 (globals.css +45/−2, theme-toggle.tsx +46/−5)
**Ledger:** persisted into the repo as `docs/T-THEME-TIER3-FIX-RECORD.md`
(2026-11-09); line refs re-verified against main @ `9faaae7` — one drift
found and noted in place (§3). CI on the merge commit re-confirmed as a
genuine push-event run (42506448853, event=push).

---

## 1. Scope and method

Tier-3 design critique over the full theme matrix — 4 themes × light/dark
(8 cells): `sme`, `quiet-green`, `candy-shop`, `chat-app-plum`. Contrast
figures are WCAG 2.x, computed sRGB→linear with alpha compositing; the
calculator was anchored against the critique's published numbers before use.
Theme state law of record: `localStorage["syllabai-theme"]`
(T-THEME-LOCAL-1 run-001, operator order 2026-11-07).

## 2. The five fixes (all landed on main)

### F1 — QG dark on-primary ink — `globals.css:312–322`
`--on-primary-qg: #ecf7f0 → #04110b`. The inherited near-white ink measured
**3.63:1** on the lightened fern fill — the one UNdocumented FAIL in the
8-cell matrix. The ink flips dark per the house dark idiom (SME dark runs
dark ink on its lightened fill at 7.4:1; QG's own success-ink already does
it on fern chips). `#04110b` clears AA on the solid fill (**4.83**), the
hover token (**5.88**) and the /70 gradient end (**3.9** — icons only,
aria-hidden avatars, ≥3:1 graphics rule).

### F2 — QG dark authored hover — `globals.css:392–406`
```css
[data-theme="quiet-green"].dark .bg-primary:hover {
  background: var(--primary-qg-hover);
}
```
Why: the component's `hover:bg-primary/90` composites the fern 90% over
whatever dark surface it sits on — **darker than the fill itself** — and no
ink carries that composite at AA (even `#000` measures **4.30** on the worst
one). The dark hover is pinned to `--primary-qg-hover`, which lightens
toward the viewer (the CS/plum authored-hover idiom); the dark ink holds
**5.88** there and the previously dangling token finally gets its consumer.
Scope notes: light mode keeps the component default (its /90 composite
passes with white ink, ~4.9 — out of scope); the broad `.bg-primary`
selector only fires on hoverable elements (also covers the plain `<button>`
on `app/error.tsx`, which carries no data-slot). Latent /90-composite FAILs
on QG dark tooltip and text-selection surfaces are covered by the same
authored-hover rule.

### F3 — SME dark hairline — `globals.css:181–184`
`--border: oklch(1 0 0 / 10%) → 15%`. White/10 over the dark card
composited to **1.32:1** — hairlines effectively invisible; 15% (**1.58:1**)
matches the pre-existing `--input` value so every dark hairline reads the
same strength. `--sidebar-border` intentionally untouched.

### F4 — CS badge label voice — `globals.css:645–654`
```css
[data-theme="candy-shop"] [data-slot="badge"].bg-primary {
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 0.04em;
}
```
The known spec exception (§13 option 1, documented, `globals.css:503–506`):
white-on-cherry fills ≈**3.59:1**, carried by the 800-weight uppercase label
style. Buttons already had the mitigation via the authored signature; the
default badge variant renders the same pair at 12px with no label voice, so
the identical mitigation is pinned onto primary-filled badges. **Note:**
as of this record no page renders a primary-variant badge (all `<Badge>`
call sites are outline/secondary/soft) — the rule is a pre-pinned guard for
the latent surface, demonstrated with a labeled synthetic badge in §6.

### F5 — Theme switcher swatches — `theme-toggle.tsx:49–76, 101, 134–140`
- `THEME_SWATCH` map: sme `#265bf6`/`#76a1ff`, quiet-green
  `#2e6b4f`/`#3d8e67`, candy-shop `#ff2d6e`/`#ff2d6e`, chat-app-plum
  `#7b44c7`/`#7b44c7`. CS and plum are **byte-identical across modes** (the
  brand-never-moves law); their dark entries exist for the uniform shape.
- `usePrefersDark()` — SSR-safe (`useSyncExternalStore`, server snapshot
  `false`), consumed only when `state.mode === "system"`.
- Each menu row renders an aria-hidden swatch dot
  (`ring-inset ring-black/10 dark:ring-white/25`); the label text carries
  the meaning, the dot is reinforcement. Values must stay in sync with the
  theme blocks in globals.css.
- Docblock law corrected: `T-ACCOUNT-ONLY` → `T-THEME-LOCAL-1` (localStorage
  is the store of record).

## 3. Deliberately not changed

| Item | Reason |
| --- | --- |
| `dashboard-client.tsx:300` `border-primary/25` | passes on both modes; 25% tint is an owned-hue wash, not a hairline. Drift note (2026-11-09 refs re-check @ `9faaae7`): T-HUB-COURSES-UI-2 later re-tinted this exact card /25 → /30 (hover /60) — a stronger owned-hue wash; conclusion unchanged |
| CS / plum brand fills | brand-never-moves law — byte-identical across modes |
| SME dark `--sidebar-border` | separate token with different intent; audit-scoped to `--border` |
| chat-app-plum (entire theme) | A/A− across the matrix — nothing failing |
| QG light mode | 5.84 / 4.71 already AA; /90 composite ~4.9 passes with white ink |
| Component files (TSX) for CS geometry | all CS signatures live in the authored layer; zero component edits for candy |

## 4. Local validation gates (pre-push) — all green

- Contrast anchors reproduced the critique's numbers (3.63 / 5.84 / 3.59).
- esbuild TSX transform ✓ (`theme-toggle.tsx`).
- Turbopack compile gate ✓ (the globals.css pipeline). Full `next build`
  was OOM-killed in the sandbox (exit 137) — environment limit, not code.
- `tsc --noEmit` exit 0 (`NODE_OPTIONS=--max-old-space-size=3584`).
- CSS brace balance 158/158; zero residual `#ecf7f0` in the tree.
- Patch integrity: `patch -p1 --dry-run` clean; applied tree byte-identical
  to the authored files.

## 5. Post-merge production verification (2026-11-08 UTC)

- CI on the merge commit: `verify` ✓, `hub` ✓ (workflow run 42506448853).
- Vercel auto-deploy: theme chunk rotated `43gh0q5zdumlh.css`
  (221,522 B, pre-fix) → `0f4o6wqn10h3u.css` (221,645 B, +123 B ≈ the added
  rules).
- CSS markers live on `www.syllab-ai.com`: `--on-primary-qg:#04110b`;
  `#ecf7f0` absent; `[data-theme=quiet-green].dark
  .bg-primary:hover{background:var(--primary-qg-hover)}`;
  `[data-slot=badge].bg-primary{text-transform:uppercase;
  letter-spacing:.04em;font-weight:800}`; `--border:#ffffff26`
  (was `#ffffff1a` — lightningcss rewrites oklch to hex).
- JS marker: `THEME_SWATCH` fingerprint (`265bf6",dark:"#76a1ff`) in chunk
  `1xrq74igvl1d1.js`.
- API smoke: `GET /api/demo/login?role=student&code=…` → 200 with session.

## 6. Browser visual pass (belt-and-braces, 2026-11-08)

Login path used: demo API → `localStorage["syllabai.token"/"syllabai.user"]`
→ `POST /api/session` mirror (signed `sai_session` routing cookie) — the
same contract the login page drives; data authorization stays with the
Bearer token throughout.

| Surface | Computed evidence (live DOM) |
| --- | --- |
| QG dark button pair | rest fill `#3d8e67` carrying dark ink `#04110b`; hover fill `rgb(71,158,116)` = `#479e74` |
| CS badge label voice | on `#ff2d6e` fill: uppercase / 800 / 0.04em — synthetic labeled badge (no live carrier, see F4) |
| SME dark hairline | card border `lab(100 0 0 / 0.15)` = white 15% |
| Switcher swatches (dark) | SME `#76a1ff`, QG `#3d8e67`, CS `#ff2d6e`, plum `#7b44c7` — exact THEME_SWATCH values |
| Switcher swatches (light) | SME `#265bf6`, QG `#2e6b4f` + identical CS/plum |

Screenshots (`01`…`06`, retained in the audit session workspace
`download/tier3-theme-fixes/verify/` — not committed): `01` switcher menu
light · `02` switcher menu dark · `03` QG dark buttons rest · `04` QG dark
button hover · `05` CS badge voice (synthetic) · `06` SME dark hairlines.

## 7. Re-verification recipe

```bash
# 1. current CSS chunks from the homepage
curl -s https://www.syllab-ai.com/ | grep -o '/_next/static/chunks/[a-z0-9]*\.css' | sort -u
# 2. markers (expect 04110b=1, ecf7f0=0, hover rule=1, badge rule=1 per chunk)
#    fetch each chunk and count occurrences
# 3. login smoke
curl "https://www.syllab-ai.com/api/demo/login?role=student&code=HNA%20269a"  # → 200 {accessToken, user}
```
