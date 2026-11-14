/**
 * The My-subjects grid terminator law (tier-3 follow-up 5, dashboard UX
 * review 2026-11-04 — the "mobile 2-2-1 subject-grid orphan" nit).
 *
 * The dashboard's subject grid is
 *   `grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3`
 *   (the base `grid-cols-1` — added 2026-11-13, visual audit V-1 — gives
 *   the <sm band an explicit shrinkable minmax(0,1fr) column so the
 *   truncate rows' nowrap min-content cannot widen the implicit track)
 * holding N subject cards plus ONE trailing "Got another course?" tile.
 * The trailing tile is the grid's terminator, so its span must adapt to
 * the row it lands in — otherwise some counts read broken:
 *
 *   N=6 at 2 cols:  [1,2] [3,4] [5,6] [tile·∅]  — a lone ghost row
 *   N=7 at 3 cols:  [1,2,3] [4,5,6] [7,tile,∅]  — a half-filled row
 *   N=5 at 2 cols:  [1,2] [3,4] [5,tile]        — fine (the review's case:
 *                    the tile absorbs the odd subject's row)
 *
 * The law: the tile always COMPLETES its last row.
 *   - 2-col band (sm…2xl): the tile spans the full row when N is even
 *     (its row would otherwise hold only the tile); an odd N pairs it
 *     beside the last subject (the SME idiom, unchanged).
 *   - 3-col band (2xl+): (N+1) % 3 === 1 → the tile is alone → span the
 *     whole row; === 2 → span 2 beside the last subject; === 0 → the row
 *     is complete → span 1.
 *
 * A spanning tile is a ghost BAR, not a stretched card: row layout,
 * vertically centred, short. A pairing tile keeps the 10rem cell shape.
 * Where the two bands disagree the narrower band's shape is explicitly
 * reverted at the wider one (e.g. N=2: bar at sm…xl, cell again at 2xl).
 *
 * Pure and string-typed so the parity/shape table is unit-pinned
 * (subject-grid.test.ts) without a DOM.
 *
 * NB every utility below is a SOURCE LITERAL — Tailwind v4's scanner is
 * textual, so breakpoint variants must never be composed at runtime (an
 * `at("sm", shape)` helper's output is invisible to the scan and the
 * utilities silently never compile — the @source "../lib" directive in
 * globals.css brings the FILE into the scan; these literals keep it
 * honest).
 */

/** Cell shape of a tile that shares its row with subject cards. */
const CELL = "min-h-[10rem]";

/** Bar shape, 2-col band: a slim full-width ghost row. */
const SM_BAR =
  "sm:min-h-[5.5rem] sm:flex-row sm:items-center sm:justify-between";

/** Bar shape, 3-col band. */
const XL_BAR =
  "2xl:min-h-[5.5rem] 2xl:flex-row 2xl:items-center 2xl:justify-between";

/** Back to a cell at 3-col when the sm span would otherwise leak upward
 *  (Tailwind col-span classes persist across breakpoints). */
const XL_CELL_REVERT =
  "2xl:col-span-1 2xl:flex-col 2xl:items-start 2xl:justify-center 2xl:min-h-[10rem]";

export function addCourseTileClasses(n: number): string {
  const classes: string[] = [CELL];

  // 2-col band: n even → the tile's row would hold only the tile.
  const smWide = n % 2 === 0;
  if (smWide) classes.push("sm:col-span-2", SM_BAR);

  // 3-col band: (n + 1) % 3 seats the tile in the last row; a complete-row
  // verdict must cancel the sm span explicitly.
  const r = (n + 1) % 3;
  if (r === 1) classes.push("2xl:col-span-3", XL_BAR);
  else if (r === 2) classes.push("2xl:col-span-2", XL_BAR);
  else if (smWide) classes.push(XL_CELL_REVERT);

  return classes.join(" ");
}

