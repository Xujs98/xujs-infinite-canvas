"use client";

import { useEffect } from "react";

import { useConfigStore } from "@/stores/use-config-store";

export function DynamicTitle() {
    const publicSystemSettings = useConfigStore((state) => state.publicSystemSettings);
    const siteName = publicSystemSettings?.siteName;

    useEffect(() => {
        if (siteName) {
            document.title = siteName;
        }
    }, [siteName]);

    return null;
}
