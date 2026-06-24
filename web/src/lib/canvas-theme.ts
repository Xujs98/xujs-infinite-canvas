export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";
export type ThemePalette = "stone" | "blue" | "emerald" | "rose" | "amber" | "violet";

interface ThemeColors {
    canvas: {
        background: string;
        dot: string;
        line: string;
        selectionStroke: string;
        selectionFill: string;
    };
    node: {
        label: string;
        fill: string;
        panel: string;
        stroke: string;
        activeStroke: string;
        placeholder: string;
        text: string;
        muted: string;
        faint: string;
    };
    toolbar: {
        panel: string;
        border: string;
        item: string;
        itemHover: string;
        activeBg: string;
        activeText: string;
    };
}

const stone: { light: ThemeColors; dark: ThemeColors } = {
    light: {
        canvas: { background: "#f4f2ed", dot: "rgba(68,64,60,.28)", line: "rgba(68,64,60,.12)", selectionStroke: "#1c1917", selectionFill: "rgba(28,25,23,.06)" },
        node: { label: "#57534e", fill: "#e7e5df", panel: "#fbfaf7", stroke: "#d6d3ca", activeStroke: "#1c1917", placeholder: "#8a8479", text: "#292524", muted: "#78716c", faint: "#a8a29e" },
        toolbar: { panel: "rgba(251,250,247,.96)", border: "#d6d3ca", item: "#57534e", itemHover: "#e7e5df", activeBg: "#e7e5df", activeText: "#292524" },
    },
    dark: {
        canvas: { background: "#181715", dot: "rgba(245,245,244,.24)", line: "rgba(245,245,244,.10)", selectionStroke: "#fafaf9", selectionFill: "rgba(250,250,249,.10)" },
        node: { label: "#d6d3d1", fill: "#292524", panel: "#1f1d1a", stroke: "#44403c", activeStroke: "#fafaf9", placeholder: "#a8a29e", text: "#f5f5f4", muted: "#d6d3d1", faint: "#78716c" },
        toolbar: { panel: "rgba(31,29,26,.96)", border: "#44403c", item: "#d6d3d1", itemHover: "#292524", activeBg: "#3a3631", activeText: "#f5f5f4" },
    },
};

const blue: { light: ThemeColors; dark: ThemeColors } = {
    light: {
        canvas: { background: "#f0f4f8", dot: "rgba(51,65,85,.26)", line: "rgba(51,65,85,.10)", selectionStroke: "#1e3a5f", selectionFill: "rgba(30,58,95,.06)" },
        node: { label: "#475569", fill: "#dbeafe", panel: "#f0f7ff", stroke: "#bfdbfe", activeStroke: "#1d4ed8", placeholder: "#94a3b8", text: "#1e3a5f", muted: "#64748b", faint: "#94a3b8" },
        toolbar: { panel: "rgba(240,247,255,.96)", border: "#bfdbfe", item: "#475569", itemHover: "#dbeafe", activeBg: "#dbeafe", activeText: "#1e3a5f" },
    },
    dark: {
        canvas: { background: "#0f172a", dot: "rgba(148,163,184,.22)", line: "rgba(148,163,184,.08)", selectionStroke: "#e2e8f0", selectionFill: "rgba(226,232,240,.10)" },
        node: { label: "#cbd5e1", fill: "#1e293b", panel: "#162032", stroke: "#334155", activeStroke: "#93c5fd", placeholder: "#64748b", text: "#e2e8f0", muted: "#94a3b8", faint: "#475569" },
        toolbar: { panel: "rgba(22,32,50,.96)", border: "#334155", item: "#cbd5e1", itemHover: "#1e293b", activeBg: "#283548", activeText: "#e2e8f0" },
    },
};

