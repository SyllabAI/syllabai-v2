"use client";

/**
 * ThemeToggle — quad-theme switcher (SME | Quiet Green | Candy Shop |
 * Chat App Plum × Light | Dark | System). Two mount shapes:
 *   variant="icon" (default) — compact header dropdown
 *   variant="row"            — labelled pill for the footer
 *
 * State lives in src/lib/theme-store.ts — T-THEME-LOCAL-1 run-001
 * (operator order 2026-11-07: "Theme must be browser saved only"):
 * localStorage["syllabai-theme"] is the store of record; the account-doc
 * "theme" key is the retired carrier (one-time adoption bridge in the
 * store). The inline bootstrap in app/layout.tsx applies the stored theme
 * pre-paint; the first mount calls hydrateTheme() so the React store
 * agrees with the device record.
 *
 * Each theme row carries a 12px fill swatch (Tier-3 theme audit
 * 2026-11-08) rendered in the theme's own --primary raw for the RESOLVED
 * mode. The hexes are hardcoded per theme below — the dropdown always
 * renders under the ACTIVE theme, so var(--primary) would paint every
 * row in the current theme's color, not the row's.
 */
import { useEffect, useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MODE_LABEL,
  THEME_LABEL,
  getServerThemeState,
  getThemeState,
  hydrateTheme,
  setTheme,
  subscribeTheme,
  type ThemeMode,
  type ThemeName,
} from "@/lib/theme-store";

const THEMES: ThemeName[] = ["sme", "quiet-green", "candy-shop", "chat-app-plum"];
const MODES: ThemeMode[] = ["light", "dark", "system"];

/** Per-mode primary fill hexes for the menu swatches (aria-hidden — the
 *  label text carries the meaning; the dot is reinforcement). Values are
 *  the raw fills from the theme blocks in globals.css — keep in sync.
 *  candy-shop and chat-app-plum are byte-identical across modes (the
 *  brand-never-moves law); their dark entries exist for the uniform shape. */
const THEME_SWATCH: Record<ThemeName, { light: string; dark: string }> = {
  sme: { light: "#265bf6", dark: "#76a1ff" }, // dark = oklch(0.72 0.145 264.4)
  "quiet-green": { light: "#2e6b4f", dark: "#3d8e67" },
  "candy-shop": { light: "#ff2d6e", dark: "#ff2d6e" },
  "chat-app-plum": { light: "#7b44c7", dark: "#7b44c7" },
};

/** Resolved OS preference — SSR-safe (server snapshot false, like
 *  getServerThemeState). Only consumed when state.mode is "system". */
function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

function Row({
  active,
  children,
  onSelect,
}: {
  active: boolean;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="cursor-pointer justify-between"
      aria-checked={active}
      role="menuitemradio"
      data-state={active ? "checked" : "unchecked"}
    >
      <span className="flex items-center gap-2">{children}</span>
      <Check className={cn("size-4", active ? "opacity-100" : "opacity-0")} aria-hidden />
    </DropdownMenuItem>
  );
}

export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const state = useSyncExternalStore(subscribeTheme, getThemeState, getServerThemeState);
  const prefersDark = usePrefersDark();
  const dark = state.mode === "dark" || (state.mode === "system" && prefersDark);

  useEffect(() => {
    hydrateTheme();
  }, []);

  const trigger =
    variant === "icon" ? (
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Theme: ${THEME_LABEL[state.theme]}, appearance: ${MODE_LABEL[state.mode]} — open theme menu`}
        className="size-8 sm:size-10"
      >
        <Palette className="size-4" aria-hidden />
      </Button>
    ) : (
      <Button variant="outline" size="sm" className="gap-1.5 text-[11px] font-normal">
        <Palette className="size-3.5" aria-hidden />
        {THEME_LABEL[state.theme]} · {MODE_LABEL[state.mode]}
      </Button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {THEMES.map((t) => (
          <Row
            key={t}
            active={state.theme === t}
            onSelect={() => setTheme({ theme: t })}
          >
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/25"
              style={{ background: THEME_SWATCH[t][dark ? "dark" : "light"] }}
            />
            <span className="font-medium">{THEME_LABEL[t]}</span>
          </Row>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        {MODES.map((m) => (
          <Row
            key={m}
            active={state.mode === m}
            onSelect={() => setTheme({ mode: m })}
          >
            {m === "light" && <Sun className="size-4 text-muted-foreground" aria-hidden />}
            {m === "dark" && <Moon className="size-4 text-muted-foreground" aria-hidden />}
            {m === "system" && <Monitor className="size-4 text-muted-foreground" aria-hidden />}
            <span className="font-medium">{MODE_LABEL[m]}</span>
          </Row>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
