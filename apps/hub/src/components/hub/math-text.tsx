import katex from "katex";

/**
 * Inline `$…$` math for operator-imported TITLES (T-UGM-RENDER-1).
 *
 * 235 of the 628 UGM resource titles carry `$…$` math ("When is $12x^2+7x-10$
 * negative?") — rendered as plain text they leak raw dollars into the reader
 * h1, the sibling "More from these spec points" links and the course index
 * listings (live audit 2026-10-27). This component renders each `$…$` segment
 * through KaTeX's MathML-only output: no katex.css dependency (titles render
 * on surfaces that never load the body-math CSS), no HTML injection surface
 * (output is MathML, throwOnError → the raw segment stays text), and it is a
 * plain server component — zero client JS.
 *
 * Text outside `$…$` (and any segment KaTeX refuses) renders verbatim.
 */
export function MathText({ text }: { text: string }) {
  if (!text.includes("$")) return <>{text}</>;
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.length < 3 || !part.startsWith("$") || !part.endsWith("$")) {
          return <span key={i}>{part}</span>;
        }
        const tex = part.slice(1, -1);
        try {
          const html = katex.renderToString(tex, {
            output: "mathml",
            throwOnError: true,
            strict: "ignore",
          });
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch {
          return <span key={i}>{part}</span>;
        }
      })}
    </>
  );
}
