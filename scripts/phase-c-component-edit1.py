#!/usr/bin/env python3
"""Phase C component wiring — ScientificCalculator.tsx (asserted edits)."""
import re

P = "apps/hub/src/components/pastpapers/calc/ScientificCalculator.tsx"
s = open(P, encoding="utf-8").read()

def sub(old, new, count=1):
    global s
    assert s.count(old) == count, f"anchor x{s.count(old)}: {old[:70]!r}"
    s = s.replace(old, new)

# 1) imports
sub('''import {
  bufferToTex,
  formatNatural,
  initialCalcState,
  pressKey,
  type CalcDisplayFmt,
  type CalcKey,
  type CalcState,
} from "./calc-engine";''', '''import {
  bufferToTex,
  formatNatural,
  initialCalcState,
  pressKey,
  type CalcDisplayFmt,
  type CalcKey,
  type CalcState,
  type CalcValue,
} from "./calc-engine";
import {
  buildNumberTable,
  stat1Var,
  stat2Var,
  statEntryToValue,
  TABLE_ROWS_BOTH,
  TABLE_ROWS_SINGLE,
  type Stat1Var,
  type Stat2Var,
  type TableType,
} from "./calc-apps";''')

# 2) Screen union
sub('type Screen = "calc" | "home" | "settings" | "catalog" | "catalog-cat" | "vars" | "fns" | "tools" | "notice" | "qr";',
    '''type Screen =
  | "calc"
  | "home"
  | "settings"
  | "catalog"
  | "catalog-cat"
  | "vars"
  | "fns"
  | "tools"
  | "notice"
  | "qr"
  // T-MG-CALC-2 phase C: the Statistics and Table apps (the spec pin 5:
  // the ONLY new app surfaces — the exam-honest scope matches MG's
  // enabled set exactly; every other registered app keeps the notice).
  | "stat-type"
  | "stat-edit"
  | "stat-menu"
  | "stat-res"
  | "table-setup"
  | "table-res";''')

# 3) the Range hint wording (the first genuine raise site lives in the Table app)
sub('''  "Range ERROR": "Check the input range for this function.",''',
    '''  "Range ERROR":
    "Check the range — Start ≤ End, Step ≠ 0, and the row limit (45 rows for f(x) or g(x), 30 for both).",''')

