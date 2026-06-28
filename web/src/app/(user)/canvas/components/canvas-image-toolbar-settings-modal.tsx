"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Card, Modal, Segmented, Space, Tag, Tooltip, Typography, theme as antdTheme } from "antd";
import { Ellipsis, Eye, Image as ImageIcon, Settings2, Check } from "lucide-react";

import type { ImageQuickToolId, ToolbarAnimationMode, ToolbarLabelMode } from "./canvas-image-toolbar-tools";

export type ImageToolbarSettingsTool = {
    id: ImageQuickToolId;
    title: string;
    label: string;
    icon: ReactNode;
    active?: boolean;
    danger?: boolean;
};

type PreviewTool = ImageToolbarSettingsTool | {
    id: "more";
    title: string;
    label: string;
    icon: ReactNode;
    active?: boolean;
    danger?: boolean;
};

type PreviewScroll = {
    left: number;
    max: number;
    viewport: number;
    content: number;
};

const labelModeOptions: { value: ToolbarLabelMode; label: string }[] = [
    { value: "icon", label: "仅图标" },
    { value: "side", label: "图标+文字" },
    { value: "below", label: "图标上·文字下" },
];

const animationModeOptions: { value: ToolbarAnimationMode; label: string }[] = [
    { value: "none", label: "无动画" },
    { value: "fade", label: "淡入" },
    { value: "slide", label: "滑入" },
    { value: "scale", label: "缩放" },
    { value: "bounce", label: "弹跳" },
];

