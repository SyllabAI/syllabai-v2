/**
 * calc-engine.ts — T-MG-CALC run-001: the exam calculator ENGINE of record.
 *
 * A pure, zero-React, zero-DOM model of the Casio fx-83GT CW ClassWiz —
 * the NON-programmable scientific the UK GCSE trains on (the reverse-
 * engineering receipt on the task card: mathsgenie.co.uk exposes NO
 * calculator logged-out, so this models the device MG's ecosystem
 * trains students on, plus the UI conventions extracted in prior lanes).
 *
 * EXAM HONESTY (card L2): no history beyond the live Ans chain, no
 * persistence, no solver/CAS/graphing/STAT/QR, nothing leaves the
 * client, nothing touches localStorage. Everything here is deterministic
 * and pinned in calc-engine.test.ts.
 *
 * THE RATIONAL CORE (card L4, amended 2026-11-15 — see the task card
 * amendment note): evaluation carries EXACT BigInt rationals through
 * + − × ÷ integer-exponent ^ and the rational unary post-fixes, and
 * falls to double precision the moment an irrational op (trig, log, ln,
 * √ on a non-square, ³√ irrational, float Ans) enters. The DISPLAY law
 * follows the real device: an exact rational result renders as its
 * reduced fraction BY DEFAULT (1÷3 = shows "1/3"), and S⇔D converts to
 * the 10-significant-digit decimal whenever an exact form exists; with
 * no exact form the key is INERT (the Casio law — pinned). The card's
 * original §3 example ("1÷3 → 0.3333333333") contradicted its own L4
 * rule; the device wins, the decimal is the S⇔D form, and the pins
 * cover both.
 *
 * ERROR CLASSES (card L5): exactly the Casio pair — "Syntax ERROR" for
 * malformed structure, "Math ERROR" for domain/overflow/÷0.
 */

// (no self-import — removed; the types below are local)

/** Angle modes of the SETUP screen. GRA = gon (90° = 100 gon). */
export type CalcAngle = "DEG" | "RAD" | "GRA";

/** The one-shot modifier states (Casio law: SHIFT/hyp are one-shot). */
export interface CalcMods {
  shift: boolean;
  hyp: boolean;
}

/** A fraction input atom (the a b/c template): two live fields. */
export interface CalcFracAtom {
  kind: "frac";
  n: string;
  d: string;
}

/** One atom of the linear input buffer (Casio's token buffer). */
export type CalcAtom =
  | { kind: "num"; text: string }
  | { kind: "op"; op: "+" | "-" | "×" | "÷" }
  | { kind: "pow" }
  | { kind: "postfix"; op: "²" | "³" | "⁻¹" | "%" }
  | { kind: "fn"; name: string } // opens an implicit "(" — sin( ln( √( ³√( 10^( e^( asin( sinh( …
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "const"; name: "π" | "e" }
  | { kind: "ans" }
  | CalcFracAtom;

export interface CalcState {
  /** The linear input buffer, exactly as the device's cursor line. */
  buf: CalcAtom[];
  /** Cursor position in atoms (0..buf.length); inside-atom cursors live
   * on the frac fields / number tails (the fracCursor field below). */
  cur: number;
  /** When the cursor sits INSIDE a fraction atom: which field. */
  fracField: "n" | "d" | null;
  /** Last committed result (exact when rational). */
  ans: CalcValue | null;
  /** The '=' committed display (kept so S⇔D/ENG can re-render it). */
  result: CalcValue | null;
  /** What the display line shows: the buffer, the committed result, or
   * an error. */
  shown: "input" | "result" | "error";
  /** The committed display's form (S⇔D toggles; only when exact). */
  resultForm: "fraction" | "decimal" | "eng";
  angle: CalcAngle;
  /** Fixed decimal places (0 = off — the natural display). */
  fix: number;
  mods: CalcMods;
  error: "Syntax ERROR" | "Math ERROR" | null;
}

/**
 * A computed value: EXACT rational when the computation stayed rational
 * (BigInt pair, d > 0, reduced), double otherwise. This is the honesty
 * core: 1÷3 is EXACTLY 1/3, not 0.333…, until S⇔D asks for the decimal.
 */
export type CalcValue =
  | { exact: true; n: bigint; d: bigint }
  | { exact: false; v: number };

