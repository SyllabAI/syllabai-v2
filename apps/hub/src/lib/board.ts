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
 * True when the lane may present the imported exam-series calendar.
 *
 * FLIPPED of record 2026-10-20 (operator trace 1a1589078364b76d "CIE lanes
 * to also carry an exam-series calendar"): the founding gate refused
 * Cambridge International lanes because the calendar's vocabulary was
 * Pearson-only — presenting a Pearson list on a Cambridge lane would have
 * been a lie. The vocabulary is now WIDENED with the two Cambridge
 * families (CAMBRIDGE_IGCSE / CAMBRIDGE_INTL_AS_A_LEVEL, contracts
 * ingestion.ts widening of record) and the qualification mapping is
 * board-aware (lib/exam-series qualForLevel(level, board)), so a Cambridge
 * lane reads the CAMBRIDGE_* calendar — honestly EMPTY until a measured
 * Cambridge key-times dataset is imported (the disabled hint, never a
 * Pearson list, never a fabricated window). The gate now only refuses
 * boards OUTSIDE the calendar vocabulary entirely (an unknown future board
 * has no qualification mapping to speak of — fail-closed honest absence).
 * The flip is inseparable from the mapping: gate and mapping move together.
 */
export function hasExamSeriesCalendar(meta: BoardKeyable): boolean {
  const b = boardOf(meta);
  return b === "Edexcel" || b === "Cambridge International";
}