export function ImageToolSettingsModal({
    open,
    tools,
    selectedIds,
    labelMode,
    animationMode,
    onToggle,
    onLabelModeChange,
    onAnimationModeChange,
    onCancel,
    onSave,
}: {
    open: boolean;
    tools: ImageToolbarSettingsTool[];
    selectedIds: ImageQuickToolId[];
    labelMode: ToolbarLabelMode;
    animationMode: ToolbarAnimationMode;
    onToggle: (id: ImageQuickToolId, visible: boolean) => void;
    onLabelModeChange: (value: ToolbarLabelMode) => void;
    onAnimationModeChange: (value: ToolbarAnimationMode) => void;
    onCancel: () => void;
    onSave: () => void;
}) {
    const { token } = antdTheme.useToken();
    const previewToolbarRef = useRef<HTMLDivElement>(null);
    const scrollbarTrackRef = useRef<HTMLInputElement>(null);
    const [previewScroll, setPreviewScroll] = useState<PreviewScroll>({ left: 0, max: 0, viewport: 1, content: 1 });
    const [animPreviewKey, setAnimPreviewKey] = useState(0);
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedTools = tools.filter((tool) => selected.has(tool.id));
    const previewTools: PreviewTool[] = [
        ...selectedTools,
        { id: "more", title: "配置快捷工具", label: "更多", icon: <Ellipsis className="size-4" />, active: true },
    ];

    const syncPreviewScroll = useCallback(() => {
        const toolbar = previewToolbarRef.current;
        if (!toolbar) return;
        setPreviewScroll({
            left: toolbar.scrollLeft,
            max: Math.max(0, toolbar.scrollWidth - toolbar.clientWidth),
            viewport: Math.max(1, toolbar.clientWidth),
            content: Math.max(1, toolbar.scrollWidth),
        });
    }, []);

    const setPreviewScrollLeft = useCallback(
        (left: number) => {
            const toolbar = previewToolbarRef.current;
            if (!toolbar) return;
            toolbar.scrollLeft = left;
            syncPreviewScroll();
        },
        [syncPreviewScroll],
    );

    const updateSelectedTools = (values: ImageQuickToolId[]) => {
        const next = new Set(values);
        tools.forEach((tool) => {
            const visible = next.has(tool.id);
            if (selected.has(tool.id) !== visible) onToggle(tool.id, visible);
        });
    };

    useEffect(() => {
        if (!open) return;
        const toolbar = previewToolbarRef.current;
        const sync = () => syncPreviewScroll();
        const frames: number[] = [];
        const firstFrame = window.requestAnimationFrame(() => {
            sync();
            frames.push(window.requestAnimationFrame(sync));
        });
        frames.push(firstFrame);
        const timer = window.setTimeout(sync, 120);
        const resizeObserver = typeof ResizeObserver !== "undefined" && toolbar ? new ResizeObserver(sync) : null;
        resizeObserver?.observe(toolbar);
        toolbar?.childNodes.forEach((child) => {
            if (child instanceof Element) resizeObserver?.observe(child);
        });
        sync();
        window.addEventListener("resize", syncPreviewScroll);
        return () => {
            frames.forEach((frame) => window.cancelAnimationFrame(frame));
            window.clearTimeout(timer);
            resizeObserver?.disconnect();
            window.removeEventListener("resize", syncPreviewScroll);
        };
    }, [open, selectedIds, labelMode, previewTools.length, syncPreviewScroll]);

    const scrollbarWidth = scrollbarTrackRef.current?.clientWidth || previewScroll.viewport;
    const scrollbarThumbWidth = previewScroll.max > 0 ? Math.min(scrollbarWidth, Math.max(64, (previewScroll.viewport / previewScroll.content) * scrollbarWidth)) : scrollbarWidth;

    const previewAnimClass = animationMode === "none" ? "" : animationMode === "fade" ? "animate-toolbar-fade" : animationMode === "slide" ? "animate-toolbar-slide" : animationMode === "scale" ? "animate-toolbar-scale" : "animate-toolbar-bounce";

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <Settings2 className="size-5 text-blue-500" />
                    <span>自定义工具栏</span>
                </div>
            }
            open={open}
            centered
            width={760}
            onCancel={onCancel}
            destroyOnHidden
            footer={
                <div className="flex items-center justify-end gap-2">
                    <Button onClick={onCancel}>取消</Button>
                    <Button type="primary" onClick={onSave}>保存</Button>
                </div>
            }
        >
            {/* Preview section */}
            <Card
                size="small"
                className="mb-5"
                styles={{ body: { padding: 0 } }}
            >
                <div className="relative flex min-h-[280px] w-full justify-center overflow-hidden rounded-lg bg-gradient-to-b from-neutral-50 to-neutral-100 pt-20 pb-9 dark:from-neutral-900 dark:to-neutral-950">
                    <div
                        key={animPreviewKey}
                        ref={previewToolbarRef}
                        className={`hide-scrollbar absolute left-2 right-2 top-3 z-10 flex h-12 items-center overflow-x-auto rounded-[18px] border px-1 text-[13px] ${previewAnimClass}`}
                        style={{ background: token.colorBgElevated, borderColor: token.colorBorderSecondary, boxShadow: token.boxShadowSecondary, color: token.colorText }}
                        onScroll={syncPreviewScroll}
                    >
                        {previewTools.map((tool) => (
                            <PreviewToolbarItem key={tool.id} tool={tool} labelMode={labelMode} />
                        ))}
                    </div>
                    <div className="flex h-48 w-full max-w-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 dark:border-neutral-700 dark:bg-neutral-800/60">
                        <ImageIcon className="mb-2 size-8 text-neutral-400" />
                        <Typography.Text type="secondary">图片节点</Typography.Text>
                    </div>
                    <input
                        ref={scrollbarTrackRef}
                        type="range"
                        min={0}
                        max={Math.max(previewScroll.max, 1)}
                        value={Math.min(previewScroll.left, Math.max(previewScroll.max, 1))}
                        disabled={previewScroll.max <= 0}
                        className="absolute bottom-4 left-10 right-10 h-2.5 cursor-pointer appearance-none bg-transparent disabled:cursor-default [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-[var(--preview-scrollbar-thumb-width)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#8d9498] [&::-moz-range-track]:h-2.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#bdc4c8] [&::-webkit-slider-runnable-track]:h-2.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#bdc4c8] [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-[var(--preview-scrollbar-thumb-width)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#8d9498]"
                        style={{ "--preview-scrollbar-thumb-width": `${scrollbarThumbWidth}px` } as CSSProperties}
                        onInput={(event) => setPreviewScrollLeft(Number(event.currentTarget.value))}
                        onChange={(event) => setPreviewScrollLeft(Number(event.target.value))}
                    />
                </div>
            </Card>

            {/* Settings section */}
            <div className="mb-5 grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
                    <div className="mb-2 text-xs font-medium text-neutral-500">按钮样式</div>
                    <Segmented block size="small" value={labelMode} options={labelModeOptions} onChange={(value) => onLabelModeChange(value as ToolbarLabelMode)} />
                </div>
                <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-500">出场动画</span>
                        <Button
                            type="text"
                            size="small"
                            icon={<Eye className="size-3" />}
                            className="!text-xs !text-neutral-400"
                            onClick={() => setAnimPreviewKey((k) => k + 1)}
                        >
                            预览
                        </Button>
                    </div>
                    <Segmented block size="small" value={animationMode} options={animationModeOptions} onChange={(value) => { onAnimationModeChange(value as ToolbarAnimationMode); setAnimPreviewKey((k) => k + 1); }} />
                </div>
            </div>

            {/* Tools selection */}
            <div>
                <div className="mb-3 flex items-center gap-2">
                    <span className="text-sm font-medium">快捷工具</span>
                    <Tag color="blue" className="m-0">
                        {selectedTools.length}/{tools.length}
                    </Tag>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {tools.map((tool) => {
                        const isSelected = selected.has(tool.id);
                        return (
                            <button
                                key={tool.id}
                                type="button"
                                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                                    isSelected
                                        ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300"
                                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600"
                                }`}
                                onClick={() => onToggle(tool.id, !isSelected)}
                            >
                                <span className="flex size-5 shrink-0 items-center justify-center">
                                    {isSelected ? <Check className="size-3.5 text-blue-500" /> : tool.icon}
                                </span>
                                <span className="truncate">{tool.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
}

function PreviewToolbarItem({ tool, labelMode }: { tool: PreviewTool; labelMode: ToolbarLabelMode }) {
    const hasText = labelMode !== "icon";
    const isBelow = labelMode === "below" && hasText;
    return (
        <Tooltip title={tool.title}>
            <span className={`flex shrink-0 items-center px-1.5 ${isBelow ? "h-14 flex-col justify-center gap-0.5" : "h-12"}`} style={{ color: tool.danger ? "#ef4444" : undefined }}>
                <span className={`flex items-center rounded-lg ${isBelow ? "h-7 px-1.5" : `h-9 ${hasText ? "gap-2 px-2" : "justify-center px-2"}`}`}>
                    {tool.icon}
                    {hasText && !isBelow ? <span className="whitespace-nowrap">{tool.label}</span> : null}
                </span>
                {isBelow ? <span className="px-1 text-[10px] leading-tight opacity-70">{tool.label}</span> : null}
            </span>
        </Tooltip>
    );
}