const emerald: { light: ThemeColors; dark: ThemeColors } = {
    light: {
        canvas: { background: "#f0fdf4", dot: "rgba(22,101,52,.24)", line: "rgba(22,101,52,.10)", selectionStroke: "#064e3b", selectionFill: "rgba(6,78,59,.06)" },
        node: { label: "#4d7c5e", fill: "#d1fae5", panel: "#ecfdf5", stroke: "#a7f3d0", activeStroke: "#059669", placeholder: "#6ee7b7", text: "#064e3b", muted: "#6b8f7b", faint: "#a7c4b5" },
        toolbar: { panel: "rgba(236,253,245,.96)", border: "#a7f3d0", item: "#4d7c5e", itemHover: "#d1fae5", activeBg: "#d1fae5", activeText: "#064e3b" },
    },
    dark: {
        canvas: { background: "#0a1f14", dot: "rgba(167,243,208,.22)", line: "rgba(167,243,208,.08)", selectionStroke: "#d1fae5", selectionFill: "rgba(209,250,229,.10)" },
        node: { label: "#a7c4b5", fill: "#143326", panel: "#0f2a1e", stroke: "#1e5c3e", activeStroke: "#6ee7b7", placeholder: "#34d399", text: "#d1fae5", muted: "#6ee7b7", faint: "#2d6a4f" },
        toolbar: { panel: "rgba(15,42,30,.96)", border: "#1e5c3e", item: "#a7c4b5", itemHover: "#143326", activeBg: "#1a4a32", activeText: "#d1fae5" },
    },
};

const rose: { light: ThemeColors; dark: ThemeColors } = {
    light: {
        canvas: { background: "#fff1f2", dot: "rgba(159,18,72,.22)", line: "rgba(159,18,72,.08)", selectionStroke: "#881337", selectionFill: "rgba(136,19,55,.06)" },
        node: { label: "#9f6b7a", fill: "#ffe4e6", panel: "#fff1f2", stroke: "#fecdd3", activeStroke: "#e11d48", placeholder: "#fda4af", text: "#881337", muted: "#be7280", faint: "#d4a0ab" },
        toolbar: { panel: "rgba(255,241,242,.96)", border: "#fecdd3", item: "#9f6b7a", itemHover: "#ffe4e6", activeBg: "#ffe4e6", activeText: "#881337" },
    },
    dark: {
        canvas: { background: "#1f0a10", dot: "rgba(253,164,175,.22)", line: "rgba(253,164,175,.08)", selectionStroke: "#ffe4e6", selectionFill: "rgba(255,228,230,.10)" },
        node: { label: "#d4a0ab", fill: "#2d1520", panel: "#250f18", stroke: "#4a2030", activeStroke: "#fb7185", placeholder: "#f43f5e", text: "#ffe4e6", muted: "#fda4af", faint: "#8b3a4e" },
        toolbar: { panel: "rgba(37,15,24,.96)", border: "#4a2030", item: "#d4a0ab", itemHover: "#2d1520", activeBg: "#3d1a28", activeText: "#ffe4e6" },
    },
};

const amber: { light: ThemeColors; dark: ThemeColors } = {
    light: {
        canvas: { background: "#fffbeb", dot: "rgba(146,64,14,.24)", line: "rgba(146,64,14,.08)", selectionStroke: "#78350f", selectionFill: "rgba(120,53,15,.06)" },
        node: { label: "#92734a", fill: "#fef3c7", panel: "#fffbeb", stroke: "#fde68a", activeStroke: "#d97706", placeholder: "#fcd34d", text: "#78350f", muted: "#a88b5e", faint: "#c9b68e" },
        toolbar: { panel: "rgba(255,251,235,.96)", border: "#fde68a", item: "#92734a", itemHover: "#fef3c7", activeBg: "#fef3c7", activeText: "#78350f" },
    },
    dark: {
        canvas: { background: "#1c1207", dot: "rgba(252,211,77,.22)", line: "rgba(252,211,77,.08)", selectionStroke: "#fef3c7", selectionFill: "rgba(254,243,199,.10)" },
        node: { label: "#c9b68e", fill: "#2a1f0e", panel: "#221a0a", stroke: "#4a3518", activeStroke: "#fbbf24", placeholder: "#f59e0b", text: "#fef3c7", muted: "#fcd34d", faint: "#8b6914" },
        toolbar: { panel: "rgba(34,26,10,.96)", border: "#4a3518", item: "#c9b68e", itemHover: "#2a1f0e", activeBg: "#3a2d14", activeText: "#fef3c7" },
    },
};

