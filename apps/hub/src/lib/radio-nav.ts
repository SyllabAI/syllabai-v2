/**
 * radio-nav — the shared WAI-ARIA radiogroup keyboard law (audit-0006 PR-2).
 *
 * Two pure helpers so the roving-tabindex + arrow-key law lives in ONE
 * test-covered place instead of being re-derived per surface:
 *
 *   - `rovingTabIndex` — the ARIA radiogroup law: exactly ONE option is a
 *     tab stop (the checked one; the first when nothing is checked yet),
 *     every other option is reached with the arrow keys, never with Tab.
 *   - `radioNav` — arrow movement inside the group: Up/Down/Left/Right all
 *     move (vertical lists read Up/Down, but Left/Right stay wired for the
 *     horizontal convention), wrapping at both ends; Home/End jump to the
 *     ends. Everything else is not the group's business.
 *
 * Consumers keep selection in their existing onClick/Space/Enter path and
 * make selection follow focus by focusing the target and clicking it —
 * the same observable behavior as a native `<input type="radio">` group.
 */

export function rovingTabIndex(
  isSelected: boolean,
  isFirst: boolean,
  anySelected: boolean,
): 0 | -1 {
  return isSelected || (!anySelected && isFirst) ? 0 : -1;
}

export type RadioNavResult = { handled: boolean; nextIndex: number | null };

export function radioNav(key: string, index: number, count: number): RadioNavResult {
  if (count <= 0 || index < 0 || index >= count) return { handled: false, nextIndex: null };
  if (key === "Home") return { handled: true, nextIndex: 0 };
  if (key === "End") return { handled: true, nextIndex: count - 1 };
  if (key === "ArrowDown" || key === "ArrowRight")
    return { handled: true, nextIndex: (index + 1) % count };
  if (key === "ArrowUp" || key === "ArrowLeft")
    return { handled: true, nextIndex: (index - 1 + count) % count };
  return { handled: false, nextIndex: null };
}
