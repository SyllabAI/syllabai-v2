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

## 5. T-MG-INK-9 — the text editor + the equation keyboard (corrections & additions)

Two §1/§2 lines were EXTRACTION ERRORS, corrected against the live site
(mathsgenie.co.uk paper viewer, 2026-11-02, DOM + computed styles read
directly):

- **§1 "Fonts: app sans … No handwriting webfont anywhere" was WRONG.**
  MG's text editor is a borderless transparent textarea painting
  "Shantell Sans" 16px weight 500 (line-height 1.35), and the COMMITTED
  shape is canvas-painted in the same font (their `font-ink` canvas).
  Correction shipped: Shantell Sans is OFL-1.1 → self-hosted latin
  subset `public/fonts/ShantellSans-latin-500.woff2` (47 KB, licence
  beside it), `INK_TEXT_FONT_STACK`/`INK_TEXT_WEIGHT`/`INK_TEXT_BASE_PX`
  = 16 in ./ink.ts, the painter and the editors use it. Old text ink
  re-skins to the new font live (the palette-value precedent — shapes
  carry sizeFrac, not the family).
- **§2 "crosshair/text/default tool cursors" needed the MATH correction:**
  the TEXT tool arms MG's I-beam (`cursor: text` — confirmed live); the
  MATH tool arms DEFAULT (their math-armed overlay computes `auto` — the
  box, not a caret, is the affordance). Our map: text→text,
  math→default, select→default, ruler/protractor→move, rest crosshair
  (test-pinned).

The text editor is now MG's posture exactly: borderless, transparent,
auto-growing (48×44 initial box), **Enter = newline; commit on
click-away or Escape** (tldraw's stop-editing: non-empty commits, empty
cancels); the math draft keeps Enter=commit (the keyboard's ⏎ is the
same path).

### The equation keyboard (MG ships MathLive's virtual keyboard)

Their math box carries a ⌨ toggle (`aria-label="Toggle Virtual
Keyboard"`; keyboard NEVER auto-opens — mirrored). The keyboard itself
is MathLive's `ML__keyboard`: **4 layers**, tab glyphs `123 · ∞≠∈ · abc
· αβγ`, tab names (their data-tooltip) Numeric / Symbols / Roman
Letters / Greek Letters; **136 keycaps** — numeric 30, symbols 33,
letters 42, greek 31 — plus backspace/commit/shift chrome (SVG sprite,
not keycaps). Every key's insertion template was extracted verbatim
(`\frac{#@}{#?}`, `\sqrt{#0}`, `#@^2}`, `\int^{\infty}_{0}\!#?\,\mathrm{d}x`,
the greek rows, the dual-label shift keys `<≤ >≥ ([ )] =≠ 9( 0) qQ…`).
Census of record: `./math-keyboard.ts` (each key: label, our adapted
insert, MG's verbatim `mg` template + `aria`), pinned by
`math-keyboard.test.ts` (counts, spot-exact rows, brace balance, the
insert/caret maths — MG's `#@` slot = replace the selection; `#?` = the
caret's fill-next position).

NO MathLive (the SDK gate stands: 575.5 KB gz + licence posture vs our
47 KB font and a pure-data module). Our keyboard is OUR panel
(./MathKeyboard.tsx) fed by the census: same layers, same tabs, same
keys, same insertions; the shift tap applies to one key then clears
(MathLive's behavior); the draft textarea keeps focus across taps (the
panel swallows its pointerdowns — the onBlur commit cannot fire on a
keyboard tap). The draft shows the LIVE KaTeX preview through the ONE
render law (renderMathHtml) — editing agrees glyph-for-glyph with the
committed overlay.

## 6. T-MG-INK-10 — the armed-tool hover chips (the "hover text", extracted live)

The operator's report (2026-11-03): "The hover text? It is not there."
Ground truth, extracted from MG's live paper viewer (DOM + real trusted
hovers, two independent reads per chip):

- **The Text tool, armed:** a cursor-following chip reads **"Add text"**
  — `<span class="font-ink absolute top-0 whitespace-nowrap left-0
  font-medium" style="color: rgb(159, 168, 178); opacity: 0.6;">`,
  24px, left edge AT the cursor x, vertically centred on the cursor
  (their measured rect: cursor 700/300 → chip box 700,284 @ 107×32).
- **The Math tool, armed:** the chip reads **"Add maths"** —
  `<span class="font-ink absolute top-0 whitespace-nowrap left-3.5
  -translate-y-1/2 text-lg leading-none" style="color: rgb(159, 168,
  178); opacity: 0.6;">`, 18px, left edge +14px right of the cursor,
  vertically centred (cursor 700/300 → box 714,291 @ 98×18).
- **Both** paint in `font-ink` = "Shantell Sans" (the same handwriting
  stack the committed ink uses), pointer-events none, decorative.
- **Behavior:** the chip follows the cursor over the page; it hides
  while the placement editor is open; it stays hidden after the first
  placement opens one; it RETURNS when the tool is re-armed (proven:
  re-arm → chip back at the cursor). The working tools (pen, shapes,
  instruments) show NO chip — ink appears immediately.
- **There are NO toolbar tooltips on MG at all:** a real 0.9s hover on
  the Text button yields no title attribute, no aria-describedby, and
  no tooltip node anywhere (the bottom-anchored float probe too). The
  chip IS the hover text — so we ship the chip and no tooltip layer.
- Our posture before this card: the chips were absent entirely (proven
  on production: Text and Math armed, cursor over the paper, zero
  "Add text"/"Add maths" nodes in the DOM).

Our implementation mirrors the census: ./ink.ts holds the constants
(INK_CHIP_*), the InkCanvas tracks the cursor while an editor tool is
armed and no editor is open, and the chip renders with MG's exact
values. The per-arm spend law is keyed by an arm epoch (armSeq, bumped
by every explicit arming) — no reset effects, the stale-seq chip is
simply not the current arming. One disclosed refinement: re-clicking
the already-armed tool counts as a re-arm (the chip returns) — MG's
behavior on that exact gesture was not probed; the law above (re-arm
after tool change) is proven.
