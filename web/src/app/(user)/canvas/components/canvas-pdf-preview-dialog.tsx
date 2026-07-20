"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minus, Plus, X } from "lucide-react";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { CanvasNodeData } from "../types";
import { renderPdfPages } from "../utils/pdf-processing";

type Props = {
    node: CanvasNodeData | null;
    open: boolean;
    onClose: () => void;
};

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;

function clampPage(value: number, pageCount: number) {
    return Math.min(pageCount, Math.max(1, Math.round(value) || 1));
}

function clampZoom(value: number) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function CanvasPdfPreviewDialog({ node, open, onClose }: Props) {
    const theme = useCanvasTheme();
    const [pageNumber, setPageNumber] = useState(1);
    const [zoom, setZoom] = useState(100);
    const [fitToWindow, setFitToWindow] = useState(true);
    const [previewUrl, setPreviewUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const pageCount = Math.max(1, node?.metadata?.pdfPageCount || 1);

    useEffect(() => {
        if (!open || !node) return;
        setPageNumber(1);
        setZoom(100);
        setFitToWindow(true);
    }, [node?.id, open]);

    useEffect(() => {
        if (!open || !node?.metadata?.content) return;
        let cancelled = false;
        let objectUrl = "";
        setLoading(true);
        setError("");

        void renderPdfPages(node.metadata.content, [pageNumber], { dpi: 144, format: "png" })
            .then(([page]) => {
                if (cancelled || !page) return;
                objectUrl = URL.createObjectURL(page.blob);
                setPreviewUrl(objectUrl);
            })
            .catch((caught) => {
                if (!cancelled) {
                    setPreviewUrl("");
                    setError(caught instanceof Error ? caught.message : String(caught));
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [node?.metadata?.content, open, pageNumber]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.tagName === "INPUT") return;
            if (event.key === "ArrowLeft") setPageNumber((current) => Math.max(1, current - 1));
            if (event.key === "ArrowRight") setPageNumber((current) => Math.min(pageCount, current + 1));
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose, open, pageCount]);

    if (!open || !node || typeof document === "undefined") return null;

    const updateZoom = (nextZoom: number) => {
        setZoom(clampZoom(nextZoom));
        setFitToWindow(false);
    };
    const controlStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };

    return createPortal(
        <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className="flex h-[min(88vh,900px)] w-full max-w-[1120px] flex-col overflow-hidden rounded-lg border shadow-2xl"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-5" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{node.title || "document.pdf"}</div>
                        <div className="mt-0.5 text-[10px]" style={{ color: theme.node.muted }}>PDF 预览 · {pageCount} 页</div>
                    </div>
                    <button
                        type="button"
                        className="grid size-8 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-65"
                        style={{ color: theme.node.muted }}
                        onClick={onClose}
                        title="关闭预览"
                        aria-label="关闭预览"
                    >
                        <X className="size-4" />
                    </button>
                </header>

                <main className="min-h-0 flex-1 overflow-auto bg-black/10 p-3 sm:p-5">
                    <div className={`flex min-h-full min-w-full justify-center ${fitToWindow ? "items-center" : "items-start"}`}>
                        {loading ? (
                            <div className="flex items-center gap-2 text-xs" style={{ color: theme.node.muted }}>
                                <Loader2 className="size-4 animate-spin" />正在加载第 {pageNumber} 页
                            </div>
                        ) : error ? (
                            <div className="max-w-md text-center text-xs leading-5 text-red-500">{error}</div>
                        ) : previewUrl ? (
                            <img
                                src={previewUrl}
                                alt={`${node.title || "PDF"} 第 ${pageNumber} 页`}
                                draggable={false}
                                className="block bg-white shadow-[0_12px_40px_rgba(0,0,0,0.24)]"
                                style={fitToWindow
                                    ? { maxHeight: "calc(min(88vh, 900px) - 132px)", maxWidth: "100%", objectFit: "contain" }
                                    : { width: `${zoom}%`, maxWidth: "none", height: "auto" }}
                            />
                        ) : null}
                    </div>
                </main>

                <footer className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-2 sm:px-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex h-8 items-center overflow-hidden rounded-md border" style={controlStyle}>
                        <PreviewIconButton label="上一页" disabled={pageNumber <= 1 || loading} onClick={() => setPageNumber((current) => Math.max(1, current - 1))} theme={theme}>
                            <ChevronLeft className="size-4" />
                        </PreviewIconButton>
                        <label className="flex h-full items-center border-x px-2 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                            <input
                                type="number"
                                min={1}
                                max={pageCount}
                                value={pageNumber}
                                onChange={(event) => setPageNumber(clampPage(Number(event.target.value), pageCount))}
                                className="w-8 appearance-none bg-transparent text-center text-xs font-semibold tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                style={{ color: theme.node.text }}
                                aria-label="当前页码"
                            />
                            <span>/ {pageCount}</span>
                        </label>
                        <PreviewIconButton label="下一页" disabled={pageNumber >= pageCount || loading} onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))} theme={theme}>
                            <ChevronRight className="size-4" />
                        </PreviewIconButton>
                    </div>

                    <div className="flex h-8 items-center overflow-hidden rounded-md border" style={controlStyle}>
                        <PreviewIconButton label="缩小" disabled={!fitToWindow && zoom <= MIN_ZOOM} onClick={() => updateZoom((fitToWindow ? 100 : zoom) - ZOOM_STEP)} theme={theme}>
                            <Minus className="size-3.5" />
                        </PreviewIconButton>
                        <span className="grid h-full min-w-14 place-items-center border-x px-2 text-[10px] font-semibold tabular-nums" style={{ borderColor: theme.node.stroke }}>
                            {fitToWindow ? "适应" : `${zoom}%`}
                        </span>
                        <PreviewIconButton label="放大" disabled={!fitToWindow && zoom >= MAX_ZOOM} onClick={() => updateZoom((fitToWindow ? 100 : zoom) + ZOOM_STEP)} theme={theme}>
                            <Plus className="size-3.5" />
                        </PreviewIconButton>
                        <button
                            type="button"
                            className="inline-flex h-full items-center gap-1.5 border-l px-2.5 text-[10px] font-medium transition-opacity hover:opacity-65"
                            style={{ borderColor: theme.node.stroke, color: fitToWindow ? theme.node.activeStroke : theme.node.muted }}
                            onClick={() => {
                                setFitToWindow(true);
                                setZoom(100);
                            }}
                            title="适应窗口"
                        >
                            <Maximize2 className="size-3.5" />
                            适应窗口
                        </button>
                    </div>
                </footer>
            </div>
        </div>,
        document.body,
    );
}

function PreviewIconButton({ label, disabled, onClick, theme, children }: { label: string; disabled?: boolean; onClick: () => void; theme: ReturnType<typeof useCanvasTheme>; children: ReactNode }) {
    return (
        <button
            type="button"
            className="grid h-full w-8 place-items-center transition-opacity hover:opacity-65 disabled:opacity-30"
            style={{ color: theme.node.muted }}
            disabled={disabled}
            onClick={onClick}
            title={label}
            aria-label={label}
        >
            {children}
        </button>
    );
}
