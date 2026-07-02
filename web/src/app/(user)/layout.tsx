"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppTopNav } from "@/components/layout/app-top-nav";

export default function UserLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isCanvasDetail = /^\/canvas\/[^/]+/.test(pathname);

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className={isCanvasDetail ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto md:overflow-hidden"}>{children}</div>
        </div>
    );
}
