"use client";

import { useEffect } from "react";

import { DEFAULT_SITE_ICON, DEFAULT_SITE_LOGO, DEFAULT_SITE_NAME } from "@/constant/brand";
import { useConfigStore } from "@/stores/use-config-store";

export function DynamicTitle() {
    const publicSystemSettings = useConfigStore((state) => state.publicSystemSettings);
    const siteName = publicSystemSettings?.siteName || DEFAULT_SITE_NAME;
    const siteLogo = publicSystemSettings?.siteLogo || DEFAULT_SITE_LOGO;
    const siteIcon = !publicSystemSettings?.siteLogo || publicSystemSettings.siteLogo === DEFAULT_SITE_LOGO ? DEFAULT_SITE_ICON : publicSystemSettings.siteLogo;

    useEffect(() => {
        document.title = siteName;
    }, [siteName]);

    useEffect(() => {
        document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']").forEach((link) => link.remove());

        const icon = document.createElement("link");
        icon.rel = "icon";
        icon.href = siteIcon;
        document.head.appendChild(icon);

        const shortcut = document.createElement("link");
        shortcut.rel = "shortcut icon";
        shortcut.href = siteIcon;
        document.head.appendChild(shortcut);

        return () => {
            icon.remove();
            shortcut.remove();
        };
    }, [siteIcon]);

    return null;
}
