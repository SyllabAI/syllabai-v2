/**
 * Title-grade TeX → plaintext (T-UGM-RENDER-2).
 *
 * 235 of the 628 UGM resource titles carry `$…$` math. The reader renders
 * titles through MathText (KaTeX MathML), but the tab/SEO surfaces —
 * generateMetadata's document.title — need PLAIN TEXT: Next 16 streams the
 * head and no MathML survives there, so the raw `$…$` string leaked into the
 * browser tab on all 235 pages (fresh sweep 2026-10-29, residual R2).
 *
 * The law is DETERMINISTIC and FAIL-CLOSED, keyed to the title census of
 * record (2026-10-29: 295 unique math segments, 35 distinct commands, all
 * titles ≤102 chars, all `$` balanced):
 *
 *   - `$` delimiters drop; segment bodies render as plaintext;
 *   - every command in the census maps to a fixed plaintext form below;
 *   - any command OUTSIDE the census survives verbatim — the fleet gate
 *     (ugm.render.test.ts title sweep) fails on any residual backslash
 *     command, so a future title with a new command forces a table update
 *     here first (no silent mangling, no silent leaks);
 *   - superscripts/subscripts keep the caret/underscore form (x^2, a_1 —
 *     honest ASCII, uniform; no partial unicode-superscript mixing), with
 *     parenthesisation exactly when the atom carries an operator
 *     (x^(n+1), 2^(3/2)) so precedence never misreads;
 *   - `^\circ` renders ° (degrees) while a bare `\circ` renders ∘
 *     (function composition — f ∘ g);
 *   - \mathbf is dropped (bold is not recoverable in plaintext — disclosed);
 *   - non-ASCII minus in the source (−) is byte-true, never re-typed.
 */

const GREEK: Record<string, string> = {
  alpha: "α",
  beta: "β",
  pi: "π",
  lambda: "λ",
  theta: "θ",
};

const FUNC_NAMES: Record<string, string> = {
  sin: "sin",
  cos: "cos",
  tan: "tan",
  cot: "cot",
  log: "log",
  ln: "ln",
  arctan: "arctan",
};

const SYMBOLS: Record<string, string> = {
  geq: "≥",
  leq: "≤",
  times: "×",
  to: "→",
  infty: "∞",
  circ: "∘",
  dots: "…",
  dotsb: "⋯",
  cdots: "⋯",
  lfloor: "⌊",
  rfloor: "⌋",
  colon: ":",
  sum: "∑",
  int: "∫",
};

/** A command atom that can ride directly on a ^ or _ without parentheses. */
function isSimpleAtom(s: string): boolean {
  return /^[A-Za-z0-9.\-−]+$/.test(s);
}

/** Parenthesise ^/_ atoms that carry an operator, so precedence never misreads. */
function needsParens(s: string): boolean {
  return /[+\s<>=/]/.test(s);
}

function resolveCommand(cmd: string): string | null {
  return GREEK[cmd] ?? FUNC_NAMES[cmd] ?? SYMBOLS[cmd] ?? null;
}