const violet: { light: ThemeColors; dark: ThemeColors } = {
    light: {
        canvas: { background: "#f5f3ff", dot: "rgba(91,33,182,.22)", line: "rgba(91,33,182,.08)", selectionStroke: "#4c1d95", selectionFill: "rgba(76,29,149,.06)" },
        node: { label: "#7c6b99", fill: "#ede9fe", panel: "#f5f3ff", stroke: "#c4b5fd", activeStroke: "#7c3aed", placeholder: "#a78bfa", text: "#4c1d95", muted: "#8b72a8", faint: "#b5a3cc" },
        toolbar: { panel: "rgba(245,243,255,.96)", border: "#c4b5fd", item: "#7c6b99", itemHover: "#ede9fe", activeBg: "#ede9fe", activeText: "#4c1d95" },
    },
    dark: {
        canvas: { background: "#130d1f", dot: "rgba(196,181,253,.22)", line: "rgba(196,181,253,.08)", selectionStroke: "#ede9fe", selectionFill: "rgba(237,233,254,.10)" },
        node: { label: "#b5a3cc", fill: "#1e1430", panel: "#180f28", stroke: "#3b2860", activeStroke: "#a78bfa", placeholder: "#8b5cf6", text: "#ede9fe", muted: "#c4b5fd", faint: "#6d4ba0" },
        toolbar: { panel: "rgba(24,15,40,.96)", border: "#3b2860", item: "#b5a3cc", itemHover: "#1e1430", activeBg: "#2a1e42", activeText: "#ede9fe" },
    },
};

export const themePalettes: Record<ThemePalette, { light: ThemeColors; dark: ThemeColors }> = {
    stone,
    blue,
    emerald,
    rose,
    amber,
    violet,
};

export const themePaletteLabels: Record<ThemePalette, string> = {
    stone: "石墨",
    blue: "海蓝",
    emerald: "翡翠",
    rose: "玫瑰",
    amber: "琥珀",
    violet: "星紫",
};

export const themePalettePreviews: Record<ThemePalette, { primary: string; accent: string; bg: string }> = {
    stone: { primary: "#171717", accent: "#57534e", bg: "#f4f2ed" },
    blue: { primary: "#1d4ed8", accent: "#475569", bg: "#f0f4f8" },
    emerald: { primary: "#059669", accent: "#4d7c5e", bg: "#f0fdf4" },
    rose: { primary: "#e11d48", accent: "#9f6b7a", bg: "#fff1f2" },
    amber: { primary: "#d97706", accent: "#92734a", bg: "#fffbeb" },
    violet: { primary: "#7c3aed", accent: "#7c6b99", bg: "#f5f3ff" },
};

export const canvasThemes = {
    light: stone.light,
    dark: stone.dark,
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];

export function getCanvasTheme(palette: ThemePalette, mode: CanvasColorTheme): ThemeColors {
    return themePalettes[palette][mode];
}

/** 后台管理根据全局主题色生成对应颜色 */
export function getAdminColors(palette: ThemePalette) {
    const map: Record<ThemePalette, { primary: string; light: string; hover: string }> = {
        stone: { primary: "#171717", light: "#f5f5f5", hover: "#e8e8e8" },
        blue: { primary: "#1d4ed8", light: "#eff6ff", hover: "#dbeafe" },
        emerald: { primary: "#059669", light: "#ecfdf5", hover: "#d1fae5" },
        rose: { primary: "#e11d48", light: "#fff1f2", hover: "#ffe4e6" },
        amber: { primary: "#d97706", light: "#fffbeb", hover: "#fef3c7" },
        violet: { primary: "#7c3aed", light: "#f5f3ff", hover: "#ede9fe" },
    };
    return map[palette];
}
