/**
 * Board helpers — client-safe (no "server-only" import; consumed by client
 * components, re-exported by lib/courses for the server plane).
 *
 * The registry (content/courses.json) carries TWO awarding boards since the
 * CIE-INTEGRATION wave: Pearson Edexcel rows (board absent — every pre-CIE
 * row is an Edexcel lane) and Cambridge International rows (board explicit,
 * the A2 band). The add-course overlay's board step used to hard-code the
 * single Edexcel value and its "Edexcel lanes only" caption — true when
 * written, false since phase 3 landed 45 Cambridge bundles — which left the
 * operator-reported gap: no way to choose the CIE board when adding a
 * course. The cascade now derives its boards from the registry instead of
 * asserting one (distinctBoards), and the label rule lives here so client
 * surfaces (overlay, dashboard cards) print the row's real board without
 * reaching into the server-only lib/courses.
 */

export interface BoardKeyable {
  /** registry-explicit awarding board; absent = the pre-CIE Edexcel rows */
  board?: string;
}

/**
 * Board label for course-level copy (eyebrows, jump-back rows, titles).
 * Registry-explicit when the row carries one (the CIE wave), else "Edexcel".
 * Same rule lib/courses has printed since the CIE wave — moved here so the
 * client plane shares the one source of truth.
 */
export function boardOf(meta: Pick<BoardKeyable, "board">): string {
  return meta.board ?? "Edexcel";
}

/**
 * The registry's distinct boards with row counts, busiest first — the
 * honest cascade step 1 (derived from the registry, never invented).
 * Ties break alphabetically, mirroring the level step's sort.
 */
export function distinctBoards(courses: BoardKeyable[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const c of courses) {
    const b = boardOf(c);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * True when the lane may present the imported exam-series calendar: the
 * core calendar's vocabulary and provenance are Pearson-only (official
 * Pearson key-dates documents), so Cambridge International lanes gate OUT
 * of the series surface — an honest absence (there is no Cambridge
 * calendar of record), never a Pearson list on a Cambridge lane.
 */
export function hasExamSeriesCalendar(meta: BoardKeyable): boolean {
  return boardOf(meta) === "Edexcel";
}
