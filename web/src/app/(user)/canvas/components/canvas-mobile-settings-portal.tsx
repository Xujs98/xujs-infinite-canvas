"use client";

import { type ReactNode, type RefObject, useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { Button } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";

type CanvasMobileSettingsPortalProps = {
    panelRef: RefObject<HTMLDivElement | null>;
    theme: CanvasTheme;
    title: string;
    description?: string;
    closeLabel?: string;
    confirmLabel?: string;
    onClose: () => void;
    children: ReactNode;
};

export function CanvasMobileSettingsPortal({
    panelRef,
    theme,
    title,
    description = "配置完成后点击确定返回画布",
    closeLabel,
    confirmLabel = "确定",
    onClose,
    children,
}: CanvasMobileSettingsPortalProps) {
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-mobile-settings-portal fixed inset-0 z-[1600] flex flex-col"
            style={{ background: theme.canvas.background, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="flex h-[calc(56px+env(safe-area-inset-top))] shrink-0 items-end justify-between border-b px-4 pb-3" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                <div className="min-w-0">
                    <div className="text-lg font-semibold">{title}</div>
                    {description ? (
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>
                            {description}
                        </div>
                    ) : null}
                </div>
                <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: theme.node.fill, color: theme.node.text }} onClick={onClose} aria-label={closeLabel || `关闭${title}`}>
                    <X className="size-5" />
                </button>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5">{children}</div>

            <div className="shrink-0 border-t px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                <Button type="primary" size="large" block className="!h-12 !rounded-xl !font-semibold" icon={<Check className="size-4" />} onClick={onClose}>
                    {confirmLabel}
                </Button>
            </div>
        </div>,
        document.body,
    );
}
