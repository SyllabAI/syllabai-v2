# T-MG-INK-8 — the MathsGenie ink UX parity spec (extracted, not invented)

**Status**: spec of record for the MG annotator parity pass. Every number below was
EXTRACTED from MathsGenie's production paper annotator (mathsgenie.co.uk paper viewer,
2026-11-02): toolbar aria-labels and menus read from the live DOM, pen/line/text width
maths and the thickness/colour constants read from their shipped JS bundles
(chunk `293fkzzrgjp_u.js`: the pen-size store `{name,value,dotSize}` rows and the
width maps; chunk `2qyw8g6sp6ia6.js`: the width-of-record functions `N/O/X` and the
shape-kind grammar). Not a guess, not a screenshot eyeball.

## 1. What MG ships (the census target)

Toolbar: Zoom out · Zoom in · Undo · Redo · Clear all · Browse · Select · Text ·
Math text box · Draw · Erase · Pen colour: Black · Pen thickness: Medium · Line ·
Ruler · Protractor · Compasses · Collapse toolbar.

Pen colours (exact, from their swatch styles): black `#1d1d1d`, red `#e03131`,
blue `#4465e9`, green `#099268`, violet `#ae3ec9`, orange `#e16919` (Mantine shades).
Default Black.

Pen thickness: `Fine | Medium | Thick | Extra thick` (store values `s|m|l|xl`,
default `m`), toolbar dot previews `4|7|11|16` px. Stroke width of record (their
`N()`, PDF page units at zoom 1) = `0.75 × {s:.5, m:1, l:2, xl:4}` →
**0.375 / 0.75 / 1.5 / 3.0 pt**; highlight = `0.2 × K`; line tool = `0.75 × K × ((n+1)/n)`
(slightly heavier than the freehand pen). Widths are page-relative (annotation units
÷ zoom) — ink scales with the paper, which is the same normalized-fraction law this
repo already ships (`ink.ts` widthFrac/sizeFrac).

Shapes: `draw | highlight | line | text | note | math-field | geo | arrow |
measurement`. Math is a WYSIWYG math-field stored as latex, rendered KaTeX
(`KaTeX_Main`); text/note carry `meta.pdfTextSize ∈ {s:.5, m:.75, l:1}` (default `l`).

First-open affordance: a floating card titled **"Put your answer down"**, body
*"Click anywhere in the box and type your working. It saves as you go."* (keyboard) /
*"Tap the box, then write your working with your finger or a stylus. It saves as you
go."* (touch), anchored to MG's parsed first answer region; clicking it arms Text
(keyboard) or Draw (touch); shown once (their localStorage key
`mg-first-region-hint-done`); analytics `pdf_first_region_hint_shown/_armed`.

Fonts: app sans (system-ui stack) for text; KaTeX for math. No handwriting webfont
anywhere — handwriting IS the pen stroke.

## 2. The deltas this card landed

| Surface | Before | After (MG parity) |
| --- | --- | --- |
| Palette | 4 colours, Fluent-ish (`#1a1a1a #d13438 #0f6cbd #107c10`) | MG's exact 6 (`#1d1d1d #e03131 #4465e9 #099268 #ae3ec9 #e16919`) |
| Pen widths | `[0.0022, 0.0038, 0.006]` — ~2× MG at every step | MG's exact model: `[0.375, 0.75, 1.5, 3.0] pt / 595.276 pt (A4)` = `[0.00063, 0.00126, 0.00252, 0.00504]` |
| Thickness row | 3 dots, `3+i*3` px, label "Pen thickness N of 3" | 4 dots at MG's `4/7/11/16` px, labels "Pen thickness: Fine/Medium/Thick/Extra thick" (default Medium, MG's default) |
| Toolbar labels | "Pen tool / Text box tool / Math text box tool / Select tool / Erase tool / Straight line tool / Ruler guide… / Undo stroke / Redo stroke / Clear all ink on this paper" | MG's exact strings: "Draw / Text / Math text box / Select / Erase / Line / Ruler / Protractor / Compasses / Undo / Redo / Clear all" (+ "Pen colour: Black" capitalization) |
| First-open affordance | none (the T-MG-INK-8 gap behind the operator's complaint) | the MG "Put your answer down" card (exact copy), once until armed/dismissed (`syllabai.ink-hint-done`), Type-answers arms Text, Write-by-hand arms pen; floats above the toolbar |
| Text editor | edits at 12 px (`text-xs`), commits 14 px | edits at 14 px (`text-sm`) = its commit size (WYSIWYG-honest) |

Unchanged (already at parity, verified this pass): text font = `ui-sans-serif,
system-ui, …` stack (paint.ts) = MG's app sans; math = KaTeX/KaTeX_Main
(MathTextOverlay) = MG's renderer; round caps/joins; crosshair/text/default
tool cursors; width-frac persistence law (old strokes keep their committed
widthFrac — ink on paper doesn't shrink).

## 3. Disclosed deviations (each deliberate)

- **The consent gate stays**: MG's toolbar is always visible; ours keeps the
  T-MG-INK-3 gate ("Ink" launcher + the migration notice law). Once opened, parity
  holds; the gate is a product posture, not a UX gap.
- **No MathLive**: MG edits math in a WYSIWYG math-field; we edit raw LaTeX in the
  textarea per the MG-INK-SDK-GATE verdict (bundle/licence discipline). The COMMITTED
  render (KaTeX) is identical.
- **Hint card anchors above the toolbar**, not to a parsed answer region — we don't
  parse answer regions; copy/behavior/once-ness are MG's.
- **New colour keys (`violet`, `orange`) are dropped by OLD clients** at the honest
  parse boundary (ink.ts law: unknown colour key → shape dropped, never a throw).
  Palette VALUE changes re-skin old ink live (shapes store the key).
- **MG extras out of scope**: Genie AI marking, measurement tool, Collapse-toolbar
  chrome, their zoom-only main bar (we keep fit-width/fit-page/spread/find).

## 4. Verification law for this card

Numbers pinned by tests (`ink.test.ts`): the palette toEqual, the width fracs
toBeCloseTo `pt/595.276` at 6 dp, the name and dot rows. Live: draw a 100 css-px
Medium stroke on both MG and our viewer at the same rendered page width and read
back the stroke's pixel thickness — the two must agree within antialiasing tolerance
(±1 px), since both are page-relative widths of the same pt value.
