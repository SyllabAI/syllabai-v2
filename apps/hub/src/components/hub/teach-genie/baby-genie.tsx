"use client";

/**
 * T-TEACHGENIE-001 — the pupil avatar of record (renamed SillyAI in
 * T-TEACHGENIE-003; same original art).
 *
 * Original art (inline SVG, drawn for SyllabAI): a friendly baby-genie face
 * on the dark tile MG's chat avatar uses (`rounded-xl border-2 bg-black` in
 * the captures). NO MathsGenie asset is copied — the mascot image is their
 * IP; this is a same-role original stand-in so the feature "feels like"
 * MathsGenie without shipping their art.
 */

export function BabyGenieAvatar({ size = 32, round = false }: { size?: number; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden border-2 border-white bg-black ring-2 ring-background dark:border-white/20 ${
        round ? "rounded-full" : "rounded-xl"
      }`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="SillyAI">
        <defs>
          <radialGradient id="tg-bg" cx="50%" cy="38%" r="80%">
            <stop offset="0%" stopColor="#1d3a5f" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </radialGradient>
          <linearGradient id="tg-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9be7ff" />
            <stop offset="100%" stopColor="#1cb0f6" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" fill="url(#tg-bg)" />
        {/* genie tail wisp */}
        <path d="M20 60c5-5 8-6.5 12-6.5s7 1.5 12 6.5" stroke="#46cbe3" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.55" />
        {/* head */}
        <circle cx="32" cy="27" r="14" fill="url(#tg-skin)" />
        {/* single hair curl (the baby-genie tell) */}
        <path d="M32 13c0-4 5-5 5-1.5 0 2-2.5 2.5-3.5 1" stroke="#0a0a0a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {/* eyes */}
        <circle cx="26.5" cy="26" r="2.6" fill="#0a0a0a" />
        <circle cx="37.5" cy="26" r="2.6" fill="#0a0a0a" />
        <circle cx="27.3" cy="25.2" r="0.8" fill="#fff" />
        <circle cx="38.3" cy="25.2" r="0.8" fill="#fff" />
        {/* blush */}
        <ellipse cx="22.5" cy="31" rx="2.6" ry="1.5" fill="#7cd4ff" opacity="0.7" />
        <ellipse cx="41.5" cy="31" rx="2.6" ry="1.5" fill="#7cd4ff" opacity="0.7" />
        {/* smile */}
        <path d="M27 33.5c2.5 2.6 7.5 2.6 10 0" stroke="#0a0a0a" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* little gold earring — the genie tell */}
        <circle cx="46.5" cy="30.5" r="1.2" fill="#fac800" />
      </svg>
    </span>
  );
}
