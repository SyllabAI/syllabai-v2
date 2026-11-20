/**
 * ink-penmode.ts — T-MG-INK-12 run-001, the pen-mode PURE laws (the
 * stylus lane's second run: "pen writes, finger scrolls").
 *
 * The operator's proposal, sanctioned: when a stylus is detected, the
 * stylus writes ink automatically and touch works for scrolling — the
 * GoodNotes / Samsung Notes posture, beating the incumbent (MG arms
 * Draw by hand and lets the finger draw). The gesture-side laws (the
 * touch→pan routing, the palm window, the anchor) live in InkCanvas and
 * are pinned by ink-penmode.test.ts at the seam; THIS module holds the
 * two decisions that are pure state math so they are pinned without
 * mounting the toolbar plane:
 *
 *   computePenModeOnLoad — the sticky preference law (localStorage):
 *   an EXPLICIT user toggle ('on'/'off') always wins; without one, a
 *   browser that has ever seen a stylus ('stylus-seen') starts in pen
 *   mode so the S-Pen/Pencil user never re-fights the flip per load.
 *
 *   penAutoArm — the flip targets ONLY the resting default (select /
 *   Browse): an explicitly armed tool (text, erase, an instrument) is
 *   the user's choice and is never overridden — the pen acts as THAT
 *   tool. The paper opens in select by design ("reading is the paper's
 *   first job", T-HUB-INK-TOUCH run-001), so the pen's first sighting
 *   arming the freehand tool IS the explicit pick.
 */

/** The stored preference values (localStorage `syllabai-ink-pen-mode`).
 * `auto` is the ABSENCE of an explicit choice — the value is never
 * persisted as such. */
export type InkPenPref = "auto" | "on" | "off";

/**
 * The mount-time law: pen mode at load = explicit pref, else the sticky
 * sighting. An unparsed/absent pref reads as `auto` (defensive: the
 * try/catch in the caller already guards storage access; this guards a
 * corrupted value the same way).
 */
export function computePenModeOnLoad(pref: string | null, stylusSeen: boolean): boolean {
  if (pref === "on") return true;
  if (pref === "off") return false;
  return stylusSeen;
}

/**
 * The first-sighting flip law: auto-arm the freehand tool ONLY from the
 * resting default. Everything else is an explicit arming — the pen acts
 * as the tool the user picked.
 */
export function penAutoArm(currentMode: string): boolean {
  return currentMode === "select";
}