# 4) session state (after menuCursor)
sub('''  const [menuCursor, setMenuCursor] = useState(0);''',
    '''  const [menuCursor, setMenuCursor] = useState(0);
  // ── phase C: the Statistics/Table session state. In-memory per the
  // device's retention table (launching another app discards the data;
  // the f/g defining equations stay in the persisted record they
  // already live in — the manual's own retention table).
  const [statKind, setStatKind] = useState<"1var" | "2var">("1var");
  const [statList, setStatList] = useState<{ x: string[]; y: string[] }>({ x: [], y: [] });
  const [statCell, setStatCell] = useState<{ col: 0 | 1; row: number }>({ col: 0, row: 0 });
  const [statEntry, setStatEntry] = useState("");
  const [statRes, setStatRes] = useState<Stat1Var | Stat2Var | null>(null);
  const [statReg, setStatReg] = useState<{ a: CalcValue; b: CalcValue; r: CalcValue } | null>(null);
  const [statTypeCursor, setStatTypeCursor] = useState(0);
  const [statMenuCursor, setStatMenuCursor] = useState(0);
  const [tableType, setTableType] = useState<TableType>("fg");
  const [tableRange, setTableRange] = useState<{ start: string; end: string; step: string }>({ start: "", end: "", step: "" });
  const [tableField, setTableField] = useState<"start" | "end" | "step">("start");
  const [tableRows, setTableRows] = useState<{ x: CalcValue; f: CalcValue | null; g: CalcValue | null }[] | null>(null);
  const [appError, setAppError] = useState<string | null>(null);

  /** the manual's editor row caps: 160 rows for one column, 80 for two. */
  const STAT_MAX_ROWS: Record<"1var" | "2var", number> = { "1var": 160, "2var": 80 };

  const openStatEditor = (kind: "1var" | "2var") => {
    setStatKind(kind);
    setStatCell({ col: 0, row: 0 });
    setStatEntry("");
    setStatRes(null);
    setStatReg(null);
    setAppError(null);
    setScreen("stat-edit");
  };

  /** EXE on the editor: the entry commits (the cursor advances down —
   * the device's registration law); an empty line opens the results
   * menu (the device's post-editor menu). */
  const commitStatCell = () => {
    setAppError(null);
    if (!statEntry) return;
    try {
      statEntryToValue(statEntry);
    } catch {
      setAppError("Syntax ERROR");
      return;
    }
    if (statCell.row >= STAT_MAX_ROWS[statKind]) {
      setAppError("Range ERROR");
      return;
    }
    const col = statCell.col === 0 ? "x" : "y";
    setStatList((l) => {
      const next = [...l[col]];
      next[statCell.row] = statEntry;
      return { ...l, [col]: next };
    });
    setStatEntry("");
    setStatCell((c) => ({ ...c, row: c.row + 1 }));
  };

  /** the manual's editor law: DEL on the cursor row deletes the row
   * (with entry text it backspaces instead — routed in keyDefPress). */
  const deleteStatRow = () => {
    const col = statCell.col === 0 ? "x" : "y";
    setStatList((l) => ({ ...l, [col]: l[col].filter((_, i) => i !== statCell.row) }));
    setStatCell((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
    setStatEntry("");
  };

  const runStatResults = (which: "1var" | "2var" | "reg") => {
    setAppError(null);
    try {
      const xs = statList.x.map(statEntryToValue);
      if (which === "1var") {
        setStatRes(stat1Var(xs));
        setStatReg(null);
      } else {
        const ys = statList.y.map(statEntryToValue);
        const r2 = stat2Var(xs, ys);
        if (which === "reg") {
          if (!r2.reg) throw new CalcError("Math ERROR");
          setStatRes(null);
          setStatReg(r2.reg);
        } else {
          setStatRes(r2);
          setStatReg(null);
        }
      }
      setScreen("stat-res");
    } catch (e) {
      if (e instanceof CalcError) setAppError(e.cls);
      else throw e;
    }
  };

  const statMenuItems = () => {
    const items: { label: string; run: () => void }[] = [];
    if (statKind === "1var") items.push({ label: "1-Var Results", run: () => runStatResults("1var") });
    else {
      items.push({ label: "2-Var Results", run: () => runStatResults("2var") });
      items.push({ label: "Reg Results", run: () => runStatResults("reg") });
    }
    items.push({ label: "Back to editor", run: () => setScreen("stat-edit") });
    return items;
  };

  /** the results rows in the manual's CATALOG grouping order
   * (Summation → Mean/Var/Dev → Min/Max/Quartile) — OUR presentation
   * ruling; the value set is the manual's own. A null s²/s row is the
   * honest "Math ERROR" (n < 2 — the (n−1) denominator). */
  const statValueRows = (res: Stat1Var | Stat2Var): { label: string; v: CalcValue | null; aria: string }[] => [
    { label: "Σx", v: res.sumX, aria: "sum x" },
    { label: "Σx²", v: res.sumX2, aria: "sum x squared" },
    { label: "x̄", v: res.xBar, aria: "x mean" },
    { label: "σ²x", v: res.sig2X, aria: "population variance x" },
    { label: "σx", v: res.sigX, aria: "population std dev x" },
    { label: "s²x", v: res.s2X, aria: "sample variance x" },
    { label: "sx", v: res.sX, aria: "sample std dev x" },
    { label: "n", v: res.n, aria: "n" },
    { label: "min(x)", v: res.minX, aria: "min x" },
    { label: "Q1", v: res.q1, aria: "Q1" },
    { label: "Med", v: res.med, aria: "median" },
    { label: "Q3", v: res.q3, aria: "Q3" },
    { label: "max(x)", v: res.maxX, aria: "max x" },
    ...("sumY" in res
      ? [
          { label: "Σy", v: res.sumY, aria: "sum y" },
          { label: "Σy²", v: res.sumY2, aria: "sum y squared" },
          { label: "ȳ", v: res.yBar, aria: "y mean" },
          { label: "σ²y", v: res.sig2Y, aria: "population variance y" },
          { label: "σy", v: res.sigY, aria: "population std dev y" },
          { label: "s²y", v: res.s2Y, aria: "sample variance y" },
          { label: "sy", v: res.sY, aria: "sample std dev y" },
          { label: "min(y)", v: res.minY, aria: "min y" },
          { label: "max(y)", v: res.maxY, aria: "max y" },
          { label: "Σxy", v: res.sumXY, aria: "sum xy" },
        ]
      : []),
  ];

  /** the Table app's generation — the manual's range flow. The table
   * evaluates REAL-valued (complex: false — a complex cell value is the
   * honest Math ERROR); the manual's side-effect law (generation
   * changes variable x) stores the last x into the engine's store. */
  const executeTable = () => {
    setAppError(null);
    if (!tableRange.start || !tableRange.end || !tableRange.step) {
      setAppError("Range ERROR");
      return;
    }
    try {
      const start = statEntryToValue(tableRange.start);
      const end = statEntryToValue(tableRange.end);
      const step = statEntryToValue(tableRange.step);
      const t = buildNumberTable(state.fns, tableType, start, end, step, {
        angle: state.angle,
        ans: state.ans,
        vars: state.vars,
        complex: false,
      });
      setTableRows(t.rows);
      setState((s2) => ({ ...s2, vars: { ...s2.vars, x: t.lastX } }));
      setScreen("table-res");
    } catch (e) {
      if (e instanceof CalcError) setAppError(e.cls);
      else throw e;
    }
  };''')

