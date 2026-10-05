/**
 * Java-parity Instant writer (W2-F1) — renders Postgres timestamptz values
 * exactly the way the frozen core's Jackson JSR-310 serializer prints
 * Instant.toString() (DateTimeFormatter.ISO_INSTANT): UTC 'Z' suffix and
 * fractional seconds in groups of three — 0, 3, 6, or 9 digits, trailing
 * zeros never carried past a group, no fraction at all when the fraction
 * is zero. From Postgres micros precision the reachable outputs are 0, 3,
 * or 6 digits; the 9-digit branch exists for defensive full-nano inputs.
 *
 * Why this exists (T-MIG-022 run-001, F-1): 1021 golden divergences, every
 * one the same rule — expected "2026-09-21T12:59:21.578011Z" vs actual
 * "…T12:59:21.578Z". Both transports lose micros: postgres.js parses
 * timestamptz into a JS Date (millis precision — a JS Date physically
 * cannot carry micros), and neon-http delivers text that was then coerced
 * through Date on the old path. The repositories therefore select
 * timestamps as UTC-pinned text in SQL —
 *   to_char(<col> at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
 * (written as a literal in each select: `at time zone 'UTC'` is session-
 * timezone-proof; `.US` always emits 6 fraction digits) — and this module
 * applies the Java fraction rule to that string. The value never passes
 * through a JS Date.
 *
 * Fail-fast contract: javaInstant accepts only the string forms produced
 * by the SQL cast and their tolerant dialects (pg raw text, ISO-8601 Z,
 * explicit offsets). A Date or null reaching this writer is a contract
 * violation — a silent millis render would re-introduce the exact F-1
 * divergence class this module exists to kill, so it throws instead.
 */

/** `to_char(<col> at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`. */
const PG_UTC_TEXT =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * Render a Postgres/ISO timestamp string with Java Instant.toString()
 * parity. Accepted dialects:
 *   "2026-09-21T12:59:21.578011"      — the SQL cast's canonical output
 *   "2026-09-21 12:59:21.578011+00"   — pg raw timestamptz text
 *   "2026-09-21T12:59:21.578011Z"     — ISO-8601 UTC
 *   "2026-09-21 14:59:21.578011+02"   — explicit offsets are normalized to UTC
 * Fraction-less, 1-9 digit fractions and Z/±HH/±HHMM/±HH:MM offsets are
 * all handled. Throws TypeError on null/Date/garbage — see contract above.
 */
export function javaInstant(value: unknown): string {
  if (value == null || value instanceof Date || typeof value !== "string") {
    throw new TypeError(
      "javaInstant: timestamp left the SQL text contract — " +
        `expected the to_char(… at time zone 'UTC' …) string, got ${prettyKind(value)}. ` +
        "Fix the select, never the renderer (a Date renders millis only).",
    );
  }
  const m = PG_UTC_TEXT.exec(value.trim());
  if (m === null) {
    throw new TypeError(`javaInstant: unparseable timestamp ${JSON.stringify(value)}`);
  }
  const [, y, mo, d, h, mi, s, fracRaw, offRaw] = m as unknown as [
    string, string, string, string, string, string, string, string | undefined, string | undefined,
  ];
  // Coarse component sanity: Postgres never emits out-of-range civil
  // fields, and silent Date.UTC rollover (month 13, hour 25) would mask a
  // broken select. Reject instead of roll over. (Full calendar validation
  // — e.g. Feb 30 — is deliberately not duplicated here.)
  const month = Number(mo), hour = Number(h), minute = Number(mi), second = Number(s);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    throw new TypeError(`javaInstant: out-of-range component in ${JSON.stringify(value)}`);
  }

  // nanos from the fraction, Java-parse semantics: ".5" === ".500000000".
  const nanos = fracRaw === undefined ? 0 : Number(fracRaw.padEnd(9, "0"));

  let utcSec = Date.UTC(Number(y), month - 1, Number(d), hour, minute, second) / 1000;
  const offsetMinutes = parseOffsetMinutes(offRaw);
  if (offsetMinutes !== 0) utcSec -= offsetMinutes * 60;

  const base = datePartOf(utcSec); // "YYYY-MM-DDTHH:MM:SS" re-rendered in UTC
  return `${base}${fraction(nanos)}Z`;
}

/** The ISO_INSTANT fraction rule, on nanos: 0 / 3 / 6 / 9 digits. */
function fraction(nanos: number): string {
  if (nanos === 0) return "";
  if (nanos % 1_000_000 === 0) return "." + String(nanos / 1_000_000).padStart(3, "0");
  if (nanos % 1_000 === 0) return "." + String(nanos / 1_000).padStart(6, "0");
  return "." + String(nanos).padStart(9, "0");
}

/** "Z"/"z"/absent → 0; ±HH[:MM] / ±HHMM → signed minutes. */
function parseOffsetMinutes(off: string | undefined): number {
  if (off === undefined || off === "Z" || off === "z" || off === "+00" || off === "-00") return 0;
  const sign = off[0] === "-" ? -1 : 1;
  const digits = off.slice(1).replace(":", "");
  const hh = Number(digits.slice(0, 2));
  const mm = digits.length >= 4 ? Number(digits.slice(2, 4)) : 0;
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh > 23 || mm > 59) {
    throw new TypeError(`javaInstant: unparseable UTC offset ${JSON.stringify(off)}`);
  }
  return sign * (hh * 60 + mm);
}

/** Civil date+time of an epoch-seconds instant, UTC, exact at second grain. */
function datePartOf(epochSec: number): string {
  const dt = new Date(epochSec * 1000); // whole seconds — exact in float64
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(dt.getUTCFullYear(), 4)}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}` +
    `T${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:${p(dt.getUTCSeconds())}`
  );
}

function prettyKind(value: unknown): string {
  if (value === null) return "null";
  if (value instanceof Date) return `Date (${(value as Date).toISOString()})`;
  return `${typeof value} (${String(value)})`;
}
