/**
 * subject-glyph.tsx — the bespoke subject glyph set + resolver.
 *
 * T-HUB-COURSES-UI-1 run-001 (the /courses redesign plan, stage 1): 17
 * bespoke 24×24 stroke glyphs, one per distinct identity in
 * lib/subject-identity.ts, drawn from the approved /courses redesign
 * mockup (download/redesign/mockup/courses-redesign-mockup.html). Every
 * glyph paints in currentColor so the consumer owns the colour — the
 * identity's tile.fg tints the strokes, tile.bg fills the tile behind it.
 *
 * The compile gate lives in the GLYPHS map's type: Record<SubjectGlyphId, …>
 * fails typecheck if a glyph id in lib/subject-identity.ts has no component
 * here. SubjectGlyph falls back to a quiet lucide BookOpen for any glyph id
 * it does not know at runtime — a resilience net for subjects that do not
 * exist yet (the build gate in scripts/verify_subject_identity.ts keeps the
 * fallback from ever rendering for a CURRENT registry subject: unknown
 * subjects fail the build there).
 *
 * Pure presentational components: no state, no hooks, no "use client"
 * directive needed — usable from server and client trees alike.
 */
import type { ComponentType, SVGProps } from "react";
import { BookOpen } from "lucide-react";
import type { SubjectGlyphId } from "@/lib/subject-identity";

type GlyphProps = SVGProps<SVGSVGElement>;

const base: GlyphProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  xmlns: "http://www.w3.org/2000/svg",
};

const ChemistryGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M9 3h6" />
    <path d="M10 3v5.2L4.8 17.5A2.6 2.6 0 0 0 7.1 21h9.8a2.6 2.6 0 0 0 2.3-3.5L14 8.2V3" />
    <path d="M7.4 14h9.2" />
  </svg>
);

const PhysicsGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" {...p}>
    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.2" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-60 12 12)" />
  </svg>
);

const BiologyGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M20 4c-9 0-14 5-14 11 0 2.2.9 4 .9 4S8 10 20 4z" fill="currentColor" stroke="none" />
    <path d="M6 20c2-6 7-11 13-14" />
  </svg>
);

const ScienceGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" {...p}>
    <circle cx="7" cy="15" r="3" />
    <circle cx="16" cy="8" r="2.4" />
    <circle cx="18" cy="17" r="1.7" />
    <path d="M9.4 13.2l4.3-3.4M10 15.6l6.3.9" />
  </svg>
);

const MathsGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2.5" />
    <path d="M8.5 7.5h7" />
    <path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" />
  </svg>
);

const FurtherMathsGlyph = (p: GlyphProps) => (
  <svg {...base} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M17.5 5H7.5l6.2 7-6.2 7h10" />
  </svg>
);

const ComputerScienceGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
    <rect x="10" y="10" width="4" height="4" rx=".8" />
    <path d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3" />
  </svg>
);

const IctGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" {...p}>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M9 20h6M12 16.5V20" />
  </svg>
);

const EnglishLanguageGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 6c-1.8-1.4-4.2-2-7-2v14c2.8 0 5.2.6 7 2 1.8-1.4 4.2-2 7-2V4c-2.8 0-5.2.6-7 2z" />
    <path d="M12 6v14" />
  </svg>
);

const EnglishLiteratureGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 4h11.5A2.5 2.5 0 0 1 19 6.5V21H7.5A2.5 2.5 0 0 1 5 18.5V4z" />
    <path d="M5 4v14.5A2.5 2.5 0 0 0 7.5 21" />
    <path d="M14 4v6l2.2-1.7L18.4 10V4" />
  </svg>
);

const EconomicsGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 20V10M10 20V4M16 20v-8M20 20H2" />
  </svg>
);

const BusinessGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="7.5" width="18" height="13" rx="2.5" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
    <path d="M3 12.5h18" />
  </svg>
);

const AccountingGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M6 2.5h9.5L19 6v15.5H6z" />
    <path d="M15.5 2.5V6H19" />
    <path d="M9 11h7M9 14.5h7" />
    <circle cx="9" cy="18" r="1.6" />
  </svg>
);

const GeographyGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3.5 13.8 9 12 20.5 10.2 9z" fill="currentColor" stroke="none" />
    <path d="M4 10.5 9.5 9M20 10.5 14.5 9M6 18l4-4.5M18 18l-4-4.5" />
  </svg>
);

const HistoryGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3.5 9.5 12 3.5l8.5 6v1.5h-17z" />
    <path d="M5.5 11v7M9.8 11v7M14.2 11v7M18.5 11v7" />
    <path d="M3.5 21h17M2.5 18h19" />
  </svg>
);

const ReligiousStudiesGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 3v6.6M12 14.4V21M3 12h6.6M14.4 12H21M5.6 5.6l4.7 4.7M13.7 13.7l4.7 4.7M18.4 5.6l-4.7 4.7M10.3 13.7l-4.7 4.7" />
  </svg>
);

const EnvironmentalGlyph = (p: GlyphProps) => (
  <svg {...base} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5c-4.5.5-7 3-7.5 7.5 4.5-.5 7-3 7.5-7.5z" fill="currentColor" stroke="none" />
    <path d="M8.5 15.5C10 12 13 9.5 16.5 8" />
  </svg>
);

/** glyph id → component. The Record<SubjectGlyphId, …> type IS the compile
 *  gate: a glyph id without a component here fails `tsc --noEmit`. */
const GLYPHS: Record<SubjectGlyphId, ComponentType<GlyphProps>> = {
  chemistry: ChemistryGlyph,
  physics: PhysicsGlyph,
  biology: BiologyGlyph,
  science: ScienceGlyph,
  maths: MathsGlyph,
  "further-maths": FurtherMathsGlyph,
  "computer-science": ComputerScienceGlyph,
  ict: IctGlyph,
  "english-language": EnglishLanguageGlyph,
  "english-literature": EnglishLiteratureGlyph,
  economics: EconomicsGlyph,
  business: BusinessGlyph,
  accounting: AccountingGlyph,
  geography: GeographyGlyph,
  history: HistoryGlyph,
  "religious-studies": ReligiousStudiesGlyph,
  environmental: EnvironmentalGlyph,
};

export interface SubjectGlyphProps extends GlyphProps {
  glyph: SubjectGlyphId;
}

/**
 * Render a subject glyph. Unknown runtime ids (a caller bypassing the
 * identity lib with a stale id) fall back to the quiet lucide glyph rather
 * than crashing — the build gate keeps that path theoretical.
 */
export function SubjectGlyph({ glyph, ...rest }: SubjectGlyphProps) {
  const Component = (GLYPHS as Record<string, ComponentType<GlyphProps>>)[glyph] ?? BookOpen;
  return <Component aria-hidden {...rest} />;
}

/** Test/census surface: the rendered glyph count (17 today). */
export const SUBJECT_GLYPH_COMPONENT_COUNT = Object.keys(GLYPHS).length;