# 5) launchApp
sub('''  const launchApp = (name: string, label: string) => {
    if (name === "calculate" && model.implementedApps.includes("calculate")) {
      setScreen("calc");
      return;
    }
    // the staged-rollout notice — MG's own captured pattern (the chase
    // card's live probes); it doubles as our exam-honest fence
    setNoticeApp(label);
    setScreen("notice");
  };''',
    '''  const launchApp = (name: string, label: string) => {
    if (name === "calculate" && model.implementedApps.includes("calculate")) {
      setScreen("calc");
      return;
    }
    // phase C: Statistics/Table launch into their app screens (the
    // manual's flows). The session data resets here per the device's
    // retention table (① returning to HOME and launching another app
    // discards the data; the f/g defining equations are retained).
    if (name === "statistics" && model.implementedApps.includes("statistics")) {
      openStatEditorProbe();
      return;
    }
    if (name === "table" && model.implementedApps.includes("table")) {
      setTableRange({ start: "", end: "", step: "" });
      setTableField("start");
      setTableRows(null);
      setAppError(null);
      setScreen("table-setup");
      return;
    }
    // the staged-rollout notice — MG's own captured pattern (the chase
    // card's live probes); it doubles as our exam-honest fence
    setNoticeApp(label);
    setScreen("notice");
  };

  /** the Statistics launch: the type menu first (the manual's flow). */
  const openStatEditorProbe = () => {
    setStatList({ x: [], y: [] });
    setStatCell({ col: 0, row: 0 });
    setStatEntry("");
    setStatRes(null);
    setStatReg(null);
    setAppError(null);
    setStatTypeCursor(0);
    setScreen("stat-type");
  };''')

