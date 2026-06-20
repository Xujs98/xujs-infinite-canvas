import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ThemePalette } from "@/lib/canvas-theme";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    palette: ThemePalette;
    setTheme: (theme: ThemeName) => void;
    setPalette: (palette: ThemePalette) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "dark",
            palette: "stone",
            setTheme: (theme) => set({ theme }),
            setPalette: (palette) => set({ palette }),
        }),
        { name: "infinite-canvas:theme_store" },
    ),
);
