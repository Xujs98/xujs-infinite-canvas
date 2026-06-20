"use client";

import type { ReactNode } from "react";
import { Brush, Camera, Copy, FileText, Grid2x2, Lock, LockOpen, Maximize2, Scissors, Sparkles, Upload, ZoomIn } from "lucide-react";

import type { CanvasNodeData } from "../types";

export type ImageNodeActionToolId = "copyPrompt" | "reversePrompt" | "replace" | "resize" | "maskEdit" | "crop" | "split" | "upscale" | "superResolve" | "angle" | "view";
export type ImageQuickToolId = "info" | "delete" | "saveAsset" | "download" | "edit" | ImageNodeActionToolId;

export type ImageToolHandlers = {
    onUpload: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onSuperResolve: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onCopyPrompt: (node: CanvasNodeData) => void;
    onReversePrompt: (node: CanvasNodeData) => void;
};

export type ImageToolDefinition = {
    id: ImageNodeActionToolId;
    defaultVisible: boolean;
    panelLabel: string;
    label: string | ((node: CanvasNodeData) => string);
    title: string | ((node: CanvasNodeData) => string);
    icon: (node: CanvasNodeData) => ReactNode;
    active?: (node: CanvasNodeData) => boolean;
    run: (node: CanvasNodeData, handlers: ImageToolHandlers) => void;
};

export type ToolbarLabelMode = "icon" | "side" | "below";
export type ToolbarAnimationMode = "none" | "fade" | "slide" | "scale" | "bounce";

export type ImageQuickToolsConfig = {
    ids: ImageQuickToolId[];
    labelMode: ToolbarLabelMode;
    animationMode: ToolbarAnimationMode;
};

export const IMAGE_QUICK_TOOLS_STORAGE_KEY = "canvas-image-quick-tools-v7";

const defaultBaseToolIds: ImageQuickToolId[] = ["info", "delete", "saveAsset", "download", "edit"];

export const imageToolDefinitions: ImageToolDefinition[] = [
    {
        id: "copyPrompt",
        defaultVisible: true,
        panelLabel: "复制提示词",
        label: "复制提示词",
        title: "复制生成该图片的提示词",
        icon: () => <Copy className="size-4" />,
        run: (node, handlers) => handlers.onCopyPrompt(node),
    },
    {
        id: "reversePrompt",
        defaultVisible: true,
        panelLabel: "反推提示词",
        label: "反推提示词",
        title: "创建反推提示词的文本和配置节点",
        icon: () => <FileText className="size-4" />,
        run: (node, handlers) => handlers.onReversePrompt(node),
    },
    {
        id: "replace",
        defaultVisible: true,
        panelLabel: "替换图片",
        label: "替换图片",
        title: "替换图片",
        icon: () => <Upload className="size-4" />,
        run: (node, handlers) => handlers.onUpload(node),
    },
    {
        id: "resize",
        defaultVisible: false,
        panelLabel: "锁比例",
        label: (node) => (node.metadata?.freeResize ? "自由比例" : "锁比例"),
        title: (node) => (node.metadata?.freeResize ? "切换为等比缩放" : "切换为自由比例"),
        icon: (node) => (node.metadata?.freeResize ? <LockOpen className="size-4" /> : <Lock className="size-4" />),
        active: (node) => Boolean(node.metadata?.freeResize),
        run: (node, handlers) => handlers.onToggleFreeResize(node),
    },
    {
        id: "maskEdit",
        defaultVisible: true,
        panelLabel: "局部编辑",
        label: "局部编辑",
        title: "添加蒙版遮罩后局部修改",
        icon: () => <Brush className="size-4" />,
        run: (node, handlers) => handlers.onMaskEdit(node),
    },
    {
        id: "crop",
        defaultVisible: true,
        panelLabel: "裁剪",
        label: "裁剪",
        title: "裁剪并生成新节点",
        icon: () => <Scissors className="size-4" />,
        run: (node, handlers) => handlers.onCrop(node),
    },
    {
        id: "split",
        defaultVisible: true,
        panelLabel: "切图",
        label: "切图",
        title: "按行列切分图片",
        icon: () => <Grid2x2 className="size-4" />,
        run: (node, handlers) => handlers.onSplit(node),
    },
    {
        id: "upscale",
        defaultVisible: true,
        panelLabel: "放大",
        label: "放大",
        title: "放大图片分辨率",
        icon: () => <ZoomIn className="size-4" />,
        run: (node, handlers) => handlers.onUpscale(node),
    },
    {
        id: "superResolve",
        defaultVisible: false,
        panelLabel: "超分",
        label: "超分",
        title: "AI 超分",
        icon: () => <Sparkles className="size-4" />,
        run: (node, handlers) => handlers.onSuperResolve(node),
    },
    {
        id: "angle",
        defaultVisible: false,
        panelLabel: "多角度",
        label: "多角度",
        title: "生成角度",
        icon: () => <Camera className="size-4" />,
        run: (node, handlers) => handlers.onAngle(node),
    },
    {
        id: "view",
        defaultVisible: true,
        panelLabel: "查看大图",
        label: "查看大图",
        title: "查看图片详情",
        icon: () => <Maximize2 className="size-4" />,
        run: (node, handlers) => handlers.onViewImage(node),
    },
];

export const defaultImageQuickToolIds: ImageQuickToolId[] = [...defaultBaseToolIds, ...imageToolDefinitions.filter((tool) => tool.defaultVisible).map((tool) => tool.id)];

export function buildImageToolbarTools(node: CanvasNodeData, handlers: ImageToolHandlers) {
    return imageToolDefinitions.map((tool) => ({
        id: tool.id,
        label: resolveToolText(tool.label, node),
        title: resolveToolText(tool.title, node),
        icon: tool.icon(node),
        active: tool.active?.(node),
        onClick: () => tool.run(node, handlers),
    }));
}

export function normalizeImageQuickToolIds(value: unknown[]) {
    const allIds: ImageQuickToolId[] = [...defaultBaseToolIds, ...imageToolDefinitions.map((tool) => tool.id)];
    const ids = new Set(allIds);
    return allIds.filter((id) => value.includes(id) && ids.has(id));
}

function migrateLabelMode(data: Record<string, unknown>): ToolbarLabelMode {
    if (typeof data.labelMode === "string" && ["icon", "side", "below"].includes(data.labelMode)) return data.labelMode as ToolbarLabelMode;
    if (data.showLabels === false) return "icon";
    return "side";
}

export function readImageQuickToolsConfig(value: unknown): ImageQuickToolsConfig {
    if (Array.isArray(value)) return { ids: normalizeImageQuickToolIds(value), labelMode: "side", animationMode: "slide" };
    if (!value || typeof value !== "object") return { ids: defaultImageQuickToolIds, labelMode: "side", animationMode: "slide" };
    const data = value as Record<string, unknown>;
    return {
        ids: Array.isArray(data.ids) ? normalizeImageQuickToolIds(data.ids as unknown[]) : defaultImageQuickToolIds,
        labelMode: migrateLabelMode(data),
        animationMode: migrateAnimationMode(data),
    };
}

function migrateAnimationMode(data: Record<string, unknown>): ToolbarAnimationMode {
    if (typeof data.animationMode === "string" && ["none", "fade", "slide", "scale", "bounce"].includes(data.animationMode)) return data.animationMode as ToolbarAnimationMode;
    return "slide";
}

function resolveToolText(value: string | ((node: CanvasNodeData) => string), node: CanvasNodeData) {
    return typeof value === "function" ? value(node) : value;
}