# 6) handleDial — insert the new screens before the notice line
sub('''    if (screen === "notice" && d === "ok") setScreen("home");
  };''',
    '''    if (screen === "stat-type") {
      if (d === "up" || d === "down") setStatTypeCursor((c) => (c + 1) % 2);
      else if (d === "ok") openStatEditor(statTypeCursor === 0 ? "1var" : "2var");
      return;
    }
    if (screen === "stat-edit") {
      const len = statCell.col === 0 ? statList.x.length : statList.y.length;
      if (d === "up") setStatCell((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
      else if (d === "down") setStatCell((c) => ({ ...c, row: Math.min(c.row + 1, len) }));
      else if (d === "left") setStatCell((c) => ({ ...c, col: 0 }));
      else if (d === "right" && statKind === "2var") setStatCell((c) => ({ ...c, col: 1 }));
      else if (d === "ok") {
        if (statEntry) commitStatCell();
        else setScreen("stat-menu");
      }
      return;
    }
    if (screen === "stat-menu") {
      const items = statMenuItems();
      if (d === "up") setStatMenuCursor((c) => (c + items.length - 1) % items.length);
      else if (d === "down") setStatMenuCursor((c) => (c + 1) % items.length);
      else if (d === "ok") items[statMenuCursor].run();
      return;
    }
    if (screen === "table-setup") {
      if (d === "left") setTableField((f) => (f === "step" ? "end" : "start"));
      else if (d === "right") setTableField((f) => (f === "start" ? "end" : "step"));
      else if (d === "ok") executeTable();
      return;
    }
    if (screen === "notice" && d === "ok") setScreen("home");
  };''')

# 7) keyDefPress — the entry interception on the stat/table screens
sub('''  const keyDefPress = (def: KeyDef) => {
    const ovr = shiftOverrideKey(def);
    if (ovr) {
      press(ovr);
      return;
    }''',
    '''  const keyDefPress = (def: KeyDef) => {
    // phase C: the Statistics editor and the Table range fields take
    // over the keypad's entry column (the device's per-app entry line);
    // the dial (arrows/OK) still routes through handleDial.
    if (!def.shell && !def.dial && typeof def.key === "object") {
      const k = def.key as CalcKey;
      if (screen === "stat-edit") {
        if (k.k === "digit") {
          setStatEntry((s) => (s.length < 12 ? s + k.d : s));
          return;
        }
        if (k.k === "neg") {
          setStatEntry((s) => (s.startsWith("-") ? s.slice(1) : "-" + s));
          return;
        }
        if (k.k === "del") {
          if (statEntry) setStatEntry((s) => s.slice(0, -1));
          else deleteStatRow(); // the manual's DEL law on the cursor row
          return;
        }
        if (k.k === "eq") {
          if (statEntry) commitStatCell();
          else setScreen("stat-menu");
          return;
        }
        if (k.k === "ac") {
          setStatEntry("");
          return;
        }
        return; // the editor uses only the entry column (the rest inert)
      }
      if (screen === "table-setup") {
        if (k.k === "digit") {
          setTableRange((r) => ({ ...r, [tableField]: r[tableField].length < 12 ? { ...r, [tableField]: r[tableField] + k.d } : r }));
          return;
        }
        if (k.k === "neg") {
          setTableRange((r) => ({ ...r, [tableField]: r[tableField].startsWith("-") ? r[tableField].slice(1) : "-" + r[tableField] }));
          return;
        }
        if (k.k === "del") {
          setTableRange((r) => ({ ...r, [tableField]: r[tableField].slice(0, -1) }));
          return;
        }
        if (k.k === "eq") {
          executeTable();
          return;
        }
        if (k.k === "ac") {
          setTableRange((r) => ({ ...r, [tableField]: "" }));
          return;
        }
        return;
      }
    }
    const ovr = shiftOverrideKey(def);
    if (ovr) {
      press(ovr);
      return;
    }''')

open(P, "w", encoding="utf-8").write(s)
print("part 1 OK (imports/union/state/launch/dial/keys)")
