import { getCanvasTheme, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function useCanvasTheme(): CanvasTheme {
    const theme = useThemeStore((state) => state.theme);
    const palette = useThemeStore((state) => state.palette);
    return getCanvasTheme(palette, theme);
}