/** The engine's public key vocabulary (the component's keypad maps 1:1). */
export type CalcKey =
  | { k: "digit"; d: string }
  | { k: "op"; op: "+" | "-" | "×" | "÷" }
  | { k: "paren"; p: "(" | ")" }
  | { k: "sq" }
  | { k: "cube" }
  | { k: "pow" }
  | { k: "recip" }
  | { k: "sqrt" }
  | { k: "cbrt" }
  | { k: "log" }
  | { k: "ln" }
  | { k: "pow10" }
  | { k: "exp" }
  | { k: "trig"; f: "sin" | "cos" | "tan" }
  | { k: "frac" }
  | { k: "pi" }
  | { k: "econst" }
  | { k: "pct" }
  | { k: "ans" }
  | { k: "sd" }
  | { k: "eng" }
  | { k: "neg" }
  | { k: "del" }
  | { k: "ac" }
  | { k: "eq" }
  | { k: "left" }
  | { k: "right" }
  | { k: "shift" }
  | { k: "hyp" }
  | { k: "mode" }
  // the SETUP screen's own selections (the component's chips map here)
  | { k: "setup-angle"; angle: CalcAngle }
  | { k: "setup-fix"; fix: number };

// ── rational helpers (BigInt; the exactness core) ─────────────────────

