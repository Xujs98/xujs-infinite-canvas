"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Settings2, X } from "lucide-react";
import { Button } from "antd";

import { ImageSettingsPanel, imageQualityLabel, imageSizeLabel } from "@/components/image-settings-panel";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, buttonClassName, placement = "topLeft" }: CanvasImageSettingsPopoverProps) {
    const theme = useCanvasTheme();
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const [mobileFullscreen, setMobileFullscreen] = useState(false);
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    useEffect(() => {
        const query = window.matchMedia("(max-width: 767px), (pointer: coarse)");
        const update = () => setMobileFullscreen(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            if (!mobileFullscreen) updateOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [mobileFullscreen, onOpenChange, open]);

    useEffect(() => {
        if (!open || !mobileFullscreen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [mobileFullscreen, open]);

    const panel = open ? (
        mobileFullscreen ? (
            <MobileImageSettingsPortal panelRef={panelRef} theme={theme} config={config} onConfigChange={onConfigChange} onClose={() => updateOpen(false)} />
        ) : buttonRect ? (
            <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} onConfigChange={onConfigChange} />
        ) : null
    ) : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"} style={{ background: theme.node.fill, color: theme.node.text }} icon={<Settings2 className="size-3.5" />} onClick={() => updateOpen(!open)}>
                    <span className="truncate">
                        {imageQualityLabel(quality)} · {imageSizeLabel(activeSize)} · {count} 张
                    </span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function MobileImageSettingsPortal({
    panelRef,
    theme,
    config,
    onConfigChange,
    onClose,
}: {
    panelRef: RefObject<HTMLDivElement | null>;
    theme: CanvasTheme;
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onClose: () => void;
}) {
    return createPortal(
        <div
            ref={panelRef}
            className="canvas-image-settings-popover fixed inset-0 z-[1600] flex flex-col"
            style={{ background: theme.canvas.background, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="flex h-[calc(56px+env(safe-area-inset-top))] shrink-0 items-end justify-between border-b px-4 pb-3" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                <div className="min-w-0">
                    <div className="text-lg font-semibold">图像设置</div>
                    <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>
                        配置完成后点击确定返回画布
                    </div>
                </div>
                <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: theme.node.fill, color: theme.node.text }} onClick={onClose} aria-label="关闭图像设置">
                    <X className="size-5" />
                </button>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <ImageSettingsPanel
                    config={config}
                    onConfigChange={(key, value) => onConfigChange(key, value)}
                    theme={theme}
                    showTitle={false}
                    className="mobile-image-settings-panel mx-auto w-full max-w-[560px] space-y-6 pb-28"
                />
            </div>

            <div className="shrink-0 border-t px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                <Button type="primary" size="large" block className="!h-12 !rounded-xl !font-semibold" icon={<Check className="size-4" />} onClick={onClose}>
                    确定
                </Button>
            </div>
        </div>,
        document.body,
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    onConfigChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: CanvasTheme;
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
}) {
    const width = 356;
    const gap = 8;
    const margin = 12;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(260, buttonRect.top - margin * 2) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(260, window.innerHeight - buttonRect.bottom - margin * 2) }),
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-image-settings-popover"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <ImageSettingsPanel config={config} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} className="space-y-4" />
        </div>,
        document.body,
    );
}
