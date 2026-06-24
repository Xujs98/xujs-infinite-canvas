"use client";

import { useEffect } from "react";

import { useConfigStore } from "@/stores/use-config-store";

export function DynamicTitle() {
    const publicSystemSettings = useConfigStore((state) => state.publicSystemSettings);
    const siteName = publicSystemSettings?.siteName;
    const siteLogo = publicSystemSettings?.siteLogo;

    useEffect(() => {
        document.title = siteName || "小松鼠画布";
    }, [siteName]);

    useEffect(() => {
        if (!siteLogo) return;
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
        }
        link.href = siteLogo;
    }, [siteLogo]);

    return null;
}
