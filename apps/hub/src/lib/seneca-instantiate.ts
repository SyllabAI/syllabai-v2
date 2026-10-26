/**
 * Seneca `$var` instantiation (T-SENECA-001 Task 42) — faithful port of the
 * harvest prototype's syllabai.ts instantiate(): Seneca exam questions carry
 * optional generationScript that computes template variables ($mass, $vol, …)
 * consumed by questionTitleMd. The script body runs in a Function sandbox
 * where the ONLY capabilities exposed are random(a,b) and pick(arr) —
 * exactly what the harvested scripts were written against. Script failures
 * must never break rendering; unresolved variables render as ___.
 */
export function instantiate(
  title: string | null | undefined,
  script: string | null | undefined,
): string {
  const md = title ?? "";
  if (!md.includes("$")) return md;
  const needed = Array.from(
    new Set(Array.from(md.matchAll(/\$([a-zA-Z_]\w*)/g), (m) => m[1])),
  );
  if (needed.length === 0) return md;
  const vars: Record<string, unknown> = {};
  if (script) {
    try {
      const returns = needed
        .map((n) => `${JSON.stringify(n)}: typeof ${n} === "undefined" ? null : ${n}`)
        .join(",");
      const body = `${script}\n;return {${returns}};`;
      const random = (a: number, b: number) =>
        Math.floor(Math.random() * (b - a + 1)) + a;
      const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
      Object.assign(vars, new Function("random", "pick", body)(random, pick));
    } catch {
      // script failures must never break rendering — fall through
    }
  }
  return md.replace(/\$([a-zA-Z_]\w*)/g, (_m, n: string) => {
    const v = vars[n];
    return v === undefined || v === null ? "___" : String(v);
  });
}