export function mathTitleToPlainText(title: string): string {
  if (!title.includes("$") && !title.includes("\\")) return title;
  let out = "";
  let i = 0;
  const n = title.length;

  /** Read a balanced {...} group starting at `start`; escapes honored. */
  const readGroup = (start: number): { body: string; end: number } | null => {
    if (title[start] !== "{") return null;
    let depth = 0;
    for (let j = start; j < n; j++) {
      const c = title[j];
      if (c === "\\") {
        j++;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return { body: title.slice(start + 1, j), end: j + 1 };
      }
    }
    return null; // unbalanced — caller falls back to verbatim handling
  };

  while (i < n) {
    const c = title[i];

    if (c === "$") {
      i++; // delimiter drops
      continue;
    }

    if (c === "\\") {
      const m = /^[a-zA-Z]+/.exec(title.slice(i + 1));
      if (!m) {
        const next = title[i + 1];
        if (next === "," || next === ";" || next === " ") {
          i += 2; // thin/medium space → drop (collapsed later)
          continue;
        }
        if (next === ":") {
          out += " ";
          i += 2;
          continue;
        }
        if (next !== undefined) {
          out += next; // escaped punctuation → the character itself
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      const cmd = m[0];
      i += 1 + cmd.length;
      // TeX spacing law: a control word consumes the whitespace that
      // terminates it — re-emit that space unless a braced argument
      // immediately follows (the argument is "attached").
      let consumedSpace = false;
      {
        let k = i;
        while (title[k] === " ") k++;
        const g = readGroup(k);
        if (g) {
          i = k; // look straight at the brace below
        } else if (title[i] === " ") {
          consumedSpace = true;
          i++;
        }
      }
      /** frac/tfrac/binom join: separate from a preceding number/letter so
       * 19\tfrac{3}{4} reads "19 3/4", never "193/4". */
      const joinSpace = () => {
        if (/[A-Za-z0-9]$/.test(out)) out += " ";
      };

      if (cmd === "left" || cmd === "right") {
        // keep the delimiter, drop the sizing command (\left( → (, \right| → |)
        const next = title[i];
        if (next === undefined || next === ".") continue;
        out += next === "{" ? "(" : next === "}" ? ")" : next;
        i++;
        continue;
      }
      if (cmd === "sqrt") {
        const g = readGroup(i);
        if (g) {
          out += "√(" + mathTitleToPlainText(g.body) + ")";
          i = g.end;
        } else {
          out += "√";
        }
        continue;
      }
      if (cmd === "frac" || cmd === "tfrac") {
        const a = readGroup(i);
        const b = a ? readGroup(a.end) : null;
        if (a && b) {
          const pa = mathTitleToPlainText(a.body);
          const pb = mathTitleToPlainText(b.body);
          joinSpace();
          out +=
            isSimpleAtom(pa) && isSimpleAtom(pb) ? `${pa}/${pb}` : `(${pa})/(${pb})`;
          i = b.end;
        } else {
          out += "\\" + cmd; // malformed — fail closed, the gate will flag it
        }
        continue;
      }
      if (cmd === "binom") {
        const a = readGroup(i);
        const b = a ? readGroup(a.end) : null;
        if (a && b) {
          joinSpace();
          out += `(${mathTitleToPlainText(a.body)} choose ${mathTitleToPlainText(b.body)})`;
          i = b.end;
        } else {
          out += "\\" + cmd;
        }
        continue;
      }
      if (cmd === "text" || cmd === "mathbf") {
        const g = readGroup(i);
        if (g) {
          out += mathTitleToPlainText(g.body); // mathbf: bold dropped (disclosed)
          i = g.end;
        } else {
          out += "\\" + cmd;
        }
        continue;
      }
      if (cmd === "overrightarrow") {
        const g = readGroup(i);
        if (g) {
          out += mathTitleToPlainText(g.body) + "→";
          i = g.end;
        } else {
          out += "\\" + cmd;
        }
        continue;
      }
      const resolved = resolveCommand(cmd);
      if (resolved !== null && cmd in FUNC_NAMES && /[A-Za-z0-9)]$/.test(out)) {
        out += " "; // operator spacing: KaTeX spaces function names (3\cos → 3 cos)
      }
      out += resolved ?? "\\" + cmd; // unknown command rides verbatim (gate catches)
      if (consumedSpace) out += " ";
      continue;
    }

    if (c === "^" || c === "_") {
      const sym = c;
      i++;
      let inner: string | null = null;
      if (title[i] === "{") {
        const g = readGroup(i);
        if (g) {
          inner = g.body;
          i = g.end;
        }
      } else if (title[i] === "\\") {
        const m = /^[a-zA-Z]+/.exec(title.slice(i + 1));
        if (m) {
          inner = "\\" + m[0];
          i += 1 + m[0].length;
        }
      } else if (i < n) {
        inner = title[i];
        i++;
      }
      if (inner === null) {
        out += sym;
        continue;
      }
      if (inner === "\\circ") {
        out += "°"; // degrees, never ∘
        continue;
      }
      // Braced atoms may carry commands of their own — convert the body
      // recursively (8^{\log_2x} → 8^(log_2x)); bare \cmd atoms resolve
      // through the table (S_\infty → S_∞).
      const plain = inner.startsWith("\\") && !inner.includes("{") && !inner.includes("_")
        ? (resolveCommand(inner.slice(1)) ?? inner)
        : mathTitleToPlainText(inner);
      out += needsParens(plain) ? `${sym}(${plain})` : sym + plain;
      // A braced atom rides visually lower/higher in render — plaintext needs
      // a separator or log_{0.5}{0.25} glues into "log_0.50.25".
      if (title[i - 1] === "}" && /^[A-Za-z0-9{]/.test(title.slice(i))) out += " ";
      continue;
    }

    if (c === "{" || c === "}") {
      i++; // grouping braces unwrap
      continue;
    }

    out += c;
    i++;
  }

  return out.replace(/[ \t]{2,}/g, " ").trim();
}