function gcd(a: bigint, b: bigint): bigint {
  a = a < BigInt(0) ? -a : a;
  b = b < BigInt(0) ? -b : b;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function rat(n: bigint, d: bigint = BigInt(1)): CalcValue {
  if (d === BigInt(0)) throw new CalcError("Math ERROR");
  if (d < BigInt(0)) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || BigInt(1);
  return { exact: true, n: n / g, d: d / g };
}

function ratFromNumber(x: number): CalcValue {
  // exact integers ride as rationals (14-digit safety: a float this clean
  // is an integer of the computation, not noise)
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return rat(BigInt(x));
  // the device's exact half-turns: a float EQUAL to p/q with a SMALL
  // denominator (the L4 3-digit rule) is that rational — sin 30° = 1/2,
  // never a giant binary fraction or a decimal. Non-exact floats
  // (π, e, 1/3-as-double) find NO exact match and stay float.
  if (Number.isFinite(x)) {
    for (let q = 2; q <= 999; q++) {
      const p = x * q;
      if (Number.isInteger(p) && Math.abs(p) < 1e15 && p / q === x) return rat(BigInt(p), BigInt(q));
    }
  }
  return { exact: false, v: x };
}

function toNumber(v: CalcValue): number {
  return v.exact ? Number(v.n) / Number(v.d) : v.v;
}

function ratAdd(a: CalcValue, b: CalcValue): CalcValue {
  if (!a.exact || !b.exact) return ratFromNumber(toNumber(a) + toNumber(b));
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

function ratSub(a: CalcValue, b: CalcValue): CalcValue {
  if (!a.exact || !b.exact) return ratFromNumber(toNumber(a) - toNumber(b));
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

function ratMul(a: CalcValue, b: CalcValue): CalcValue {
  if (!a.exact || !b.exact) return ratFromNumber(toNumber(a) * toNumber(b));
  return rat(a.n * b.n, a.d * b.d);
}

function ratDiv(a: CalcValue, b: CalcValue): CalcValue {
  if (!b.exact && b.v === 0) throw new CalcError("Math ERROR");
  if (b.exact && b.n === BigInt(0)) throw new CalcError("Math ERROR");
  if (!a.exact || !b.exact) return ratFromNumber(toNumber(a) / toNumber(b));
  return rat(a.n * b.d, a.d * b.n);
}

function ratPow(a: CalcValue, b: CalcValue): CalcValue {
  // exact ONLY for integer exponents in range; otherwise the honest float
  const bv = toNumber(b);
  if (b.exact && Number.isInteger(bv) && Math.abs(bv) <= 512) {
    const e = Number(bv);
    if (!a.exact) return ratFromNumber(Math.pow(a.v, e));
    let n = BigInt(1);
    let d = BigInt(1);
    const baseN = a.n;
    const baseD = a.d;
    for (let i = 0; i < Math.abs(e); i++) {
      n *= baseN;
      d *= baseD;
    }
    return rat(e >= 0 ? n : d, e >= 0 ? d : n);
  }
  return ratFromNumber(Math.pow(toNumber(a), bv));
}

/** The Casio error — exactly the two display classes. */
export class CalcError extends Error {
  readonly cls: "Syntax ERROR" | "Math ERROR";
  constructor(cls: "Syntax ERROR" | "Math ERROR") {
    super(cls);
    this.cls = cls;
  }
}

// ── state constructors ────────────────────────────────────────────────

export function initialCalcState(angle: CalcAngle = "DEG"): CalcState {
  return {
    buf: [],
    cur: 0,
    fracField: null,
    ans: null,
    result: null,
    shown: "input",
    resultForm: "fraction",
    angle,
    fix: 0,
    mods: { shift: false, hyp: false },
    error: null,
  };
}

// ── buffer editing (the cursor semantics) ─────────────────────────────

type Insertable = CalcAtom | "digit-into-current";

function needsImplicitMul(prev: CalcAtom | undefined, next: CalcAtom): boolean {
  if (!prev) return false;
  const prevCloses = prev.kind === "num" || prev.kind === "const" || prev.kind === "ans" || prev.kind === "rparen" || prev.kind === "postfix" || prev.kind === "frac";
  const nextOpens = next.kind === "lparen" || next.kind === "fn" || next.kind === "const" || next.kind === "ans" || next.kind === "num" || next.kind === "frac";
  return prevCloses && nextOpens;
}

/** The atom the cursor would extend when a digit lands. */
function currentEditableAtom(state: CalcState): CalcAtom | undefined {
  if (state.fracField) {
    const at = state.buf[state.cur];
    return at && at.kind === "frac" ? at : undefined;
  }
  const at = state.buf[state.cur - 1];
  return at && at.kind === "num" ? at : undefined;
}

/**
 * pressKey — the pure state machine. EVERY law above funnels through
 * here; the component never edits the state directly.
 */
export function pressKey(prev: CalcState, key: CalcKey): CalcState {
  let s: CalcState = prev;
  const mods = { ...prev.mods };

  // one-shot modifiers first
  if (key.k === "shift") return { ...s, mods: { shift: !mods.shift, hyp: mods.hyp } };
  if (key.k === "hyp") return { ...s, mods: { shift: mods.shift, hyp: !mods.hyp } };

  // the SETUP screen selections (wired from the component's chips)
  if (key.k === "setup-angle") return { ...s, angle: key.angle, mods: { shift: false, hyp: false } };
  if (key.k === "setup-fix") return { ...s, fix: key.fix, mods: { shift: false, hyp: false } };

  const consume = (st: CalcState): CalcState => ({ ...st, mods: { shift: false, hyp: false } });

  // ── result-display keys (S⇔D / ENG act on the committed value) ──
  if (key.k === "sd") {
    if (s.shown !== "result" || !s.result) return consume(s);
    // Casio law: S⇔D is INERT when no exact alternative form exists
    if (!s.result.exact) return consume(s);
    const nextForm = s.resultForm === "fraction" ? "decimal" : "fraction";
    return consume({ ...s, resultForm: nextForm });
  }
  if (key.k === "eng") {
    if (s.shown !== "result" || !s.result) return consume(s);
    const v = toNumber(s.result);
    if (!Number.isFinite(v) || v === 0) return consume(s);
    return consume({ ...s, resultForm: s.resultForm === "eng" ? "decimal" : "eng" });
  }

  // ── AC: clears the buffer + error, Ans SURVIVES (Casio law) ──
  if (key.k === "ac") {
    return consume({
      ...initialCalcState(s.angle),
      fix: s.fix,
      ans: s.ans,
      mods: { shift: false, hyp: false },
    });
  }

  // ── after '=': digits/constants/functions start FRESH input; operators
  // continue from Ans (the Casio continuation law) ──
  let continueFromAns = false;
  if (s.shown === "result" || s.shown === "error") {
    const continues = key.k === "op" || key.k === "pct";
    continueFromAns = continues;
    s = {
      ...s,
      buf: continues && s.ans ? [{ kind: "ans" }] : [],
      cur: continues && s.ans ? 1 : 0,
      fracField: null,
      shown: "input",
      error: null,
    };
  }

  const buf = s.buf.map((a) => ({ ...a }));
  let cur = Math.min(s.cur, buf.length);
  let fracField = s.fracField;
  let shown: CalcState["shown"] = "input";

  // Casio: an operator/fn/paren press while INSIDE the a b/c template
  // auto-commits it — the insert point exits to AFTER the fraction.
  // (digit/del/left/right manage the frac cursor themselves.)
  if (fracField && key.k !== "digit" && key.k !== "del" && key.k !== "left" && key.k !== "right") {
    cur += 1;
    fracField = null;
  }

  switch (key.k) {
    case "digit": {
      const editable = currentEditableAtom({ ...s, buf, cur, fracField });
      if (editable && editable.kind === "num") {
        // Casio: a number token holds up to 15 chars; '.' once
        if (editable.text.length >= 15) break;
        if (key.d === "." && editable.text.includes(".")) break;
        editable.text += key.d;
        cur = buf.indexOf(editable) + 1;
        break;
      }
      if (editable && editable.kind === "frac") {
        const field = fracField ?? "n";
        if (editable[field].length >= 15) break;
        if (key.d === "." && editable[field].includes(".")) break;
        editable[field] += key.d;
        break;
      }
      const atom: CalcAtom = { kind: "num", text: key.d };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "op": {
      const atom: CalcAtom = { kind: "op", op: key.op };
      // a leading operator lands on the empty buffer — Casio shows it and
      // it evaluates from Ans (or Syntax ERROR when no Ans exists)
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "paren": {
      const atom: CalcAtom = key.p === "(" ? { kind: "lparen" } : { kind: "rparen" };
      if (needsImplicitMul(buf[cur - 1], atom) && key.p === "(") buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "sq":
    case "cube":
    case "recip":
    case "pct": {
      const op: "²" | "³" | "⁻¹" | "%" = key.k === "sq" ? "²" : key.k === "cube" ? "³" : key.k === "recip" ? "⁻¹" : "%";
      buf.splice(cur, 0, { kind: "postfix", op });
      cur += 1;
      fracField = null;
      break;
    }
    case "pow": {
      buf.splice(cur, 0, { kind: "pow" });
      cur += 1;
      fracField = null;
      break;
    }
    case "sqrt":
    case "cbrt":
    case "log":
    case "ln":
    case "pow10":
    case "exp":
    case "trig": {
      // SHIFT one-shot: trig → arcsin/… (the CW SHIFT law)
      let name: string;
      if (key.k === "trig") {
        name = mods.shift ? "a" + key.f : mods.hyp ? "h" + key.f : key.f;
        if (mods.shift && mods.hyp) name = "ha" + key.f; // arc-hyperbolic
      } else {
        name = key.k === "sqrt" ? "√" : key.k === "cbrt" ? "³√" : key.k === "log" ? "log" : key.k === "ln" ? "ln" : key.k === "pow10" ? "10^" : "e^";
      }
      buf.splice(cur, 0, { kind: "fn", name });
      cur += 1;
      fracField = null;
      break;
    }
    case "pi":
    case "econst":
    case "ans": {
      const atom: CalcAtom = key.k === "pi" ? { kind: "const", name: "π" } : key.k === "econst" ? { kind: "const", name: "e" } : { kind: "ans" };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      cur += 1;
      fracField = null;
      break;
    }
    case "frac": {
      const atom: CalcAtom = { kind: "frac", n: "", d: "" };
      if (needsImplicitMul(buf[cur - 1], atom)) buf.splice(cur, 0, { kind: "op", op: "×" }), (cur += 1);
      buf.splice(cur, 0, atom);
      // the cursor drops INTO the numerator (Casio): while fracField is
      // set, `cur` indexes the frac ATOM itself, not the insert point
      fracField = "n";
      break;
    }
    case "neg": {
      // Casio (+/-): a negation enters as the minus op at the cursor
      buf.splice(cur, 0, { kind: "op", op: "-" });
      cur += 1;
      fracField = null;
      break;
    }
    case "del": {
      if (fracField) {
        const at = buf[cur];
        if (at && at.kind === "frac") {
          const field = fracField;
          if (at[field].length > 0) at[field] = at[field].slice(0, -1);
          else if (field === "d") fracField = "n";
        }
        break;
      }
      if (cur === 0) break;
      const at = buf[cur - 1];
      if (at.kind === "num" && at.text.length > 1) at.text = at.text.slice(0, -1);
      else {
        buf.splice(cur - 1, 1);
        cur -= 1;
      }
      break;
    }
    case "left": {
      if (fracField) {
        // inside a fraction: ◀ moves d → n, then OUT to its left
        const at = buf[cur];
        if (at && at.kind === "frac" && fracField === "d") {
          fracField = "n";
          break;
        }
        fracField = null; // exiting left: cur stays ON the atom
        break;
      }
      const prev = buf[cur - 1];
      if (prev && prev.kind === "frac" && prev.n === "" && prev.d === "") {
        cur -= 1;
        fracField = "n";
        break;
      }
      if (cur > 0) cur -= 1;
      break;
    }
    case "right": {
      if (fracField) {
        const at = buf[cur];
        if (at && at.kind === "frac" && fracField === "n") {
          fracField = "d";
          break;
        }
        fracField = null;
        cur += 1; // exiting right: the insert point moves PAST the atom
        break;
      }
      const at = buf[cur];
      if (at && at.kind === "frac") {
        if (at.n === "") {
          fracField = "n"; // ▶ onto a fresh template enters the numerator
          break;
        }
        cur += 1;
        break;
      }
      if (cur < buf.length) cur += 1;
      break;
    }
    case "eq": {
      // the device: '=' on an EMPTY buffer is a no-op (no error)
      if (buf.length === 0) return consume(s);
      try {
        const v = evaluateAtoms(buf, s.angle, s.ans);
        const result: CalcValue = clampDevice(v);
        shown = "result";
        return consume({
          ...s,
          buf,
          cur,
          fracField: null,
          ans: result,
          result,
          shown,
          resultForm: "fraction",
          error: null,
        });
      } catch (err) {
        if (err instanceof CalcError) {
          return consume({ ...s, buf, cur, fracField: null, shown: "error", error: err.cls });
        }
        throw err;
      }
    }
    default:
      break;
  }

  void continueFromAns;
  return consume({ ...s, buf, cur, fracField, shown: "input", error: null });
}

/**
 * The device limit (the fx-83GT CW computes to ±9.999…×10⁹⁹): beyond it
 * the real hardware shows Math ERROR — pinned honesty, not silent inf.
 */
function clampDevice(v: CalcValue): CalcValue {
  const x = toNumber(v);
  if (!Number.isFinite(x) || Math.abs(x) >= 1e100) throw new CalcError("Math ERROR");
  return v;
}

// ── evaluation: tokenizer-free recursive descent over the atoms ───────

type AtomCursor = { at: number };

export function evaluateAtoms(buf: CalcAtom[], angle: CalcAngle, ans: CalcValue | null): CalcValue {
  const padded = padAutoClose(buf);
  const c: AtomCursor = { at: 0 };
  const v = parseExpr(padded, c, angle, ans, null);
  if (c.at !== padded.length) throw new CalcError("Syntax ERROR");
  return v;
}

/**
 * Casio: unclosed parens auto-close at '=' — sin(30 = is 1/2, (1+2 =
 * is 3. A stray ')' that closes NOTHING is a Syntax ERROR (pinned).
 */
function padAutoClose(buf: CalcAtom[]): CalcAtom[] {
  let depth = 0;
  for (const a of buf) {
    if (a.kind === "fn" || a.kind === "lparen") depth += 1;
    else if (a.kind === "rparen") {
      depth -= 1;
      if (depth < 0) throw new CalcError("Syntax ERROR");
    }
  }
  if (depth === 0) return buf;
  return [...buf, ...Array.from({ length: depth }, () => ({ kind: "rparen" as const }))];
}

function peek(buf: CalcAtom[], c: AtomCursor): CalcAtom | undefined {
  return buf[c.at];
}

/** implicit multiplication: 2π, 3(, )(, )sin(, Ans(, ½π — the Casio law. */
function implicitMul(a: CalcAtom | undefined, b: CalcAtom): boolean {
  if (!a) return false;
  const prevCloses = a.kind === "num" || a.kind === "const" || a.kind === "ans" || a.kind === "rparen" || a.kind === "postfix" || a.kind === "frac";
  const nextOpens = b.kind === "lparen" || b.kind === "fn" || b.kind === "const" || b.kind === "ans" || b.kind === "num" || b.kind === "frac";
  return prevCloses && nextOpens;
}

function parseExpr(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null, _p: null): CalcValue {
  let left = parseTerm(buf, c, angle, ans);
  for (;;) {
    const t = peek(buf, c);
    if (t && t.kind === "op" && (t.op === "+" || t.op === "-")) {
      c.at += 1;
      const rightStart = c.at;
      const right = parseTerm(buf, c, angle, ans);
      // ── the Casio % law: 50+10% = 55 — a % directly on the RIGHT
      // operand of ± makes it a fraction OF THE LEFT ──
      if (endsWithPct(buf, rightStart, c.at)) {
        // the % postfix ALREADY divided the right operand by 100; the ±
        // law reinterprets it as a fraction OF THE LEFT (50+10% = 55)
        const share = ratMul(left, right);
        left = t.op === "+" ? ratAdd(left, share) : ratSub(left, share);
      } else {
        left = t.op === "+" ? ratAdd(left, right) : ratSub(left, right);
      }
    } else break;
  }
  return left;
}

/** did the operand just parsed END with a % postfix (the ± context law)? */
function endsWithPct(buf: CalcAtom[], start: number, end: number): boolean {
  for (let i = end - 1; i >= start; i--) {
    const a = buf[i];
    if (a.kind === "postfix" && a.op === "%") return true;
    if (a.kind === "postfix" || a.kind === "rparen") continue;
    if (a.kind === "num" || a.kind === "const" || a.kind === "ans" || a.kind === "frac") return false;
    return false;
  }
  return false;
}

function parseTerm(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null): CalcValue {
  let left = parseUnary(buf, c, angle, ans);
  for (;;) {
    // implicit multiplication binds at term level: 2π, 3sin(, (1+2)(3)
    const t = peek(buf, c);
    if (t && implicitMul(buf[c.at - 1], t)) {
      const right = parseUnary(buf, c, angle, ans);
      left = ratMul(left, right);
      continue;
    }
    if (t && t.kind === "op" && (t.op === "×" || t.op === "÷")) {
      c.at += 1;
      const right = parseUnary(buf, c, angle, ans);
      left = t.op === "×" ? ratMul(left, right) : ratDiv(left, right);
      continue;
    }
    break;
  }
  return left;
}

function parseUnary(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null): CalcValue {
  const t = peek(buf, c);
  if (t && t.kind === "op" && t.op === "-") {
    c.at += 1;
    // Casio: −2² = −4 — the postfix binds TIGHTER than negation
    return ratMul(parsePostfix(buf, c, angle, ans), rat(-BigInt(1)));
  }
  if (t && t.kind === "op" && t.op === "+") {
    c.at += 1;
    return parseUnary(buf, c, angle, ans);
  }
  return parsePostfix(buf, c, angle, ans);
}

function parsePostfix(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null): CalcValue {
  let v = parsePower(buf, c, angle, ans);
  for (;;) {
    const t = peek(buf, c);
    if (t && t.kind === "postfix") {
      c.at += 1;
      if (t.op === "²") v = ratPow(v, rat(BigInt(2)));
      else if (t.op === "³") v = ratPow(v, rat(BigInt(3)));
      else if (t.op === "⁻¹") v = ratDiv(rat(BigInt(1)), v);
      else if (t.op === "%") v = ratDiv(v, rat(BigInt(100)));
      continue;
    }
    break;
  }
  return v;
}

function parsePower(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null): CalcValue {
  const base = parsePrimary(buf, c, angle, ans);
  const t = peek(buf, c);
  if (t && t.kind === "pow") {
    c.at += 1;
    // RIGHT-associative: 2^3^2 = 2^(3^2) = 512 (pinned Casio law)
    const exp = parseUnary(buf, c, angle, ans);
    return ratPow(base, exp);
  }
  return base;
}

function parsePrimary(buf: CalcAtom[], c: AtomCursor, angle: CalcAngle, ans: CalcValue | null): CalcValue {
  const t = peek(buf, c);
  if (!t) throw new CalcError("Syntax ERROR");
  if (t.kind === "num") {
    c.at += 1;
    const x = Number(t.text);
    if (!Number.isFinite(x)) throw new CalcError("Syntax ERROR");
    return ratFromNumber(x);
  }
  if (t.kind === "frac") {
    c.at += 1;
    if (t.n === "" || t.d === "") throw new CalcError("Syntax ERROR");
    const n = Number(t.n);
    const d = Number(t.d);
    if (!Number.isFinite(n) || !Number.isFinite(d)) throw new CalcError("Syntax ERROR");
    return rat(BigInt(truncDigits(t.n)), BigInt(truncDigits(t.d)));
  }
  if (t.kind === "const") {
    c.at += 1;
    return t.name === "π" ? { exact: false, v: Math.PI } : { exact: false, v: Math.E };
  }
  if (t.kind === "ans") {
    c.at += 1;
    if (!ans) throw new CalcError("Syntax ERROR");
    return ans;
  }
  if (t.kind === "lparen") {
    c.at += 1;
    const v = parseExpr(buf, c, angle, ans, null);
    const close = peek(buf, c);
    if (!close || close.kind !== "rparen") throw new CalcError("Syntax ERROR");
    c.at += 1;
    return v;
  }
  if (t.kind === "fn") {
    c.at += 1;
    // the fn opens an implicit paren; the argument runs to its matching )
    const arg = parseExpr(buf, c, angle, ans, null);
    const close = peek(buf, c);
    if (!close || close.kind !== "rparen") throw new CalcError("Syntax ERROR");
    c.at += 1;
    return applyFn(t.name, arg, angle);
  }
  throw new CalcError("Syntax ERROR");
}

function truncDigits(s: string): string {
  // BigInt ctor safety: integers only in fraction fields (Casio's a b/c
  // takes integers); a '.' is a Syntax ERROR at eval.
  if (!/^-?\d+$/.test(s)) throw new CalcError("Syntax ERROR");
  if (s.length > 15) throw new CalcError("Math ERROR");
  return s;
}

function applyFn(name: string, x: CalcValue, angle: CalcAngle): CalcValue {
  const v = toNumber(x);
  const toRad = (a: number): number => (angle === "DEG" ? (a * Math.PI) / 180 : angle === "GRA" ? (a * Math.PI) / 200 : a);
  const fromRad = (r: number): number => (angle === "DEG" ? (r * 180) / Math.PI : angle === "GRA" ? (r * 200) / Math.PI : r);
  switch (name) {
    case "sin": {
      const r = Math.sin(toRad(v));
      return ratFromNumber(snapTrig(r, angle, v, "sin"));
    }
    case "cos": {
      const r = Math.cos(toRad(v));
      return ratFromNumber(snapTrig(r, angle, v, "cos"));
    }
    case "tan": {
      const r = Math.tan(toRad(v));
      if (!Number.isFinite(r) || Math.abs(r) > 1e15) throw new CalcError("Math ERROR");
      return ratFromNumber(snapTrig(r, angle, v, "tan"));
    }
    case "asin": {
      if (v < -1 || v > 1) throw new CalcError("Math ERROR");
      return ratFromNumber(fromRad(Math.asin(v)));
    }
    case "acos": {
      if (v < -1 || v > 1) throw new CalcError("Math ERROR");
      return ratFromNumber(fromRad(Math.acos(v)));
    }
    case "atan":
      return ratFromNumber(fromRad(Math.atan(v)));
    case "hsin":
      return ratFromNumber(Math.sinh(v));
    case "hcos":
      return ratFromNumber(Math.cosh(v));
    case "htan": {
      const r = Math.tanh(v);
      return ratFromNumber(r);
    }
    case "hasin":
      return ratFromNumber(Math.asinh(v));
    case "hacos":
      if (v < 1) throw new CalcError("Math ERROR");
      return ratFromNumber(Math.acosh(v));
    case "hatan":
      return ratFromNumber(Math.atanh(Math.abs(v) < 1 ? v : NaN));
    case "log": {
      if (v <= 0) throw new CalcError("Math ERROR");
      return ratFromNumber(Math.log10(v));
    }
    case "ln": {
      if (v <= 0) throw new CalcError("Math ERROR");
      return ratFromNumber(Math.log(v));
    }
    case "√": {
      if (v < 0) throw new CalcError("Math ERROR");
      // exact when the argument is a perfect square (the rational core)
      if (x.exact) {
        const n = x.n;
        const d = x.d;
        const rn = bigintSqrt(n);
        const rd = bigintSqrt(d);
        if (rn !== null && rd !== null) return rat(rn, rd);
      }
      return ratFromNumber(Math.sqrt(v));
    }
    case "³√": {
      if (v < 0) return ratFromNumber(-Math.cbrt(-v));
      return ratFromNumber(Math.cbrt(v));
    }
    case "10^":
      return ratFromNumber(Math.pow(10, v));
    case "e^":
      return ratFromNumber(Math.exp(v));
    default:
      throw new CalcError("Syntax ERROR");
  }
}

function bigintSqrt(n: bigint): bigint | null {
  if (n < BigInt(0)) return null;
  if (n === BigInt(0)) return BigInt(0);
  let lo = BigInt(1);
  let hi = n;
  while (lo <= hi) {
    const mid = (lo + hi) / BigInt(2);
    const sq = mid * mid;
    if (sq === n) return mid;
    if (sq < n) lo = mid + BigInt(1);
    else hi = mid - BigInt(1);
  }
  return null;
}

/**
 * The trig snap: the device shows sin(30°) = 1/2, not 0.4999999999….
 * Inside the float path an EXACT half/quarter turn result snaps to the
 * rational the hardware displays (0, ±1/2, ±1); anything else stays float.
 */
function snapTrig(r: number, angle: CalcAngle, v: number, f: "sin" | "cos" | "tan"): number {
  if (angle !== "DEG") return r;
  const norm = ((v % 360) + 360) % 360;
  if (f === "sin") {
    if (norm === 0 || norm === 180) return 0;
    if (norm === 90) return 1;
    if (norm === 270) return -1;
    if (norm === 30 || norm === 150) return 0.5;
    if (norm === 210 || norm === 330) return -0.5;
  }
  if (f === "cos") {
    if (norm === 90 || norm === 270) return 0;
    if (norm === 0) return 1;
    if (norm === 180) return -1;
    if (norm === 60 || norm === 300) return 0.5;
    if (norm === 120 || norm === 240) return -0.5;
  }
  if (f === "tan") {
    if (norm === 0 || norm === 180) return 0;
    if (norm === 45 || norm === 225) return 1;
    if (norm === 135 || norm === 315) return -1;
  }
  return r;
}

// ── display: the 10-sig-digit formatter + fraction/ENG renderers ──────

const SIG_DIGITS = 10;

/** The decimal display: 10 significant digits, trailing zeros trimmed. */
export function formatDecimal(v: CalcValue, fix = 0): string {
  const x = toNumber(v);
  if (!Number.isFinite(x)) throw new CalcError("Math ERROR");
  if (x === 0) return fix > 0 ? (0).toFixed(fix) : "0";
  let out: string;
  if (fix > 0) out = x.toFixed(fix);
  else {
    out = x.toPrecision(SIG_DIGITS);
    if (out.includes("e")) {
      // toPrecision may go exponential; keep it honest and readable
      out = trimZeros(out);
    } else {
      out = trimZeros(out);
    }
  }
  return out;
}

function trimZeros(s: string): string {
  if (s.includes("e")) {
    const [m, e] = s.split("e");
    return `${m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m}e${e}`;
  }
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/**
 * The natural display of a committed value (card L4): exact rational →
 * "n/d" (reduced); float → the 10-sig decimal. ENG renders the decimal
 * as mantissa ×10^(multiple of 3) — the Casio engineering stepping.
 */
export function formatNatural(v: CalcValue, form: "fraction" | "decimal" | "eng", fix = 0): string {
  if (form === "fraction") {
    if (v.exact) {
      // an integer result renders PLAIN (5, never 5/1 — the device law)
      if (v.d === BigInt(1)) return `${v.n}`;
      return `${v.n}/${v.d}`;
    }
    return formatDecimal(v, fix);
  }
  if (form === "eng") {
    const x = toNumber(v);
    if (x === 0 || !Number.isFinite(x)) return formatDecimal(v, fix);
    const exp = Math.floor(Math.log10(Math.abs(x)) / 3) * 3;
    const mant = x / Math.pow(10, exp);
    const m = trimZeros(Number(mant.toPrecision(SIG_DIGITS)).toString());
    return exp === 0 ? m : `${m}×10^${exp}`;
  }
  return formatDecimal(v, fix);
}

/**
 * KaTeX for the input buffer (the component's preview line): textbook
 * rendering — \frac for fractions, \sqrt for roots, implicit × as
 * juxtaposition (the Casio display shows 2π, not 2×π).
 */
export function bufferToTex(buf: CalcAtom[]): string {
  let out = "";
  for (const a of buf) {
    switch (a.kind) {
      case "num":
        out += a.text;
        break;
      case "op":
        out += a.op === "×" ? " \\times " : a.op === "÷" ? " \\div " : a.op === "-" ? "-" : "+";
        break;
      case "pow":
        out += "^{";
        break;
      case "postfix":
        out += a.op === "²" ? "^{2}" : a.op === "³" ? "^{3}" : a.op === "⁻¹" ? "^{-1}" : "\\%";
        break;
      case "lparen":
        out += "(";
        break;
      case "rparen":
        out += ")";
        break;
      case "const":
        out += a.name === "π" ? "\\pi " : "\\mathrm{e} ";
        break;
      case "ans":
        out += "\\mathrm{Ans}";
        break;
      case "frac":
        out += `\\frac{${a.n || "\\square"}}{${a.d || "\\square"}}`;
        break;
      case "fn": {
        const tex = FN_TEX[a.name] ?? `\\mathrm{${a.name}}`;
        out += `${tex}(`;
        break;
      }
    }
  }
  // close the ^{ opened by pow (the exponent renders after the cursor)
  const opens = (out.match(/\^\{/g) || []).length - (out.match(/\^\{2\}|\^\{3\}|\^\{-1\}/g) || []).length;
  for (let i = 0; i < opens; i++) out += "}";
  return out;
}

const FN_TEX: Record<string, string> = {
  sin: "\\sin",
  cos: "\\cos",
  tan: "\\tan",
  asin: "\\sin^{-1}",
  acos: "\\cos^{-1}",
  atan: "\\tan^{-1}",
  hsin: "\\sinh",
  hcos: "\\cosh",
  htan: "\\tanh",
  hasin: "\\sinh^{-1}",
  hacos: "\\cosh^{-1}",
  hatan: "\\tanh^{-1}",
  log: "\\log",
  ln: "\\ln",
  "√": "\\sqrt",
  "³√": "\\sqrt[3]",
  "10^": "10^{",
  "e^": "\\mathrm{e}^{",
};
