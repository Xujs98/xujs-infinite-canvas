import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

import type { ThemePalette } from "@/lib/canvas-theme";

interface NeutralColor {
    primary: string;
    primaryHover: string;
    primaryText: string;
    menuBg: string;
    menuText: string;
    selectActiveBg: string;
    selectSelectedBg: string;
    selectText: string;
    tableSelectedBg: string;
    tableSelectedHoverBg: string;
}

const neutral: { light: NeutralColor; dark: NeutralColor } = {
    light: {
        primary: "#171717",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        menuBg: "#f5f5f5",
        menuText: "#171717",
        selectActiveBg: "#f5f5f5",
        selectSelectedBg: "#f0f0f0",
        selectText: "#171717",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
    },
    dark: {
        primary: "#fafafa",
        primaryHover: "#ffffff",
        primaryText: "#171717",
        menuBg: "#262626",
        menuText: "#fafafa",
        selectActiveBg: "#262626",
        selectSelectedBg: "#333333",
        selectText: "#fafafa",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
    },
};

const paletteAccentColors: Record<ThemePalette, { light: string; dark: string }> = {
    stone: { light: "#171717", dark: "#fafafa" },
    blue: { light: "#1d4ed8", dark: "#60a5fa" },
    emerald: { light: "#059669", dark: "#34d399" },
    rose: { light: "#e11d48", dark: "#fb7185" },
    amber: { light: "#d97706", dark: "#fbbf24" },
    violet: { light: "#7c3aed", dark: "#a78bfa" },
};

export const adminLayoutStyle = {
    siderWidth: 232,
    headerHeight: 56,
    brandHeight: 64,
    menu: { borderInlineEnd: 0, padding: "18px 12px", fontSize: 15 } satisfies CSSProperties,
    menuItem: { height: 44, lineHeight: "44px", marginBlock: 4, borderRadius: 8 } satisfies CSSProperties,
};

export function getAntThemeConfig(dark: boolean, palette: ThemePalette = "stone"): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;
    const accent = paletteAccentColors[palette];
    const primaryColor = palette === "stone" ? color.primary : (dark ? accent.dark : accent.light);
    const primaryHover = palette === "stone" ? color.primaryHover : primaryColor;
    const primaryText = palette === "stone" ? color.primaryText : "#ffffff";

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: primaryColor,
            colorInfo: primaryColor,
            colorLink: primaryColor,
            colorLinkHover: primaryHover,
            colorLinkActive: primaryColor,
            colorTextLightSolid: primaryText,
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: neutral.dark.menuBg,
                darkItemSelectedBg: neutral.dark.menuBg,
                darkItemSelectedColor: neutral.dark.menuText,
            },
            Select: {
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
