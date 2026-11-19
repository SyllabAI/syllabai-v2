#!/usr/bin/env python3
"""Phase C component wiring part 2 — the five app screens (render blocks)."""
P = "apps/hub/src/components/pastpapers/calc/ScientificCalculator.tsx"
s = open(P, encoding="utf-8").read()

def sub(old, new, count=1):
    global s
    assert s.count(old) == count, f"anchor x{s.count(old)}: {old[:70]!r}"
    s = s.replace(old, new)

anchor = '''      {screen === "notice" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="notice" aria-live="polite">
          <div className="text-sm text-zinc-100" data-calc-notice>
            {noticeApp}. This app isn&apos;t on the simulator yet.
          </div>
          <div className="mt-2">{screenBtn("Back to home", "Back", () => setScreen("home"), { data: "Notice back" })}</div>
        </div>
      )}'''
assert s.count(anchor) == 1

blocks = anchor + '''

      {/* ── phase C: the Statistics app — the manual's flow: the
          [1-Variable]/[2-Variable] type menu, then the Statistics
          Editor, then the results menu. The editor caps (160/80) and
          the value sets are the official manual's. ── */}
      {screen === "stat-type" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="stat-type" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Statistics · Select Type</div>
          <div className="space-y-1.5">
            {(["1-Variable", "2-Variable"] as const).map((label, i) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className={`text-sm ${statTypeCursor === i ? "text-zinc-50" : "text-zinc-300"}`}>
                  {statTypeCursor === i ? "▶ " : "  "}
                  {label}
                </span>
                {screenBtn(`Open ${label} editor`, label, () => openStatEditor(i === 0 ? "1var" : "2var"), {
                  pressed: statTypeCursor === i,
                  data: label,
                })}
              </div>
            ))}
          </div>
          <div className="mt-2">{screenBtn("Back to home", "Back", () => setScreen("home"), { data: "Stat back" })}</div>
        </div>
      )}

      {screen === "stat-edit" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="stat-edit" aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>
              Statistics Editor · {statKind === "1var" ? "1-Variable" : "2-Variable"}
            </span>
            <span>
              {statList.x.length}/{STAT_MAX_ROWS[statKind]} rows
            </span>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs font-mono">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="px-2 py-1 text-left">x</th>
                  {statKind === "2var" && <th className="px-2 py-1 text-left">y</th>}
                </tr>
              </thead>
              <tbody>
                {Array.from({
                  length: Math.max(statList.x.length, statKind === "2var" ? statList.y.length : 0, statCell.row + 1, 1),
                }).map((_, r) => (
                  <tr key={r} className={statCell.row === r ? "bg-zinc-800/60" : ""}>
                    {[0, 1]
                      .filter((c) => statKind === "2var" || c === 0)
                      .map((c) => {
                        const active = statCell.row === r && statCell.col === c;
                        const text = active && statEntry ? statEntry : (c === 0 ? statList.x[r] : statList.y[r]) ?? "";
                        return (
                          <td
                            key={c}
                            className={`px-2 py-1 text-zinc-100 ${active ? "outline outline-1 outline-zinc-500" : ""}`}
                            data-calc-stat-cell={`${c === 0 ? "x" : "y"}-${r}`}
                          >
                            {text || " "}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-[10px] leading-snug text-zinc-500">
            Type on the keypad · EXE commits the cell · DEL deletes the row · EXE on an empty line opens the results menu
          </div>
          {appError && (
            <div className="cw-error-hint mt-1 text-left text-[10px] leading-snug text-zinc-400" data-calc-app-error>
              {appError}: check the entry and the editor limits ({STAT_MAX_ROWS[statKind]} rows).
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {screenBtn("Open results menu", "Results", () => setScreen("stat-menu"), { data: "Stat results" })}
            {screenBtn("Delete all rows", "Delete All", () => {
              setStatList({ x: [], y: [] });
              setStatCell({ col: 0, row: 0 });
              setStatEntry("");
              setAppError(null);
            }, { data: "Delete All" })}
            {screenBtn("Back to home", "Back", () => setScreen("home"), { data: "Stat editor back" })}
          </div>
        </div>
      )}

      {screen === "stat-menu" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="stat-menu" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Statistics · {statKind === "1var" ? "1-Variable" : "2-Variable"} data</div>
          <div className="space-y-1.5">
            {statMenuItems().map((it, i) => (
              <div key={it.label} className="flex items-center justify-between gap-2">
                <span className={`text-sm ${statMenuCursor === i ? "text-zinc-50" : "text-zinc-300"}`}>
                  {statMenuCursor === i ? "▶ " : "  "}
                  {it.label}
                </span>
                {screenBtn(`Select ${it.label}`, it.label, it.run, { pressed: statMenuCursor === i, data: it.label })}
              </div>
            ))}
          </div>
          <div className="mt-2">{screenBtn("Back to editor", "Back", () => setScreen("stat-edit"), { data: "Menu back" })}</div>
        </div>
      )}

      {screen === "stat-res" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="stat-res" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">
            {statReg ? "Reg Results · y = a + bx" : statKind === "1var" ? "1-Var Results" : "2-Var Results"}
          </div>
          <div className="max-h-44 overflow-y-auto text-xs font-mono">
            {statReg
              ? (
                  [
                    ["a", statReg.a],
                    ["b", statReg.b],
                    ["r", statReg.r],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-3 py-0.5">
                    <span className="text-zinc-400">{l}</span>
                    <span className="text-zinc-100" data-calc-stat-value={l}>
                      {formatNatural(v, state.resultForm, state.fix, fmt)}
                    </span>
                  </div>
                ))
              : statRes &&
                statValueRows(statRes).map((row) => (
                  <div key={row.aria} className="flex justify-between gap-3 py-0.5">
                    <span className="text-zinc-400">{row.label}</span>
                    <span className="text-zinc-100" data-calc-stat-value={row.aria}>
                      {row.v ? formatNatural(row.v, state.resultForm, state.fix, fmt) : "Math ERROR"}
                    </span>
                  </div>
                ))}
          </div>
          {appError && (
            <div className="cw-error-hint mt-1 text-left text-[10px] leading-snug text-zinc-400" data-calc-app-error>
              {appError}: the data cannot support this screen (fewer than 2 pairs, or a constant x/y).
            </div>
          )}
          <div className="mt-2">{screenBtn("Back to menu", "Back", () => setScreen("stat-menu"), { data: "Results back" })}</div>
        </div>
      )}

      {/* ── phase C: the Table app — the manual's flow: Table Type
          (f(x)/g(x) both = the default), the defining equations shared
          with the FUNCTION key, the Table Range (Start/End/Step), then
          the number table. Row caps: 45 single, 30 both. ── */}
      {screen === "table-setup" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="table-setup" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Table · Number Table</div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-zinc-400">Type</span>
            {screenBtn("Table type f(x)/g(x)", "f(x)/g(x)", () => {
              setTableType("fg");
              setAppError(null);
            }, { pressed: tableType === "fg", data: "Table type f/g" })}
            {screenBtn("Table type f(x)", "f(x)", () => {
              setTableType("f");
              setAppError(null);
            }, { pressed: tableType === "f", data: "Table type f(x)" })}
            {screenBtn("Table type g(x)", "g(x)", () => {
              setTableType("g");
              setAppError(null);
            }, { pressed: tableType === "g", data: "Table type g(x)" })}
          </div>
          <div className="mt-2 space-y-1 text-xs font-mono">
            <div className="text-zinc-300">f(x) = {state.fns.f ? bufferToTex(state.fns.f) : "not set"}</div>
            <div className="text-zinc-300">g(x) = {state.fns.g ? bufferToTex(state.fns.g) : "not set"}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {screenBtn("Define f(x) on the Function screen", "Define f", () => setScreen("fns"), { data: "Define f(x)" })}
            {screenBtn("Define g(x) on the Function screen", "Define g", () => setScreen("fns"), { data: "Define g(x)" })}
          </div>
          <div className="mt-2 space-y-1 text-xs font-mono">
            {(["start", "end", "step"] as const).map((f) => (
              <div key={f} className="flex items-center justify-between gap-2">
                <span className={tableField === f ? "text-zinc-50" : "text-zinc-400"}>
                  {tableField === f ? "▶ " : "  "}
                  {f === "start" ? "Start" : f === "end" ? "End" : "Step"}
                </span>
                {screenBtn(
                  `Select the ${f} field`,
                  f === "start" ? "Start" : f === "end" ? "End" : "Step",
                  () => {
                    setTableField(f);
                    setAppError(null);
                  },
                  { pressed: tableField === f, data: `Table ${f}` },
                )}
                <span className="min-w-16 text-right text-zinc-100" data-calc-table-field={f}>
                  {tableRange[f] || "—"}
                </span>
              </div>
            ))}
          </div>
          {appError && (
            <div className="cw-error-hint mt-1 text-left text-[10px] leading-snug text-zinc-400" data-calc-app-error>
              {appError}: check Start ≤ End, Step ≠ 0, and the row limit (
              {tableType === "fg" ? TABLE_ROWS_BOTH : TABLE_ROWS_SINGLE} rows for{" "}
              {tableType === "fg" ? "f(x)/g(x)" : tableType === "f" ? "f(x)" : "g(x)"}).
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {screenBtn("Generate the number table", "Execute", executeTable, { data: "Execute table" })}
            {screenBtn("Back to home", "Back", () => setScreen("home"), { data: "Table setup back" })}
          </div>
        </div>
      )}

      {screen === "table-res" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="table-res" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Number Table · {tableType === "fg" ? "f(x)/g(x)" : tableType === "f" ? "f(x)" : "g(x)"}</div>
          <div className="max-h-44 overflow-y-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="px-2 py-1 text-left">x</th>
                  {(tableType === "f" || tableType === "fg") && <th className="px-2 py-1 text-left">f(x)</th>}
                  {(tableType === "g" || tableType === "fg") && <th className="px-2 py-1 text-left">g(x)</th>}
                </tr>
              </thead>
              <tbody>
                {(tableRows ?? []).map((row, r) => (
                  <tr key={r}>
                    <td className="px-2 py-1 text-zinc-100" data-calc-table-cell={`x-${r}`}>
                      {formatNatural(row.x, state.resultForm, state.fix, fmt)}
                    </td>
                    {(tableType === "f" || tableType === "fg") && (
                      <td className="px-2 py-1 text-zinc-100" data-calc-table-cell={`f-${r}`}>
                        {row.f ? formatNatural(row.f, state.resultForm, state.fix, fmt) : "—"}
                      </td>
                    )}
                    {(tableType === "g" || tableType === "fg") && (
                      <td className="px-2 py-1 text-zinc-100" data-calc-table-cell={`g-${r}`}>
                        {row.g ? formatNatural(row.g, state.resultForm, state.fix, fmt) : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2">{screenBtn("Back to table range", "Back", () => setScreen("table-setup"), { data: "Table back" })}</div>
        </div>
      )}'''

s = s.replace(anchor, blocks)
open(P, "w", encoding="utf-8").write(s)
print("part 2 OK (render blocks)")
